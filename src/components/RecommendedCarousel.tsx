'use client';

import { useState } from 'react';
import PostCard from './PostCard';
import { PostWithBookmark } from '@/types';

interface RecommendedCarouselProps {
  title: string;
  posts: PostWithBookmark[];
  isLoading?: boolean;
  userId?: string | null;
  onBookmarkChange?: (postId: number, isBookmarked: boolean) => void;
  emptyMessage?: string;
  perPage?: number;
}

export default function RecommendedCarousel({
  title,
  posts,
  isLoading = false,
  userId,
  onBookmarkChange,
  emptyMessage = '추천할 공지가 없어요.',
  perPage = 3,
}: RecommendedCarouselProps) {
  const [page, setPage] = useState(0);
  const [hover, setHover] = useState(false);

  const pageCount = Math.max(1, Math.ceil(posts.length / perPage));
  const safePage = Math.min(page, pageCount - 1);
  const canPrev = safePage > 0;
  const canNext = safePage < pageCount - 1;

  return (
    <section
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: 'relative', minWidth: 0, marginBottom: 32 }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 14,
          gap: 10,
        }}
      >
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
        {pageCount > 1 && (
          <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>
            {safePage + 1} / {pageCount}
          </span>
        )}
      </div>

      {isLoading && posts.length === 0 ? (
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          style={{ gridAutoRows: '1fr' }}
        >
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
      ) : posts.length === 0 ? (
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
      ) : (
        <div style={{ position: 'relative', overflow: 'hidden', paddingTop: 12, marginTop: -12 }}>
          <div
            style={{
              display: 'flex',
              transform: `translateX(-${safePage * 100}%)`,
              transition: 'transform .35s cubic-bezier(.4,.1,.2,1)',
            }}
          >
            {Array.from({ length: pageCount }).map((_, pi) => {
              const slice = posts.slice(pi * perPage, pi * perPage + perPage);
              return (
                <div
                  key={pi}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                  style={{
                    flex: '0 0 100%',
                    gridAutoRows: '1fr',
                  }}
                >
                  {slice.map((p, idx) => (
                    <PostCard
                      key={p.id}
                      post={p}
                      index={pi * perPage + idx}
                      userId={userId}
                      onBookmarkChange={onBookmarkChange}
                    />
                  ))}
                  {/* 마지막 페이지의 카드 크기 유지를 위해 빈 슬롯 채움 */}
                  {Array.from({ length: perPage - slice.length }).map((_, i) => (
                    <div key={`empty-${i}`} />
                  ))}
                </div>
              );
            })}
          </div>

          <CarouselArrow
            side="left"
            visible={hover && canPrev}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          />
          <CarouselArrow
            side="right"
            visible={hover && canNext}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          />
        </div>
      )}
    </section>
  );
}

interface CarouselArrowProps {
  side: 'left' | 'right';
  visible: boolean;
  onClick: () => void;
}

function CarouselArrow({ side, visible, onClick }: CarouselArrowProps) {
  const isLeft = side === 'left';
  return (
    <button
      onClick={onClick}
      aria-label={isLeft ? '이전' : '다음'}
      style={{
        all: 'unset',
        cursor: 'pointer',
        position: 'absolute',
        top: '50%',
        [isLeft ? 'left' : 'right']: 8,
        transform: `translateY(-50%) ${visible ? 'scale(1)' : 'scale(0.8)'}`,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        width: 40,
        height: 40,
        borderRadius: '50%',
        background: 'var(--surface)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.04)',
        color: 'var(--text)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'opacity .2s, transform .2s, background .2s, color .2s',
        zIndex: 5,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--accent)';
        e.currentTarget.style.color = '#fff';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--surface)';
        e.currentTarget.style.color = 'var(--text)';
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {isLeft ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </button>
  );
}
