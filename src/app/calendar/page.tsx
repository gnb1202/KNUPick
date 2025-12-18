'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Calendar from '@/components/Calendar';
import { Post } from '@/types';
import { useTheme } from '@/contexts/ThemeContext';
import { ACTIVITY_TYPES } from '@/lib/constants';

export default function CalendarPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showExpired, setShowExpired] = useState(false);
  const { theme, setTheme, mounted } = useTheme();

  // 마감일 또는 이벤트 날짜가 있는 게시글 불러오기
  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const response = await fetch(
          `/api/posts?pageSize=200&sort=deadline`
        );
        const data = await response.json();

        // 마감일 또는 이벤트 날짜가 있는 게시글만 필터링
        const postsWithDates = data.posts.filter(
          (post: Post) => post.deadline !== null || post.event_start_date !== null
        );

        setPosts(postsWithDates);
      } catch (error) {
        console.error('Failed to fetch posts:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPosts();
  }, []);

  // 마감 여부 확인 함수
  const isExpired = (dateString: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const date = new Date(dateString);
    date.setHours(0, 0, 0, 0);
    return date < today;
  };

  // 선택된 날짜의 게시글 (마감일 + 이벤트 날짜)
  const selectedDateItems = selectedDate
    ? posts.flatMap((post) => {
        const items: { post: Post; type: 'deadline' | 'event_start' | 'event_end' }[] = [];
        if (post.deadline?.split('T')[0] === selectedDate) {
          if (showExpired || !isExpired(post.deadline)) {
            items.push({ post, type: 'deadline' });
          }
        }
        if (post.event_start_date?.split('T')[0] === selectedDate) {
          if (showExpired || !isExpired(post.event_start_date)) {
            items.push({ post, type: 'event_start' });
          }
        }
        if (post.event_end_date?.split('T')[0] === selectedDate && post.event_end_date !== post.event_start_date) {
          if (showExpired || !isExpired(post.event_end_date)) {
            items.push({ post, type: 'event_end' });
          }
        }
        return items;
      })
    : [];

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const getActivityTypeName = (id: number) => {
    return ACTIVITY_TYPES.find((t) => t.id === id)?.name || '기타';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekDays = ['일', '월', '화', '수', '목', '금', '토'];
    const weekDay = weekDays[date.getDay()];
    return `${year}년 ${month}월 ${day}일 (${weekDay})`;
  };

  const getDaysUntil = (deadline: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadlineDate = new Date(deadline);
    deadlineDate.setHours(0, 0, 0, 0);
    const diffTime = deadlineDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { text: '마감됨', color: 'text-slate-500' };
    if (diffDays === 0) return { text: 'D-Day', color: 'text-red-500 font-bold' };
    if (diffDays <= 3) return { text: `D-${diffDays}`, color: 'text-red-500' };
    if (diffDays <= 7) return { text: `D-${diffDays}`, color: 'text-orange-500' };
    return { text: `D-${diffDays}`, color: 'text-slate-600 dark:text-slate-400' };
  };

  return (
    <div className="min-h-screen">
      {/* 헤더 */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* 왼쪽: 게시글 보기 버튼 */}
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-4 py-2
                           bg-gradient-to-r from-[#033885] to-[#01a753]
                           text-white text-sm font-semibold rounded-lg
                           shadow-md shadow-[#033885]/20
                           hover:shadow-lg hover:shadow-[#033885]/30
                           transition-all duration-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                </svg>
                <span>게시글</span>
              </Link>
            </div>

            {/* 중앙: 로고 */}
            <Link href="/" className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
              <div className="w-9 h-9 bg-[#033885] rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-base">K</span>
              </div>
              <div className="hidden sm:block">
                <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                  KNUPick
                </h1>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                  공주대 대회/대외활동
                </p>
              </div>
            </Link>

            {/* 오른쪽: 테마 토글 + 로그인 */}
            <div className="flex items-center gap-2">
              {/* 테마 토글 버튼 */}
              <button
                onClick={cycleTheme}
                className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                title={mounted ? `현재: ${theme === 'light' ? '라이트' : theme === 'dark' ? '다크' : '시스템'} 모드` : '테마 변경'}
              >
                {!mounted ? (
                  <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                ) : theme === 'light' ? (
                  <svg className="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                  </svg>
                ) : theme === 'dark' ? (
                  <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                )}
              </button>

              {/* 로그인 버튼 */}
              <Link
                href="/login"
                className="px-4 py-1.5 bg-[#033885] text-white text-sm font-medium rounded-lg
                         hover:bg-[#022a66] transition-colors"
              >
                로그인
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 캘린더 */}
          <div className="lg:col-span-2">
            {isLoading ? (
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8">
                <div className="animate-pulse space-y-4">
                  <div className="h-12 bg-slate-200 dark:bg-slate-700 rounded-lg" />
                  <div className="grid grid-cols-7 gap-2">
                    {Array.from({ length: 35 }).map((_, i) => (
                      <div key={i} className="h-20 bg-slate-200 dark:bg-slate-700 rounded" />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* 마감됨 표시 토글 */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-4 mb-4">
                  <button
                    onClick={() => setShowExpired(!showExpired)}
                    className="flex items-center gap-2 w-full"
                  >
                    <div
                      className={`relative w-10 h-5 rounded-full transition-colors ${
                        showExpired ? 'bg-[#033885]' : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                          showExpired ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </div>
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      마감된 일정 표시
                    </span>
                  </button>
                </div>
                <Calendar
                  posts={posts}
                  onDateSelect={setSelectedDate}
                  selectedDate={selectedDate}
                  showExpired={showExpired}
                />
              </>
            )}
          </div>

          {/* 선택된 날짜의 게시글 목록 */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg overflow-hidden sticky top-24">
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-700 border-b dark:border-slate-600">
                <h3 className="font-bold text-slate-900 dark:text-white">
                  {selectedDate ? formatDate(selectedDate) : '날짜를 선택하세요'}
                </h3>
                {selectedDate && (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {selectedDateItems.length}개의 일정
                  </p>
                )}
              </div>

              <div className="max-h-[calc(100vh-250px)] overflow-y-auto">
                {!selectedDate ? (
                  <div className="p-6 text-center text-slate-500 dark:text-slate-400">
                    <svg className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p>캘린더에서 날짜를 클릭하면<br />해당 날짜의 일정을 볼 수 있습니다</p>
                  </div>
                ) : selectedDateItems.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 dark:text-slate-400">
                    <svg className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p>이 날짜에 해당하는<br />일정이 없습니다</p>
                  </div>
                ) : (
                  <div className="divide-y dark:divide-slate-700">
                    {selectedDateItems.map((item, idx) => {
                      const typeLabel = item.type === 'deadline' ? '마감' : item.type === 'event_start' ? '시작' : '종료';
                      const typeBgColor = item.type === 'deadline'
                        ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                        : item.type === 'event_start'
                          ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400';
                      return (
                        <a
                          key={`${item.post.id}-${item.type}-${idx}`}
                          href={item.post.original_url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeBgColor}`}>
                                  {typeLabel}
                                </span>
                                <span className="text-xs px-2 py-0.5 bg-[#033885]/10 text-[#033885] dark:bg-[#033885]/20 dark:text-blue-300 rounded-full">
                                  {getActivityTypeName(item.post.activity_types[0])}
                                </span>
                              </div>
                              <h4 className="font-medium text-slate-900 dark:text-white text-sm line-clamp-2">
                                {item.post.title}
                              </h4>
                              {item.post.summary && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                                  {item.post.summary}
                                </p>
                              )}
                            </div>
                            <svg className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
