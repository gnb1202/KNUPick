import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { currentObservation } from '@/lib/chat-observation';
import { currentUsageMeter, meteredRequestOptions } from '@/lib/usage-meter';
const mocks = vi.hoisted(() => ({ env: { CHAT_OBSERVABILITY_MODE: 'testers', CHAT_OBSERVER_USER_IDS: '', CHAT_AGENTIC_RAG: true, EVALUATION_AS_OF: '', CRON_SECRET: 'test-cron-secret' },
  getUser: vi.fn(), from: vi.fn(), rpc: vi.fn(), legacy: vi.fn(), after: [] as (() => Promise<void>)[] }));
vi.mock('@/env', () => ({ env: mocks.env }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { auth: { getUser: mocks.getUser }, from: mocks.from, rpc: mocks.rpc } }));
vi.mock('@/lib/legacy/chat', () => ({ POST: mocks.legacy }));
vi.mock('next/server', async original => ({ ...await original<typeof import('next/server')>(), after: (fn: () => Promise<void>) => mocks.after.push(fn) }));
import { requireTester, ownedObservation, validateObservationParent, requestObservationIdentity } from '@/lib/chat-observation-store';
import { GET as access } from '@/app/api/chat/observation-access/route';
import { GET as detail } from '@/app/api/admin/chat-observations/[requestId]/route';
import { GET as purge } from '@/app/api/internal/chat-observations/purge/route';
import { POST } from '@/app/api/chat/route';
const owner = randomUUID(), other = randomUUID(), sessionId = randomUUID(), rowId = randomUUID();
const req = (headers = {}, url = 'http://localhost/api/chat') => new NextRequest(url, { headers: { authorization: 'Bearer verified-token', ...headers } });
const observed = () => req({ 'x-chat-observation': 'chat-observation-v1', 'x-chat-session-id': sessionId });
function query(result: unknown) {
  const chain = { select: vi.fn(), eq: vi.fn(), gt: vi.fn(), lte: vi.fn(), delete: vi.fn(), abortSignal: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(result).then(resolve) };
  for (const name of ['select', 'eq', 'gt', 'lte', 'delete', 'abortSignal'] as const) chain[name].mockReturnValue(chain);
  return chain;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.after.length = 0;
  vi.spyOn(console, 'info').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.env.CHAT_OBSERVABILITY_MODE = 'testers'; mocks.env.CHAT_OBSERVER_USER_IDS = owner;
  mocks.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null });
  mocks.rpc.mockImplementation(() => query({ error: null }));
  mocks.legacy.mockImplementation(async () => {
    const o = currentObservation();
    o?.start([{ role: 'user', content: '테스트 질문' }], { deployment: 'test' }, null);
    o?.event({ type: 'text', delta: '검증된 답변' }); o?.event({ type: 'done' });
    return Response.json({ metered: Boolean(currentUsageMeter()), retry: meteredRequestOptions() });
  });
});
afterEach(() => vi.restoreAllMocks());

it('rejects forged identity, invalid tokens and self-assigned admin metadata', async () => {
  await expect(requireTester(req({ authorization: '', 'x-user-id': owner }))).rejects.toMatchObject({ status: 401 });
  expect(mocks.getUser).not.toHaveBeenCalled();
  mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: {} });
  await expect(requireTester(req())).rejects.toMatchObject({ status: 401 });
  mocks.getUser.mockResolvedValueOnce({ data: { user: { id: other, user_metadata: { is_admin: true } } }, error: null });
  await expect(requireTester(req({ 'x-user-id': owner }))).rejects.toMatchObject({ status: 403 });
  expect(mocks.getUser).toHaveBeenCalledWith('verified-token');
});
it('keeps capture off independently of authenticated read access and ordinary chat', async () => {
  mocks.env.CHAT_OBSERVABILITY_MODE = 'off';
  expect(await (await access(req())).json()).toEqual({ canRead: true, canRecord: false });
  const blocked = await POST(observed()); expect(blocked.status).toBe(403); expect(mocks.legacy).not.toHaveBeenCalled();
  const normal = await POST(req({ authorization: '' })); expect(normal.status).toBe(200);
  expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.after).toHaveLength(0);
});
it('links authorized capture to the server ID and persists using after without altering retries', async () => {
  const response = await POST(observed());
  expect(await response.json()).toEqual({ metered: true, retry: {} });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-chat-observation')).toBe('requested');
  await Promise.all(mocks.after.map(fn => fn()));
  const records = mocks.rpc.mock.calls.filter(([name]) => name === 'save_chat_observation').map(([, args]) => args.p_record);
  expect(records).toHaveLength(2);
  expect(records.at(-1)).toMatchObject({ request_id: response.headers.get('x-request-id'), tester_user_id: owner, status: 'completed' });
});
it('uses the verified owner and expiry in every detail lookup, including parent validation', async () => {
  const chain = query({ data: { request_id: rowId, tester_user_id: owner, session_id: sessionId, status: 'completed', started_at: new Date().toISOString() }, error: null });
  mocks.from.mockReturnValue(chain);
  const result = await detail(req(), { params: Promise.resolve({ requestId: rowId }) });
  expect(result.status).toBe(200); expect(result.headers.get('cache-control')).toBe('no-store');
  expect(chain.eq).toHaveBeenCalledWith('tester_user_id', owner); expect(chain.gt).toHaveBeenCalledWith('expires_at', expect.any(String));
  await validateObservationParent(owner, { consentVersion: 'chat-observation-v1', sessionId, previousRequestId: rowId });
  await expect(validateObservationParent(owner, { consentVersion: 'chat-observation-v1', sessionId: randomUUID(), previousRequestId: rowId })).rejects.toMatchObject({ status: 400 });
  mocks.from.mockReturnValue(query({ data: null, error: null }));
  await expect(ownedObservation(owner, rowId)).rejects.toMatchObject({ status: 404 });
  expect(() => requestObservationIdentity(req({ 'x-chat-observation': 'true' }))).toThrow();
});
it('protects retention cleanup with its own secret and deletes only expired rows even with capture off', async () => {
  expect((await purge(req())).status).toBe(401); expect(mocks.from).not.toHaveBeenCalled();
  const chain = query({ error: null, count: 2 }); mocks.from.mockReturnValue(chain); mocks.env.CHAT_OBSERVABILITY_MODE = 'off';
  const response = await purge(req({ authorization: 'Bearer test-cron-secret' }));
  expect(await response.json()).toEqual({ deleted: 2 }); expect(chain.lte).toHaveBeenCalledWith('expires_at', expect.any(String));
});
