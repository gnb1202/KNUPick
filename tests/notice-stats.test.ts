import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { isNoticeStats } from '@/lib/notice-stats';

const dbFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return { supabase: createClient('https://notice-test.supabase.co', 'test-anon-key', {
    global: { fetch: dbFetch }, auth: { persistSession: false, autoRefreshToken: false },
  }) };
});

import { GET as getStats } from '@/app/api/posts/stats/route';
import { GET as getPosts } from '@/app/api/posts/route';

const baseRows = [
  ...Array.from({ length: 251 }, (_, id) => ({ id, posted_date: '2026-09-10', created_at: '2026-09-11T01:00:00Z' })),
  ...Array.from({ length: 3 }, (_, id) => ({ id: id + 251, posted_date: '2026-09-11', created_at: '2026-09-11T01:00:00Z' })),
  { id: 254, posted_date: null, created_at: '2026-09-11T01:00:00Z' },
];
let rows = [...baseRows];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-11T03:00:00Z'));
  dbFetch.mockReset();
  rows = [...baseRows];
  dbFetch.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url);
    const isPosts = url.pathname.endsWith('/posts');
    const dates = url.searchParams.getAll('posted_date');
    const matched = isPosts ? rows.filter(row => dates.every(filter => {
      const [op, day] = filter.split('.');
      if (!row.posted_date) return false;
      return op === 'eq' ? row.posted_date === day : op === 'gte' ? row.posted_date >= day : op === 'lte' ? row.posted_date <= day : false;
    })) : [];
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = Number(url.searchParams.get('limit') || 1000);
    return new Response(init?.method === 'HEAD' ? null : JSON.stringify(matched.slice(offset, offset + limit)), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': `*/${matched.length}` },
    });
  });
});
afterEach(() => { vi.useRealTimers(); });

describe('notice counts and original posting dates', () => {
  it('counts the last 30 days beyond the feed limit, using posted_date rather than collection time', async () => {
    const response = await getStats();
    expect(await response.json()).toEqual({ date: '2026-09-11', timeZone: 'Asia/Seoul', todayCount: 3, recentCount: 254 });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(dbFetch.mock.calls.every(([, init]) => init.method === 'HEAD')).toBe(true);
  });

  it('includes today and the 29th prior day, excluding older, future and undated posts', async () => {
    rows.push(...['2026-08-13', '2026-08-12', '2026-09-12'].map((posted_date, index) => ({
      id: 255 + index, posted_date, created_at: '2026-09-11T01:00:00Z',
    })));
    expect(await (await getStats()).json()).toMatchObject({ todayCount: 3, recentCount: 255 });
    vi.setSystemTime(new Date('2026-09-12T03:00:00Z'));
    expect(await (await getStats()).json()).toMatchObject({ todayCount: 1, recentCount: 255 });
  });

  it('rolls today over at Korean midnight, not UTC midnight', async () => {
    vi.setSystemTime(new Date('2026-09-10T14:59:59Z'));
    expect((await (await getStats()).json()).todayCount).toBe(251);
    vi.setSystemTime(new Date('2026-09-10T15:00:00Z'));
    expect(await (await getStats()).json()).toMatchObject({ date: '2026-09-11', todayCount: 3 });
  });

  it('returns a real zero on a day with no notices', async () => {
    vi.setSystemTime(new Date('2026-09-12T03:00:00Z'));
    expect(await (await getStats()).json()).toMatchObject({ todayCount: 0, recentCount: 254 });
  });

  it('reports an unavailable count instead of fabricating zero', async () => {
    dbFetch.mockRejectedValueOnce(new Error('database unavailable'));
    const response = await getStats();
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty('todayCount');
  });

  it.each(['', '&departmentId=1'])('filters today before pagination, including the department branch (%s)', async (department) => {
    const response = await getPosts(new NextRequest(`http://localhost/api/posts?pageSize=200&posted=today${department}`));
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.total).toBe(3);
    expect(data.posts).toHaveLength(3);
    expect(data.posts.every((row: { posted_date: string }) => row.posted_date === '2026-09-11')).toBe(true);
  });

  it('keeps the unfiltered total independent of the first page size', async () => {
    const response = await getPosts(new NextRequest('http://localhost/api/posts?pageSize=200'));
    const data = await response.json();
    expect(data.total).toBe(255);
    expect(data.posts).toHaveLength(200);
  });

  it('rejects an invalid posted period without querying the database', async () => {
    expect((await getPosts(new NextRequest('http://localhost/api/posts?posted=invalid'))).status).toBe(400);
    expect(dbFetch).not.toHaveBeenCalled();
  });

  it('accepts zero but rejects missing, negative, or inconsistent counts in the UI contract', () => {
    const stats = { date: '2026-09-11', timeZone: 'Asia/Seoul', todayCount: 0, recentCount: 254 };
    expect(isNoticeStats(stats)).toBe(true);
    expect(isNoticeStats({ ...stats, todayCount: undefined })).toBe(false);
    expect(isNoticeStats({ ...stats, todayCount: -1 })).toBe(false);
    expect(isNoticeStats({ ...stats, recentCount: 2, todayCount: 3 })).toBe(false);
  });
});
