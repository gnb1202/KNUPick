'use client';

import { useState, useEffect, useCallback, Suspense, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Header from '@/components/Header';
import FilterPanel from '@/components/FilterPanel';
import PostList from '@/components/PostList';
import SearchBar from '@/components/SearchBar';
import DeadlineAlert from '@/components/DeadlineAlert';
import FeedSection from '@/components/FeedSection';
import { useAuth } from '@/contexts/AuthContext';
import { PostWithBookmark, Campus } from '@/types';
import { ACTIVITY_TYPES } from '@/lib/constants';
import { searchInFields } from '@/lib/search';

function HomeContent() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [posts, setPosts] = useState<PostWithBookmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [showExpired, setShowExpired] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // 개인화 피드 상태
  const [recommendedPosts, setRecommendedPosts] = useState<PostWithBookmark[]>([]);
  const [isRecommendedLoading, setIsRecommendedLoading] = useState(false);

  // URL에서 필터 상태 읽기 (문자열로 안정화)
  const deptParam = searchParams.get('dept');
  const typesParam = searchParams.get('types');
  const campusParam = searchParams.get('campus');
  const sortParam = searchParams.get('sort') || 'latest';

  const selectedDepartment = deptParam ? parseInt(deptParam) : null;
  const selectedCampus = (campusParam as Campus) || null;

  // useMemo로 배열 안정화 (typesParam 문자열이 변경될 때만 재계산)
  const selectedActivityTypes = useMemo(() => {
    return typesParam ? typesParam.split(',').map(Number) : [];
  }, [typesParam]);

  // 검색어 필터 적용된 게시글
  const searchedPosts = useMemo(() => {
    if (!searchQuery.trim()) return posts;

    return posts.filter((post) =>
      searchInFields([post.title, post.summary, post.content], searchQuery)
    );
  }, [posts, searchQuery]);

  // 필터링된 게시글 개수 계산
  const filteredPostCount = useMemo(() => {
    if (showExpired) return searchedPosts.length;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return searchedPosts.filter((post) => {
      if (!post.deadline) return true;
      const deadline = new Date(post.deadline);
      deadline.setHours(0, 0, 0, 0);
      return deadline >= today;
    }).length;
  }, [searchedPosts, showExpired]);

  // URL 업데이트 함수 - router.replace 사용으로 히스토리 스택 방지
  const updateURL = useCallback((params: {
    dept?: number | null;
    types?: number[];
    campus?: Campus | null;
    sort?: string;
  }) => {
    const currentUrl = new URL(window.location.href);
    const newParams = new URLSearchParams();

    // 현재 URL에서 직접 읽기 (searchParams 의존성 제거)
    const currentDept = currentUrl.searchParams.get('dept');
    const currentTypes = currentUrl.searchParams.get('types');
    const currentCampus = currentUrl.searchParams.get('campus');
    const currentSort = currentUrl.searchParams.get('sort');

    const dept = params.dept !== undefined ? params.dept : (currentDept ? parseInt(currentDept) : null);
    const types = params.types !== undefined ? params.types : (currentTypes ? currentTypes.split(',').map(Number) : []);
    const campus = params.campus !== undefined ? params.campus : currentCampus;
    const sort = params.sort !== undefined ? params.sort : currentSort;

    if (dept) newParams.set('dept', String(dept));
    if (types.length > 0) newParams.set('types', types.join(','));
    if (campus) newParams.set('campus', campus);
    if (sort && sort !== 'latest') newParams.set('sort', sort);

    const queryString = newParams.toString();
    router.replace(queryString ? `/?${queryString}` : '/', { scroll: false });
  }, [router]);

  // 필터 변경 핸들러
  const handleDepartmentChange = useCallback((dept: number | null) => {
    updateURL({ dept });
  }, [updateURL]);

  const handleCampusChange = useCallback((campus: Campus | null) => {
    updateURL({ campus });
  }, [updateURL]);

  const handleActivityTypeToggle = useCallback((id: number) => {
    const currentUrl = new URL(window.location.href);
    const currentTypesStr = currentUrl.searchParams.get('types');
    const currentTypes = currentTypesStr ? currentTypesStr.split(',').map(Number) : [];
    const newTypes = currentTypes.includes(id)
      ? currentTypes.filter((t) => t !== id)
      : [...currentTypes, id];
    updateURL({ types: newTypes });
  }, [updateURL]);

  const handleSortChange = useCallback((sort: string) => {
    updateURL({ sort });
  }, [updateURL]);

  // 프로필 기반 초기 필터 설정 (URL 파라미터가 없을 때만)
  const initializedRef = useRef(false);

  // 이전 파라미터 추적 (중복 호출 방지)
  const prevParamsRef = useRef<string | null>(null);

  // 컴포넌트 언마운트 시 refs 초기화
  useEffect(() => {
    return () => {
      initializedRef.current = false;
      prevParamsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    // URL에 이미 파라미터가 있으면 건너뜀
    if (window.location.search) return;

    // 프로필이 있고 URL 파라미터가 없을 때만 초기화
    if (profile) {
      const params: { dept?: number; types?: number[]; campus?: Campus } = {};

      if (profile.campus) params.campus = profile.campus;
      if (profile.department_id) params.dept = profile.department_id;
      if (profile.preferred_activity_types?.length) params.types = profile.preferred_activity_types;

      if (Object.keys(params).length > 0) {
        updateURL(params);
      }
    }
  }, [profile, updateURL]);

  // 초기 로드 및 필터 변경 시
  useEffect(() => {
    // 파라미터 조합을 문자열로 만들어 비교
    const currentParamsKey = `${deptParam || ''}-${typesParam || ''}-${campusParam || ''}-${sortParam}`;

    // 이전과 같으면 스킵 (중복 호출 방지) - 단, 첫 마운트(null)일 때는 항상 실행
    if (prevParamsRef.current !== null && prevParamsRef.current === currentParamsKey) {
      return;
    }
    prevParamsRef.current = currentParamsKey;

    const controller = new AbortController();

    const fetchData = async () => {
      setIsLoading(true);

      try {
        const params = new URLSearchParams({
          pageSize: '200',
        });

        if (deptParam) {
          params.set('departmentId', deptParam);
        }

        if (typesParam) {
          params.set('activityTypes', typesParam);
        }

        if (campusParam) {
          params.set('campus', campusParam);
        }

        if (sortParam && sortParam !== 'latest') {
          params.set('sort', sortParam);
        }

        const headers: HeadersInit = {};
        if (user?.id) {
          headers['x-user-id'] = user.id;
        }

        const response = await fetch(`/api/posts?${params}`, {
          signal: controller.signal,
          headers,
        });

        if (!response.ok) {
          throw new Error('Failed to fetch posts');
        }

        const data = await response.json();

        setPosts(data.posts);
        setIsLoading(false);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return; // 취소된 요청은 무시 (isLoading도 변경하지 않음)
        }
        console.error('Fetch error:', error);
        setPosts([]);
        setIsLoading(false);
      }
    };

    fetchData();

    return () => {
      controller.abort();
    };
  }, [deptParam, typesParam, campusParam, sortParam, user?.id]);

  // 북마크 변경 핸들러
  const handleBookmarkChange = useCallback((postId: number, isBookmarked: boolean) => {
    setPosts(prev => prev.map(post =>
      post.id === postId ? { ...post, isBookmarked } : post
    ));
    setRecommendedPosts(prev => prev.map(post =>
      post.id === postId ? { ...post, isBookmarked } : post
    ));
  }, []);

  // 추천 게시물 로드 (로그인 사용자만)
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

  // 마감 임박 게시물 (D-7 이내)
  const urgentPosts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysLater = new Date(today);
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

    return posts
      .filter(post => {
        if (!post.deadline) return false;
        const deadline = new Date(post.deadline);
        deadline.setHours(0, 0, 0, 0);
        return deadline >= today && deadline <= sevenDaysLater;
      })
      .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
      .slice(0, 6);
  }, [posts]);

  return (
    <div className="min-h-screen">
      {/* 헤더 */}
      <Header />

      {/* 메인 컨텐츠 */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* 마감 알림 배너 (로그인 사용자만) */}
        <DeadlineAlert userId={user?.id || null} />

        {/* Hero 섹션 */}
        <section className="text-center mb-8 animate-fade-in">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-2">
            나에게 딱 맞는 활동을 찾아보세요
          </h2>
          <p className="text-slate-600 dark:text-slate-300 mb-6">
            학과를 선택하면 관련된 대회와 대외활동을 추천해드려요
          </p>

          {/* 활동유형 필터 */}
          <div className="flex flex-wrap justify-center gap-2">
            {ACTIVITY_TYPES.map((type) => {
              const isSelected = selectedActivityTypes.includes(type.id);
              return (
                <button
                  key={type.id}
                  onClick={() => handleActivityTypeToggle(type.id)}
                  className={`
                    px-3 py-1.5 text-sm font-medium rounded-full
                    transition-all duration-200 btn-press border
                    ${isSelected
                      ? 'bg-[#033885] text-white shadow-md border-[#033885]'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-300 dark:border-slate-600'
                    }
                  `}
                >
                  {type.icon && <span className="mr-1">{type.icon}</span>}
                  {type.name}
                </button>
              );
            })}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* 사이드바 - 필터 */}
          <aside className="lg:col-span-1">
            <FilterPanel
              selectedDepartment={selectedDepartment}
              onDepartmentChange={handleDepartmentChange}
              selectedCampus={selectedCampus}
              onCampusChange={handleCampusChange}
              isMobileOpen={isFilterOpen}
              onMobileToggle={() => setIsFilterOpen(!isFilterOpen)}
              showExpired={showExpired}
              onShowExpiredChange={setShowExpired}
            />
          </aside>

          {/* 게시글 목록 */}
          <section className="lg:col-span-3">
            {/* 검색바 */}
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="공지 검색 (초성 검색 가능: ㅈㅎㄱ → 장학금)"
              className="mb-4"
            />

            {/* 개인화 피드 섹션 (로그인 사용자, 검색 중이 아닐 때) */}
            {user && !searchQuery && !deptParam && !typesParam && !campusParam && (
              <>
                {/* 마감 임박 섹션 */}
                {urgentPosts.length > 0 && (
                  <FeedSection
                    title="⏰ 마감 임박"
                    posts={urgentPosts}
                    userId={user.id}
                    onBookmarkChange={handleBookmarkChange}
                    emptyMessage="마감 임박 공지가 없습니다."
                    maxItems={6}
                  />
                )}

                {/* 맞춤 추천 섹션 */}
                <FeedSection
                  title="✨ 맞춤 추천"
                  posts={recommendedPosts}
                  isLoading={isRecommendedLoading}
                  userId={user.id}
                  onBookmarkChange={handleBookmarkChange}
                  emptyMessage="추천할 공지를 찾고 있어요. 프로필에서 관심 키워드를 설정해보세요!"
                  maxItems={6}
                />
              </>
            )}

            {/* 검색 결과 + 정렬 바 */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-slate-600 dark:text-slate-300">
                <span className="font-bold text-[#033885] text-xl">{filteredPostCount}</span>
                <span className="ml-1">건의 활동</span>
                {searchQuery && (
                  <span className="ml-2 text-sm text-slate-500">
                    &quot;{searchQuery}&quot; 검색 결과
                  </span>
                )}
              </p>

              {/* 정렬 버튼 그룹 */}
              <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                <button
                  onClick={() => handleSortChange('latest')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    sortParam === 'latest'
                      ? 'bg-white dark:bg-slate-700 shadow-sm text-[#033885] dark:text-blue-400'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  최신순
                </button>
                <button
                  onClick={() => handleSortChange('deadline')}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    sortParam === 'deadline'
                      ? 'bg-white dark:bg-slate-700 shadow-sm text-[#033885] dark:text-blue-400'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  마감임박
                </button>
              </div>
            </div>

            <PostList
              posts={searchedPosts}
              isLoading={isLoading}
              showExpired={showExpired}
              userId={user?.id}
              onBookmarkChange={handleBookmarkChange}
            />
          </section>
        </div>
      </main>

      {/* 푸터 */}
      <footer className="mt-16 py-8 border-t border-slate-200 dark:border-slate-700">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-slate-500 dark:text-slate-400">
          <p>© 2024 KNUPick. 공주대학교 학생을 위한 서비스입니다.</p>
          <p className="mt-1">
            문의:{' '}
            <a href="mailto:support@knupick.kr" className="text-[#033885] hover:underline">
              support@knupick.kr
            </a>
          </p>
        </div>
      </footer>

    </div>
  );
}

// 로딩 폴백 컴포넌트
function HomeLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#033885]"></div>
    </div>
  );
}

// 메인 페이지 - Suspense로 감싸기
export default function Home() {
  return (
    <Suspense fallback={<HomeLoading />}>
      <HomeContent />
    </Suspense>
  );
}
