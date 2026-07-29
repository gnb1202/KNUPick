'use client';

import { useState, useEffect, useCallback, Suspense, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Header from '@/components/Header';
import FilterPanel from '@/components/FilterPanel';
import PostList from '@/components/PostList';
import SearchBar from '@/components/SearchBar';
import DeadlineAlert from '@/components/DeadlineAlert';
import RecommendedCarousel from '@/components/RecommendedCarousel';
import ThisWeekStrip from '@/components/ThisWeekStrip';
import { useAuth } from '@/contexts/AuthContext';
import { PostWithBookmark, Campus } from '@/types';
import { searchInFields } from '@/lib/search';
import { CAMPUS_LABELS } from '@/lib/constants';

function HomeContent() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [posts, setPosts] = useState<PostWithBookmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showExpired, setShowExpired] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [recommendedPosts, setRecommendedPosts] = useState<PostWithBookmark[]>([]);
  const [isRecommendedLoading, setIsRecommendedLoading] = useState(false);

  // URL 파라미터 (문자열 안정화)
  const deptParam = searchParams.get('dept');
  const typesParam = searchParams.get('types');
  const campusParam = searchParams.get('campus');
  const sortParam = searchParams.get('sort') || 'latest';

  const selectedDepartment = deptParam ? parseInt(deptParam) : null;
  const selectedCampus = (campusParam as Campus) || null;

  const selectedActivityTypes = useMemo(() => {
    return typesParam ? typesParam.split(',').map(Number) : [];
  }, [typesParam]);

  const searchedPosts = useMemo(() => {
    if (!searchQuery.trim()) return posts;
    return posts.filter((post) =>
      searchInFields([post.title, post.summary, post.content], searchQuery)
    );
  }, [posts, searchQuery]);

  const filteredPostCount = useMemo(() => {
    if (showExpired) return searchedPosts.length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return searchedPosts.filter((post) => {
      if (!post.deadline) return true;
      const d = new Date(post.deadline);
      d.setHours(0, 0, 0, 0);
      return d >= today;
    }).length;
  }, [searchedPosts, showExpired]);

  // URL 업데이트
  const updateURL = useCallback(
    (params: { dept?: number | null; types?: number[]; campus?: Campus | null; sort?: string }) => {
      const currentUrl = new URL(window.location.href);
      const newParams = new URLSearchParams();

      const currentDept = currentUrl.searchParams.get('dept');
      const currentTypes = currentUrl.searchParams.get('types');
      const currentCampus = currentUrl.searchParams.get('campus');
      const currentSort = currentUrl.searchParams.get('sort');

      const dept = params.dept !== undefined ? params.dept : currentDept ? parseInt(currentDept) : null;
      const types = params.types !== undefined ? params.types : currentTypes ? currentTypes.split(',').map(Number) : [];
      const campus = params.campus !== undefined ? params.campus : currentCampus;
      const sort = params.sort !== undefined ? params.sort : currentSort;

      if (dept) newParams.set('dept', String(dept));
      if (types.length > 0) newParams.set('types', types.join(','));
      if (campus) newParams.set('campus', campus);
      if (sort && sort !== 'latest') newParams.set('sort', sort);

      const queryString = newParams.toString();
      router.replace(queryString ? `/?${queryString}` : '/', { scroll: false });
    },
    [router]
  );

  const handleDepartmentChange = useCallback((dept: number | null) => updateURL({ dept }), [updateURL]);
  const handleCampusChange = useCallback((campus: Campus | null) => updateURL({ campus }), [updateURL]);
  const handleActivityTypeToggle = useCallback(
    (id: number) => {
      const currentUrl = new URL(window.location.href);
      const currentTypesStr = currentUrl.searchParams.get('types');
      const currentTypes = currentTypesStr ? currentTypesStr.split(',').map(Number) : [];
      const newTypes = currentTypes.includes(id)
        ? currentTypes.filter((t) => t !== id)
        : [...currentTypes, id];
      updateURL({ types: newTypes });
    },
    [updateURL]
  );
  const handleSortChange = useCallback((sort: string) => updateURL({ sort }), [updateURL]);

  // 기본은 사용자 preference와 무관하게 전체 보기.
  // 필터링은 사용자가 직접 FilterPanel에서 선택했을 때만 적용된다.
  const prevParamsRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      prevParamsRef.current = null;
    };
  }, []);

  // posts 로드
  useEffect(() => {
    const currentParamsKey = `${deptParam || ''}-${typesParam || ''}-${campusParam || ''}-${sortParam}-${user?.id || ''}`;
    if (prevParamsRef.current !== null && prevParamsRef.current === currentParamsKey) return;
    prevParamsRef.current = currentParamsKey;

    const controller = new AbortController();
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ pageSize: '200' });
        if (deptParam) params.set('departmentId', deptParam);
        if (typesParam) params.set('activityTypes', typesParam);
        if (campusParam) params.set('campus', campusParam);
        if (sortParam && sortParam !== 'latest') params.set('sort', sortParam);

        const headers: HeadersInit = {};
        if (user?.id) headers['x-user-id'] = user.id;

        const response = await fetch(`/api/posts?${params}`, {
          signal: controller.signal,
          headers,
        });
        if (!response.ok) throw new Error('Failed to fetch posts');
        const data = await response.json();
        setPosts(data.posts);
        setIsLoading(false);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('Fetch error:', error);
        setPosts([]);
        setIsLoading(false);
      }
    };
    fetchData();
    return () => controller.abort();
  }, [deptParam, typesParam, campusParam, sortParam, user?.id]);

  const handleBookmarkChange = useCallback((postId: number, isBookmarked: boolean) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, isBookmarked } : p)));
    setRecommendedPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, isBookmarked } : p)));
  }, []);

  // 추천 로드
  useEffect(() => {
    if (!user?.id) {
      setRecommendedPosts([]);
      return;
    }
    const fetchRecommendations = async () => {
      setIsRecommendedLoading(true);
      try {
        const response = await fetch('/api/recommendations?limit=6', {
          headers: { 'x-user-id': user.id },
        });
        if (response.ok) {
          const data = await response.json();
          setRecommendedPosts(data.posts || []);
        }
      } catch (error) {
        console.error('추천 조회 오류:', error);
      } finally {
        setIsRecommendedLoading(false);
      }
    };
    fetchRecommendations();
  }, [user?.id]);

  // 인사 — 닉네임 + 학과/캠퍼스
  const greetingName = profile?.nickname || profile?.username;
  const campusLabel = profile?.campus ? CAMPUS_LABELS[profile.campus] : null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Header />

      <main
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: '32px 24px 64px',
          display: 'grid',
          gap: 32,
        }}
      >
        {/* 인사 헤딩 */}
        <section className="animate-fade-up">
          {greetingName && campusLabel && (
            <div style={{ fontSize: 13, color: 'var(--text-dim)', fontWeight: 600 }}>
              {profile?.department_id ? `학과 추천 · ` : ''}
              {campusLabel}캠퍼스
            </div>
          )}
          <h1
            style={{
              margin: '6px 0 0',
              fontSize: 28,
              fontWeight: 800,
              color: 'var(--text)',
              letterSpacing: -0.7,
              lineHeight: 1.2,
            }}
          >
            {greetingName ? (
              <>
                {greetingName}님, 오늘{' '}
                <span style={{ color: 'var(--accent)' }}>{filteredPostCount}건</span>의 공지를
                골라봤어요
              </>
            ) : (
              <>
                나에게 딱 맞는 활동을{' '}
                <span style={{ color: 'var(--accent)' }}>찾아보세요</span>
              </>
            )}
          </h1>
          {!greetingName && (
            <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--text-mute)' }}>
              학과와 관심분야를 설정하면 더 정확하게 추천해드려요
            </p>
          )}
        </section>

        {/* 마감 알림 */}
        <DeadlineAlert userId={user?.id || null} />

        {/* 검색 */}
        <SearchBar value={searchQuery} onChange={setSearchQuery} />

        {/* 다가오는 2주 마감/행사 */}
        {!isLoading && <ThisWeekStrip posts={posts} />}

        {/* 추천 — 로그인 사용자만 */}
        {user && (
          <RecommendedCarousel
            title={`✨ ${greetingName || '나'}님께 딱 맞는 공지`}
            posts={recommendedPosts}
            isLoading={isRecommendedLoading}
            userId={user.id}
            onBookmarkChange={handleBookmarkChange}
            emptyMessage="추천할 공지를 찾고 있어요. 프로필에서 관심 키워드를 설정해보세요!"
            perPage={3}
          />
        )}

        {/* 필터 + 전체 그리드 */}
        <section style={{ display: 'grid', gap: 16 }}>
          <FilterPanel
            selectedDepartment={selectedDepartment}
            onDepartmentChange={handleDepartmentChange}
            selectedActivityTypes={selectedActivityTypes}
            onActivityTypeToggle={handleActivityTypeToggle}
            selectedCampus={selectedCampus}
            onCampusChange={handleCampusChange}
            showExpired={showExpired}
            onShowExpiredChange={setShowExpired}
            sort={sortParam}
            onSortChange={handleSortChange}
            resultCount={filteredPostCount}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginTop: 4,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>
              전체 공지{' '}
              <span style={{ color: 'var(--text-dim)', fontWeight: 600, fontSize: 16 }}>
                · {filteredPostCount}건
              </span>
              {searchQuery && (
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 13,
                    color: 'var(--text-dim)',
                    fontWeight: 500,
                  }}
                >
                  &quot;{searchQuery}&quot; 검색 결과
                </span>
              )}
            </h2>
          </div>

          <PostList
            posts={searchedPosts}
            isLoading={isLoading}
            showExpired={showExpired}
            userId={user?.id}
            onBookmarkChange={handleBookmarkChange}
          />
        </section>
      </main>

      <footer
        style={{
          marginTop: 32,
          padding: '32px 24px',
          borderTop: '1px solid var(--border-soft)',
          background: 'var(--surface)',
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--text-dim)',
          }}
        >
          <p style={{ margin: 0 }}>© 2024 KNUPick. 공주대학교 학생을 위한 서비스입니다.</p>
          <p style={{ margin: '6px 0 0' }}>
            문의:{' '}
            <a
              href="mailto:support@knupick.kr"
              style={{ color: 'var(--accent)', textDecoration: 'none' }}
            >
              support@knupick.kr
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

function HomeLoading() {
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

export default function Home() {
  return (
    <Suspense fallback={<HomeLoading />}>
      <HomeContent />
    </Suspense>
  );
}
