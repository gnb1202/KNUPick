import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env';
import { Post } from '@/types';

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

// 맞춤 추천 게시물 조회
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '10');

    if (!userId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    // 1. 사용자 프로필 조회 (맞춤 키워드)
    const { data: profile } = await supabase
      .from('profiles')
      .select('custom_keywords, excluded_keywords, preferred_activity_types')
      .eq('id', userId)
      .single();

    // 2. 최근 7일간 조회한 게시물의 키워드 분석
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentViews } = await supabase
      .from('post_views')
      .select('post_id')
      .eq('user_id', userId)
      .gte('viewed_at', sevenDaysAgo.toISOString());

    const viewedPostIds = recentViews?.map(v => v.post_id) || [];

    // 3. 북마크한 게시물 조회
    const { data: bookmarks } = await supabase
      .from('bookmarks')
      .select('post_id')
      .eq('user_id', userId);

    const bookmarkedPostIds = bookmarks?.map(b => b.post_id) || [];

    // 4. 조회/북마크한 게시물의 키워드 추출
    let interestKeywords: string[] = profile?.custom_keywords || [];

    if (viewedPostIds.length > 0 || bookmarkedPostIds.length > 0) {
      const interestPostIds = [...new Set([...viewedPostIds, ...bookmarkedPostIds])];

      const { data: interestPosts } = await supabase
        .from('posts')
        .select('keywords')
        .in('id', interestPostIds.slice(0, 50)); // 최대 50개

      // 키워드 빈도 계산
      const keywordFreq: Record<string, number> = {};
      interestPosts?.forEach(post => {
        post.keywords?.forEach((kw: string) => {
          keywordFreq[kw] = (keywordFreq[kw] || 0) + 1;
        });
      });

      // 상위 10개 키워드 추출
      const topKeywords = Object.entries(keywordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([kw]) => kw);

      interestKeywords = [...new Set([...interestKeywords, ...topKeywords])];
    }

    // 5. 추천 게시물 조회
    const excludedKeywords = profile?.excluded_keywords || [];
    const excludePostIds = [...viewedPostIds, ...bookmarkedPostIds];

    // 오늘 날짜 (마감일 필터용)
    const today = new Date().toISOString().split('T')[0];

    let query = supabase
      .from('posts')
      .select('*')
      .gte('deadline', today)
      .order('deadline', { ascending: true });

    // 이미 본 게시물 제외
    if (excludePostIds.length > 0) {
      query = query.not('id', 'in', `(${excludePostIds.join(',')})`);
    }

    const { data: allPosts, error } = await query.limit(100);

    if (error) {
      console.error('추천 조회 오류:', error);
      return NextResponse.json({ error: '추천 조회에 실패했습니다.' }, { status: 500 });
    }

    // 6. 추천 점수 계산 및 정렬
    const scoredPosts = (allPosts || []).map(post => {
      let score = 0;

      // 관심 키워드 매칭 (+2점)
      const postKeywords = [...(post.keywords || []), post.title?.toLowerCase()];
      interestKeywords.forEach((kw: string) => {
        if (postKeywords.some((pk: string | null) => pk?.toLowerCase().includes(kw.toLowerCase()))) {
          score += 2;
        }
      });

      // 제외 키워드 매칭 (-10점)
      excludedKeywords.forEach((kw: string) => {
        if (postKeywords.some((pk: string | null) => pk?.toLowerCase().includes(kw.toLowerCase()))) {
          score -= 10;
        }
      });

      // 관심 활동유형 매칭 (+3점)
      const preferredTypes: number[] = profile?.preferred_activity_types || [];
      post.activity_types?.forEach((type: number) => {
        if (preferredTypes.includes(type)) {
          score += 3;
        }
      });

      return { ...post, score };
    });

    // 제외 키워드가 있는 게시물 필터링 후 점수순 정렬
    const recommendations = scoredPosts
      .filter(p => p.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ score, ...post }) => ({ ...post, isBookmarked: false }));

    return NextResponse.json({ posts: recommendations as Post[] });
  } catch (error) {
    console.error('추천 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
