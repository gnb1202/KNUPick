'use client';

import Link from 'next/link';
import PostCard from './PostCard';
import { PostWithBookmark } from '@/types';

interface FeedSectionProps {
  title: string;
  posts: PostWithBookmark[];
  isLoading?: boolean;
  userId?: string | null;
  onBookmarkChange?: (postId: number, isBookmarked: boolean) => void;
  viewAllHref?: string;
  emptyMessage?: string;
  maxItems?: number;
}

export default function FeedSection({
  title,
  posts,
  isLoading = false,
  userId,
  onBookmarkChange,
  viewAllHref,
  emptyMessage = '게시물이 없습니다.',
  maxItems = 6,
}: FeedSectionProps) {
  const displayPosts = posts.slice(0, maxItems);

  return (
    <section className="mb-8">
      {/* 섹션 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          {title}
        </h2>
        {viewAllHref && posts.length > maxItems && (
          <Link
            href={viewAllHref}
            className="text-sm text-[#033885] hover:underline"
          >
            전체보기 →
          </Link>
        )}
      </div>

      {/* 로딩 스켈레톤 */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-md overflow-hidden animate-pulse"
            >
              <div className="p-5">
                <div className="flex gap-2 mb-3">
                  <div className="h-6 w-20 bg-slate-200 dark:bg-slate-700 rounded-full" />
                </div>
                <div className="h-7 bg-slate-200 dark:bg-slate-700 rounded-lg mb-2" />
                <div className="h-7 bg-slate-200 dark:bg-slate-700 rounded-lg w-2/3 mb-3" />
                <div className="space-y-2 mb-4">
                  <div className="h-4 bg-slate-100 dark:bg-slate-700/50 rounded" />
                  <div className="h-4 bg-slate-100 dark:bg-slate-700/50 rounded w-4/5" />
                </div>
              </div>
              <div className="h-11 bg-gradient-to-r from-[#01a753]/30 to-[#02bf5e]/20" />
            </div>
          ))}
        </div>
      )}

      {/* 게시물 목록 */}
      {!isLoading && displayPosts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayPosts.map((post, index) => (
            <PostCard
              key={post.id}
              post={post}
              index={index}
              userId={userId}
              onBookmarkChange={onBookmarkChange}
            />
          ))}
        </div>
      )}

      {/* 빈 상태 */}
      {!isLoading && displayPosts.length === 0 && (
        <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
          <p className="text-slate-500 dark:text-slate-400">{emptyMessage}</p>
        </div>
      )}
    </section>
  );
}
