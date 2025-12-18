'use client';

import { useMemo } from 'react';
import { PostWithBookmark } from '@/types';
import PostCard from './PostCard';
import EmptyState from './EmptyState';

interface PostListProps {
  posts: PostWithBookmark[];
  isLoading: boolean;
  showExpired?: boolean;
  userId?: string | null;
  onBookmarkChange?: (postId: number, isBookmarked: boolean) => void;
}

export default function PostList({ posts, isLoading, showExpired = false, userId, onBookmarkChange }: PostListProps) {
  // 마감된 게시글 필터링
  const filteredPosts = useMemo(() => {
    if (showExpired) return posts;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return posts.filter((post) => {
      if (!post.deadline) return true;
      const deadline = new Date(post.deadline);
      deadline.setHours(0, 0, 0, 0);
      return deadline >= today;
    });
  }, [posts, showExpired]);

  if (!isLoading && filteredPosts.length === 0) {
    return <EmptyState />;
  }

  return (
    <div>
      {/* 게시글 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredPosts.map((post, index) => (
          <PostCard
            key={post.id}
            post={post}
            index={index}
            userId={userId}
            onBookmarkChange={onBookmarkChange}
          />
        ))}
      </div>

      {/* 로딩 스켈레톤 - 실제 카드와 동일한 구조 */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className={`bg-white dark:bg-slate-800 rounded-2xl shadow-md overflow-hidden animate-fade-in opacity-0 stagger-${i % 5 + 1}`}
            >
              <div className="p-5">
                {/* 태그 스켈레톤 */}
                <div className="flex gap-2 mb-3">
                  <div className="h-6 w-20 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse" />
                  <div className="h-6 w-16 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse" />
                </div>
                {/* 제목 스켈레톤 */}
                <div className="h-7 bg-slate-200 dark:bg-slate-700 rounded-lg mb-2 animate-pulse" />
                <div className="h-7 bg-slate-200 dark:bg-slate-700 rounded-lg w-2/3 mb-3 animate-pulse" />
                {/* 요약 스켈레톤 */}
                <div className="space-y-2 mb-4">
                  <div className="h-4 bg-slate-100 dark:bg-slate-700/50 rounded animate-pulse" />
                  <div className="h-4 bg-slate-100 dark:bg-slate-700/50 rounded animate-pulse" />
                  <div className="h-4 bg-slate-100 dark:bg-slate-700/50 rounded w-4/5 animate-pulse" />
                </div>
                {/* 메타정보 스켈레톤 */}
                <div className="flex items-center gap-4">
                  <div className="h-4 w-24 bg-slate-100 dark:bg-slate-700/50 rounded animate-pulse" />
                  <div className="h-4 w-28 bg-slate-100 dark:bg-slate-700/50 rounded animate-pulse" />
                </div>
              </div>
              {/* CTA 스켈레톤 */}
              <div className="h-11 bg-gradient-to-r from-[#01a753]/30 to-[#02bf5e]/20 dark:from-[#01a753]/20 dark:to-[#02bf5e]/10 animate-pulse" />
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
