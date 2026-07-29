'use client';

import { useState } from 'react';
import { PostWithBookmark } from '@/types';
import { CAMPUS_LABELS } from '@/lib/constants';
import { ActivityChip, BookmarkBtn, DDay, SourceMark, daysUntil } from './atoms';

interface PostCardProps {
  post: PostWithBookmark;
  index: number;
  userId?: string | null;
  onBookmarkChange?: (postId: number, isBookmarked: boolean) => void;
}

export default function PostCard({ post, index, userId, onBookmarkChange }: PostCardProps) {
  const [isBookmarked, setIsBookmarked] = useState(post.isBookmarked || false);
  const [isBookmarkLoading, setIsBookmarkLoading] = useState(false);

  // deadline 우선, 없으면 event_start_date를 D-day 표시 기준으로
  const effectiveDate = post.deadline || post.event_start_date;
  const isDeadlineDate = !!post.deadline;
  const n = daysUntil(effectiveDate);
  const isExpired = isDeadlineDate && n !== null && n < 0;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (post.original_url) {
      if (userId) {
        fetch('/api/clicks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
          body: JSON.stringify({ postId: post.id }),
        }).catch(() => {});
      }
      window.open(post.original_url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleBookmarkClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!userId) {
      alert('로그인이 필요합니다.');
      return;
    }
    if (isBookmarkLoading) return;

    setIsBookmarkLoading(true);
    const next = !isBookmarked;
    setIsBookmarked(next);

    try {
      if (next) {
        const res = await fetch('/api/bookmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
          body: JSON.stringify({ postId: post.id }),
        });
        if (!res.ok) throw new Error('북마크 추가 실패');
      } else {
        const res = await fetch(`/api/bookmarks/${post.id}`, {
          method: 'DELETE',
          headers: { 'x-user-id': userId },
        });
        if (!res.ok) throw new Error('북마크 삭제 실패');
      }
      onBookmarkChange?.(post.id, next);
    } catch {
      setIsBookmarked(!next);
    } finally {
      setIsBookmarkLoading(false);
    }
  };

  const summary = post.summary || post.content;
  const hasImageOnly = !post.content && !post.summary;
  const staggerClass = `stagger-${(index % 5) + 1}`;

  return (
    <a
      href={post.original_url || '#'}
      onClick={handleClick}
      className={`group block animate-fade-up ${staggerClass} card-hover`}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-soft)',
        borderRadius: 'var(--radius-lg)',
        padding: 20,
        boxShadow: 'var(--shadow-card)',
        textDecoration: 'none',
        color: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        height: '100%',
        opacity: isExpired ? 0.7 : 1,
      }}
    >
      {/* 상단: 활동 칩 + D-day + 북마크 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {post.activity_types.slice(0, 2).map((t) => (
            <ActivityChip key={t} typeId={t} />
          ))}
          {hasImageOnly && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                padding: '3px 8px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 600,
                background: 'var(--surface-2)',
                color: 'var(--text-mute)',
              }}
            >
              <span>🖼</span>이미지 공지
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {effectiveDate && <DDay date={effectiveDate} />}
          {userId && (
            <BookmarkBtn
              active={isBookmarked}
              onClick={handleBookmarkClick}
              loading={isBookmarkLoading}
            />
          )}
        </div>
      </div>

      {/* 제목 + 요약 */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <h3
          style={{
            margin: 0,
            fontSize: 17,
            fontWeight: 700,
            lineHeight: 1.35,
            letterSpacing: -0.2,
            color: 'var(--text)',
          }}
          className="line-clamp-2"
        >
          {post.title}
        </h3>
        {summary && (
          <p
            style={{
              margin: '8px 0 0',
              fontSize: 13.5,
              lineHeight: 1.55,
              color: 'var(--text-mute)',
            }}
            className="line-clamp-2"
          >
            {summary}
          </p>
        )}
      </div>

      {/* 푸터: 캠퍼스 · 게시일 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          paddingTop: 10,
          borderTop: '1px solid var(--border-soft)',
          fontSize: 12,
          color: 'var(--text-dim)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <SourceMark source={CAMPUS_LABELS[post.campus] || post.campus} size={20} />
          <span style={{ fontWeight: 500, color: 'var(--text-mute)' }}>
            {CAMPUS_LABELS[post.campus] || post.campus}캠퍼스
          </span>
        </div>
        {post.posted_date && (
          <span>
            {new Date(post.posted_date).toLocaleDateString('ko-KR', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        )}
      </div>
    </a>
  );
}
