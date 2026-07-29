import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/env';

declare global {
  var __knupickSupabase: SupabaseClient | undefined;
}

function getSupabaseClient(): SupabaseClient {
  if (typeof window === 'undefined') {
    return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  if (!globalThis.__knupickSupabase) {
    globalThis.__knupickSupabase = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  }
  return globalThis.__knupickSupabase;
}

function getSupabaseAdminClient(): SupabaseClient | null {
  // service role key는 서버 전용 — 클라이언트 번들에선 비활성
  if (typeof window !== 'undefined') return null;
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const supabase = getSupabaseClient();
export const supabaseAdmin = getSupabaseAdminClient();
