/**
 * 게시물 전체 재임베딩 스크립트
 *
 * 사용법:
 *   npx tsx scripts/reembed-posts.ts                  # dry-run (기본) — 대상/비용만 출력
 *   npx tsx scripts/reembed-posts.ts --execute        # 실제 DB 쓰기
 *   npx tsx scripts/reembed-posts.ts --execute --force  # 이미 최신 모델인 것까지 전량 재생성
 *   npx tsx scripts/reembed-posts.ts --execute --limit 20
 *
 * 재개: 성공한 행마다 posts.embedding_model을 갱신하므로, 중단 후 같은 명령을
 * 다시 실행하면 남은 것만 처리한다. 별도 체크포인트 파일이 필요 없다.
 *
 * .env.local의 OPENAI_API_KEY / SUPABASE_* 를 사용한다.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// .env.local 수동 로드 — src/lib/* 가 import 시점에 env를 검증하므로 그 전에 채워야 한다.
function loadEnvLocal() {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  } catch (err) {
    console.warn('.env.local 로드 실패:', err);
  }
}
loadEnvLocal();

// OpenAI 임베딩 단가 (USD / 1M tokens). 모델 추가 시 여기에 등록.
const PRICE_PER_1M_TOKENS: Record<string, number> = {
  'text-embedding-3-small': 0.02,
  'text-embedding-3-large': 0.13,
};

const BATCH_SIZE = 64;
const CALIBRATION_SAMPLE = 5;

interface PostRow {
  id: number;
  title: string;
  summary: string | null;
  content: string | null;
  keywords: string[] | null;
  activity_types: number[] | null;
  campus: string | null;
  deadline: string | null;
  event_start_date: string | null;
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const limitIdx = argv.indexOf('--limit');
  return {
    execute: argv.includes('--execute'),
    force: argv.includes('--force'),
    limit: limitIdx >= 0 ? parseInt(argv[limitIdx + 1], 10) : undefined,
  };
}

function formatUSD(usd: number): string {
  return usd < 0.01 ? `$${usd.toFixed(5)}` : `$${usd.toFixed(2)}`;
}

async function main() {
  const args = parseArgs();

  const { createClient } = await import('@supabase/supabase-js');
  const { buildEmbeddingText, generateEmbeddingsBatch, EMBEDDING_MODEL_ID } = await import(
    '../src/lib/embeddings'
  );
  const { openai } = await import('../src/lib/openai');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const provider = process.env.EMBEDDING_PROVIDER || 'openai';

  console.log('='.repeat(60));
  console.log('재임베딩 대상 조회');
  console.log('='.repeat(60));
  console.log(`공급자     : ${provider}`);
  console.log(`모델       : ${EMBEDDING_MODEL_ID}`);
  console.log(`모드       : ${args.execute ? 'EXECUTE (DB 쓰기)' : 'DRY-RUN (쓰기 없음)'}`);
  console.log(`대상 선정  : ${args.force ? '전량 강제' : 'embedding NULL 또는 다른 모델로 생성된 것'}`);
  console.log('');

  const columns =
    'id, title, summary, content, keywords, activity_types, campus, deadline, event_start_date';

  let query = supabase.from('posts').select(columns).order('id', { ascending: true });
  if (!args.force) {
    // 임베딩이 없거나 / 출처가 안 남았거나 / 다른 모델로 만든 행.
    // embedding_model.is.null을 빼면 안 된다 — SQL에서 NULL != 'x' 는 true가 아니라
    // NULL이라 neq 조건만으로는 출처 미기록 행이 조용히 누락된다.
    query = query.or(
      `embedding.is.null,embedding_model.is.null,embedding_model.neq.${EMBEDDING_MODEL_ID}`
    );
  }
  if (args.limit) query = query.limit(args.limit);

  const { data, error } = await query;
  if (error) {
    console.error('대상 조회 실패:', error.message);
    process.exit(1);
  }

  const posts = (data ?? []) as PostRow[];
  if (posts.length === 0) {
    console.log('처리할 대상이 없습니다. (이미 전부 최신 모델로 임베딩됨)');
    return;
  }

  const texts = posts.map((p) => buildEmbeddingText(p));
  const totalChars = texts.reduce((sum, t) => sum + t.length, 0);

  console.log(`대상 건수  : ${posts.length}건`);
  console.log(`총 문자수  : ${totalChars.toLocaleString()}자`);
  console.log(`평균 길이  : ${Math.round(totalChars / posts.length)}자`);
  console.log('');

  // 비용 추정 — 한국어는 문자당 토큰 비율이 커서 추측이 부정확하다.
  // 소수의 샘플을 실제로 임베딩해 tokens/char 비율을 재고 전체에 외삽한다.
  // (샘플 비용 자체는 $0.000001 수준)
  let estimatedTokens: number;
  let calibrationNote: string;

  if (provider === 'openai') {
    const sample = texts.slice(0, Math.min(CALIBRATION_SAMPLE, texts.length));
    try {
      const res = await openai.embeddings.create({
        model: EMBEDDING_MODEL_ID,
        input: sample,
        dimensions: 1024,
      });
      const sampleChars = sample.reduce((sum, t) => sum + t.length, 0);
      const ratio = res.usage.prompt_tokens / sampleChars;
      estimatedTokens = Math.ceil(totalChars * ratio);
      calibrationNote = `실측 ${sample.length}건 기준 ${ratio.toFixed(3)} tokens/자`;
    } catch (err) {
      estimatedTokens = Math.ceil(totalChars * 1.5);
      calibrationNote = `샘플 호출 실패로 추정치 1.5 tokens/자 적용 (${err})`;
    }

    const price = PRICE_PER_1M_TOKENS[EMBEDDING_MODEL_ID];
    console.log('='.repeat(60));
    console.log('예상 비용');
    console.log('='.repeat(60));
    console.log(`토큰 추정  : ${estimatedTokens.toLocaleString()} tokens (${calibrationNote})`);
    if (price === undefined) {
      console.log(`단가       : 미등록 모델 — PRICE_PER_1M_TOKENS에 추가 필요`);
    } else {
      console.log(`단가       : $${price} / 1M tokens`);
      console.log(`예상 비용  : ${formatUSD((estimatedTokens / 1_000_000) * price)}`);
    }
    console.log('');
  } else {
    console.log('로컬 Ollama 공급자 — API 비용 없음');
    console.log('');
  }

  if (!args.execute) {
    console.log('DRY-RUN 종료. 실제 실행하려면 --execute 를 붙이세요.');
    return;
  }

  console.log('='.repeat(60));
  console.log('재임베딩 실행');
  console.log('='.repeat(60));

  let success = 0;
  let failed = 0;
  const failedIds: number[] = [];

  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);
    const batchTexts = texts.slice(i, i + BATCH_SIZE);

    // 재시도(429/5xx 지수 백오프)는 generateEmbeddingsBatch 내부에서 처리한다.
    const embeddings = await generateEmbeddingsBatch(batchTexts);

    for (let j = 0; j < batch.length; j++) {
      const post = batch[j];
      const embedding = embeddings[j];

      if (!embedding) {
        failed++;
        failedIds.push(post.id);
        continue;
      }

      const { error: updateError } = await supabase
        .from('posts')
        .update({
          embedding: JSON.stringify(embedding),
          embedding_model: EMBEDDING_MODEL_ID,
        })
        .eq('id', post.id);

      if (updateError) {
        console.error(`  저장 실패 (id=${post.id}):`, updateError.message);
        failed++;
        failedIds.push(post.id);
      } else {
        success++;
      }
    }

    const done = Math.min(i + BATCH_SIZE, posts.length);
    const pct = Math.round((done / posts.length) * 100);
    console.log(`진행: ${done}/${posts.length} (${pct}%) — 성공 ${success} / 실패 ${failed}`);
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`완료: 성공 ${success}건 / 실패 ${failed}건`);
  if (failedIds.length > 0) {
    console.log(`실패 id: ${failedIds.join(', ')}`);
    console.log('같은 명령을 다시 실행하면 실패분만 재시도합니다.');
  }
  console.log('='.repeat(60));

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
