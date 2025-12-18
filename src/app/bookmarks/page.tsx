'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import PostList from '@/components/PostList';
import { useAuth } from '@/contexts/AuthContext';
import { PostWithBookmark } from '@/types';

export default function BookmarksPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<PostWithBookmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 로그인 체크
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // 북마크 목록 조회
  useEffect(() => {
    if (!user?.id) return;

    const fetchBookmarks = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/bookmarks', {
          headers: { 'x-user-id': user.id },
        });

        if (!response.ok) throw new Error('북마크 조회 실패');

        const data = await response.json();
        setPosts(data.posts || []);
      } catch (error) {
        console.error('북마크 조회 오류:', error);
        setPosts([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBookmarks();
  }, [user?.id]);

  // 북마크 변경 핸들러 (삭제 시 목록에서 제거)
  const handleBookmarkChange = useCallback((postId: number, isBookmarked: boolean) => {
    if (!isBookmarked) {
      setPosts(prev => prev.filter(post => post.id !== postId));
    }
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#033885]"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* 페이지 헤더 */}
        <section className="mb-8 animate-fade-in">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-2">
            북마크한 공지
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            관심있는 공지를 모아볼 수 있어요
          </p>
        </section>

        {/* 게시글 수 */}
        <div className="mb-4">
          <p className="text-slate-600 dark:text-slate-400">
            <span className="font-bold text-[#033885] text-xl">{posts.length}</span>
            <span className="ml-1">개의 북마크</span>
          </p>
        </div>

        {/* 북마크 목록 */}
        {!isLoading && posts.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">💫</div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              아직 북마크한 공지가 없어요
            </h3>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              관심있는 공지의 하트를 눌러 저장해보세요
            </p>
            <button
              onClick={() => router.push('/')}
              className="px-6 py-3 bg-[#033885] text-white rounded-lg font-medium hover:bg-[#022a66] transition-colors"
            >
              공지 둘러보기
            </button>
          </div>
        ) : (
          <PostList
            posts={posts}
            isLoading={isLoading}
            showExpired={true}
            userId={user?.id}
            onBookmarkChange={handleBookmarkChange}
          />
        )}
      </main>

      {/* 푸터 */}
      <footer className="mt-16 py-8 border-t border-slate-200 dark:border-slate-700">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-slate-500">
          <p>© 2024 KNUPick. 공주대학교 학생을 위한 서비스입니다.</p>
        </div>
      </footer>
    </div>
  );
}
