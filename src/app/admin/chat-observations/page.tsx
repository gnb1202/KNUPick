'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { FEEDBACK_REASONS, type FeedbackReason } from '@/lib/chat-feedback';
import { effectiveStatus, type Json } from '@/lib/chat-observation-types';
import { observationMetrics, versionKey, versionLabel, STATUS_LABELS, REVIEW_VERDICTS, OBSERVATION_PRICE_VERSION,
  type ObservationList, type ObservationDetail, type ReviewColumns, type ReviewVerdict } from '@/lib/chat-review';

const ratio = (n: number, total: number) => total ? `${n}/${total} (${(100 * n / total).toFixed(1)}%)` : '자료 없음 (0건)';
const ms = (value: number | null) => value === null ? '자료 없음' : `${(value / 1000).toFixed(2)}초`;
const date = (value: string) => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
const usd = (value: number | null) => value === null ? '자료 없음' : `$${value.toFixed(6)}`;
function JsonView({ value }: { value: unknown }) { return <pre>{JSON.stringify(value, null, 2)}</pre>; }
function SourceLinks({ items }: { items: Json[] }) {
  const links = items.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    try {
      const url = new URL(String(item.url ?? item.original_url)); if (!['https:', 'http:'].includes(url.protocol)) return [];
      return [{ url: url.href, label: String(item.title ?? item.ref ?? `공지 ${item.post_id ?? item.id ?? ''}`) }];
    } catch { return []; }
  });
  return <ul>{links.map((link, i) => <li key={i}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label} 원문</a></li>)}</ul>;
}

export default function ChatObservationsPage() {
  const { user, session, isLoading } = useAuth();
  if (isLoading) return <main className="observation-page"><p role="status">로그인 확인 중…</p></main>;
  if (!user || !session) return <main className="observation-page"><h1>내 테스트 대화 기록</h1><p>허용된 테스트 계정으로 로그인해주세요.</p><Link href="/">홈으로</Link></main>;
  // Remount on identity change so stale responses cannot expose another account's records.
  return <ReviewWorkspace key={`${user.id}:${session.access_token}`} token={session.access_token} />;
}

function ReviewWorkspace({ token }: { token: string }) {
  const [days, setDays] = useState('7'), [version, setVersion] = useState(''), [status, setStatus] = useState(''), [focus, setFocus] = useState('');
  const [reason, setReason] = useState('');
  const [list, setList] = useState<ObservationList | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null), [detail, setDetail] = useState<ObservationDetail | null>(null);
  const [detailError, setDetailError] = useState(''), [refresh, setRefresh] = useState(0);
  const selectRow = (id: string | null) => { setSelected(id); setDetail(null); setDetailError(''); };
  const resetList = () => { setLoading(true); setError(''); setList(null); selectRow(null); };
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/chat-observations?days=${days}`, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw Error(data.error || '목록을 불러오지 못했어요.'); return data as ObservationList; })
      .then(data => { if (!controller.signal.aborted) setList(data); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '목록을 불러오지 못했어요.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [days, token, refresh]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    fetch(`/api/admin/chat-observations/${selected}`, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw Error(data.error || '기록을 불러오지 못했어요.'); return data as ObservationDetail; })
      .then(data => { if (!controller.signal.aborted) setDetail(data); })
      .catch(e => { if (!controller.signal.aborted) setDetailError(e instanceof Error ? e.message : '기록을 불러오지 못했어요.'); });
    return () => controller.abort();
  }, [selected, token, refresh]);
  const now = list ? Date.parse(list.asOf) : 0;
  const versions = useMemo(() => [...new Map((list?.rows ?? []).map(row => [versionKey(row.versions), row.versions])).entries()], [list]);
  const rows = useMemo(() => (list?.rows ?? []).filter(row => (!version || versionKey(row.versions) === version)
    && (!status || effectiveStatus(row, now) === status)
    && (!focus || (focus === 'down' ? row.feedback_rating === 'down' : row.review_verdict === focus))
    && (!reason || row.review_reasons.includes(reason as FeedbackReason))), [list, version, status, focus, reason, now]);
  const metrics = observationMetrics(rows, now);
  const onSaved = (review: ReviewColumns) => {
    setDetail(previous => previous ? { ...previous, ...review } : null);
    setList(previous => previous ? { ...previous, rows: previous.rows.map(row => row.request_id === selected ? { ...row, review_verdict: review.review_verdict, review_reasons: review.review_reasons } : row) } : null);
  };
  return <main className="observation-page">
    <header><div><Link href="/">← 홈</Link><h1>내 테스트 대화 기록</h1><p>동의한 테스트 대화만 30일 보관합니다. 이 계정의 기록만 조회·검토할 수 있습니다.</p></div>
      <button type="button" disabled={loading} onClick={() => { resetList(); setRefresh(n => n + 1); }}>새로고침</button></header>
    <div className="observation-filters">
      <label>기간<select aria-label="조회 기간" value={days} onChange={e => { resetList(); setDays(e.target.value); setVersion(''); }}><option value="7">최근 7일</option><option value="14">최근 14일</option><option value="30">최근 30일</option></select></label>
      <label>버전<select aria-label="실행 버전" value={version} onChange={e => setVersion(e.target.value)}><option value="">모든 버전</option>{versions.map(([key, value], i) => <option key={key} value={key}>{i + 1}. {versionLabel(value)}</option>)}</select></label>
      <label>상태<select aria-label="실행 상태" value={status} onChange={e => setStatus(e.target.value)}><option value="">모든 상태</option>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>검토 대상<select aria-label="검토 대상" value={focus} onChange={e => setFocus(e.target.value)}><option value="">전체</option><option value="down">👎 평가</option>{Object.entries(REVIEW_VERDICTS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>검토 사유<select aria-label="검토 사유" value={reason} onChange={e => setReason(e.target.value)}><option value="">모든 사유</option>{Object.entries(FEEDBACK_REASONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    </div>
    {loading && <p role="status">기록을 불러오는 중…</p>}
    {error && <p role="alert">{error} 새로고침으로 다시 시도할 수 있습니다.</p>}
    {list && <>
      <p className="observation-scope">{date(list.from)} ~ {date(list.asOf)} KST · 저장된 최신 {list.rows.length}건 중 필터 일치 <strong data-review-count>{rows.length}건</strong>.
        {list.hasMore && <strong> 조회 상한 {list.limit}건을 넘었습니다. 통계는 일부 표본입니다.</strong>}</p>
      <section className="observation-metrics" aria-label="관측 표본 통계">
        <article><h2>실행</h2><p>완료 {ratio(metrics.statuses.completed, metrics.count)}</p><p>실패 {ratio(metrics.statuses.error + metrics.statuses.timed_out, metrics.count)}</p>
          <p>중단 {metrics.statuses.cancelled} · 진행 {metrics.statuses.in_progress} · 종료 미확인 {metrics.statuses.unknown}</p><p>검색 0건 {ratio(metrics.emptySearches, metrics.searches)}</p></article>
        <article><h2>평가와 검토</h2><p>평가 참여 {ratio(metrics.votes, metrics.statuses.completed)}</p><p>평가 중 👎 {ratio(metrics.down, metrics.votes)}</p>
          <p>검토 {metrics.count - metrics.reviews.unreviewed}/{metrics.count} · 문제 {metrics.reviews.issue} · 보류 {metrics.reviews.uncertain}</p><p>미평가 {metrics.statuses.completed - metrics.votes} · 미검토 {metrics.reviews.unreviewed}</p></article>
        <article><h2>완료 답변 지연</h2><p>첫 조각 p50 {ms(metrics.first.p50)} / p95 {ms(metrics.first.p95)} · {metrics.first.count}건</p>
          <p>전체 p50 {ms(metrics.total.p50)} / p95 {ms(metrics.total.p95)} · {metrics.total.count}건</p><p>서버 기준, 브라우저 수신 시간과 다릅니다.</p></article>
        <article><h2>확보된 사용량</h2><p>입력 {metrics.inputTokens.toLocaleString()} · 출력 {metrics.outputTokens.toLocaleString()} 토큰</p>
          <p>사용량 확보 {metrics.completeUsage}건 · 누락·불완전 {metrics.missingUsage}건</p><p>호출 확보 {metrics.knownCalls} · 호출 불완전 {metrics.missingCalls} · 기록 축약 {metrics.truncated}</p>
          <p>환산 합계 {usd(metrics.estimatedUsd)} · 평균 {usd(metrics.meanUsd)}/건 · 계산 가능 {metrics.priced}건</p></article>
      </section>
      <p className="observation-note">검색 0건의 분모는 결과 수가 확보된 검색입니다. 미평가·미검토는 긍정이나 정답으로 계산하지 않습니다.
        저장 자체가 실패한 요청은 이 목록에 없으며 전체 누락률은 알 수 없습니다. 버전마다 질문·날짜·근거가 달라 개선 효과를 단정할 수 없습니다.</p>
      <details className="observation-note"><summary>비용 추정 기준과 기존 평가</summary><p>{OBSERVATION_PRICE_VERSION}: <a href="https://developers.openai.com/api/docs/models/gpt-4o" target="_blank" rel="noopener noreferrer">GPT-4o</a> 입력 $2.50·출력 $10.00/백만 토큰,
        <a href="https://developers.openai.com/api/docs/models/text-embedding-3-small" target="_blank" rel="noopener noreferrer"> 임베딩</a> $0.02/백만 토큰. 캐시 할인·미확보 재시도·세금·환율을 반영하지 않은 표준 단가 추정입니다. 사용량 누락·미등록 모델은 계산에서 제외합니다.</p>
        <p>고정 질문 비교와 이 표본의 관측 통계는 별도로 해석합니다. 자료와 한계는 <a href="/chat-evaluation-baseline.md" target="_blank" rel="noopener noreferrer">기존 고정 평가 요약</a>에서 확인할 수 있습니다.</p></details>
      <div className="observation-columns">
        <section aria-label="실행 목록"><h2>질문 {rows.length}건</h2>
          {!rows.length && <p>이 조건에 해당하는 기록이 없습니다.</p>}
          <ul className="observation-list">{rows.map(row => <li key={row.request_id}><button type="button" data-review-row={row.request_id} aria-pressed={selected === row.request_id} onClick={() => { if (selected !== row.request_id) selectRow(row.request_id); }}>
            <small>{date(row.started_at)} · {STATUS_LABELS[effectiveStatus(row, now)]}</small><strong>{row.question || '(질문 기록 없음)'}</strong>
            <small>{row.feedback_rating === 'up' ? '👍' : row.feedback_rating === 'down' ? '👎' : '미평가'} · {REVIEW_VERDICTS[row.review_verdict]} · {versionLabel(row.versions)}</small>
          </button></li>)}</ul>
        </section>
        <section className="observation-detail" aria-label="실행 상세">
          {detailError && <p role="alert">{detailError}</p>}
          {!detail && !detailError && <p role="status">{selected ? '상세 기록을 불러오는 중…' : '질문을 선택하면 실행과 근거를 확인할 수 있습니다.'}</p>}
          {detail && <>
            <h2>실행 상세</h2><p className="observation-id">요청 {detail.request_id}<br />세션 {detail.session_id}</p>
            <p>{STATUS_LABELS[detail.effective_status]} · {date(detail.started_at)} · 만료 {date(detail.expires_at)}{detail.error_code && ` · ${detail.error_code}`}</p>
            {detail.previous_request_id && <p>이전 실행 <button type="button" onClick={() => selectRow(detail.previous_request_id)}>이전 질문 보기</button></p>}
            {detail.payload.captureTruncated && <p role="status">용량 제한으로 일부 기록이 축약됐습니다.</p>}
            <h3>질문</h3><p className="observation-prose">{detail.payload.question}</p>
            <details><summary>전달된 대화와 참조</summary><JsonView value={{ history: detail.payload.history, reference: detail.payload.reference }} /></details>
            <details open><summary>실제 검색 조건</summary><JsonView value={detail.payload.search} /></details>
            <details><summary>사용한 공지 카드 ({detail.payload.posts.length})</summary><SourceLinks items={detail.payload.posts} /><JsonView value={detail.payload.posts} /></details>
            <details open><summary>전달한 원문 근거 ({detail.payload.evidence.length})</summary><SourceLinks items={detail.payload.evidence} /><JsonView value={detail.payload.evidence} /></details>
            <h3>실행 호출</h3><ol className="observation-calls">{detail.payload.calls.map(call => <li key={call.seq}><details><summary>{call.seq}. {call.name} · {call.status} · 시작 {ms(call.startedMs)} · 소요 {ms(call.durationMs ?? null)}</summary>
              <JsonView value={{ input: call.input, output: call.output, errorCode: call.errorCode }} /></details></li>)}</ol>
            <h3>답변 {detail.status !== 'completed' && '(미완료)'}</h3><p className="observation-prose">{detail.payload.answer || '(확보된 답변 없음)'}</p>
            <details><summary>모델·프롬프트·배포 버전과 사용량</summary><JsonView value={{ versions: detail.payload.versions, usage: detail.payload.usage, redactionVersion: detail.payload.redactionVersion }} /></details>
            <h3>사용자 평가</h3><p>{detail.feedback_rating === 'up' ? '👍' : detail.feedback_rating === 'down' ? '👎' : '미평가'} {detail.feedback_reasons.map(reason => FEEDBACK_REASONS[reason]).join(' · ')}</p>
            {detail.feedback_comment && <p className="observation-prose">{detail.feedback_comment}</p>}
            <ReviewForm key={detail.request_id} detail={detail} token={token} onSaved={onSaved} />
          </>}
        </section>
      </div>
    </>}
  </main>;
}

function ReviewForm({ detail, token, onSaved }: { detail: ObservationDetail; token: string; onSaved: (review: ReviewColumns) => void }) {
  const [verdict, setVerdict] = useState(detail.review_verdict), [reasons, setReasons] = useState(detail.review_reasons), [comment, setComment] = useState(detail.review_comment ?? '');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const save = async () => {
    if (controller.current) return;
    const request = new AbortController(); controller.current = request; setBusy(true); setMessage(''); setError('');
    try {
      const response = await fetch(`/api/admin/chat-observations/${detail.request_id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: request.signal, body: JSON.stringify({ verdict, reasons, comment: comment.trim() || null }) });
      const data = await response.json(); if (!response.ok) throw Error(data.error || '검토를 저장하지 못했어요.');
      if (request.signal.aborted) return;
      const accepted = data.review as ReviewColumns; setVerdict(accepted.review_verdict); setReasons(accepted.review_reasons); setComment(accepted.review_comment ?? ''); onSaved(accepted); setMessage('검토가 저장됐습니다.');
    } catch (e) { if (!request.signal.aborted) setError(e instanceof Error ? e.message : '검토를 저장하지 못했어요.'); }
    finally { if (!request.signal.aborted) { setBusy(false); controller.current = null; } }
  };
  return <section className="observation-review"><h3>원문 확인 후 검토</h3><p>사용자 평가와 별도로 판정합니다. 자동 정답셋에 추가하지 않습니다.</p>
    <fieldset disabled={busy || detail.effective_status === 'in_progress'}><legend>검토 판정</legend>
      <select aria-label="검토 판정" value={verdict} onChange={e => setVerdict(e.target.value as ReviewVerdict)}>{Object.entries(REVIEW_VERDICTS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <div className="chat-feedback-reasons">{Object.entries(FEEDBACK_REASONS).map(([key, label]) => <label key={key}><input type="checkbox" checked={reasons.includes(key as FeedbackReason)}
        disabled={!reasons.includes(key as FeedbackReason) && reasons.length >= 3} onChange={e => setReasons(old => e.target.checked ? [...old, key as FeedbackReason] : old.filter(r => r !== key))} />{label}</label>)}</div>
      <label>검토 메모 (선택, 500자)<textarea aria-label="검토 메모" value={comment} maxLength={500} rows={3} onChange={e => setComment(e.target.value)} /></label>
      <button type="button" onClick={save}>{busy ? '저장 중…' : '검토 저장'}</button>
    </fieldset><p role="status">{message}</p>{error && <p role="alert">{error}</p>}
  </section>;
}
