import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { addDays, todayKST } from '@/lib/dates';
import type { NoticeStats } from '@/lib/notice-stats';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (!supabase) throw new Error('Database unavailable');
    const date = todayKST();
    // Count the same publicly readable posts as the feed; never load rows to count them.
    const [recent, today] = await Promise.all([
      supabase.from('posts').select('id', { count: 'exact', head: true })
        .gte('posted_date', addDays(date, -29)).lte('posted_date', date),
      supabase.from('posts').select('id', { count: 'exact', head: true }).eq('posted_date', date),
    ]);
    if (recent.error || today.error || recent.count === null || today.count === null) {
      throw new Error('Notice count unavailable');
    }
    const stats: NoticeStats = {
      date, timeZone: 'Asia/Seoul', todayCount: today.count, recentCount: recent.count,
    };
    return NextResponse.json(stats, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // A failed count is unknown, not zero.
    return NextResponse.json({ error: '공지 수를 불러오지 못했어요.' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  }
}
