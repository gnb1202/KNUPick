'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ACTIVITY_TYPES } from '@/lib/constants';

interface Reminder {
  postId: number;
  title: string;
  deadline: string;
  daysLeft: number;
  activityTypes: number[];
}

interface DeadlineAlertProps {
  userId: string | null;
}

export default function DeadlineAlert({ userId }: DeadlineAlertProps) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isVisible, setIsVisible] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!userId) return;
    const fetchReminders = async () => {
      try {
        const response = await fetch('/api/reminders', {
          headers: { 'x-user-id': userId },
        });
        if (!response.ok) return;
        const data = await response.json();
        setReminders(data.reminders || []);
      } catch (error) {
        console.error('알림 조회 오류:', error);
      }
    };
    fetchReminders();
  }, [userId]);

  useEffect(() => {
    if (reminders.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % reminders.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [reminders.length]);

  if (!userId || reminders.length === 0 || !isVisible) return null;

  const current = reminders[currentIndex];
  const at = ACTIVITY_TYPES.find((t) => current.activityTypes.includes(t.id));

  return (
    <div
      className="animate-fade-in"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 18px',
        marginBottom: 24,
        background: 'var(--accent-soft)',
        border: '1px solid color-mix(in oklab, var(--accent) 20%, transparent)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: '50%',
          background: 'var(--accent)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          flexShrink: 0,
        }}
      >
        ⏰
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--accent)',
            marginBottom: 2,
          }}
        >
          북마크한 공지 마감 {current.daysLeft === 0 ? '오늘' : `D-${current.daysLeft}`}
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {at?.icon} {current.title}
        </div>
      </div>
      {reminders.length > 1 && (
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {reminders.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              aria-label={`${idx + 1}번째`}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                border: 'none',
                cursor: 'pointer',
                background:
                  idx === currentIndex
                    ? 'var(--accent)'
                    : 'color-mix(in oklab, var(--accent) 35%, transparent)',
                padding: 0,
              }}
            />
          ))}
        </div>
      )}
      <Link
        href="/bookmarks"
        className="btn-press"
        style={{
          padding: '8px 14px',
          borderRadius: 10,
          background: 'var(--accent)',
          color: '#fff',
          fontSize: 13,
          fontWeight: 700,
          textDecoration: 'none',
          flexShrink: 0,
        }}
      >
        보기
      </Link>
      <button
        onClick={() => setIsVisible(false)}
        aria-label="닫기"
        style={{
          all: 'unset',
          cursor: 'pointer',
          padding: 4,
          color: 'var(--text-dim)',
          fontSize: 18,
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
