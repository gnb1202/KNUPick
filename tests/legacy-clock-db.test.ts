import { expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { readFileSync } from 'node:fs';

it('adds the legacy clock RPC on the old posts schema without v2 migrations, and can remove it without losing notices', async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    // Production has vector in public and no evidence/index columns. Do not
    // load the full v2 fixture: it would hide this deployment dependency.
    await db.exec(`CREATE EXTENSION vector;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE posts(id int PRIMARY KEY, title text, deadline date, embedding vector(1024));
      GRANT SELECT ON posts TO service_role;`);
    const embedding = JSON.stringify([1, ...Array(1023).fill(0)]);
    for (const [id, deadline] of [[1, '2026-09-11'], [2, '2026-09-10'], [3, null]] as const)
      await db.query('INSERT INTO posts VALUES ($1,$2,$3,$4::vector)', [id, `notice ${id}`, deadline, embedding]);
    const query = (includeExpired = false, asOf = '2026-09-11') => db.query<{ post: { id: number; embedding?: unknown }; similarity: number }>(
      'SELECT * FROM legacy_match_posts_at($1::jsonb,0.36,5,$2,$3::date)', [embedding, includeExpired, asOf]);
    await expect(query()).rejects.toThrow('does not exist');
    const migration = readFileSync('supabase/migrations/202609080005_legacy_clock.sql', 'utf8');
    await db.exec(migration);
    await db.exec('SET ROLE service_role');
    const result = (await query()).rows;
    expect(result.map(row => row.post.id).sort()).toEqual([1, 3]);
    expect(result.every(row => row.similarity === 1 && !('embedding' in row.post))).toBe(true);
    expect((await query(false, '2026-09-12')).rows.map(row => row.post.id)).toEqual([3]);
    expect((await query(true)).rows.map(row => row.post.id).sort()).toEqual([1, 2, 3]);
    await db.exec('RESET ROLE; SET ROLE anon');
    await expect(query()).rejects.toThrow('permission denied');
    await db.exec('RESET ROLE; SET ROLE authenticated');
    await expect(query()).rejects.toThrow('permission denied');
    await db.exec('RESET ROLE');
    // Roll back this added RPC only. Existing auth and other functions stay put.
    await db.exec('DROP FUNCTION legacy_match_posts_at(jsonb,float,int,boolean,date)');
    await expect(query()).rejects.toThrow('does not exist');
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM posts')).rows[0].count).toBe(3);
    await db.exec(migration);
    expect((await query()).rows.map(row => row.post.id).sort()).toEqual([1, 3]);
  } finally { await db.close(); }
});
