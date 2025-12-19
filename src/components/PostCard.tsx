'use client';

import { useMemo, useState } from 'react';
import { PostWithBookmark } from '@/types';
import { ACTIVITY_TYPES } from '@/lib/constants';

interface PostCardProps {
  post: PostWithBookmark;
  index: number;
  userId?: string | null;
  onBookmarkChange?: (postId: number, isBookmarked: boolean) => void;
}

export default function PostCard({ post, index, userId, onBookmarkChange }: PostCardProps) {
  const [isBookmarked, setIsBookmarked] = useState(post.isBookmarked || false);
  const [isBookmarkLoading, setIsBookmarkLoading] = useState(false);
  const activityTypeData = post.activity_types
    .map(id => ACTIVITY_TYPES.find(t => t.id === id))
    .filter(Boolean) as { id: number; name: string; icon?: string }[];

  // 마감일 계산 (useMemo로 안정화)
  const daysUntilDeadline = useMemo(() => {
    if (!post.deadline) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const deadline = new Date(post.deadline);
    deadline.setHours(0, 0, 0, 0);
    return Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }, [post.deadline]);

  const isUrgent = daysUntilDeadline !== null && daysUntilDeadline <= 7 && daysUntilDeadline >= 0;
  const isExpired = daysUntilDeadline !== null && daysUntilDeadline < 0;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (post.original_url) {
      // 클릭 기록 (비동기, 실패해도 무시)
      if (userId) {
        fetch('/api/clicks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
          body: JSON.stringify({ postId: post.id }),
        }).catch(() => {});
      }
      window.open(post.original_url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleBookmarkClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!userId) {
      alert('로그인이 필요합니다.');
      return;
    }

    if (isBookmarkLoading) return;

    setIsBookmarkLoading(true);
    const newBookmarkState = !isBookmarked;

    // Optimistic update
    setIsBookmarked(newBookmarkState);

    try {
      if (newBookmarkState) {
        const res = await fetch('/api/bookmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
          body: JSON.stringify({ postId: post.id }),
        });
        if (!res.ok) throw new Error('북마크 추가 실패');
      } else {
        const res = await fetch(`/api/bookmarks/${post.id}`, {
          method: 'DELETE',
          headers: { 'x-user-id': userId },
        });
        if (!res.ok) throw new Error('북마크 삭제 실패');
      }
      onBookmarkChange?.(post.id, newBookmarkState);
    } catch {
      // Rollback on error
      setIsBookmarked(!newBookmarkState);
    } finally {
      setIsBookmarkLoading(false);
    }
  };

  return (
    <a
      href={post.original_url || '#'}
      onClick={handleClick}
      className={`
        group flex flex-col bg-white dark:bg-slate-800 rounded-2xl shadow-md overflow-hidden
        card-hover animate-fade-in opacity-0 h-full
        stagger-${Math.min(index % 5 + 1, 5)}
        focus:outline-none focus:ring-2 focus:ring-[#033885]/50
      `}
    >
      <div className="p-5 flex-1 flex flex-col relative">
        {/* 북마크 버튼 */}
        {userId && (
          <button
            onClick={handleBookmarkClick}
            disabled={isBookmarkLoading}
            className={`
              absolute top-3 right-3 p-2 rounded-full transition-all duration-200
              ${isBookmarked
                ? 'text-red-500 hover:text-red-600 bg-red-50 dark:bg-red-500/20'
                : 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20'
              }
              ${isBookmarkLoading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            aria-label={isBookmarked ? '북마크 해제' : '북마크 추가'}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill={isBookmarked ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth={2}
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
              />
            </svg>
          </button>
        )}

        {/* 태그 */}
        <div className="flex flex-wrap gap-2 mb-3 pr-10">
          {activityTypeData.map((type) => (
            <span
              key={type.id}
              className="px-2.5 py-0.5 text-xs font-medium bg-[#033885]/10 dark:bg-blue-500/20 text-[#033885] dark:text-blue-400 rounded-full"
            >
              {type.icon && <span className="mr-1">{type.icon}</span>}
              {type.name}
            </span>
          ))}
          {isUrgent && (
            <span className="px-2.5 py-0.5 text-xs font-medium bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 rounded-full">
              마감 임박
            </span>
          )}
          {isExpired && (
            <span className="px-2.5 py-0.5 text-xs font-medium bg-slate-100 dark:bg-slate-600 text-slate-500 dark:text-slate-400 rounded-full">
              마감됨
            </span>
          )}
          {!post.content && (
            <span className="px-2.5 py-0.5 text-xs font-medium bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded-full">
              📷 이미지 공지
            </span>
          )}
        </div>

        {/* 제목 */}
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 line-clamp-2">
          {post.title}
        </h3>

        {/* 내용 미리보기 - summary 우선, 없으면 content */}
        {(post.summary || post.content) && (
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 line-clamp-3">
            {post.summary || post.content}
          </p>
        )}

        {/* 메타 정보 */}
        <div className="flex items-stretch gap-3 text-xs text-slate-500 dark:text-slate-300 mt-auto">
          {/* 왼쪽: 날짜 정보 (항상 두 줄 높이 유지) */}
          <div className="flex flex-col gap-1 flex-1 min-h-[44px]">
            {post.posted_date && (
              <span className="flex items-center gap-1">
                <span className="text-slate-400 dark:text-slate-400">게시일</span>
                {new Date(post.posted_date).toLocaleDateString('ko-KR')}
              </span>
            )}
            {post.deadline ? (
              <span className={`flex items-center gap-1 ${isUrgent ? 'text-orange-500 font-medium' : ''}`}>
                <span className={isUrgent ? '' : 'text-slate-400 dark:text-slate-400'}>마감일</span>
                {new Date(post.deadline).toLocaleDateString('ko-KR')}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-slate-400 dark:text-slate-400">
                <span>마감일</span>
                확인불가
              </span>
            )}
          </div>
          {/* 오른쪽: D-day 뱃지 (두 줄 높이) */}
          {daysUntilDeadline !== null && daysUntilDeadline >= 0 && (
            <div className={`flex items-center justify-center px-3 py-1 text-base font-bold rounded-lg ${
              daysUntilDeadline === 0
                ? 'bg-red-500 text-white'
                : isUrgent
                  ? 'bg-orange-500 text-white'
                  : 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300'
            }`}>
              {daysUntilDeadline === 0 ? 'D-day' : `D-${daysUntilDeadline}`}
            </div>
          )}
        </div>
      </div>

      {/* CTA 영역 - 녹색 */}
      <div
        aria-hidden="true"
        className="w-full py-3 text-center text-sm font-semibold
                   bg-gradient-to-r from-[#01a753] to-[#02bf5e] text-white
                   group-hover:from-[#018a45] group-hover:to-[#01a753]
                   transition-all duration-200"
      >
        원본 공지 보기 →
      </div>
    </a>
  );
}
