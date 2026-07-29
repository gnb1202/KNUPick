import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env';

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

// 마감 임박 북마크 조회
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    // 사용자 프로필에서 알림 설정 조회
    const { data: profile } = await supabase
      .from('profiles')
      .select('reminder_enabled, reminder_days_before')
      .eq('id', userId)
      .single();

    if (!profile?.reminder_enabled) {
      return NextResponse.json({ reminders: [] });
    }

    const daysBefore = profile.reminder_days_before || 3;

    // 오늘 날짜 + daysBefore 일 이내의 마감일을 가진 북마크 조회
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + daysBefore);

    const todayStr = today.toISOString().split('T')[0];
    const futureStr = futureDate.toISOString().split('T')[0];

    const { data: bookmarks, error } = await supabase
      .from('bookmarks')
      .select(`
        id,
        post_id,
        posts (
          id,
          title,
          deadline,
          activity_types
        )
      `)
      .eq('user_id', userId);

    if (error) {
      console.error('알림 조회 오류:', error);
      return NextResponse.json({ error: '알림 조회에 실패했습니다.' }, { status: 500 });
    }

    // 마감 임박 게시물 필터링
    interface PostData {
      id: number;
      title: string;
      deadline: string | null;
      activity_types: number[];
    }

    const reminders = bookmarks
      ?.filter(b => {
        const post = b.posts as unknown as PostData | null;
        if (!post?.deadline) return false;
        return post.deadline >= todayStr && post.deadline <= futureStr;
      })
      .map(b => {
        const post = b.posts as unknown as PostData;
        const deadline = new Date(post.deadline!);
        const daysLeft = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return {
          postId: post.id,
          title: post.title,
          deadline: post.deadline!,
          daysLeft,
          activityTypes: post.activity_types,
        };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft) || [];

    return NextResponse.json({ reminders });
  } catch (error) {
    console.error('알림 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
