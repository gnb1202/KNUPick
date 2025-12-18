'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AdminStats } from '@/types';
import { ACTIVITY_TYPES } from '@/lib/constants';

interface CrawlResult {
  success: boolean;
  crawled: number;
  newPosts: number;
  inserted: number;
  llmAnalyzed: number;
  llmEnabled: boolean;
  durationMs: number;
  error?: string;
}

export default function AdminPage() {
  const router = useRouter();
  const { user, profile, isLoading: authLoading } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlResult, setCrawlResult] = useState<CrawlResult | null>(null);

  const fetchStats = useCallback(async () => {
    if (!user) return;
    try {
      setIsLoading(true);
      const res = await fetch('/api/admin/stats', {
        headers: { 'x-user-id': user.id },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch stats');
      }

      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const handleCrawl = async () => {
    if (!user || isCrawling) return;

    if (!confirm('크롤링을 실행하시겠습니까?\n(수 분이 소요될 수 있습니다)')) {
      return;
    }

    setIsCrawling(true);
    setCrawlResult(null);
    setError(null);

    try {
      const res = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'x-user-id': user.id },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '크롤링 실패');
      }

      setCrawlResult(data);
      // 크롤링 완료 후 통계 새로고침
      fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : '크롤링 중 오류가 발생했습니다');
    } finally {
      setIsCrawling(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login');
        return;
      }
      if (!profile?.is_admin) {
        router.push('/');
        return;
      }
      fetchStats();
    }
  }, [authLoading, user, profile, router, fetchStats]);

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#033885]"></div>
      </div>
    );
  }

  if (!profile?.is_admin) {
    return null;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* 헤더 */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                관리자 대시보드
              </h1>
            </div>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {profile?.nickname || profile?.username}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* 통계 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">총 게시글</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {stats?.totalPosts.toLocaleString() || 0}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">오늘 크롤링</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {stats?.todayPosts || 0}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">총 사용자</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {stats?.totalUsers || 0}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">마감 예정</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  {stats?.postsWithDeadline || 0}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 관리 메뉴 */}
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">관리 메뉴</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Link
            href="/admin/posts"
            className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 hover:border-[#033885] dark:hover:border-[#033885] transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 transition-colors">
                <svg className="w-6 h-6 text-slate-600 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">게시글 관리</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">게시글 조회, 수정, 삭제</p>
              </div>
            </div>
          </Link>

          <Link
            href="/admin/users"
            className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 hover:border-[#033885] dark:hover:border-[#033885] transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center group-hover:bg-purple-100 dark:group-hover:bg-purple-900/30 transition-colors">
                <svg className="w-6 h-6 text-slate-600 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">사용자 관리</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">사용자 목록, 권한 관리</p>
              </div>
            </div>
          </Link>

          <button
            onClick={handleCrawl}
            disabled={isCrawling}
            className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 hover:border-[#033885] dark:hover:border-[#033885] transition-colors group text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center group-hover:bg-green-100 dark:group-hover:bg-green-900/30 transition-colors ${isCrawling ? 'animate-pulse' : ''}`}>
                <svg className={`w-6 h-6 text-slate-600 dark:text-slate-400 group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors ${isCrawling ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  {isCrawling ? '크롤링 중...' : '크롤링 실행'}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {isCrawling ? '잠시만 기다려주세요' : '수동 크롤링 실행'}
                </p>
              </div>
            </div>
          </button>
        </div>

        {/* 크롤링 결과 */}
        {crawlResult && (
          <div className="mb-8 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-6">
            <h3 className="font-semibold text-green-800 dark:text-green-200 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              크롤링 완료
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-green-600 dark:text-green-400">수집된 게시글</p>
                <p className="font-semibold text-green-800 dark:text-green-200">{crawlResult.crawled}개</p>
              </div>
              <div>
                <p className="text-green-600 dark:text-green-400">신규 게시글</p>
                <p className="font-semibold text-green-800 dark:text-green-200">{crawlResult.newPosts}개</p>
              </div>
              <div>
                <p className="text-green-600 dark:text-green-400">저장 완료</p>
                <p className="font-semibold text-green-800 dark:text-green-200">{crawlResult.inserted}개</p>
              </div>
              <div>
                <p className="text-green-600 dark:text-green-400">소요 시간</p>
                <p className="font-semibold text-green-800 dark:text-green-200">{(crawlResult.durationMs / 1000).toFixed(1)}초</p>
              </div>
            </div>
            {crawlResult.llmEnabled && (
              <p className="mt-3 text-xs text-green-600 dark:text-green-400">
                LLM 분석: {crawlResult.llmAnalyzed}개 게시글 처리
              </p>
            )}
            <button
              onClick={() => setCrawlResult(null)}
              className="mt-3 text-xs text-green-600 dark:text-green-400 hover:underline"
            >
              닫기
            </button>
          </div>
        )}

        {/* 활동유형별 통계 */}
        {stats?.postsByActivityType && Object.keys(stats.postsByActivityType).length > 0 && (
          <>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">활동유형별 게시글</h2>
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
              <div className="space-y-4">
                {Object.entries(stats.postsByActivityType).map(([typeId, count]) => {
                  const activityType = ACTIVITY_TYPES.find(t => t.id === Number(typeId));
                  return (
                    <div key={typeId} className="flex items-center gap-4">
                      <div className="w-32 text-sm text-slate-600 dark:text-slate-400">
                        {activityType?.name || `유형 ${typeId}`}
                      </div>
                      <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-4 overflow-hidden">
                        <div
                          className="h-full bg-[#033885] rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min((count / stats.totalPosts) * 100, 100)}%`,
                          }}
                        />
                      </div>
                      <div className="w-16 text-right text-sm font-medium text-slate-900 dark:text-white">
                        {count}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
