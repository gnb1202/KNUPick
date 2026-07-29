import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env';

const supabaseAdmin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

// 사용자 목록 조회
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 관리자 권한 확인
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const search = searchParams.get('search') || '';

    let query = supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    // 검색 필터
    if (search) {
      query = query.or(`username.ilike.%${search}%,nickname.ilike.%${search}%`);
    }

    // 페이지네이션
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data: users, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      users: users || [],
      total: count || 0,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('Admin users error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

// 사용자 권한 수정
export async function PATCH(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 관리자 권한 확인
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { id, is_admin } = body;

    if (!id) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    // 자기 자신의 관리자 권한은 해제할 수 없음
    if (id === userId && is_admin === false) {
      return NextResponse.json(
        { error: 'Cannot remove your own admin privileges' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({ is_admin, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, user: data });
  } catch (error) {
    console.error('Admin user update error:', error);
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    );
  }
}
