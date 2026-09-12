'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import BrandMark from './BrandMark';

const NAV_ITEMS = [
  { href: '/', label: '기회 둘러보기' },
  { href: '/calendar', label: '캘린더' },
  { href: '/bookmarks', label: '저장한 공지' },
];

export default function Header() {
  const { user, profile, isLoading, mounted: authMounted } = useAuth();
  const { theme, setTheme, mounted } = useTheme();
  const pathname = usePathname();
  const cycleTheme = () => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light');
  const themeName = !mounted ? '시스템' : theme === 'light' ? '라이트' : theme === 'dark' ? '다크' : '시스템';

  return (
    <header className="site-header">
      <a className="skip-link" href="#main-content">본문 바로가기</a>
      <div className="site-header-inner">
        <Link href="/" className="brand-lockup" aria-label="KNUPICK 홈">
          <BrandMark />
          <span>KNUPICK</span>
        </Link>
        <nav className="site-nav" aria-label="주 메뉴">
          {NAV_ITEMS.map(item => {
            const active = item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
            return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}>{item.label}</Link>;
          })}
        </nav>
        <div className="header-actions">
          {profile?.is_admin && <Link href="/admin" className="icon-control" aria-label="관리자">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </Link>}
          <button type="button" onClick={cycleTheme} className="icon-control" aria-label={`테마 변경, 현재 ${themeName}`} title={`현재: ${themeName}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {mounted && theme === 'light' ? <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></> : mounted && theme === 'dark' ? <path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10Z"/> : <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></>}
            </svg>
          </button>
          {authMounted && isLoading ? <div className="header-loading animate-pulse" /> : authMounted && user ? (
            <Link href="/profile" className="profile-control" aria-label="내 프로필">
              <span className="profile-initial">{profile?.nickname?.[0] || profile?.username?.[0]?.toUpperCase() || '나'}</span>
              <span className="profile-name">{profile?.nickname || profile?.username || '프로필'}</span>
            </Link>
          ) : <Link href="/login" className="button-primary header-login">로그인</Link>}
        </div>
      </div>
    </header>
  );
}
