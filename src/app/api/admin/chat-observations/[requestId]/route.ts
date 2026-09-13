import { requireTester, ownedObservation, privateJson, observationError, observationDb, ObservationHttpError, readObservationJson, observationWriteLimit } from '@/lib/chat-observation-store';
import { effectiveStatus } from '@/lib/chat-observation-types';
import { reviewInputSchema } from '@/lib/chat-review';
import { redactText } from '@/lib/chat-observation';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    const userId = await requireTester(request);
    const row = await ownedObservation(userId, (await context.params).requestId);
    return privateJson({ ...row, effective_status: effectiveStatus(row) });
  } catch (error) { return observationError(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    // Existing records remain reviewable with new capture disabled.
    const userId = await requireTester(request);
    await observationWriteLimit(userId);
    const parsed = reviewInputSchema.safeParse(await readObservationJson(request));
    if (!parsed.success) throw new ObservationHttpError(400, 'INVALID_REVIEW', '검토 내용을 확인해주세요.');
    const { requestId } = await context.params;
    const row = await ownedObservation(userId, requestId);
    if (effectiveStatus(row) === 'in_progress') throw new ObservationHttpError(409, 'RECORD_PENDING', '실행이 끝난 뒤 검토해주세요.');
    const { verdict, reasons, comment } = parsed.data, reset = verdict === 'unreviewed';
    const db = await observationDb();
    const { data, error } = await db.from('chat_observations').update({
      review_verdict: verdict, review_reasons: reset ? [] : reasons,
      review_comment: reset || !comment ? null : redactText(comment), reviewed_by: reset ? null : userId,
      reviewed_at: reset ? null : new Date().toISOString(),
    }).eq('request_id', requestId).eq('tester_user_id', userId).gt('expires_at', new Date().toISOString())
      .select('review_verdict,review_reasons,review_comment,reviewed_by,reviewed_at').abortSignal(AbortSignal.timeout(3000)).maybeSingle();
    if (error) throw new ObservationHttpError(503, 'REVIEW_SAVE_FAILED', '검토를 저장하지 못했어요. 다시 시도해주세요.');
    if (!data) throw new ObservationHttpError(404, 'NOT_FOUND', '기록을 찾을 수 없어요.');
    return privateJson({ review: data });
  } catch (error) { return observationError(error); }
}
