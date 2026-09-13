import { feedbackInputSchema, feedbackFromRow, type FeedbackColumns } from '@/lib/chat-feedback';
import { redactText } from '@/lib/chat-observation';
import { requireTester, observationDb, ownedObservation, privateJson, observationError, ObservationHttpError,
  readObservationJson, observationWriteLimit } from '@/lib/chat-observation-store';
export const runtime = 'nodejs';
export async function PUT(request: Request) {
  try {
    const userId = await requireTester(request, true);
    await observationWriteLimit(userId);
    const parsed = feedbackInputSchema.safeParse(await readObservationJson(request));
    if (!parsed.success) throw new ObservationHttpError(400, 'INVALID_FEEDBACK', '평가 내용을 확인해주세요.');
    const input = parsed.data;
    const row = await ownedObservation(userId, input.requestId);
    if (row.status === 'in_progress') throw new ObservationHttpError(409, 'RECORD_PENDING', '기록을 저장 중이에요. 잠시 후 다시 저장해주세요.');
    if (row.status !== 'completed') throw new ObservationHttpError(409, 'ANSWER_NOT_COMPLETED', '완료된 답변에 평가를 남길 수 있어요.');
    const db = await observationDb();
    const { data, error } = await db.from('chat_observations').update({
      feedback_rating: input.rating, feedback_reasons: input.rating ? input.reasons : [],
      feedback_comment: input.rating && input.comment ? redactText(input.comment) : null,
      feedback_updated_at: new Date().toISOString(),
    }).eq('request_id', input.requestId).eq('tester_user_id', userId).eq('status', 'completed')
      .gt('expires_at', new Date().toISOString()).select('feedback_rating,feedback_reasons,feedback_comment,feedback_updated_at')
      .abortSignal(AbortSignal.timeout(3000)).maybeSingle();
    if (error) throw new ObservationHttpError(503, 'FEEDBACK_SAVE_FAILED', '평가를 저장하지 못했어요. 다시 시도해주세요.');
    if (!data) throw new ObservationHttpError(404, 'NOT_FOUND', '기록을 찾을 수 없어요.');
    return privateJson({ feedback: feedbackFromRow(data as FeedbackColumns) });
  } catch (error) { return observationError(error); }
}
