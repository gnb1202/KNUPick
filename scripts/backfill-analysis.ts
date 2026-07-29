/**
 * 요약/분석 백필 스크립트
 *
 * LLM이 꺼져 있던 동안 크롤링된 게시물은 summary가 비어 있고 활동유형·키워드가
 * 키워드 폴백 값이다. 이 스크립트가 LLM_PROVIDER 경로로 다시 분석해 채운다.
 *
 * 사용법:
 *   npx tsx scripts/backfill-analysis.ts                 # dry-run — 대상/비용만
 *   npx tsx scripts/backfill-analysis.ts --execute
 *   npx tsx scripts/backfill-analysis.ts --execute --limit 20
 *   npx tsx scripts/backfill-analysis.ts --execute --force   # summary 있는 것도 재분석
 *
 * 대상: content가 있고 summary가 비어 있는 게시물.
 *   - 본문이 없는 이미지 전용 공지는 이 스크립트가 아니라
 *     /api/crawl/reanalyze (CLOVA OCR 경로)가 담당한다.
 *
 * 재개: 성공 시 summary가 채워지므로 다시 실행하면 남은 것만 처리한다.
 *
 * 반영 범위는 crawl route와 동일하다 — LLM이 값을 준 필드만 덮어쓰고,
 * 빈 값이면 기존(키워드 폴백) 값을 유지한다.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

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

// USD / 1M tokens — [input, output]
const PRICING: Record<string, [number, number]> = {
  'gpt-4o-mini': [0.15, 0.6],
  'gpt-4o': [2.5, 10],
};

const IMAGE_PLACEHOLDER = '이미지로 작성된 공지입니다. 원문에서 상세 내용을 확인하세요.';
const CALIBRATION_SAMPLE = 3;
const RATE_LIMIT_MS = 200;

interface PostRow {
  id: number;
  title: string;
  content: string | null;
  summary: string | null;
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

function costOf(model: string, promptTokens: number, completionTokens: number): number | null {
  const price = PRICING[model];
  if (!price) return null;
  return (promptTokens / 1_000_000) * price[0] + (completionTokens / 1_000_000) * price[1];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = parseArgs();

  const { createClient } = await import('@supabase/supabase-js');
  const { analyzePostWithLLM, isLLMEnabled, testLLMConnection, LLM_MODEL_ID, llmUsage } =
    await import('../src/lib/llm');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const provider = process.env.LLM_PROVIDER || 'openai';

  console.log('='.repeat(64));
  console.log('요약/분석 백필');
  console.log('='.repeat(64));
  console.log(`공급자   : ${provider}`);
  console.log(`모델     : ${LLM_MODEL_ID}`);
  console.log(`모드     : ${args.execute ? 'EXECUTE (DB 쓰기)' : 'DRY-RUN (쓰기 없음)'}`);
  console.log('');

  if (!isLLMEnabled()) {
    console.error('LLM_ENABLED=false 입니다. .env.local에서 true로 바꾼 뒤 다시 실행하세요.');
    process.exit(1);
  }
  if (!(await testLLMConnection())) {
    console.error('LLM 연결 확인 실패. 공급자 설정을 점검하세요.');
    process.exit(1);
  }
  console.log('');

  let query = supabase
    .from('posts')
    .select('id, title, content, summary')
    .not('content', 'is', null)
    .neq('content', '')
    .order('id', { ascending: true });

  if (!args.force) {
    // summary가 없거나, 이미지 안내 문구만 들어간 행.
    query = query.or(`summary.is.null,summary.eq.${IMAGE_PLACEHOLDER}`);
  }
  if (args.limit) query = query.limit(args.limit);

  const { data, error } = await query;
  if (error) {
    console.error('대상 조회 실패:', error.message);
    process.exit(1);
  }

  const posts = (data ?? []) as PostRow[];
  if (posts.length === 0) {
    console.log('처리할 대상이 없습니다.');
    return;
  }

  const totalContentChars = posts.reduce((s, p) => s + (p.content?.length ?? 0), 0);
  console.log(`대상 건수 : ${posts.length}건`);
  console.log(`본문 총량 : ${totalContentChars.toLocaleString()}자 (건당 평균 ${Math.round(
    totalContentChars / posts.length
  )}자)`);
  console.log('');

  if (!args.execute) {
    // 프롬프트 템플릿이 커서 문자수만으로는 추정이 빗나간다.
    // 소수를 실제로 분석해 건당 토큰을 재고 전체에 외삽한다.
    const sample = posts.slice(0, Math.min(CALIBRATION_SAMPLE, posts.length));
    console.log(`비용 산정을 위해 ${sample.length}건을 실제로 분석합니다 (DB 쓰기 없음)...`);

    for (const p of sample) {
      await analyzePostWithLLM(p.title, p.content ?? '');
      await sleep(RATE_LIMIT_MS);
    }

    console.log('');
    console.log('='.repeat(64));
    console.log('예상 비용');
    console.log('='.repeat(64));

    if (llmUsage.calls === 0) {
      console.log('토큰 사용량을 측정하지 못했습니다 (Ollama 경로이거나 호출 실패).');
    } else {
      const perCallPrompt = llmUsage.promptTokens / llmUsage.calls;
      const perCallCompletion = llmUsage.completionTokens / llmUsage.calls;
      const totalPrompt = Math.ceil(perCallPrompt * posts.length);
      const totalCompletion = Math.ceil(perCallCompletion * posts.length);
      const cost = costOf(LLM_MODEL_ID, totalPrompt, totalCompletion);

      console.log(`실측 건당  : 입력 ${Math.round(perCallPrompt)} / 출력 ${Math.round(
        perCallCompletion
      )} tokens`);
      console.log(`전체 추정  : 입력 ${totalPrompt.toLocaleString()} / 출력 ${totalCompletion.toLocaleString()} tokens`);
      if (cost === null) {
        console.log(`단가 미등록 모델 (${LLM_MODEL_ID}) — PRICING에 추가 필요`);
      } else {
        console.log(`예상 비용  : ${formatUSD(cost)}`);
      }
    }

    console.log('');
    console.log('DRY-RUN 종료. 실제 실행하려면 --execute 를 붙이세요.');
    return;
  }

  console.log('='.repeat(64));
  console.log('분석 실행');
  console.log('='.repeat(64));

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];

    try {
      const result = await analyzePostWithLLM(post.title, post.content ?? '');

      if (!result) {
        failed++;
        console.log(`  [${i + 1}/${posts.length}] 분석 실패: ${post.title.slice(0, 34)}`);
        continue;
      }

      // crawl route와 동일한 병합 규칙 — LLM이 준 값만 덮어쓴다.
      const update: Record<string, unknown> = {};
      if (result.summary) update.summary = result.summary;
      if (result.activity_types.length > 0) update.activity_types = result.activity_types;
      if (result.keywords.length > 0) update.keywords = result.keywords;
      if (result.deadline) update.deadline = result.deadline;
      if (result.event_start_date) update.event_start_date = result.event_start_date;
      if (result.event_end_date) update.event_end_date = result.event_end_date;

      if (Object.keys(update).length === 0) {
        skipped++;
        continue;
      }

      const { error: updateError } = await supabase.from('posts').update(update).eq('id', post.id);

      if (updateError) {
        failed++;
        console.error(`  [${i + 1}/${posts.length}] 저장 실패 (id=${post.id}):`, updateError.message);
      } else {
        success++;
        console.log(
          `  [${i + 1}/${posts.length}] ${post.title.slice(0, 30)} → ${
            result.summary?.slice(0, 40) ?? '(요약 없음)'
          }`
        );
      }
    } catch (err) {
      failed++;
      console.error(`  [${i + 1}/${posts.length}] 에러 (id=${post.id}):`, err);
    }

    await sleep(RATE_LIMIT_MS);
  }

  const actualCost = costOf(LLM_MODEL_ID, llmUsage.promptTokens, llmUsage.completionTokens);

  console.log('');
  console.log('='.repeat(64));
  console.log(`완료: 성공 ${success} / 변경없음 ${skipped} / 실패 ${failed}`);
  console.log(
    `실제 사용: ${llmUsage.calls}회 호출, 입력 ${llmUsage.promptTokens.toLocaleString()} / 출력 ${llmUsage.completionTokens.toLocaleString()} tokens`
  );
  if (actualCost !== null) console.log(`실제 비용: ${formatUSD(actualCost)}`);
  if (failed > 0) console.log('같은 명령을 다시 실행하면 실패분만 재시도합니다.');
  console.log('='.repeat(64));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
