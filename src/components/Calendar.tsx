'use client';

import { useState, useMemo } from 'react';
import { Post } from '@/types';
import { ACTIVITY_TYPES, ACTIVITY_COLORS } from '@/lib/constants';

interface CalendarProps {
  posts: Post[];
  onDateSelect: (date: string) => void;
  selectedDate: string | null;
  showExpired?: boolean;
}

type DayItem = { post: Post; type: 'deadline' | 'event_start' | 'event_end' };

export default function Calendar({
  posts,
  onDateSelect,
  selectedDate,
  showExpired = false,
}: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const calendarDays = useMemo(() => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const days: (Date | null)[] = [];
    for (let i = 0; i < first.getDay(); i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
    return days;
  }, [year, month]);

  const isExpired = (s: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(s);
    d.setHours(0, 0, 0, 0);
    return d < today;
  };

  const postsByDate = useMemo(() => {
    const grouped: Record<string, DayItem[]> = {};
    posts.forEach((post) => {
      if (post.deadline) {
        if (!showExpired && isExpired(post.deadline)) return;
        const k = post.deadline.split('T')[0];
        (grouped[k] ||= []).push({ post, type: 'deadline' });
      }
      if (post.event_start_date) {
        if (!showExpired && isExpired(post.event_start_date)) return;
        const k = post.event_start_date.split('T')[0];
        (grouped[k] ||= []).push({ post, type: 'event_start' });
      }
      if (post.event_end_date && post.event_end_date !== post.event_start_date) {
        if (!showExpired && isExpired(post.event_end_date)) return;
        const k = post.event_end_date.split('T')[0];
        (grouped[k] ||= []).push({ post, type: 'event_end' });
      }
    });
    return grouped;
  }, [posts, showExpired]);

  const formatDateKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const isToday = (d: Date) => {
    const t = new Date();
    return (
      d.getDate() === t.getDate() &&
      d.getMonth() === t.getMonth() &&
      d.getFullYear() === t.getFullYear()
    );
  };

  const goToPrev = () => setCurrentDate(new Date(year, month - 1, 1));
  const goToNext = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const weekDays = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-soft)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-soft)',
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
          {year}년 {month + 1}월
        </h2>
        <div style={{ display: 'flex', gap: 4 }}>
          <NavBtn label="이전" onClick={goToPrev}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </NavBtn>
          <NavBtn label="오늘" onClick={goToday}>
            <span style={{ fontSize: 12, fontWeight: 700, padding: '0 4px' }}>오늘</span>
          </NavBtn>
          <NavBtn label="다음" onClick={goToNext}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </NavBtn>
        </div>
      </div>

      {/* 요일 헤더 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
        {weekDays.map((d, i) => (
          <div
            key={d}
            style={{
              padding: 10,
              textAlign: 'center',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.5,
              color: i === 0 ? '#FF5A4E' : i === 6 ? '#3182F6' : 'var(--text-mute)',
              borderBottom: '1px solid var(--border-soft)',
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
        {calendarDays.map((date, idx) => {
          const dow = idx % 7;
          if (!date) {
            return (
              <div
                key={`empty-${idx}`}
                style={{
                  minHeight: 110,
                  borderRight: dow !== 6 ? '1px solid var(--border-soft)' : 'none',
                  borderBottom: '1px solid var(--border-soft)',
                  background: 'var(--surface-2)',
                }}
              />
            );
          }
          const key = formatDateKey(date);
          const items = postsByDate[key] || [];
          const selected = selectedDate === key;
          const today = isToday(date);

          return (
            <button
              key={key}
              onClick={() => onDateSelect(key)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                minHeight: 110,
                padding: 8,
                textAlign: 'left',
                verticalAlign: 'top',
                background: selected ? 'var(--accent-soft)' : 'transparent',
                borderRight: dow !== 6 ? '1px solid var(--border-soft)' : 'none',
                borderBottom: '1px solid var(--border-soft)',
                transition: 'background .15s',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
              onMouseEnter={(e) => {
                if (!selected) e.currentTarget.style.background = 'var(--surface-2)';
              }}
              onMouseLeave={(e) => {
                if (!selected) e.currentTarget.style.background = 'transparent';
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: today ? 24 : 'auto',
                  height: today ? 24 : 'auto',
                  borderRadius: today ? '50%' : 0,
                  background: today ? 'var(--accent)' : 'transparent',
                  color: today
                    ? '#fff'
                    : dow === 0
                      ? '#FF5A4E'
                      : dow === 6
                        ? '#3182F6'
                        : 'var(--text)',
                  fontSize: 13,
                  fontWeight: today ? 800 : 600,
                }}
              >
                {date.getDate()}
              </span>
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  overflow: 'hidden',
                }}
              >
                {items.slice(0, 3).map((item, i) => {
                  const baseColor =
                    item.type === 'deadline'
                      ? '#FF5A4E'
                      : item.type === 'event_start'
                        ? ACTIVITY_COLORS[item.post.activity_types[0]] || '#3182F6'
                        : '#94A3B8';
                  const at = ACTIVITY_TYPES.find((a) => a.id === item.post.activity_types[0]);
                  const titleShort =
                    item.post.title.length > 8
                      ? item.post.title.slice(0, 8) + '…'
                      : item.post.title;
                  return (
                    <div
                      key={`${item.post.id}-${item.type}-${i}`}
                      title={`${item.type === 'deadline' ? '마감' : item.type === 'event_start' ? '시작' : '종료'}: ${item.post.title}`}
                      style={{
                        fontSize: 10,
                        lineHeight: 1.4,
                        padding: '2px 5px',
                        borderLeft: `2px solid ${baseColor}`,
                        background: baseColor + '14',
                        color: 'var(--text)',
                        borderRadius: 3,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontWeight: 600,
                      }}
                    >
                      {item.type === 'deadline' && '🔴 '}
                      {item.type === 'event_start' && '▶ '}
                      {item.type === 'event_end' && '■ '}
                      {at?.icon} {titleShort}
                    </div>
                  );
                })}
                {items.length > 3 && (
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--text-dim)',
                      fontWeight: 600,
                      paddingLeft: 4,
                    }}
                  >
                    +{items.length - 3}건
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 범례 */}
      <div
        style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border-soft)',
          background: 'var(--surface-2)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          fontSize: 11,
          color: 'var(--text-mute)',
        }}
      >
        <Legend color="#FF5A4E" label="마감일" />
        <Legend color="#10B981" label="행사 시작" />
        <Legend color="#94A3B8" label="행사 종료" />
      </div>
    </div>
  );
}

function NavBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="btn-press"
      style={{
        all: 'unset',
        cursor: 'pointer',
        padding: '6px 10px',
        borderRadius: 8,
        background: 'var(--surface-2)',
        color: 'var(--text-mute)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 30,
      }}
    >
      {children}
    </button>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
      {label}
    </span>
  );
}
