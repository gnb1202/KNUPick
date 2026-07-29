'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

const NAV_ITEMS = [
  { href: '/', label: '홈' },
  { href: '/calendar', label: '캘린더' },
  { href: '/bookmarks', label: '북마크' },
];

export default function Header() {
  const { user, profile, isLoading, mounted: authMounted } = useAuth();
  const { theme, setTheme, mounted } = useTheme();
  const pathname = usePathname();

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname?.startsWith(href);

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        background: 'color-mix(in oklab, var(--surface) 88%, transparent)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: '1px solid var(--border-soft)',
      }}
    >
      <div
        className="mx-auto"
        style={{
          maxWidth: 1180,
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 24,
        }}
      >
        {/* 로고 */}
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            textDecoration: 'none',
            color: 'var(--text)',
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              background: 'var(--accent)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: -0.5,
            }}
          >
            K
          </div>
          <span
            style={{
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: -0.5,
            }}
          >
            KNUPick
          </span>
        </Link>

        {/* 데스크탑 네비 */}
        <nav className="hidden md:flex" style={{ gap: 4 }}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="btn-press"
                style={{
                  padding: '8px 14px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                  color: active ? 'var(--accent)' : 'var(--text-mute)',
                  background: active ? 'var(--accent-soft)' : 'transparent',
                  transition: 'background .15s, color .15s',
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        {/* 우측 액션 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* 모바일 nav 단축 (캘린더 / 북마크 아이콘) */}
          <Link
            href="/calendar"
            aria-label="캘린더"
            className="md:hidden btn-press inline-flex items-center justify-center"
            style={{
              padding: 8,
              borderRadius: 10,
              background: pathname?.startsWith('/calendar')
                ? 'var(--accent-soft)'
                : 'var(--surface-2)',
              color: pathname?.startsWith('/calendar')
                ? 'var(--accent)'
                : 'var(--text-mute)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </Link>
          {user && (
            <Link
              href="/bookmarks"
              aria-label="북마크"
              className="md:hidden btn-press inline-flex items-center justify-center"
              style={{
                padding: 8,
                borderRadius: 10,
                background: pathname?.startsWith('/bookmarks')
                  ? 'var(--accent-soft)'
                  : 'var(--surface-2)',
                color: pathname?.startsWith('/bookmarks')
                  ? 'var(--accent)'
                  : 'var(--text-mute)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </Link>
          )}

          {/* 관리자 링크 */}
          {profile?.is_admin && (
            <Link
              href="/admin"
              aria-label="관리자"
              className="btn-press"
              style={{
                padding: 8,
                borderRadius: 10,
                background: 'var(--surface-2)',
                color: 'var(--text-mute)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
          )}

          {/* 테마 토글 */}
          <button
            onClick={cycleTheme}
            className="btn-press"
            title={mounted ? `현재: ${theme === 'light' ? '라이트' : theme === 'dark' ? '다크' : '시스템'}` : '테마 변경'}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: 8,
              borderRadius: 10,
              background: 'var(--surface-2)',
              color: 'var(--text-mute)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {!mounted ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
              </svg>
            ) : theme === 'light' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#F59E0B' }}>
                <path fillRule="evenodd" clipRule="evenodd" d="M12 4a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1zm6 8a6 6 0 1 1-12 0 6 6 0 0 1 12 0zm-1.5 6.45l1 1a1 1 0 1 0 1.41-1.41l-1-1a1 1 0 0 0-1.41 1.41zm3.05-13.95a1 1 0 0 1 0 1.41l-1 1a1 1 0 0 1-1.41-1.41l1-1a1 1 0 0 1 1.41 0zM21 13a1 1 0 1 0 0-2h-1a1 1 0 1 0 0 2h1zm-9 5a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1zM6.46 7.46A1 1 0 1 0 7.87 6.05l-.71-.71a1 1 0 0 0-1.41 1.41l.71.71zm1.41 8.49l-.71.71a1 1 0 0 1-1.41-1.41l.71-.71a1 1 0 0 1 1.41 1.41zM4 13a1 1 0 1 0 0-2H3a1 1 0 1 0 0 2h1z" />
              </svg>
            ) : theme === 'dark' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#5BA3FF' }}>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            )}
          </button>

          {/* 사용자 / 로그인 */}
          {authMounted && isLoading ? (
            <div
              style={{
                width: 80,
                height: 32,
                borderRadius: 10,
                background: 'var(--surface-2)',
              }}
              className="animate-pulse"
            />
          ) : authMounted && user ? (
            <Link
              href="/profile"
              className="btn-press"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px 6px 6px',
                borderRadius: 999,
                background: 'var(--surface-2)',
                textDecoration: 'none',
                color: 'var(--text)',
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: 'var(--accent-soft)',
                  color: 'var(--accent)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: 13,
                }}
              >
                {profile?.nickname?.[0] || profile?.username?.[0]?.toUpperCase() || 'U'}
              </span>
              <span
                style={{ fontSize: 13, fontWeight: 600 }}
                className="max-md:hidden"
              >
                {profile?.nickname || profile?.username || '프로필'}
              </span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="btn-press"
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                background: 'var(--accent)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              로그인
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
