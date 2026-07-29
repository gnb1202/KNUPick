import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env';

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

// 북마크 목록 조회
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data: bookmarks, error } = await supabase
      .from('bookmarks')
      .select(`
        id,
        post_id,
        created_at,
        posts (
          id,
          title,
          content,
          summary,
          original_url,
          posted_date,
          deadline,
          event_start_date,
          event_end_date,
          activity_types,
          keywords,
          campus,
          created_at,
          updated_at
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('북마크 조회 오류:', error);
      return NextResponse.json({ error: '북마크 조회에 실패했습니다.' }, { status: 500 });
    }

    // posts 데이터를 펼쳐서 반환
    const posts = bookmarks
      ?.map(b => b.posts ? { ...b.posts, isBookmarked: true } : null)
      .filter(Boolean) || [];

    return NextResponse.json({ posts, total: posts.length });
  } catch (error) {
    console.error('북마크 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// 북마크 추가
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { postId } = await request.json();

    if (!postId) {
      return NextResponse.json({ error: 'postId가 필요합니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('bookmarks')
      .insert({ user_id: userId, post_id: postId })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '이미 북마크한 게시물입니다.' }, { status: 409 });
      }
      console.error('북마크 추가 오류:', error);
      return NextResponse.json({ error: '북마크 추가에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ bookmark: data, message: '북마크에 추가되었습니다.' });
  } catch (error) {
    console.error('북마크 추가 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
