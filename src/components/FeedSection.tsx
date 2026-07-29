'use client';

import Link from 'next/link';
import PostCard from './PostCard';
import { PostWithBookmark } from '@/types';

interface FeedSectionProps {
  title: string;
  subtitle?: string;
  posts: PostWithBookmark[];
  isLoading?: boolean;
  userId?: string | null;
  onBookmarkChange?: (postId: number, isBookmarked: boolean) => void;
  viewAllHref?: string;
  emptyMessage?: string;
  maxItems?: number;
  /** 1 = 한 줄 가로 캐러셀, 2 = 2열 그리드, 3 = 3열 그리드 */
  columns?: 1 | 2 | 3;
}

export default function FeedSection({
  title,
  subtitle,
  posts,
  isLoading = false,
  userId,
  onBookmarkChange,
  viewAllHref,
  emptyMessage = '게시물이 없습니다.',
  maxItems = 6,
  columns = 3,
}: FeedSectionProps) {
  const display = posts.slice(0, maxItems);

  const gridClass =
    columns === 1
      ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
      : columns === 2
        ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
        : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';

  return (
    <section style={{ marginBottom: 32 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 14,
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 800,
              color: 'var(--text)',
              letterSpacing: -0.5,
            }}
          >
            {title}
          </h2>
          {subtitle && (
            <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>
              {subtitle}
            </span>
          )}
        </div>
        {viewAllHref && posts.length > maxItems && (
          <Link
            href={viewAllHref}
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--accent)',
              textDecoration: 'none',
            }}
          >
            전체보기 →
          </Link>
        )}
      </div>

      {isLoading && (
        <div className={gridClass}>
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="animate-pulse"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-soft)',
                borderRadius: 'var(--radius-lg)',
                padding: 20,
                height: 200,
              }}
            >
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <div style={{ height: 22, width: 70, background: 'var(--surface-2)', borderRadius: 999 }} />
              </div>
              <div style={{ height: 18, background: 'var(--surface-2)', borderRadius: 6, marginBottom: 8 }} />
              <div style={{ height: 18, background: 'var(--surface-2)', borderRadius: 6, width: '70%', marginBottom: 14 }} />
              <div style={{ height: 12, background: 'var(--surface-2)', borderRadius: 4 }} />
            </div>
          ))}
        </div>
      )}

      {!isLoading && display.length > 0 && (
        <div className={gridClass} style={{ gridAutoRows: '1fr' }}>
          {display.map((p, idx) => (
            <PostCard
              key={p.id}
              post={p}
              index={idx}
              userId={userId}
              onBookmarkChange={onBookmarkChange}
            />
          ))}
        </div>
      )}

      {!isLoading && display.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '32px 16px',
            background: 'var(--surface)',
            border: '1px solid var(--border-soft)',
            borderRadius: 'var(--radius-lg)',
            color: 'var(--text-dim)',
            fontSize: 13,
          }}
        >
          {emptyMessage}
        </div>
      )}
    </section>
  );
}
