import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { currentObservation } from '@/lib/chat-observation';
import { currentUsageMeter, meteredRequestOptions } from '@/lib/usage-meter';
const mocks = vi.hoisted(() => ({ env: { CHAT_OBSERVABILITY_MODE: 'testers', CHAT_OBSERVER_USER_IDS: '', CHAT_AGENTIC_RAG: true, EVALUATION_AS_OF: '', CRON_SECRET: 'test-cron-secret' },
  getUser: vi.fn(), from: vi.fn(), rpc: vi.fn(), legacy: vi.fn(), limit: vi.fn(), after: [] as (() => Promise<void>)[] }));
vi.mock('@/env', () => ({ env: mocks.env }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { auth: { getUser: mocks.getUser }, from: mocks.from, rpc: mocks.rpc } }));
vi.mock('@/lib/legacy/chat', () => ({ POST: mocks.legacy }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.limit }));
vi.mock('next/server', async original => ({ ...await original<typeof import('next/server')>(), after: (fn: () => Promise<void>) => mocks.after.push(fn) }));
import { requireTester, ownedObservation, validateObservationParent, requestObservationIdentity } from '@/lib/chat-observation-store';
import { GET as access } from '@/app/api/chat/observation-access/route';
import { GET as detail, PATCH as review } from '@/app/api/admin/chat-observations/[requestId]/route';
import { GET as list } from '@/app/api/admin/chat-observations/route';
import { GET as purge } from '@/app/api/internal/chat-observations/purge/route';
import { POST } from '@/app/api/chat/route';
import { PUT as feedback } from '@/app/api/chat/feedback/route';
const owner = randomUUID(), other = randomUUID(), sessionId = randomUUID(), rowId = randomUUID();
const req = (headers = {}, url = 'http://localhost/api/chat') => new NextRequest(url, { headers: { authorization: 'Bearer verified-token', ...headers } });
const observed = () => req({ 'x-chat-observation': 'chat-observation-v1', 'x-chat-session-id': sessionId });
function query(result: unknown) {
  const chain = { select: vi.fn(), update: vi.fn(), eq: vi.fn(), gt: vi.fn(), gte: vi.fn(), order: vi.fn(), limit: vi.fn(), lte: vi.fn(), delete: vi.fn(), abortSignal: vi.fn(), maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (r: unknown) => unknown) => Promise.resolve(result).then(resolve) };
  for (const name of ['select', 'update', 'eq', 'gt', 'gte', 'order', 'limit', 'lte', 'delete', 'abortSignal'] as const) chain[name].mockReturnValue(chain);
  return chain;
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.after.length = 0;
  vi.spyOn(console, 'info').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.env.CHAT_OBSERVABILITY_MODE = 'testers'; mocks.env.CHAT_OBSERVER_USER_IDS = owner;
  mocks.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null });
  mocks.rpc.mockImplementation(() => query({ error: null }));
  mocks.limit.mockResolvedValue({ ok: true });
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

const vote = (body: unknown) => new Request('http://localhost/api/chat/feedback', { method: 'PUT', headers: { authorization: 'Bearer verified-token', 'content-type': 'application/json' }, body: JSON.stringify(body) });
it('saves only feedback columns, masks notes, and clears all feedback on withdrawal', async () => {
  const row = query({ data: { status: 'completed' }, error: null });
  const saved = query({ data: { feedback_rating: 'down', feedback_reasons: ['fact'], feedback_comment: '[이메일]', feedback_updated_at: 'now' }, error: null });
  mocks.from.mockReturnValueOnce(row).mockReturnValueOnce(saved);
  const response = await feedback(vote({ requestId: rowId, rating: 'down', reasons: ['fact'], comment: 'me@example.org' }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ feedback: { rating: 'down', reasons: ['fact'], comment: '[이메일]' } });
  expect(saved.update).toHaveBeenCalledWith({ feedback_rating: 'down', feedback_reasons: ['fact'], feedback_comment: '[이메일]', feedback_updated_at: expect.any(String) });
  expect(saved.eq).toHaveBeenCalledWith('tester_user_id', owner); expect(saved.gt).toHaveBeenCalledWith('expires_at', expect.any(String));
  mocks.from.mockReturnValueOnce(row).mockReturnValueOnce(saved);
  await feedback(vote({ requestId: rowId, rating: null, reasons: ['fact'], comment: 'clear this' }));
  expect(saved.update).toHaveBeenLastCalledWith({ feedback_rating: null, feedback_reasons: [], feedback_comment: null, feedback_updated_at: expect.any(String) });
});
it.each([[null, 404], [{ status: 'in_progress' }, 409], [{ status: 'error' }, 409]])('does not fabricate a record to accept feedback for %j', async (data, status) => {
  const chain = query({ data, error: null }); mocks.from.mockReturnValue(chain);
  expect((await feedback(vote({ requestId: rowId, rating: 'up' }))).status).toBe(status);
  expect(chain.update).not.toHaveBeenCalled();
});
it('rejects unknown fields, excessive reasons and oversized feedback before updating storage', async () => {
  for (const extra of [{ payload: {} }, { tester_user_id: other }, { reasons: ['fact', 'fact'] }, { reasons: ['unknown'] }, { reasons: ['fact', 'intent', 'reference', 'other'] }])
    expect((await feedback(vote({ requestId: rowId, rating: 'down', ...extra }))).status).toBe(400);
  expect((await feedback(vote({ requestId: rowId, rating: 'down', comment: 'x'.repeat(5000) }))).status).toBe(413);
  expect(mocks.from).not.toHaveBeenCalled();
});
it('reports rejected feedback saves without exposing upstream errors or pretending they succeeded', async () => {
  mocks.from.mockReturnValueOnce(query({ data: { status: 'completed' }, error: null })).mockReturnValueOnce(query({ data: null, error: { message: 'database secret' } }));
  const response = await feedback(vote({ requestId: rowId, rating: 'up' }));
  expect(response.status).toBe(503); expect(await response.text()).not.toContain('database secret');
  mocks.limit.mockResolvedValue({ ok: false });
  expect((await feedback(vote({ requestId: rowId, rating: 'up' }))).status).toBe(429);
});

it('lists only owner metadata inside the retention window with an explicit bounded sample', async () => {
  const chain = query({ data: Array.from({ length: 201 }, (_, i) => ({ request_id: String(i) })), error: null }); mocks.from.mockReturnValue(chain);
  const response = await list(req({}, 'http://localhost/api/admin/chat-observations?days=30'));
  const data = await response.json(); expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
  expect(data.rows).toHaveLength(200); expect(data.hasMore).toBe(true); expect(data.limit).toBe(200);
  expect(chain.eq).toHaveBeenCalledWith('tester_user_id', owner); expect(chain.gt).toHaveBeenCalledWith('expires_at', data.asOf);
  expect(chain.gte).toHaveBeenCalledWith('started_at', data.from); expect(chain.lte).toHaveBeenCalledWith('started_at', data.asOf);
  expect(chain.select.mock.calls[0][0]).not.toContain('*'); expect(chain.select.mock.calls[0][0]).not.toContain('payload,');
  expect((await list(req({}, 'http://localhost/api/admin/chat-observations?days=999'))).status).toBe(400);
  mocks.getUser.mockResolvedValue({ data: { user: { id: other } } });
  expect((await list(req())).status).toBe(403);
});
it('reviews owned records with capture off without overwriting execution or user feedback', async () => {
  mocks.env.CHAT_OBSERVABILITY_MODE = 'off';
  const row = query({ data: { status: 'completed' }, error: null }), saved = query({ data: { review_verdict: 'issue' }, error: null });
  mocks.from.mockReturnValueOnce(row).mockReturnValueOnce(saved);
  const context = { params: Promise.resolve({ requestId: rowId }) };
  const response = await review(vote({ verdict: 'issue', reasons: ['fact'], comment: 'me@example.org' }), context);
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ review: { review_verdict: 'issue' } });
  expect(saved.update).toHaveBeenCalledWith({ review_verdict: 'issue', review_reasons: ['fact'], review_comment: '[이메일]', reviewed_by: owner, reviewed_at: expect.any(String) });
  expect(saved.eq).toHaveBeenCalledWith('tester_user_id', owner); expect(saved.gt).toHaveBeenCalledWith('expires_at', expect.any(String));
  mocks.from.mockReturnValueOnce(row).mockReturnValueOnce(saved);
  await review(vote({ verdict: 'unreviewed', reasons: ['fact'], comment: 'clear' }), context);
  expect(saved.update).toHaveBeenLastCalledWith({ review_verdict: 'unreviewed', review_reasons: [], review_comment: null, reviewed_by: null, reviewed_at: null });
});
it('rejects review identity forgery, malformed data, unavailable rows and storage failures', async () => {
  const context = { params: Promise.resolve({ requestId: rowId }) };
  for (const extra of [{ tester_user_id: other }, { reviewed_by: other }, { payload: {} }, { verdict: 'unknown' }, { reasons: ['fact', 'fact'] }])
    expect((await review(vote({ verdict: 'issue', ...extra }), context)).status).toBe(400);
  for (const [data, status] of [[null, 404], [{ status: 'in_progress', started_at: new Date().toISOString() }, 409]] as const) {
    const chain = query({ data, error: null }); mocks.from.mockReturnValue(chain);
    expect((await review(vote({ verdict: 'pass' }), context)).status).toBe(status); expect(chain.update).not.toHaveBeenCalled();
  }
  mocks.from.mockReturnValueOnce(query({ data: { status: 'error' }, error: null })).mockReturnValueOnce(query({ error: { message: 'db secret' } }));
  const failed = await review(vote({ verdict: 'issue' }), context); expect(failed.status).toBe(503); expect(await failed.text()).not.toContain('db secret');
});
