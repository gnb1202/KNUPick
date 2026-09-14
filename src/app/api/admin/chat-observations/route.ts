import { requireTester, observationDb, privateJson, observationError, ObservationHttpError } from '@/lib/chat-observation-store';
import type { ObservationSummary } from '@/lib/chat-review';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const userId = await requireTester(request);
    const days = new URL(request.url).searchParams.get('days') ?? '7';
    if (!['7', '14', '30'].includes(days)) throw new ObservationHttpError(400, 'INVALID_PERIOD', '조회 기간을 확인해주세요.');
    const now = Date.now(), asOf = new Date(now).toISOString(), from = new Date(now - Number(days) * 86400_000).toISOString();
    const limit = 200;
    const db = await observationDb();
    const { data, error } = await db.from('chat_observations')
      .select('request_id,started_at,status,duration_ms,first_text_ms,error_code,feedback_rating,review_verdict,review_reasons,question:payload->>question,versions:payload->versions,result_count:payload->search->resultCount,usage:payload->usage,capture_truncated:payload->captureTruncated')
      .eq('tester_user_id', userId).gt('expires_at', asOf).gte('started_at', from).lte('started_at', asOf)
      .order('started_at', { ascending: false }).order('request_id', { ascending: false }).limit(limit + 1)
      .abortSignal(AbortSignal.timeout(3000));
    if (error) throw new ObservationHttpError(503, 'READ_FAILED', '기록 목록을 불러오지 못했어요.');
    return privateJson({ rows: (data ?? []).slice(0, limit) as unknown as ObservationSummary[], hasMore: (data?.length ?? 0) > limit, limit, from, asOf });
  } catch (error) { return observationError(error); }
}
