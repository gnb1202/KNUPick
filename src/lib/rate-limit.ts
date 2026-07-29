import { supabaseAdmin } from './supabase';

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
  remaining: number;
}

interface IncrementRow {
  allowed: boolean;
  count: number;
  reset_at: string;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  if (!supabaseAdmin) {
    throw new Error('rate-limit: supabaseAdmin not configured');
  }

  const { data, error } = await supabaseAdmin.rpc('increment_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window_ms: windowMs,
  });

  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    throw new Error(`rate-limit RPC failed: ${error?.message || 'no data'}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as IncrementRow;
  const retryAfterSec = row.allowed
    ? 0
    : Math.max(1, Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000));

  return {
    ok: row.allowed,
    retryAfterSec,
    remaining: Math.max(0, limit - row.count),
  };
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip') || 'unknown';
}
