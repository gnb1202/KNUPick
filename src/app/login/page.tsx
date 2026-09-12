'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import BrandMark from '@/components/BrandMark';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const { error } = await signIn(username, password);

    if (error) {
      setError('아이디 또는 비밀번호가 올바르지 않습니다.');
      setIsLoading(false);
      return;
    }

    router.push('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        {/* 로고 */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <h1 className="flex items-center justify-center gap-3 text-3xl font-extrabold tracking-tight text-[var(--text)]"><BrandMark size={42} /><span>KNUPICK</span></h1>
          </Link>
          <p className="text-[var(--text-mute)] mt-2">
            로그인하고 맞춤 정보를 받아보세요
          </p>
        </div>

        {/* 로그인 폼 */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div role="alert" className="p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-sm font-medium text-[var(--text)] mb-1">
                아이디
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-4 py-2.5 bg-[var(--surface-2)] rounded-xl
                         text-[var(--text)] placeholder:text-[var(--text-dim)]
                         focus:outline-none focus:ring-2 focus:ring-[var(--accent)]
                         transition-all duration-200"
                placeholder="아이디 입력"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[var(--text)] mb-1">
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 bg-[var(--surface-2)] rounded-xl
                         text-[var(--text)] placeholder:text-[var(--text-dim)]
                         focus:outline-none focus:ring-2 focus:ring-[var(--accent)]
                         transition-all duration-200"
                placeholder="비밀번호 입력"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-[var(--action)] text-white font-semibold rounded-xl
                       hover:bg-[var(--action-hover)] transition-colors duration-200
                       disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '로그인 중...' : '로그인'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-[var(--text-mute)] text-sm">
              아직 계정이 없으신가요?{' '}
              <Link href="/signup" className="text-[var(--accent)] hover:underline font-medium">
                회원가입
              </Link>
            </p>
          </div>
        </div>

        {/* 홈으로 돌아가기 */}
        <div className="mt-6 text-center">
          <Link href="/" className="text-[var(--text-dim)] hover:text-[var(--accent)] text-sm transition-colors">
            ← 홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
