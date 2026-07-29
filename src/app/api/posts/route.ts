import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { APP_CONFIG } from '@/lib/constants';
import { Post, PostWithBookmark, Campus } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const departmentId = searchParams.get('departmentId');
    const activityTypes = searchParams.get('activityTypes');
    const campusParam = searchParams.get('campus') as Campus | null;
    const sortBy = searchParams.get('sort') || 'latest'; // latest | deadline
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || String(APP_CONFIG.DEFAULT_PAGE_SIZE));
    const hasDeadline = searchParams.get('hasDeadline') === 'true';
    const startDate = searchParams.get('startDate'); // YYYY-MM-DD
    const endDate = searchParams.get('endDate'); // YYYY-MM-DD

    // 사용자 ID (북마크 여부 확인용)
    const userId = request.headers.get('x-user-id');

    let posts: Post[] = [];
    let total = 0;

    // Supabase 연결 확인
    if (!supabase) {
      return NextResponse.json(
        { error: 'Database not connected', posts: [], total: 0 },
        { status: 503 }
      );
    }

    // 정렬 옵션 설정
    const getOrderConfig = () => {
      if (sortBy === 'deadline') {
        return { column: 'deadline', ascending: true, nullsFirst: false };
      }
      return { column: 'posted_date', ascending: false, nullsFirst: false };
    };
    const orderConfig = getOrderConfig();

    // 한국 시간(KST) 기준 오늘 날짜
    const today = new Date().toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
    }).replace(/\. /g, '-').replace('.', '');

    // 학과 필터가 있는 경우 - DB JOIN 쿼리 사용
    if (departmentId) {
      const deptId = parseInt(departmentId);

      // 1. 해당 학과와 관련된 게시글 ID 조회
      // 공통 관심사: 인턴십/채용(4), 교육/특강(6), 장학금/지원(7)
      const { data: relevantPostIds } = await supabase
        .from('post_department_relevance')
        .select('post_id')
        .eq('department_id', deptId);

      const postIdsFromRelevance = relevantPostIds?.map(r => r.post_id) || [];

      // 2. 메인 쿼리 - 관련 게시글 또는 공통 관심사 활동유형
      let query = supabase
        .from('posts')
        .select(
          'id, title, content, original_url, posted_date, deadline, activity_types, keywords, created_at, updated_at, campus, summary, event_start_date, event_end_date',
          { count: 'exact' }
        )
        .order(orderConfig.column, { ascending: orderConfig.ascending, nullsFirst: orderConfig.nullsFirst });

      // 학과 관련 게시글 OR 공통 관심사 활동유형
      if (postIdsFromRelevance.length > 0) {
        query = query.or(`id.in.(${postIdsFromRelevance.join(',')}),activity_types.ov.{4,6,7}`);
      } else {
        // 관련 게시글이 없으면 공통 관심사만
        query = query.overlaps('activity_types', [4, 6, 7]);
      }

      // 마감임박순일 때: 마감일이 오늘 이후인 게시글만
      if (sortBy === 'deadline') {
        query = query.gte('deadline', today);
      }

      // 마감일 있는 게시글만 필터
      if (hasDeadline) {
        query = query.gte('deadline', today);
      }

      // 날짜 범위 필터
      if (startDate) {
        query = query.gte('deadline', startDate);
      }
      if (endDate) {
        query = query.lte('deadline', endDate);
      }

      // 활동유형 필터
      if (activityTypes) {
        const types = activityTypes.split(',').map(Number);
        query = query.overlaps('activity_types', types);
      }

      // 캠퍼스 필터 - common은 항상 포함
      if (campusParam && campusParam !== 'common') {
        query = query.in('campus', ['common', campusParam]);
      }

      // 페이지네이션
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;

      posts = data || [];
      total = count || 0;

    } else {
      // 학과 필터 없음 - 완전 DB 쿼리
      let query = supabase
        .from('posts')
        .select(
          'id, title, content, original_url, posted_date, deadline, activity_types, keywords, created_at, updated_at, campus, summary, event_start_date, event_end_date',
          { count: 'exact' }
        )
        .order(orderConfig.column, { ascending: orderConfig.ascending, nullsFirst: orderConfig.nullsFirst });

      // 마감임박순일 때: 마감일이 오늘 이후인 게시글만
      if (sortBy === 'deadline') {
        query = query.gte('deadline', today);
      }

      // 마감일 있는 게시글만 필터
      if (hasDeadline) {
        query = query.gte('deadline', today);
      }

      // 날짜 범위 필터
      if (startDate) {
        query = query.gte('deadline', startDate);
      }
      if (endDate) {
        query = query.lte('deadline', endDate);
      }

      // 활동유형 필터
      if (activityTypes) {
        const types = activityTypes.split(',').map(Number);
        query = query.overlaps('activity_types', types);
      }

      // 캠퍼스 필터
      if (campusParam && campusParam !== 'common') {
        query = query.in('campus', ['common', campusParam]);
      }

      // 페이지네이션
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;

      posts = data || [];
      total = count || 0;
    }

    // 북마크 정보 추가 (로그인 사용자만)
    let postsWithBookmark: PostWithBookmark[] = posts;

    if (userId && posts.length > 0) {
      const postIds = posts.map(p => p.id);
      const { data: bookmarks } = await supabase
        .from('bookmarks')
        .select('post_id')
        .eq('user_id', userId)
        .in('post_id', postIds);

      const bookmarkedPostIds = new Set(bookmarks?.map(b => b.post_id) || []);
      postsWithBookmark = posts.map(post => ({
        ...post,
        isBookmarked: bookmarkedPostIds.has(post.id),
      }));
    }

    return NextResponse.json({
      posts: postsWithBookmark,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Posts API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch posts', posts: [], total: 0 },
      { status: 500 }
    );
  }
}
