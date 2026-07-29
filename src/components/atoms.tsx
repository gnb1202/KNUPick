'use client';

import { CSSProperties, ReactNode } from 'react';
import { ACTIVITY_TYPES, ACTIVITY_COLORS } from '@/lib/constants';

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
  const color = ACTIVITY_COLORS[typeId] || '#64748B';
  return (
    <Pill bg={color + '1A'} color={color} size={size}>
      <span>{at.icon}</span>
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
    hot: { background: '#FF5A4E', color: '#fff' },
    warm: { background: '#F59E0B', color: '#fff' },
    cool: { background: '#94A3B8', color: '#fff' },
    expired: {
      background: 'transparent',
      color: '#94A3B8',
      border: '1px solid #94A3B8',
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
 * SourceMark - 출처 이니셜 뱃지
 * ============================================================ */
export function SourceMark({
  source,
  size = 22,
}: {
  source: string | null | undefined;
  size?: number;
}) {
  const ch = (source || '?').trim()[0] || '?';
  const colors = [
    '#FF5A4E',
    '#3182F6',
    '#0EBD8C',
    '#7C5CFF',
    '#F59E0B',
    '#06B6D4',
    '#EC4899',
  ];
  const idx = (source || '').charCodeAt(0) % colors.length;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: colors[idx],
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.45,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {ch}
    </div>
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
      style={{
        all: 'unset',
        cursor: loading ? 'not-allowed' : 'pointer',
        padding: 6,
        display: 'inline-flex',
        alignItems: 'center',
        color: active ? 'var(--accent)' : 'var(--text-dim)',
        transition: 'color .15s, transform .15s',
        opacity: loading ? 0.5 : 1,
      }}
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
