import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 클릭 기록 추가
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    const { postId } = await request.json();

    if (!postId) {
      return NextResponse.json({ error: 'postId가 필요합니다.' }, { status: 400 });
    }

    const { error } = await supabase
      .from('post_clicks')
      .insert({
        user_id: userId || null,
        post_id: postId,
      });

    if (error) {
      console.error('클릭 기록 오류:', error);
      return NextResponse.json({ error: '클릭 기록에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('클릭 기록 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
