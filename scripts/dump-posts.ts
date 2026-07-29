/**
 * posts 테이블 JSON 덤프 (파괴적 작업 전 스냅샷용)
 *
 * 사용법:
 *   npx tsx scripts/dump-posts.ts                          # 전체
 *   npx tsx scripts/dump-posts.ts --before 2026-07-01      # 해당 날짜 이전만
 *   npx tsx scripts/dump-posts.ts --out backups/x.json
 *
 * embedding을 포함한 모든 컬럼을 그대로 담는다. 213건 기준 수 MB 수준이라
 * 용량보다 복구 충실도를 우선한다.
 *
 * 출력 경로 기본값: backups/posts-<타임스탬프>.json (backups/는 .gitignore 대상)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';

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

const PAGE_SIZE = 500;

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return { before: get('--before'), out: get('--out') };
}

function defaultOutPath(): string {
  // new Date()로 파일명을 만들면 재실행마다 경로가 달라져 헷갈리므로
  // 날짜(YYYY-MM-DD)까지만 쓴다. 같은 날 다시 뜨면 덮어쓴다.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  return `backups/posts-${today}.json`;
}

async function main() {
  const args = parseArgs();
  const outPath = resolve(process.cwd(), args.out ?? defaultOutPath());

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log(`덤프 대상: ${args.before ? `posted_date < ${args.before} 또는 NULL` : '전체'}`);

  // PostgREST 기본 상한(1000행)에 걸리지 않도록 페이지네이션으로 전량을 가져온다.
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from('posts')
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (args.before) query = query.or(`posted_date.lt.${args.before},posted_date.is.null`);

    const { data, error } = await query;
    if (error) {
      console.error('조회 실패:', error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    console.log(`  ${rows.length}건 수집...`);
    if (data.length < PAGE_SIZE) break;
  }

  if (rows.length === 0) {
    console.log('덤프할 행이 없습니다.');
    return;
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(rows, null, 2), 'utf-8');

  if (!existsSync(outPath)) {
    console.error('파일 생성 실패');
    process.exit(1);
  }
  const sizeMB = statSync(outPath).size / 1024 / 1024;

  console.log('');
  console.log(`완료: ${rows.length}건 → ${outPath}`);
  console.log(`크기: ${sizeMB.toFixed(2)} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
