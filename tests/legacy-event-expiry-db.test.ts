import { expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { readFileSync } from 'node:fs';

it('excludes ended events before top-k while preserving deadlines, ongoing events, unknown dates and explicit history', async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec(`CREATE EXTENSION vector;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE posts(id int PRIMARY KEY, deadline date, event_start_date date, event_end_date date,
        campus text DEFAULT 'common',activity_types int[] DEFAULT ARRAY[1],embedding vector(1024));
      ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
      CREATE POLICY service_read ON posts FOR SELECT TO service_role USING(true);
      GRANT SELECT ON posts TO service_role;`);
    const emb = (score: number) => JSON.stringify([score, Math.sqrt(1-score**2), ...Array(1022).fill(0)]);
    // Exact reported dates plus boundaries, precedence, no dates, and start-only.
    const rows = [
      [684, null, '2026-09-05', '2026-09-06'],
      [1, null, '2026-09-01', '2026-09-12'],
      [2, null, '2026-09-12', null],
      [3, null, '2026-09-11', null],
      [4, null, null, null],
      [5, '2026-09-11', '2026-10-01', '2026-10-02'],
      [6, '2026-09-13', '2026-09-01', '2026-09-02'],
      [7, null, '2026-09-01', '2026-09-20'],
    ];
    for (const [id, deadline, start, end] of rows)
      await db.query('INSERT INTO posts(id,deadline,event_start_date,event_end_date,embedding) VALUES($1,$2,$3,$4,$5::vector)',[id,deadline,start,end,emb(0.8)]);
    // Higher scoring expired rows must not consume a global vector top-k.
    for (let id=100;id<125;id++) await db.query("INSERT INTO posts(id,event_end_date,embedding) VALUES($1,'2026-09-06',$2::vector)",[id,emb(0.99)]);
    const old = ['202609080005_legacy_clock.sql','20260912115417_legacy_filtered_search.sql']
      .map(file=>readFileSync('supabase/migrations/'+file,'utf8')).join('\n');
    const migration = readFileSync('supabase/migrations/20260912171933_legacy_event_expiry.sql','utf8');
    await db.exec(old);
    const search = async (filtered: boolean, expired=false, asOf='2026-09-12', from: string|null=null) => {
      const args: unknown[] = [emb(1),expired,asOf];
      if(filtered) args.push(from);
      const result = await db.query<{post:{id:number;embedding?:unknown}}>(filtered
        ? "SELECT * FROM legacy_match_posts_filtered_at($1::jsonb,0.36,5,$2,$3::date,ARRAY[1],'cheonan',$4::date,NULL)"
        : 'SELECT * FROM legacy_match_posts_at($1::jsonb,0.36,5,$2,$3::date)',args);
      expect(result.rows.every(r=>!('embedding' in r.post))).toBe(true);
      return result.rows.map(r=>r.post.id);
    };
    expect((await search(false)).every(id=>id>=100&&id<125)).toBe(true);
    await db.exec(migration);
    await db.exec('SET ROLE service_role');
    for (const filtered of [false,true]) {
      expect(await search(filtered)).toEqual([1,2,4,6,7]);
      expect(await search(filtered,false,'2026-09-13')).toEqual([4,6,7]);
      expect((await search(filtered,true)).every(id=>id>=100&&id<125)).toBe(true);
    }
    expect(await search(true,false,'2026-09-12','2026-09-01')).toEqual([6]);
    expect(await search(true,true,'2026-09-12','2026-09-01')).toEqual([5,6]);
    await db.exec('RESET ROLE; SET ROLE anon');
    await expect(search(false)).rejects.toThrow('permission denied');
    await expect(search(true)).rejects.toThrow('permission denied');
    await db.exec('RESET ROLE; SET ROLE authenticated');
    await expect(search(false)).rejects.toThrow('permission denied');
    await expect(search(true)).rejects.toThrow('permission denied');
    await db.exec('RESET ROLE; DROP POLICY service_read ON posts; SET ROLE service_role');
    expect(await search(false)).toEqual([]); expect(await search(true)).toEqual([]);
    await db.exec('RESET ROLE');
    // Previous definitions restore old behavior without removing data; reapply.
    await db.exec(old);
    expect((await search(false)).every(id=>id>=100&&id<125)).toBe(true);
    await db.exec(migration);
    expect(await search(false)).toEqual([1,2,4,6,7]);
    expect((await db.query<{n:number}>('SELECT count(*)::int AS n FROM posts')).rows[0].n).toBe(33);
  } finally { await db.close(); }
});
