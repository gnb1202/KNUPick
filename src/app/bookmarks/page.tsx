'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import PostList from '@/components/PostList';
import FeedSection from '@/components/FeedSection';
import { useAuth } from '@/contexts/AuthContext';
import { PostWithBookmark } from '@/types';
import { daysUntil } from '@/components/atoms';

export default function BookmarksPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<PostWithBookmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

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

  const handleBookmarkChange = useCallback(
    (postId: number, isBookmarked: boolean) => {
      if (!isBookmarked) {
        setPosts((prev) => prev.filter((post) => post.id !== postId));
      }
    },
    []
  );

  // D-3 이내 마감임박 / D-4~D-30 다가오는 / 마감없음 / 만료
  const { urgent, upcoming, noDeadline, expired } = useMemo(() => {
    const u: PostWithBookmark[] = [];
    const up: PostWithBookmark[] = [];
    const nd: PostWithBookmark[] = [];
    const ex: PostWithBookmark[] = [];

    posts.forEach((p) => {
      const n = daysUntil(p.deadline);
      if (n === null) {
        nd.push(p);
      } else if (n < 0) {
        ex.push(p);
      } else if (n <= 3) {
        u.push(p);
      } else {
        up.push(p);
      }
    });

    const byDeadline = (a: PostWithBookmark, b: PostWithBookmark) => {
      const da = daysUntil(a.deadline);
      const db = daysUntil(b.deadline);
      return (da ?? 999) - (db ?? 999);
    };
    return {
      urgent: u.sort(byDeadline),
      upcoming: up.sort(byDeadline),
      noDeadline: nd,
      expired: ex,
    };
  }, [posts]);

  if (authLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            border: '2.5px solid var(--accent-soft)',
            borderTopColor: 'var(--accent)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Header />

      <main
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: '32px 24px 64px',
        }}
      >
        {/* 페이지 헤딩 */}
        <div
          style={{
            paddingBottom: 16,
            marginBottom: 24,
            borderBottom: '1px solid var(--border-soft)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.5,
              color: 'var(--text-dim)',
              marginBottom: 6,
              textTransform: 'uppercase',
            }}
          >
            Bookmarked · 북마크
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 800,
              color: 'var(--text)',
              letterSpacing: -0.7,
            }}
          >
            저장한 공지{' '}
            <span style={{ color: 'var(--accent)' }}>{posts.length}건</span>
          </h1>
        </div>

        {/* 마감임박 배너 */}
        {urgent.length > 0 && (
          <div
            style={{
              padding: '16px 20px',
              marginBottom: 32,
              background: 'var(--accent-soft)',
              border: '1px solid color-mix(in oklab, var(--accent) 24%, transparent)',
              borderRadius: 'var(--radius-lg)',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <span style={{ fontSize: 22 }}>⏰</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)' }}>
                {urgent.length}건이 3일 안에 마감돼요
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 2 }}>
                알림 설정: D-3일 전부터 자동 표시됨
              </div>
            </div>
          </div>
        )}

        {!isLoading && posts.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '80px 20px',
              color: 'var(--text-mute)',
            }}
          >
            <div style={{ fontSize: 56, opacity: 0.5, marginBottom: 12 }}>🔖</div>
            <h3
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 800,
                color: 'var(--text)',
              }}
            >
              아직 북마크한 공지가 없어요
            </h3>
            <p
              style={{
                fontSize: 13,
                color: 'var(--text-dim)',
                marginTop: 6,
                marginBottom: 20,
              }}
            >
              관심있는 공지의 북마크 아이콘을 눌러 저장해보세요
            </p>
            <button
              onClick={() => router.push('/')}
              className="btn-press"
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '12px 24px',
                borderRadius: 12,
                background: 'var(--accent)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              공지 둘러보기
            </button>
          </div>
        ) : isLoading ? (
          <PostList posts={[]} isLoading={true} userId={user.id} />
        ) : (
          <>
            {urgent.length > 0 && (
              <FeedSection
                title="⏰ 마감 임박"
                subtitle={`3일 안에 마감 · ${urgent.length}건`}
                posts={urgent}
                userId={user.id}
                onBookmarkChange={handleBookmarkChange}
                maxItems={99}
                columns={3}
              />
            )}
            {upcoming.length > 0 && (
              <FeedSection
                title="📌 다가오는 일정"
                subtitle={`${upcoming.length}건`}
                posts={upcoming}
                userId={user.id}
                onBookmarkChange={handleBookmarkChange}
                maxItems={99}
                columns={3}
              />
            )}
            {noDeadline.length > 0 && (
              <FeedSection
                title="🔁 진행 중"
                subtitle="마감 없는 공지"
                posts={noDeadline}
                userId={user.id}
                onBookmarkChange={handleBookmarkChange}
                maxItems={99}
                columns={3}
              />
            )}
            {expired.length > 0 && (
              <FeedSection
                title="📁 지난 공지"
                subtitle={`마감됨 · ${expired.length}건`}
                posts={expired}
                userId={user.id}
                onBookmarkChange={handleBookmarkChange}
                maxItems={99}
                columns={3}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
