'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { UserProfile } from '@/types';

// 아이디를 가짜 이메일로 변환 (Supabase Auth는 이메일 기반)
const usernameToEmail = (username: string) => `${username}@konglink.local`;

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  isLoading: boolean;
  mounted: boolean;
  signUp: (username: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (username: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error: Error | null }>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // 프로필 가져오기 (가입 직후 트리거가 행을 만들 때까지 짧게 재시도)
  const fetchProfile = async (userId: string, retries = 3): Promise<UserProfile | null> => {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Profile fetch error:', error);
      return null;
    }

    if (!data && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return fetchProfile(userId, retries - 1);
    }

    return (data as UserProfile) ?? null;
  };

  // 프로필 새로고침
  const refreshProfile = async () => {
    if (user) {
      const profileData = await fetchProfile(user.id);
      setProfile(profileData);
    }
  };

  // 초기 세션 확인
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      if (!supabase) {
        if (mounted) {
          setIsLoading(false);
          setMounted(true);
        }
        return;
      }

      // 현재 세션 가져오기
      const { data: { session } } = await supabase.auth.getSession();

      if (mounted) {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          const profileData = await fetchProfile(session.user.id);
          if (mounted) setProfile(profileData);
        }

        setIsLoading(false);
        setMounted(true);
      }
    };

    initAuth();

    // 인증 상태 변경 리스너
    if (!supabase) return;

    // ⚠️ Supabase 데드락 회피:
    // onAuthStateChange 콜백 안에서 await로 다른 supabase 호출을 하면
    // GoTrueClient 내부 락과 충돌해 signInWithPassword 등의 Promise가 풀리지 않는다.
    // 콜백은 동기 처리만 하고, fetchProfile은 마이크로태스크 큐 밖으로 분리한다.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;

        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);

        if (session?.user) {
          const userId = session.user.id;
          setTimeout(() => {
            fetchProfile(userId).then((profileData) => {
              if (mounted) setProfile(profileData);
            });
          }, 0);
        } else {
          setProfile(null);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 회원가입 (아이디 기반)
  const signUp = async (username: string, password: string) => {
    if (!supabase) {
      return { error: new Error('Supabase not configured') };
    }

    // 아이디 중복 확인
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (existingUser) {
      return { error: new Error('이미 사용 중인 아이디입니다.') };
    }

    const email = usernameToEmail(username);

    // username을 metadata로 넘기면 on_auth_user_created 트리거가 profiles 행을 생성한다.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        emailRedirectTo: undefined,
      },
    });

    if (error) {
      return { error };
    }

    if (data.user) {
      // 트리거(on_auth_user_created)가 행을 만들지만, 마이그레이션 적용 전 환경에서도
      // 동작하도록 idempotent upsert로 보장. 트리거가 먼저 만들었으면 충돌 없이 무시.
      await supabase
        .from('profiles')
        .upsert({ id: data.user.id, username }, { onConflict: 'id', ignoreDuplicates: true });

      const profileData = await fetchProfile(data.user.id);
      if (profileData) {
        setProfile(profileData);
      }
    }

    return { error: null };
  };

  // 로그인 (아이디 기반)
  const signIn = async (username: string, password: string) => {
    if (!supabase) {
      return { error: new Error('Supabase not configured') };
    }

    const email = usernameToEmail(username);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error: error || null };
  };

  // 로그아웃
  const signOut = async () => {
    if (!supabase) return;

    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Sign out error:', error);
      }
    } catch (err) {
      console.error('Sign out exception:', err);
    }

    setUser(null);
    setProfile(null);
    setSession(null);
  };

  // 회원탈퇴 — 서버 라우트가 service-role로 auth.users + profiles 삭제 후 클라 세션 정리
  const deleteAccount = async () => {
    if (!supabase) {
      return { error: new Error('Supabase not configured') };
    }

    const { data: { session: current } } = await supabase.auth.getSession();
    const token = current?.access_token;
    if (!token) {
      return { error: new Error('Not authenticated') };
    }

    const res = await fetch('/api/auth/delete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: new Error(body.error || '회원탈퇴에 실패했습니다.') };
    }

    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
    return { error: null };
  };

  // 프로필 업데이트
  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!supabase || !user) {
      return { error: new Error('Not authenticated') };
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (!error) {
      await refreshProfile();
    }

    return { error: error || null };
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        isLoading,
        mounted,
        signUp,
        signIn,
        signOut,
        deleteAccount,
        updateProfile,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
