import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ChatObservation, withObservation, currentObservation, observeCall, safeJson } from '@/lib/chat-observation';
import { OBSERVATION_VERSION, CAPTURE_LIMIT_BYTES, effectiveStatus, type ObservationWrite } from '@/lib/chat-observation-types';
import { beginUsage, withUsageMeter, meteredRequestOptions, currentUsageMeter } from '@/lib/usage-meter';

beforeEach(() => { vi.spyOn(console, 'info').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const make = (write: (r: ObservationWrite) => Promise<void>, incoming?: AbortSignal) => new ChatObservation(randomUUID(), randomUUID(),
  { sessionId: randomUUID(), consentVersion: OBSERVATION_VERSION }, write, incoming);
const start = (o: ChatObservation) => o.start([{ role: 'user', content: '학번 202612345 이메일 me@example.com 전화 010-1234-5678' }], { model: 'gpt-4o', deployment: 'test-commit' }, { previousCardIds: [2, 1], selectedPostId: 1 });

it('connects source snapshots, actual calls, redacted split tokens and usage without recording secrets', async () => {
  const writes: ObservationWrite[] = [];
  const o = make(async r => { writes.push(r); });
  await withUsageMeter(() => withObservation(o, async () => {
    start(o);
    await observeCall('search_posts', { campus: 'cheonan', reasoning: 'private-thought', authorization: 'secret' }, async () => [1], ids => ({ ids }));
    o.event({ type: 'posts', posts: [{ id: 1, title: '지원 공지' }] });
    o.event({ type: 'evidence', evidence: [{ ref: 'E1', post_id: 1, text_content: '당시 원문', url: 'https://example.org/notice', start_offset: 0, end_offset: 5 }] });
    const u = beginUsage('chat', 'gpt-4o'); u?.observe({ prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 }); u?.finish();
    o.event({ type: 'text', delta: 'me@' }); o.event({ type: 'text', delta: 'example.com 답변' });
    o.event({ type: 'done', contextToken: 'signed-secret' }); o.finish('error', 'LATE_ERROR');
  }), false);
  await o.flush();
  expect(writes.map(w => w.revision)).toEqual([1, 2, 3]);
  expect(writes.map(w => w.status)).toEqual(['in_progress', 'in_progress', 'completed']);
  const row = writes.at(-1)!;
  expect(row.payload.answer).toBe('[이메일] 답변');
  expect(row.payload.question).toContain('[학번]');
  expect(row.payload.evidence[0]).toMatchObject({ text_content: '당시 원문', content_hash: expect.stringMatching(/^[a-f0-9]{64}$/) });
  expect(row.payload.reference).toEqual({ previousCardIds: [2, 1], selectedPostId: 1 });
  expect(row.payload.calls[0]).toMatchObject({ name: 'search_posts', status: 'success', input: { campus: 'cheonan' } });
  expect(row.payload.usage).toMatchObject({ complete: true, calls: [{ inputTokens: 10, outputTokens: 2 }] });
  expect(row.first_text_ms).not.toBeNull();
  expect(JSON.stringify(writes)).not.toMatch(/me@example|010-1234|202612345|private-thought|signed-secret|authorization/);
  expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain('지원 공지');
  expect(currentObservation()).toBeUndefined();
});

it('distinguishes failed execution from completion and preserves a partial answer', async () => {
  const writes: ObservationWrite[] = [], o = make(async r => { writes.push(r); });
  await withObservation(o, async () => {
    start(o);
    await expect(observeCall('vector_lookup', {}, async () => { throw Error('sensitive upstream body'); })).rejects.toThrow();
    o.event({ type: 'text', delta: '부분 답변' });
    o.event({ type: 'error', code: 'ANSWER_FAILED' });
  });
  await o.flush();
  expect(writes.at(-1)).toMatchObject({ status: 'error', error_code: 'ANSWER_FAILED', payload: { answer: '부분 답변', calls: [{ status: 'error' }] } });
  expect(JSON.stringify(writes)).not.toContain('sensitive upstream');
});

it('stores cancellation only once and keeps usage when the abort comes from outside the ALS scope', async () => {
  const writes: ObservationWrite[] = [], controller = new AbortController(), o = make(async r => { writes.push(r); }, controller.signal);
  withUsageMeter(() => withObservation(o, () => { start(o); beginUsage('chat', 'gpt-4o'); o.event({ type: 'text', delta: '일부' }); }), false);
  controller.abort(); o.event({ type: 'done' }); o.cancel(); await o.flush();
  expect(o.signal.aborted).toBe(true);
  expect(writes.at(-1)).toMatchObject({ status: 'cancelled', payload: { answer: '일부', usage: { complete: false } } });
  expect(writes).toHaveLength(2);
});

it('bounds failed or hung storage without blocking completion', async () => {
  vi.useFakeTimers();
  const write = vi.fn().mockImplementationOnce(() => new Promise(() => {})).mockRejectedValueOnce(Error('database secret')).mockResolvedValue(undefined);
  const o = make(write); start(o); o.event({ type: 'evidence', evidence: [] }); o.event({ type: 'done' });
  await vi.advanceTimersByTimeAsync(1900); await o.flush();
  expect(write).toHaveBeenCalledTimes(3);
  expect(write.mock.calls[2][0].status).toBe('completed');
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('database secret');
});

it('marks an internal deadline as timed out and a missing terminal record as unknown', async () => {
  vi.useFakeTimers(); const writes: ObservationWrite[] = [], o = make(async r => { writes.push(r); });
  start(o); await vi.advanceTimersByTimeAsync(55_000); await o.flush();
  expect(writes.at(-1)?.status).toBe('timed_out');
  expect(o.signal.aborted).toBe(true);
  expect(effectiveStatus({ status: 'in_progress', started_at: new Date(Date.now() - 301_000).toISOString() })).toBe('unknown');
  expect(effectiveStatus({ status: 'completed', started_at: '2000-01-01' })).toBe('completed');
});

it('does not persist unvalidated input or share concurrent capture state', async () => {
  const write = vi.fn().mockResolvedValue(undefined); const invalid = make(write);
  invalid.finish('error'); await invalid.flush(); expect(write).not.toHaveBeenCalled();
  const a = make(write), b = make(write);
  await Promise.all([a, b].map(o => withObservation(o, async () => {
    start(o); await Promise.resolve(); expect(currentObservation()).toBe(o); o.finish('completed'); await o.flush();
  })));
  expect(new Set(write.mock.calls.map(([r]) => r.request_id)).size).toBe(2);
});

it('caps capture payloads explicitly and keeps ordinary retry behavior when only observing usage', async () => {
  const writes: ObservationWrite[] = [], o = make(async r => { writes.push(r); });
  o.start(Array.from({ length: 30 }, () => ({ role: 'user' as const, content: '가'.repeat(2000) })), {}, null);
  o.event({ type: 'posts', posts: Array.from({ length: 20 }, (_, id) => ({ id, summary: '나'.repeat(5000) })) });
  o.event({ type: 'text', delta: '답'.repeat(64000) }); o.finish('completed'); await o.flush();
  expect(writes.at(-1)?.payload.captureTruncated).toBe(true);
  for (const w of writes) expect(Buffer.byteLength(JSON.stringify(w.payload))).toBeLessThan(CAPTURE_LIMIT_BYTES);
  withUsageMeter(() => { expect(currentUsageMeter()).toBeDefined(); expect(meteredRequestOptions()).toEqual({}); }, false);
  withUsageMeter(() => expect(meteredRequestOptions()).toEqual({ maxRetries: 0 }));
  expect(safeJson({ nested: { cookie: 'secret', query_embedding: [1, 2], topic: 'AI' } })).toEqual({ nested: { topic: 'AI' } });
});
