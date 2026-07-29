/**
 * 임베딩 유사도 분포 측정 스크립트
 *
 * SIMILARITY_THRESHOLD(src/lib/openai.ts)를 근거 있게 정하기 위한 도구.
 * 모델을 바꾸면 cosine similarity 절대값 분포가 통째로 달라지므로,
 * 기존 임계값을 그대로 들고 가면 안 된다.
 *
 * 사용법:
 *   npx tsx scripts/measure-similarity.ts
 *   npx tsx scripts/measure-similarity.ts --top 10
 *
 * 방법:
 *   - SIGNAL   = 이 서비스에서 실제로 들어올 법한 질의. 상위 결과가 높게 나와야 한다.
 *   - CONTROL  = 공지와 무관한 질의. 어떤 질의든 "가장 가까운" 문서는 항상 존재하므로,
 *                이 그룹의 최고값이 곧 false positive 하한선이다.
 *   임계값은 두 분포 사이에 놓아야 한다.
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

const SIGNAL_QUERIES = [
  '공모전 있어?',
  '천안캠퍼스 봉사활동',
  '장학금 신청하고 싶어',
  '인턴 채용 공고 알려줘',
  '서포터즈 모집하는거 있나',
  '이번달 마감인 공지',
];

const CONTROL_QUERIES = [
  '오늘 점심 뭐 먹지',
  '어제 축구 경기 결과',
  '파이썬 리스트 정렬하는 법',
  '내일 날씨 어때',
];

interface MatchRow {
  id: number;
  title: string;
  similarity: number;
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const topIdx = argv.indexOf('--top');
  return { top: topIdx >= 0 ? parseInt(argv[topIdx + 1], 10) : 10 };
}

function pct(n: number): string {
  return n.toFixed(4);
}

async function main() {
  const { top } = parseArgs();

  const { createClient } = await import('@supabase/supabase-js');
  const { generateEmbedding, EMBEDDING_MODEL_ID } = await import('../src/lib/embeddings');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 분포를 보는 게 목적이므로 임계값 0, 만료 공지 포함으로 전량을 훑는다.
  async function runQuery(q: string): Promise<MatchRow[]> {
    const emb = await generateEmbedding(q);
    if (!emb) {
      console.error(`  임베딩 생성 실패: "${q}"`);
      return [];
    }
    const { data, error } = await supabase.rpc('match_posts', {
      query_embedding: emb,
      match_threshold: 0,
      match_count: top,
      include_expired: true,
    });
    if (error) {
      console.error(`  match_posts 실패: ${error.message}`);
      return [];
    }
    return (data as MatchRow[]) ?? [];
  }

  // 측정 대상이 정말 현행 모델 벡터인지 먼저 확인 — 섞여 있으면 숫자가 무의미하다.
  const { data: modelRows } = await supabase.from('posts').select('embedding_model');
  const counts = new Map<string, number>();
  for (const r of (modelRows ?? []) as { embedding_model: string | null }[]) {
    const k = r.embedding_model ?? '(null)';
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  console.log('='.repeat(72));
  console.log(`질의 모델: ${EMBEDDING_MODEL_ID}`);
  console.log('DB 벡터 구성:');
  for (const [model, n] of counts) console.log(`  ${model}: ${n}건`);
  if (counts.size > 1) {
    console.log('  ⚠ 서로 다른 모델의 벡터가 섞여 있습니다. 재임베딩을 먼저 끝내세요.');
  }
  console.log('='.repeat(72));
  console.log('');

  const groups: { label: string; queries: string[]; tops: number[]; all: number[] }[] = [
    { label: 'SIGNAL (관련)', queries: SIGNAL_QUERIES, tops: [], all: [] },
    { label: 'CONTROL (무관)', queries: CONTROL_QUERIES, tops: [], all: [] },
  ];

  for (const group of groups) {
    console.log('#'.repeat(72));
    console.log(`# ${group.label}`);
    console.log('#'.repeat(72));

    for (const q of group.queries) {
      const rows = await runQuery(q);
      console.log('');
      console.log(`Q: "${q}"  → ${rows.length}건`);
      if (rows.length === 0) continue;

      group.tops.push(rows[0].similarity);
      for (const r of rows) group.all.push(r.similarity);

      rows.slice(0, 5).forEach((r, i) => {
        console.log(`   ${i + 1}. ${pct(r.similarity)}  ${r.title.slice(0, 46)}`);
      });
      const sims = rows.map((r) => r.similarity);
      console.log(
        `   [top1 ${pct(sims[0])} / top${rows.length} ${pct(sims[sims.length - 1])} / 평균 ${pct(
          sims.reduce((a, b) => a + b, 0) / sims.length
        )}]`
      );
    }
    console.log('');
  }

  const signal = groups[0];
  const control = groups[1];

  console.log('='.repeat(72));
  console.log('요약');
  console.log('='.repeat(72));

  if (signal.tops.length === 0 || control.tops.length === 0) {
    console.log('데이터가 부족해 임계값을 제안할 수 없습니다.');
    return;
  }

  const signalTopMin = Math.min(...signal.tops);
  const signalTopMax = Math.max(...signal.tops);
  const controlTopMax = Math.max(...control.tops);
  const controlAllMax = Math.max(...control.all);

  console.log(`SIGNAL  top1 범위 : ${pct(signalTopMin)} ~ ${pct(signalTopMax)}`);
  console.log(`CONTROL top1 최대 : ${pct(controlTopMax)}   (= false positive 하한선)`);
  console.log(`CONTROL 전체 최대 : ${pct(controlAllMax)}`);
  console.log('');

  const gap = signalTopMin - controlTopMax;
  if (gap <= 0) {
    console.log('⚠ 두 분포가 겹칩니다. 임베딩 텍스트 구성이나 질의 세트를 재검토해야 합니다.');
    console.log(`  겹침 구간: ${pct(signalTopMin)} ≤ SIGNAL, CONTROL ≤ ${pct(controlTopMax)}`);
  } else {
    const suggested = controlTopMax + gap / 2;
    console.log(`분리 간격: ${pct(gap)}`);
    console.log(`제안 임계값: ${suggested.toFixed(2)}  (두 분포 중간)`);
    console.log('');
    console.log('src/lib/openai.ts의 SIMILARITY_THRESHOLD와 그 위 주석을 이 값으로 갱신하세요.');
  }
  console.log('='.repeat(72));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
