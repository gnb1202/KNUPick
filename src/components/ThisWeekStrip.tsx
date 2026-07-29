'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { PostWithBookmark } from '@/types';
import { ACTIVITY_TYPES, ACTIVITY_COLORS } from '@/lib/constants';
import { daysUntil } from './atoms';

const DOW_KR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

interface WeekItem {
  post: PostWithBookmark;
  kind: 'deadline' | 'event';
  date: Date;
  n: number;
}

interface Props {
  posts: PostWithBookmark[];
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ThisWeekStrip({ posts }: Props) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const days = useMemo(() => {
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [today]);

  const itemsByDay = useMemo(() => {
    const m: Record<string, WeekItem[]> = {};
    posts.forEach((p) => {
      if (p.deadline) {
        const n = daysUntil(p.deadline);
        if (n !== null && n >= 0 && n <= 13) {
          const k = isoDate(new Date(p.deadline));
          if (!m[k]) m[k] = [];
          m[k].push({ post: p, kind: 'deadline', date: new Date(p.deadline), n });
        }
      }
      if (p.event_start_date) {
        const n = daysUntil(p.event_start_date);
        if (n !== null && n >= 0 && n <= 13) {
          const k = isoDate(new Date(p.event_start_date));
          if (!m[k]) m[k] = [];
          m[k].push({ post: p, kind: 'event', date: new Date(p.event_start_date), n });
        }
      }
    });
    return m;
  }, [posts]);

  const totalCount = Object.values(itemsByDay).reduce((sum, arr) => sum + arr.length, 0);
  if (totalCount === 0) return null;

  return (
    <section>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 14,
          gap: 10,
          flexWrap: 'wrap',
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
            📅 다가오는 2주 마감 · 행사
          </h2>
        </div>
        <Link
          href="/calendar"
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--accent)',
            textDecoration: 'none',
          }}
        >
          전체 캘린더 →
        </Link>
      </div>

      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-soft)',
          borderRadius: 'var(--radius-lg)',
          padding: '14px 0',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))',
            gridAutoRows: 'minmax(110px, auto)',
            rowGap: 14,
            minWidth: '100%',
          }}
        >
        {days.map((d, i) => {
          const isToday = d.getTime() === today.getTime();
          const dow = d.getDay();
          const iso = isoDate(d);
          const items = itemsByDay[iso] || [];
          const isLastInRow = (i + 1) % 7 === 0;
          return (
            <div
              key={i}
              style={{
                padding: '0 10px',
                borderRight: isLastInRow ? 'none' : '1px solid var(--border-soft)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                minHeight: 110,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    letterSpacing: -0.5,
                    color: isToday
                      ? '#fff'
                      : dow === 0
                        ? '#FF5A4E'
                        : dow === 6
                          ? '#3182F6'
                          : 'var(--text)',
                    background: isToday ? 'var(--accent)' : 'transparent',
                    padding: isToday ? '1px 7px' : 0,
                    borderRadius: isToday ? 6 : 0,
                  }}
                >
                  {String(d.getDate()).padStart(2, '0')}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: 'var(--text-dim)',
                    letterSpacing: 1,
                    fontFamily: 'ui-monospace, monospace',
                  }}
                >
                  {DOW_KR[dow]}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {items.slice(0, 3).map((it, j) => {
                  const at = ACTIVITY_TYPES.find((a) => a.id === it.post.activity_types[0]);
                  const baseColor =
                    it.kind === 'deadline'
                      ? '#FF5A4E'
                      : ACTIVITY_COLORS[it.post.activity_types[0] || 8] || '#94A3B8';
                  const title =
                    it.post.title.length > 12
                      ? it.post.title.slice(0, 12) + '…'
                      : it.post.title;
                  return (
                    <a
                      key={j}
                      href={it.post.original_url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '4px 6px',
                        borderLeft: `3px solid ${baseColor}`,
                        background: baseColor + '14',
                        borderRadius: 3,
                        fontSize: 11,
                        lineHeight: 1.3,
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <span style={{ fontSize: 10 }}>{at?.icon}</span>
                      <span
                        style={{
                          fontWeight: 600,
                          color: 'var(--text)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          flex: 1,
                        }}
                      >
                        {title}
                      </span>
                      {it.kind === 'deadline' && (
                        <span style={{ fontSize: 9, fontWeight: 800, color: '#FF5A4E' }}>
                          마감
                        </span>
                      )}
                    </a>
                  );
                })}
                {items.length > 3 && (
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 600 }}>
                    +{items.length - 3}건
                  </div>
                )}
              </div>
            </div>
          );
        })}
        </div>
      </div>
    </section>
  );
}
