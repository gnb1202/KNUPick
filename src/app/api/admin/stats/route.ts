import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // 인증 확인
    const userId = request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 관리자 권한 확인
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (profileError || !profile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 통계 데이터 수집
    const today = new Date().toISOString().split('T')[0];

    // 총 게시글 수
    const { count: totalPosts } = await supabaseAdmin
      .from('posts')
      .select('*', { count: 'exact', head: true });

    // 오늘 추가된 게시글 수
    const { count: todayPosts } = await supabaseAdmin
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', `${today}T00:00:00`);

    // 총 사용자 수
    const { count: totalUsers } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    // 마감일 있는 게시글 수
    const { count: postsWithDeadline } = await supabaseAdmin
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .not('deadline', 'is', null);

    // 활동유형별 게시글 수
    const { data: allPosts } = await supabaseAdmin
      .from('posts')
      .select('activity_types');

    const postsByActivityType: Record<number, number> = {};
    if (allPosts) {
      allPosts.forEach((post) => {
        post.activity_types?.forEach((typeId: number) => {
          postsByActivityType[typeId] = (postsByActivityType[typeId] || 0) + 1;
        });
      });
    }

    // 최근 7일간 게시글 추가 현황
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentPosts } = await supabaseAdmin
      .from('posts')
      .select('created_at')
      .gte('created_at', sevenDaysAgo.toISOString());

    const postsByDate: Record<string, number> = {};
    if (recentPosts) {
      recentPosts.forEach((post) => {
        const date = post.created_at.split('T')[0];
        postsByDate[date] = (postsByDate[date] || 0) + 1;
      });
    }

    return NextResponse.json({
      totalPosts: totalPosts || 0,
      todayPosts: todayPosts || 0,
      totalUsers: totalUsers || 0,
      postsWithDeadline: postsWithDeadline || 0,
      postsByActivityType,
      postsByDate,
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
