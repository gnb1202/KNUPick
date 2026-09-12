'use client';

import { CSSProperties, ReactNode } from 'react';
import { ACTIVITY_TYPES } from '@/lib/constants';

/* ============================================================
 * D-day 계산 헬퍼
 * ============================================================ */
export function daysUntil(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const target = new Date(date);
  if (isNaN(target.getTime())) return null;
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function ddayLabel(date: Date | string | null | undefined): string | null {
  const n = daysUntil(date);
  if (n === null) return null;
  if (n < 0) return '마감';
  if (n === 0) return 'D-DAY';
  return `D-${n}`;
}

export type DDayUrgency = 'hot' | 'warm' | 'cool' | 'expired' | 'none';

export function ddayUrgency(n: number | null): DDayUrgency {
  if (n === null) return 'none';
  if (n < 0) return 'expired';
  if (n <= 3) return 'hot';
  if (n <= 7) return 'warm';
  return 'cool';
}

/* ============================================================
 * Pill - 라운드 라벨
 * ============================================================ */
export function Pill({
  children,
  bg,
  color,
  border,
  size = 'md',
  onClick,
  style,
  className = '',
}: {
  children: ReactNode;
  bg?: string;
  color?: string;
  border?: string;
  size?: 'sm' | 'md';
  onClick?: () => void;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <span
      onClick={onClick}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: size === 'sm' ? '3px 8px' : '4px 10px',
        borderRadius: 999,
        fontSize: size === 'sm' ? 11 : 12,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        cursor: onClick ? 'pointer' : 'default',
        border: border || 'none',
        background: bg || 'transparent',
        color: color || 'inherit',
        transition: 'all .15s',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/* ============================================================
 * ActivityChip - 활동유형 칩
 * ============================================================ */
export function ActivityChip({
  typeId,
  size = 'md',
}: {
  typeId: number;
  size?: 'sm' | 'md';
}) {
  const at = ACTIVITY_TYPES.find((a) => a.id === typeId);
  if (!at) return null;
  return (
    <Pill bg={typeId === 7 ? 'var(--pick-soft)' : 'var(--accent-soft)'} color={typeId === 7 ? 'var(--pick-text)' : 'var(--accent)'} size={size} className="activity-chip">
      <span className="category-icon" aria-hidden="true">{at.icon}</span>
      {at.name}
    </Pill>
  );
}

/* ============================================================
 * DDay - D-day 뱃지
 * ============================================================ */
export function DDay({
  date,
  large = false,
}: {
  date: Date | string | null | undefined;
  large?: boolean;
}) {
  const n = daysUntil(date);
  if (n === null) return null;
  const u = ddayUrgency(n);
  const styleMap: Record<DDayUrgency, CSSProperties> = {
    hot: { background: 'var(--hot-soft)', color: 'var(--hot)' },
    warm: { background: 'var(--warm-soft)', color: 'var(--warm)' },
    cool: { background: 'var(--surface-2)', color: 'var(--text-mute)' },
    expired: {
      background: 'transparent',
      color: 'var(--text-dim)',
      border: '1px solid var(--border)',
    },
    none: {},
  };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: large ? '6px 12px' : '3px 8px',
        borderRadius: 6,
        fontSize: large ? 13 : 11,
        fontWeight: 700,
        letterSpacing: 0.3,
        ...styleMap[u],
      }}
    >
      {ddayLabel(date)}
    </span>
  );
}

/* ============================================================
 * BookmarkBtn - 북마크 토글 버튼
 * ============================================================ */
export function BookmarkBtn({
  active,
  onClick,
  loading = false,
  size = 20,
}: {
  active: boolean;
  onClick: (e: React.MouseEvent) => void;
  loading?: boolean;
  size?: number;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={active ? '북마크 해제' : '북마크'}
      aria-label={active ? '북마크 해제' : '북마크 추가'}
      type="button"
      aria-pressed={active}
      className="bookmark-control"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}
