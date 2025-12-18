'use client';

import { useState, useMemo } from 'react';
import { Post } from '@/types';
import { ACTIVITY_TYPES } from '@/lib/constants';

interface CalendarProps {
  posts: Post[];
  onDateSelect: (date: string) => void;
  selectedDate: string | null;
  showExpired?: boolean;
}

export default function Calendar({ posts, onDateSelect, selectedDate, showExpired = false }: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // 달력에 표시할 날짜 배열 생성
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const days: (Date | null)[] = [];

    // 첫 번째 날 이전의 빈 칸
    const startDay = firstDayOfMonth.getDay();
    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }

    // 해당 월의 날짜들
    for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  }, [year, month]);

  // 마감 여부 확인 함수
  const isExpired = (dateString: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const date = new Date(dateString);
    date.setHours(0, 0, 0, 0);
    return date < today;
  };

  // 날짜별 게시글 그룹화 (마감일 + 이벤트 시작일)
  const postsByDate = useMemo(() => {
    const grouped: Record<string, { post: Post; type: 'deadline' | 'event_start' | 'event_end' }[]> = {};

    posts.forEach((post) => {
      // 마감일
      if (post.deadline) {
        // 마감됨 표시가 꺼져있고, 마감일이 지난 경우 건너뛰기
        if (!showExpired && isExpired(post.deadline)) return;

        const dateKey = post.deadline.split('T')[0];
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push({ post, type: 'deadline' });
      }
      // 이벤트 시작일
      if (post.event_start_date) {
        // 마감됨 표시가 꺼져있고, 이벤트 시작일이 지난 경우 건너뛰기
        if (!showExpired && isExpired(post.event_start_date)) return;

        const dateKey = post.event_start_date.split('T')[0];
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push({ post, type: 'event_start' });
      }
      // 이벤트 종료일 (시작일과 다른 경우만)
      if (post.event_end_date && post.event_end_date !== post.event_start_date) {
        // 마감됨 표시가 꺼져있고, 이벤트 종료일이 지난 경우 건너뛰기
        if (!showExpired && isExpired(post.event_end_date)) return;

        const dateKey = post.event_end_date.split('T')[0];
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push({ post, type: 'event_end' });
      }
    });

    return grouped;
  }, [posts, showExpired]);

  const formatDateKey = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const isPast = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const weekDays = ['일', '월', '화', '수', '목', '금', '토'];

  // 활동유형별 색상
  const getActivityColor = (activityTypes: number[]) => {
    if (activityTypes.includes(1)) return 'bg-blue-500'; // 공모전
    if (activityTypes.includes(2)) return 'bg-green-500'; // 대외활동
    if (activityTypes.includes(3)) return 'bg-purple-500'; // 서포터즈
    if (activityTypes.includes(4)) return 'bg-orange-500'; // 인턴십
    if (activityTypes.includes(5)) return 'bg-pink-500'; // 봉사활동
    if (activityTypes.includes(6)) return 'bg-cyan-500'; // 교육/특강
    if (activityTypes.includes(7)) return 'bg-yellow-500'; // 장학금
    return 'bg-slate-500';
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg overflow-hidden">
      {/* 헤더 */}
      <div className="px-6 py-4 bg-[#033885] text-white">
        <div className="flex items-center justify-between">
          <button
            onClick={goToPrevMonth}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="text-center">
            <h2 className="text-xl font-bold">
              {year}년 {month + 1}월
            </h2>
            <button
              onClick={goToToday}
              className="text-sm text-white/80 hover:text-white transition-colors"
            >
              오늘로 이동
            </button>
          </div>

          <button
            onClick={goToNextMonth}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 bg-slate-50 dark:bg-slate-700">
        {weekDays.map((day, index) => (
          <div
            key={day}
            className={`py-3 text-center text-sm font-medium ${
              index === 0 ? 'text-red-500' : index === 6 ? 'text-blue-500' : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7">
        {calendarDays.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="h-32 border-t border-l dark:border-slate-700" />;
          }

          const dateKey = formatDateKey(date);
          const dayPosts = postsByDate[dateKey] || [];
          const isSelected = selectedDate === dateKey;
          const dayOfWeek = date.getDay();

          return (
            <button
              key={dateKey}
              onClick={() => onDateSelect(dateKey)}
              className={`
                h-32 p-1 border-t border-l dark:border-slate-700
                text-left align-top transition-colors
                ${isSelected ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}
                ${isPast(date) && !isToday(date) ? 'opacity-50' : ''}
              `}
            >
              <div className="flex flex-col h-full">
                <span
                  className={`
                    inline-flex items-center justify-center w-7 h-7 text-sm font-medium rounded-full
                    ${isToday(date) ? 'bg-[#033885] text-white' : ''}
                    ${dayOfWeek === 0 ? 'text-red-500' : dayOfWeek === 6 ? 'text-blue-500' : 'text-slate-700 dark:text-slate-300'}
                  `}
                >
                  {date.getDate()}
                </span>

                {/* 게시글 표시 (마감/이벤트 구분) */}
                <div className="flex-1 mt-1 space-y-0.5 overflow-hidden">
                  {dayPosts.slice(0, 4).map((item, idx) => (
                    <div
                      key={`${item.post.id}-${item.type}-${idx}`}
                      className={`
                        text-xs px-1 py-0.5 rounded truncate text-white
                        ${item.type === 'deadline'
                          ? getActivityColor(item.post.activity_types)
                          : item.type === 'event_start'
                            ? 'bg-emerald-500'
                            : 'bg-slate-400'
                        }
                      `}
                      title={`${item.type === 'deadline' ? '마감: ' : item.type === 'event_start' ? '시작: ' : '종료: '}${item.post.title}`}
                    >
                      {item.type === 'event_start' && '▶ '}
                      {item.type === 'event_end' && '■ '}
                      {item.post.title.length > 6 ? item.post.title.slice(0, 6) + '..' : item.post.title}
                    </div>
                  ))}
                  {dayPosts.length > 4 && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 px-1">
                      +{dayPosts.length - 4}개 더
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 범례 */}
      <div className="px-6 py-4 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
        <div className="flex flex-wrap gap-3 text-xs">
          {/* 이벤트 유형 */}
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-emerald-500" />
            <span className="text-slate-600 dark:text-slate-300">▶ 행사 시작</span>
          </div>
          <div className="flex items-center gap-1 mr-2">
            <div className="w-3 h-3 rounded bg-slate-400" />
            <span className="text-slate-600 dark:text-slate-300">■ 행사 종료</span>
          </div>
          <span className="text-slate-400">|</span>
          {/* 활동유형별 마감 */}
          {ACTIVITY_TYPES.filter(t => t.id !== 8).map((type) => {
            const colors: Record<number, string> = {
              1: 'bg-blue-500',
              2: 'bg-green-500',
              3: 'bg-purple-500',
              4: 'bg-orange-500',
              5: 'bg-pink-500',
              6: 'bg-cyan-500',
              7: 'bg-yellow-500',
            };
            return (
              <div key={type.id} className="flex items-center gap-1">
                <div className={`w-3 h-3 rounded ${colors[type.id]}`} />
                <span className="text-slate-600 dark:text-slate-300">{type.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
