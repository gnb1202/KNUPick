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

  // 자동 슬라이드 (5초마다)
  useEffect(() => {
    if (reminders.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % reminders.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [reminders.length]);

  if (!userId || reminders.length === 0 || !isVisible) return null;

  const current = reminders[currentIndex];
  const activityType = ACTIVITY_TYPES.find(t => current.activityTypes.includes(t.id));

  return (
    <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl shadow-lg mb-6 overflow-hidden animate-fade-in">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* 아이콘 */}
          <div className="flex-shrink-0 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>

          {/* 내용 */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium opacity-90">
              북마크한 공지 마감 {current.daysLeft === 0 ? '오늘' : `D-${current.daysLeft}`}
            </p>
            <p className="text-sm font-bold truncate">
              {activityType?.icon} {current.title}
            </p>
          </div>

          {/* 페이지네이션 (여러 개일 때) */}
          {reminders.length > 1 && (
            <div className="flex-shrink-0 flex items-center gap-1">
              {reminders.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    idx === currentIndex ? 'bg-white' : 'bg-white/40'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* 액션 버튼 */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
          <Link
            href="/bookmarks"
            className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
          >
            보기
          </Link>
          <button
            onClick={() => setIsVisible(false)}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
            aria-label="닫기"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
