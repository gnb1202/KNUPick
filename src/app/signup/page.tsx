'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

export default function SignupPage() {
  const { signUp, signOut } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [completedUsername, setCompletedUsername] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // 아이디 유효성 검사
    if (username.length < 4) {
      setError('아이디는 4자 이상이어야 합니다.');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('아이디는 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.');
      return;
    }

    // 비밀번호 확인
    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    // 비밀번호 길이 확인
    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    setIsLoading(true);

    const { error } = await signUp(username, password);

    if (error) {
      setError(error.message || '회원가입에 실패했습니다.');
      setIsLoading(false);
      return;
    }

    // Supabase signUp은 이메일 인증이 비활성화된 환경에서 즉시 세션을 생성한다.
    // 가입 완료 화면은 비로그인 상태여야 하므로 명시적으로 세션을 정리한다.
    await signOut();

    setCompletedUsername(username);
    setIsComplete(true);
    setIsLoading(false);
  };

  if (isComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link href="/" className="inline-block">
              <h1 className="text-3xl font-bold">
                <span className="text-[#033885]">KNU</span>
                <span className="text-slate-800 dark:text-white">Pick</span>
              </h1>
            </Link>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 text-center">
            <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <svg className="w-7 h-7 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              회원가입이 완료되었습니다
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              <span className="font-semibold text-[#033885]">{completedUsername}</span> 계정이 생성되었어요.
            </p>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              로그인 후 프로필을 설정하면 더 정확하게 추천해드려요.
            </p>

            <div className="mt-6 space-y-2">
              <Link
                href="/"
                className="block w-full py-3 bg-[#033885] text-white font-semibold rounded-xl
                         hover:bg-[#022a66] transition-colors duration-200"
              >
                홈으로 돌아가기
              </Link>
              <Link
                href="/login"
                className="block w-full py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl
                         hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors duration-200"
              >
                로그인하러 가기
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* 로고 */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <h1 className="text-3xl font-bold">
              <span className="text-[#033885]">KNU</span>
              <span className="text-slate-800 dark:text-white">Pick</span>
            </h1>
          </Link>
          <p className="text-slate-600 dark:text-slate-400 mt-2">
            회원가입하고 맞춤 정보를 받아보세요
          </p>
        </div>

        {/* 회원가입 폼 */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                아이디
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-700 rounded-xl
                         text-slate-900 dark:text-white placeholder-slate-400
                         focus:outline-none focus:ring-2 focus:ring-[#033885]/50
                         transition-all duration-200"
                placeholder="영문, 숫자 4자 이상"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-700 rounded-xl
                         text-slate-900 dark:text-white placeholder-slate-400
                         focus:outline-none focus:ring-2 focus:ring-[#033885]/50
                         transition-all duration-200"
                placeholder="6자 이상 입력"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                비밀번호 확인
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-700 rounded-xl
                         text-slate-900 dark:text-white placeholder-slate-400
                         focus:outline-none focus:ring-2 focus:ring-[#033885]/50
                         transition-all duration-200"
                placeholder="비밀번호 다시 입력"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-[#033885] text-white font-semibold rounded-xl
                       hover:bg-[#022a66] transition-colors duration-200
                       disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '가입 중...' : '회원가입'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              이미 계정이 있으신가요?{' '}
              <Link href="/login" className="text-[#033885] hover:underline font-medium">
                로그인
              </Link>
            </p>
          </div>
        </div>

        {/* 홈으로 돌아가기 */}
        <div className="mt-6 text-center">
          <Link href="/" className="text-slate-500 hover:text-[#033885] text-sm transition-colors">
            ← 홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
