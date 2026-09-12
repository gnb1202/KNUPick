'use client';

import { useRouter } from 'next/navigation';

interface EmptyStateProps {
  onResetFilters?: () => void;
}

export default function EmptyState({ onResetFilters }: EmptyStateProps) {
  const router = useRouter();

  return (
    <div
      style={{
        padding: '60px 20px',
        textAlign: 'center',
        color: 'var(--text-mute)',
      }}
    >
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true" style={{ margin: '0 auto 18px', color: 'var(--pick)' }}><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></svg>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
        조건에 맞는 공지가 없어요
      </div>
      <div style={{ fontSize: 13, marginTop: 6, color: 'var(--text-dim)' }}>
        필터를 조금 풀어보거나, 다른 키워드로 검색해보세요
      </div>
      <div
        style={{
          marginTop: 20,
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <button
          onClick={() => onResetFilters ? onResetFilters() : router.push('/')}
          className="btn-press"
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '8px 16px',
            borderRadius: 10,
            background: 'var(--action)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          전체 보기
        </button>
        <button
          onClick={() => router.push('/?types=1')}
          className="btn-press"
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '8px 16px',
            borderRadius: 10,
            background: 'var(--surface-2)',
            color: 'var(--text)',
            border: '1px solid var(--border-soft)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          공모전
        </button>
        <button
          onClick={() => router.push('/?types=7')}
          className="btn-press"
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '8px 16px',
            borderRadius: 10,
            background: 'var(--surface-2)',
            color: 'var(--text)',
            border: '1px solid var(--border-soft)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          장학금
        </button>
      </div>
    </div>
  );
}
