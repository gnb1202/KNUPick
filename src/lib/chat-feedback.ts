import { z } from 'zod';

export const FEEDBACK_REASONS = {
  intent: '의도·조건 오해', retrieval: '관련 공지 누락·무관한 결과', fact: '사실·날짜 오류',
  grounding: '근거·출처 부족', reference: '후속 질문 연결 오류', expression: '답변 표현·길이', other: '기타',
} as const;
export const feedbackReasonSchema = z.enum(['intent', 'retrieval', 'fact', 'grounding', 'reference', 'expression', 'other']);
export type FeedbackReason = z.infer<typeof feedbackReasonSchema>;
export const reasonListSchema = z.array(feedbackReasonSchema).max(3).refine(list => new Set(list).size === list.length, 'Duplicate reason');
export const feedbackInputSchema = z.object({ requestId: z.uuid(), rating: z.enum(['up', 'down']).nullable(),
  reasons: reasonListSchema.default([]), comment: z.string().trim().max(500).nullable().default(null) }).strict();
export type AnswerFeedback = { rating: 'up' | 'down' | null; reasons: FeedbackReason[]; comment: string | null; updatedAt: string | null };
export type FeedbackColumns = { feedback_rating: AnswerFeedback['rating']; feedback_reasons: FeedbackReason[];
  feedback_comment: string | null; feedback_updated_at: string | null };
export const feedbackFromRow = (row: FeedbackColumns): AnswerFeedback => ({ rating: row.feedback_rating, reasons: row.feedback_reasons,
  comment: row.feedback_comment, updatedAt: row.feedback_updated_at });
