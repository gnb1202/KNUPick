import { z } from 'zod';
import { reasonListSchema, type FeedbackColumns, type FeedbackReason } from './chat-feedback';
import { effectiveStatus, type ObservationRow, type ObservationStatus } from './chat-observation-types';
import type { UsageReport } from './usage-meter';

export const REVIEW_VERDICTS = { unreviewed: '미검토', pass: '이상 없음', issue: '문제 확인', uncertain: '판단 보류' } as const;
export type ReviewVerdict = keyof typeof REVIEW_VERDICTS;
export const reviewInputSchema = z.object({ verdict: z.enum(['unreviewed', 'pass', 'issue', 'uncertain']),
  reasons: reasonListSchema.default([]), comment: z.string().trim().max(500).nullable().default(null) }).strict();
export type ReviewColumns = { review_verdict: ReviewVerdict; review_reasons: FeedbackReason[];
  review_comment: string | null; reviewed_by: string | null; reviewed_at: string | null };
export type ObservationDetail = ObservationRow & FeedbackColumns & ReviewColumns & { effective_status: ObservationStatus };
export type ObservationSummary = Pick<ObservationRow, 'request_id' | 'started_at' | 'status' | 'duration_ms' | 'first_text_ms' | 'error_code'>
  & Pick<FeedbackColumns, 'feedback_rating'> & Pick<ReviewColumns, 'review_verdict' | 'review_reasons'>
  & { question: string; versions: Record<string, string>; result_count: number | null; usage: UsageReport | null; capture_truncated: boolean };
export type ObservationList = { rows: ObservationSummary[]; hasMore: boolean; limit: number; from: string; asOf: string };
export const STATUS_LABELS: Record<ObservationStatus, string> = {
  in_progress: '진행 중', completed: '완료', error: '실패', cancelled: '중단', timed_out: '시간 초과', unknown: '종료 확인 불가',
};
export const versionKey = (versions: Record<string, string>) => JSON.stringify(Object.entries(versions ?? {}).sort(([a], [b]) => a.localeCompare(b)));
export const versionLabel = (versions: Record<string, string>) => `${versions?.model ?? '모델 미상'} · ${versions?.mode ?? '모드 미상'} · ${(versions?.deployment ?? '버전 미상').slice(0, 12)}`;
const number = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
export const OBSERVATION_PRICE_VERSION = 'openai-standard-2026-09-13';
/** USD at standard uncached list prices, not invoices. Unknown models stay unknown. */
export function observationCost(usage: UsageReport | null): number | null {
  if (!usage?.complete) return null;
  let usd = 0;
  for (const call of usage.calls) {
    if (!call.complete || !number(call.inputTokens) || !number(call.outputTokens)) return null;
    if (call.kind === 'chat' && call.model === 'gpt-4o') usd += (call.inputTokens * 2.5 + call.outputTokens * 10) / 1e6;
    else if (call.kind === 'embedding' && call.model === 'text-embedding-3-small') usd += call.inputTokens * .02 / 1e6;
    else return null;
  }
  return usd;
}
const latency = (values: number[]) => {
  const sorted = values.sort((a, b) => a - b);
  const percentile = (p: number) => sorted.length ? sorted[Math.ceil(sorted.length * p) - 1] : null;
  return { count: sorted.length, p50: percentile(.5), p95: percentile(.95) };
};
/** Descriptive statistics for captured rows only; missing records and correctness cannot be inferred. */
export function observationMetrics(rows: ObservationSummary[], now: number) {
  const statuses = { in_progress: 0, completed: 0, error: 0, cancelled: 0, timed_out: 0, unknown: 0 };
  const reviews = { unreviewed: 0, pass: 0, issue: 0, uncertain: 0 };
  let searches = 0, emptySearches = 0, votes = 0, down = 0, completeUsage = 0, missingUsage = 0;
  let inputTokens = 0, outputTokens = 0, knownCalls = 0, missingCalls = 0, truncated = 0;
  let priced = 0, estimatedUsd = 0;
  const first: number[] = [], total: number[] = [];
  for (const row of rows) {
    const status = effectiveStatus(row, now); statuses[status]++; reviews[row.review_verdict]++;
    if (number(row.result_count)) { searches++; if (!row.result_count) emptySearches++; }
    if (row.feedback_rating) { votes++; if (row.feedback_rating === 'down') down++; }
    if (row.capture_truncated) truncated++;
    const cost = observationCost(row.usage); if (cost !== null) { priced++; estimatedUsd += cost; }
    // Latency comparison excludes incomplete answers; absence is never a zero.
    if (status === 'completed') {
      if (number(row.first_text_ms)) first.push(row.first_text_ms);
      if (number(row.duration_ms)) total.push(row.duration_ms);
    }
    if (row.usage?.complete) completeUsage++; else missingUsage++;
    for (const call of row.usage?.calls ?? []) {
      if (call.complete && number(call.inputTokens) && number(call.outputTokens)) {
        inputTokens += call.inputTokens; outputTokens += call.outputTokens; knownCalls++;
      } else missingCalls++;
    }
  }
  return { count: rows.length, statuses, reviews, searches, emptySearches, votes, down, truncated,
    first: latency(first), total: latency(total), completeUsage, missingUsage, knownCalls, missingCalls, inputTokens, outputTokens,
    priced, estimatedUsd: priced ? estimatedUsd : null, meanUsd: priced ? estimatedUsd / priced : null };
}
