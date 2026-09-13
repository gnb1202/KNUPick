'use client';
import { useRef, useState } from 'react';
import { FEEDBACK_REASONS, type AnswerFeedback, type FeedbackReason } from '@/lib/chat-feedback';

const empty: AnswerFeedback = { rating: null, reasons: [], comment: null, updatedAt: null };
export default function ChatFeedback({ requestId, token, initial, onSaved }: {
  requestId: string; token: string; initial?: AnswerFeedback; onSaved: (value: AnswerFeedback) => void;
}) {
  const [saved, setSaved] = useState(initial ?? empty);
  const [reasons, setReasons] = useState<FeedbackReason[]>(initial?.reasons ?? []);
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const busyRef = useRef(false);
  const retryRef = useRef<AnswerFeedback | null>(null);
  const save = async (value: AnswerFeedback) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(''); retryRef.current = value;
    try {
      const response = await fetch('/api/chat/feedback', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId, rating: value.rating, reasons: value.reasons, comment: value.comment }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || '평가를 저장하지 못했어요.');
      const accepted = data.feedback as AnswerFeedback;
      setSaved(accepted); setReasons(accepted.reasons); setComment(accepted.comment ?? ''); onSaved(accepted); retryRef.current = null;
    } catch (e) { setError(e instanceof Error ? e.message : '평가를 저장하지 못했어요.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const rate = (rating: 'up' | 'down') => save({ ...empty, rating: saved.rating === rating ? null : rating });
  return <div className="chat-feedback" data-chat-feedback>
    <div className="chat-feedback-actions">
      <button type="button" disabled={busy} aria-label="도움이 됐어요" aria-pressed={saved.rating === 'up'} onClick={() => rate('up')}>👍</button>
      <button type="button" disabled={busy} aria-label="도움이 되지 않았어요" aria-pressed={saved.rating === 'down'} onClick={() => rate('down')}>👎</button>
      <span role="status">{busy ? '저장 중…' : saved.rating ? '평가가 저장됐어요' : '답변이 도움이 되었나요?'}</span>
    </div>
    {error && <div role="alert">{error} <button type="button" disabled={busy} onClick={() => retryRef.current && save(retryRef.current)}>다시 저장</button></div>}
    {saved.rating === 'down' && <fieldset disabled={busy}>
      <legend>어떤 점이 아쉬웠나요? (선택, 최대 3개)</legend>
      <div className="chat-feedback-reasons">
        {Object.entries(FEEDBACK_REASONS).map(([key, label]) => <label key={key}>
          <input type="checkbox" checked={reasons.includes(key as FeedbackReason)} disabled={!reasons.includes(key as FeedbackReason) && reasons.length >= 3}
            onChange={e => setReasons(list => e.target.checked ? [...list, key as FeedbackReason] : list.filter(r => r !== key))} />{label}
        </label>)}
      </div>
      <label>추가 의견 (선택)
        <textarea aria-label="답변 평가 추가 의견" value={comment} maxLength={500} rows={2} onChange={e => setComment(e.target.value)} placeholder="개인정보 없이 간단히 남겨주세요" />
      </label>
      <button type="button" onClick={() => save({ ...saved, reasons, comment: comment.trim() || null })}>사유 저장</button>
    </fieldset>}
  </div>;
}
