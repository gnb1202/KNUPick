import { expect, it } from 'vitest';
import { observationMetrics, observationCost, versionKey, type ObservationSummary } from '@/lib/chat-review';
const now = Date.parse('2026-09-13T10:00:00Z');
const row = (value: Partial<ObservationSummary> = {}): ObservationSummary => ({ request_id: 'fixture', started_at: new Date(now).toISOString(), status: 'completed',
  duration_ms: 1000, first_text_ms: 250, error_code: null, feedback_rating: null, review_verdict: 'unreviewed', review_reasons: [], question: 'test', versions: { model: 'gpt-4o' },
  result_count: null, usage: null, capture_truncated: false, ...value });
it('keeps empty denominators, missing usage and unreviewed answers unknown rather than positive', () => {
  expect(observationMetrics([], now)).toMatchObject({ count: 0, votes: 0, first: { count: 0, p50: null, p95: null }, estimatedUsd: null, meanUsd: null });
  const m = observationMetrics([row(), row({ status: 'error', result_count: null, duration_ms: 50000 }),
    row({ status: 'in_progress', started_at: new Date(now - 300001).toISOString() }),
    row({ feedback_rating: 'down', review_verdict: 'issue', result_count: 0, first_text_ms: null, duration_ms: 3000 }),
    row({ feedback_rating: 'up', review_verdict: 'uncertain', result_count: 5, duration_ms: 2000 })], now);
  expect(m).toMatchObject({ count: 5, statuses: { completed: 3, error: 1, unknown: 1 }, reviews: { unreviewed: 3, pass: 0, issue: 1, uncertain: 1 },
    votes: 2, down: 1, searches: 2, emptySearches: 1, missingUsage: 5, priced: 0, estimatedUsd: null,
    first: { count: 2, p50: 250, p95: 250 }, total: { count: 3, p50: 2000, p95: 3000 } });
});
it('prices only complete supported reports and preserves the count of missing calls', () => {
  const chat = { id: 1, kind: 'chat' as const, model: 'gpt-4o', inputTokens: 1000, outputTokens: 100, complete: true };
  const usage = { version: 'chat-embedding-v1' as const, complete: true, calls: [chat, { ...chat, id: 2, kind: 'embedding' as const, model: 'text-embedding-3-small', outputTokens: 0 }] };
  expect(observationCost(usage)).toBeCloseTo(.00352);
  expect(observationCost({ ...usage, calls: [{ ...chat, model: 'gpt-4o-new' }] })).toBeNull();
  expect(observationCost({ ...usage, complete: false })).toBeNull();
  const m = observationMetrics([row({ usage }), row({ usage: { ...usage, complete: false, calls: [{ ...chat, complete: false, inputTokens: null }] } })], now);
  expect(m).toMatchObject({ completeUsage: 1, missingUsage: 1, knownCalls: 2, missingCalls: 1, inputTokens: 2000, outputTokens: 100, priced: 1 });
  expect(m.meanUsd).toBeCloseTo(.00352);
});
it('groups versions by all recorded model, prompt and deployment values independent of key ordering', () => {
  expect(versionKey({ model: 'm', planningPrompt: 'a' })).toBe(versionKey({ planningPrompt: 'a', model: 'm' }));
  expect(versionKey({ model: 'm', planningPrompt: 'a' })).not.toBe(versionKey({ model: 'm', planningPrompt: 'b' }));
});
