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

  // 프로필 가져오기 (재시도 로직 포함)
  const fetchProfile = async (userId: string, retries = 3): Promise<UserProfile | null> => {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      // PGRST116: 결과가 없음 - 프로필이 아직 생성 중일 수 있음
      if (error.code === 'PGRST116' && retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
        return fetchProfile(userId, retries - 1);
      }
      // 재시도 후에도 없으면 조용히 처리 (새 회원가입의 경우 정상)
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('Profile fetch error:', error);
      return null;
    }

    return data as UserProfile;
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          const profileData = await fetchProfile(session.user.id);
          if (mounted) setProfile(profileData);
        } else {
          setProfile(null);
        }

        setIsLoading(false);
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
      .single();

    if (existingUser) {
      return { error: new Error('이미 사용 중인 아이디입니다.') };
    }

    const email = usernameToEmail(username);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // 이메일 인증 건너뛰기
        emailRedirectTo: undefined,
      },
    });

    if (error) {
      return { error };
    }

    // 프로필 생성
    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        username,
        nickname: null,
        campus: null,
        department_id: null,
        preferred_activity_types: [],
      });

      if (profileError) {
        console.error('Profile creation error:', profileError);
        return { error: new Error('프로필 생성에 실패했습니다.') };
      }

      // 프로필 생성 후 즉시 상태 업데이트
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
