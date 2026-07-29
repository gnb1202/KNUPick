'use client';

import { useEffect, useMemo, useState } from 'react';
import { PostWithBookmark } from '@/types';
import PostCard from './PostCard';
import EmptyState from './EmptyState';

const PAGE_SIZE = 21;

interface PostListProps {
  posts: PostWithBookmark[];
  isLoading: boolean;
  showExpired?: boolean;
  userId?: string | null;
  onBookmarkChange?: (postId: number, isBookmarked: boolean) => void;
  /** "lg:grid-cols-3" (default) or "lg:grid-cols-2" */
  columns?: 2 | 3;
}

export default function PostList({
  posts,
  isLoading,
  showExpired = false,
  userId,
  onBookmarkChange,
  columns = 3,
}: PostListProps) {
  const filteredPosts = useMemo(() => {
    if (showExpired) return posts;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return posts.filter((p) => {
      if (!p.deadline) return true;
      const d = new Date(p.deadline);
      d.setHours(0, 0, 0, 0);
      return d >= today;
    });
  }, [posts, showExpired]);

  const [currentPage, setCurrentPage] = useState(1);

  // 검색·필터·만료 토글로 결과 모집단이 바뀌면 첫 페이지로 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [posts, showExpired]);

  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const visiblePosts = filteredPosts.slice(pageStart, pageStart + PAGE_SIZE);

  const handlePageChange = (p: number) => {
    if (p < 1 || p > totalPages || p === safePage) return;
    setCurrentPage(p);
  };

  if (!isLoading && filteredPosts.length === 0) {
    return <EmptyState />;
  }

  const gridClass =
    columns === 2
      ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
      : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';

  return (
    <div>
      <div className={gridClass} style={{ gridAutoRows: '1fr' }}>
        {visiblePosts.map((post, index) => (
          <PostCard
            key={post.id}
            post={post}
            index={index}
            userId={userId}
            onBookmarkChange={onBookmarkChange}
          />
        ))}
      </div>

      {/* 첫 로드(카드 비어있을 때)만 스켈레톤. 필터 변경으로 인한 재요청 중에는
          기존 카드를 그대로 두어 페이지 높이가 흔들리지 않게 한다. */}
      {isLoading && visiblePosts.length === 0 && (
        <div className={gridClass}>
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} />
          ))}
        </div>
      )}

      {!isLoading && totalPages > 1 && (
        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          totalCount={filteredPosts.length}
          pageStart={pageStart}
          pageEnd={pageStart + visiblePosts.length}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
}

function getPageItems(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const items: (number | 'ellipsis')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) items.push('ellipsis');
  for (let i = start; i <= end; i++) items.push(i);
  if (end < total - 1) items.push('ellipsis');
  items.push(total);
  return items;
}

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageStart: number;
  pageEnd: number;
  onPageChange: (page: number) => void;
}

function Pagination({
  currentPage,
  totalPages,
  totalCount,
  pageStart,
  pageEnd,
  onPageChange,
}: PaginationProps) {
  const items = getPageItems(currentPage, totalPages);

  const navBtn = (label: string, target: number, disabled: boolean) => (
    <button
      type="button"
      onClick={() => onPageChange(target)}
      disabled={disabled}
      aria-label={label}
      style={{
        minWidth: 36,
        height: 36,
        padding: '0 10px',
        borderRadius: 'var(--radius-md, 10px)',
        border: '1px solid var(--border-soft)',
        background: 'var(--surface)',
        color: disabled ? 'var(--text-mute)' : 'var(--text)',
        fontSize: 14,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {label}
    </button>
  );

  return (
    <nav
      aria-label="페이지 이동"
      style={{
        marginTop: 24,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
        {navBtn('‹', currentPage - 1, currentPage <= 1)}
        {items.map((it, idx) =>
          it === 'ellipsis' ? (
            <span
              key={`e-${idx}`}
              style={{
                minWidth: 24,
                textAlign: 'center',
                color: 'var(--text-mute)',
                fontSize: 14,
              }}
            >
              …
            </span>
          ) : (
            <button
              key={it}
              type="button"
              onClick={() => onPageChange(it)}
              aria-current={it === currentPage ? 'page' : undefined}
              style={{
                minWidth: 36,
                height: 36,
                borderRadius: 'var(--radius-md, 10px)',
                border: it === currentPage ? '1px solid var(--accent)' : '1px solid var(--border-soft)',
                background: it === currentPage ? 'var(--accent)' : 'var(--surface)',
                color: it === currentPage ? '#fff' : 'var(--text)',
                fontSize: 14,
                fontWeight: it === currentPage ? 700 : 600,
                cursor: 'pointer',
                transition: 'background 0.15s, border-color 0.15s, color 0.15s',
              }}
            >
              {it}
            </button>
          )
        )}
        {navBtn('›', currentPage + 1, currentPage >= totalPages)}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
        {totalCount.toLocaleString()}건 중 {(pageStart + 1).toLocaleString()}–{pageEnd.toLocaleString()}
      </div>
    </nav>
  );
}

function Skeleton() {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-soft)',
        borderRadius: 'var(--radius-lg)',
        padding: 20,
        height: 200,
      }}
      className="animate-pulse"
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <div style={{ height: 22, width: 70, background: 'var(--surface-2)', borderRadius: 999 }} />
        <div style={{ height: 22, width: 50, background: 'var(--surface-2)', borderRadius: 999 }} />
      </div>
      <div style={{ height: 18, background: 'var(--surface-2)', borderRadius: 6, marginBottom: 8 }} />
      <div style={{ height: 18, background: 'var(--surface-2)', borderRadius: 6, width: '70%', marginBottom: 14 }} />
      <div style={{ height: 12, background: 'var(--surface-2)', borderRadius: 4, marginBottom: 6 }} />
      <div style={{ height: 12, background: 'var(--surface-2)', borderRadius: 4, width: '85%' }} />
    </div>
  );
}
