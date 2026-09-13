import { expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

it('protects private records, rejects late writes and expires rows without extending retention', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);`);
    const owner = randomUUID(), stranger = randomUUID();
    await db.query('INSERT INTO auth.users VALUES ($1),($2)', [owner, stranger]);
    await db.exec(readFileSync('supabase/migrations/20260913091908_chat_observations.sql', 'utf8'));
    const original = { request_id: randomUUID(), tester_user_id: owner, session_id: randomUUID(), previous_request_id: null,
      consent_version: 'chat-observation-v1', started_at: '2026-09-13T09:00:00Z', status: 'in_progress', revision: 1,
      ended_at: null, duration_ms: null, first_text_ms: null, error_code: null, payload: { schemaVersion: 'chat-observation-v1', answer: '' } };
    const save = (r: unknown) => db.query('SELECT public.save_chat_observation($1::jsonb)', [JSON.stringify(r)]);
    const rows = () => db.query<{ status: string; revision: number; tester_user_id: string; expires_at: string; payload: { answer: string } }>('SELECT * FROM public.chat_observations');
    await db.exec('SET ROLE service_role');
    await save(original);
    const expires = (await rows()).rows[0].expires_at;
    await save({ ...original, revision: 3, status: 'completed', ended_at: '2026-09-13T09:00:01Z', duration_ms: 1000, payload: { schemaVersion: 'chat-observation-v1', answer: 'final' } });
    await save({ ...original, revision: 2 });
    await save({ ...original, revision: 9, tester_user_id: stranger });
    expect((await rows()).rows[0]).toMatchObject({ status: 'completed', revision: 3, tester_user_id: owner, expires_at: expires, payload: { answer: 'final' } });
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`RESET ROLE; SET ROLE ${role}`);
      await expect(rows()).rejects.toThrow('permission denied');
      await expect(save(original)).rejects.toThrow('permission denied');
    }
    await db.exec('RESET ROLE');
    expect((await db.query<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class WHERE relname='chat_observations'")).rows[0].relrowsecurity).toBe(true);
    // Even an accidental SELECT grant cannot bypass the absence of RLS policies.
    await db.exec('GRANT SELECT ON public.chat_observations TO authenticated; SET ROLE authenticated');
    expect((await rows()).rows).toEqual([]);
    await db.exec('RESET ROLE; REVOKE SELECT ON public.chat_observations FROM authenticated; SET ROLE service_role');
    await expect(save({ ...original, request_id: randomUUID(), payload: { schemaVersion: 'chat-observation-v1', text: 'x'.repeat(262144) } })).rejects.toThrow('check constraint');
    await db.query('DELETE FROM public.chat_observations WHERE expires_at <= $1::timestamptz', ['2026-10-13T09:00:00Z']);
    expect((await rows()).rows).toEqual([]);
    await save(original);
    await db.exec('RESET ROLE');
    await db.query('DELETE FROM auth.users WHERE id=$1', [owner]);
    expect((await rows()).rows).toEqual([]);
  } finally { await db.close(); }
});
