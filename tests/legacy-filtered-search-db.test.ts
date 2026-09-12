import { expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { readFileSync } from 'node:fs';

it('applies all filters before top-k, keeps the cutoff, and grants the additive RPC only to the server', async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec(`CREATE EXTENSION vector;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE posts(id int PRIMARY KEY, title text, deadline date, campus text, activity_types int[], embedding vector(1024));
      ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY service_read ON posts FOR SELECT TO service_role USING (true);
      GRANT SELECT ON posts TO service_role;`);
    const emb = (score: number) => JSON.stringify([score, Math.sqrt(1 - score ** 2), ...Array(1022).fill(0)]);
    const rows = [
      [1, '2026-09-15', 'common', [1], 0.7],
      [2, '2026-09-16', 'cheonan', [4], 0.8],
      [3, '2026-09-15', 'kongju', [1], 0.95],
      [4, '2026-09-15', 'cheonan', [7], 0.95],
      [5, '2026-09-15', 'cheonan', [1], 0.35],
      [6, '2026-09-11', 'cheonan', [1], 0.95],
      [7, null, 'common', [1], 0.9],
    ] as const;
    for (const [id, deadline, campus, types, score] of rows)
      await db.query('INSERT INTO posts VALUES ($1,$2,$3,$4,$5,$6::vector)', [id, `notice ${id}`, deadline, campus, [...types], emb(score)]);
    // More than an ordinary global top-20 have better scores, but wrong campus.
    for (let id = 100; id < 125; id++)
      await db.query("INSERT INTO posts VALUES ($1,'decoy','2026-09-15','yesan',ARRAY[1],$2::vector)", [id, emb(0.99)]);
    await db.exec(readFileSync('supabase/migrations/202609080005_legacy_clock.sql', 'utf8'));
    const migration = readFileSync('supabase/migrations/20260912115417_legacy_filtered_search.sql', 'utf8');
    await db.exec(migration);
    const search = (overrides: { from?: string | null; to?: string | null; expired?: boolean; asOf?: string; limit?: number; campus?: string | null; types?: number[] | null } = {}) => db.query<{ post: { id: number; embedding?: unknown }; similarity: number }>(
      'SELECT * FROM legacy_match_posts_filtered_at($1::jsonb,0.36,$2,$3,$4::date,$5::int[],$6,$7::date,$8::date)',
      [emb(1), overrides.limit ?? 5, overrides.expired ?? false, overrides.asOf ?? '2026-09-12',
        overrides.types === undefined ? [1, 4] : overrides.types, overrides.campus === undefined ? 'cheonan' : overrides.campus,
        overrides.from === undefined ? '2026-09-12' : overrides.from, overrides.to === undefined ? '2026-09-16' : overrides.to]);
    await db.exec('SET ROLE service_role');
    const result = (await search()).rows;
    expect(result.map(row => row.post.id)).toEqual([2, 1]);
    expect(result.every(row => row.similarity > 0.36 && !('embedding' in row.post))).toBe(true);
    expect((await search({ limit: 1 })).rows.map(row => row.post.id)).toEqual([2]);
    expect((await search({ from: null, to: null })).rows.map(row => row.post.id)).toEqual([7, 2, 1]);
    expect((await search({ from: '2026-09-01' })).rows.map(row => row.post.id)).toEqual([2, 1]);
    expect((await search({ from: '2026-09-01', expired: true })).rows.map(row => row.post.id)).toEqual([6, 2, 1]);
    expect((await search({ from: '2026-09-17', to: '2026-09-20' })).rows).toEqual([]);
    expect((await search({ from: null, to: null, asOf: '2026-09-17' })).rows.map(row => row.post.id)).toEqual([7]);
    expect((await search({ campus: null, types: [], limit: 999 })).rows).toHaveLength(20);
    await db.exec('RESET ROLE; SET ROLE anon');
    await expect(search()).rejects.toThrow('permission denied');
    await db.exec('RESET ROLE; SET ROLE authenticated');
    await expect(search()).rejects.toThrow('permission denied');
    await db.exec('RESET ROLE');
    expect((await db.query<{ prosecdef: boolean }>("SELECT prosecdef FROM pg_proc WHERE proname='legacy_match_posts_filtered_at'")).rows[0].prosecdef).toBe(false);
    await db.exec('DROP POLICY service_read ON posts; SET ROLE service_role');
    expect((await search()).rows).toEqual([]); // SECURITY INVOKER respects RLS.
    await db.exec('RESET ROLE; DROP FUNCTION legacy_match_posts_filtered_at(jsonb,float,int,boolean,date,int[],text,date,date)');
    await expect(search()).rejects.toThrow('does not exist');
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM posts')).rows[0].count).toBe(32);
    expect((await db.query("SELECT 1 FROM pg_proc WHERE proname='legacy_match_posts_at'")).rows).toHaveLength(1);
    await db.exec(migration);
    expect((await search()).rows.map(row => row.post.id)).toEqual([2, 1]);
  } finally { await db.close(); }
});
