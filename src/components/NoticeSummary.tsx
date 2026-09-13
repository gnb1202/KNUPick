'use client';

import { noticeDateLabel, type NoticeStats } from '@/lib/notice-stats';

export type NoticeSummaryVariant = 'user' | 'overview';

interface NoticeSummaryProps {
  stats: NoticeStats | null;
  error: boolean;
  loading: boolean;
  variant: NoticeSummaryVariant;
  comparison: boolean;
  todayOnly: boolean;
  onVariantChange: (variant: NoticeSummaryVariant) => void;
  onTodayToggle: () => void;
  onRetry: () => void;
}

export default function NoticeSummary({ stats, error, loading, variant, comparison, todayOnly,
  onVariantChange, onTodayToggle, onRetry }: NoticeSummaryProps) {
  const todayCount = stats?.todayCount.toLocaleString() ?? '—';
  const recentCount = stats?.recentCount.toLocaleString() ?? '—';
  const date = stats ? noticeDateLabel(stats.date) : loading ? '날짜 확인 중' : '날짜 확인 불가';
  const dateElement = <time dateTime={stats?.date} title="한국 날짜 · 원문 게시일 기준">{date}</time>;
  const todayAction = {
    type: 'button' as const,
    onClick: onTodayToggle,
    disabled: !stats,
    'aria-pressed': todayOnly,
    'aria-label': todayOnly ? '오늘 공지 필터 해제' : `오늘 올라온 공지 ${todayCount}건만 보기`,
    'data-action': 'today',
  };

  return <div className="notice-summary" data-variant={variant}>
    {comparison && <div className="notice-comparison" role="group" aria-label="공지 영역 디자인 비교">
      <span>디자인 비교</span>
      <div className="notice-comparison-options">
        <button type="button" data-variant-option="user" aria-pressed={variant === 'user'} onClick={() => onVariantChange('user')}>사용자안 · 오늘 강조</button>
        <button type="button" data-variant-option="overview" aria-pressed={variant === 'overview'} onClick={() => onVariantChange('overview')}>제안안 · 전체 안내</button>
      </div>
    </div>}

    {variant === 'user' ? <div className="notice-user-heading">
      <div>
        <div className="notice-date">{dateElement}</div>
        <h2 id="feed-title">오늘 올라온 공지 <button {...todayAction} className="notice-today-number"><span data-stat="today">{todayCount}</span><span className="notice-count-unit">건</span></button></h2>
      </div>
      <div className="notice-total-block" title="오늘을 포함한 최근 30일 · 원문 게시일 기준"><span>최근 30일</span><div><strong data-stat="recent">{recentCount}</strong><span>건</span></div></div>
    </div> : <div className="notice-overview-heading">
      <h2 id="feed-title">공지 모아보기</h2>
      <div className="notice-overview-meta">
        {dateElement}<span className="notice-separator" aria-hidden="true">·</span>
        <button {...todayAction} className="notice-today-inline">오늘 올라온 공지 <strong data-stat="today">{todayCount}</strong>건</button>
        <span className="notice-separator" aria-hidden="true">·</span>
        <span className="notice-total-inline" title="오늘을 포함한 최근 30일 · 원문 게시일 기준">최근 30일 <strong data-stat="recent">{recentCount}</strong>건</span>
      </div>
    </div>}

    {error && <p className="notice-stats-error" role="status">공지 수를 불러오지 못했어요. <button type="button" onClick={onRetry} disabled={loading}>다시 불러오기</button></p>}
    {todayOnly && <div className="notice-active-period"><span>오늘 올라온 공지만 보는 중</span><button type="button" onClick={onTodayToggle}>전체 공지로 돌아가기</button></div>}
  </div>;
}
