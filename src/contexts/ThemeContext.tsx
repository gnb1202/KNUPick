'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore, ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isDark: boolean;
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // 하이드레이션 일치를 위해 서버와 클라이언트 모두 'system'으로 시작
  const theme = useSyncExternalStore(
    callback => { window.addEventListener('storage', callback); window.addEventListener('knupick-theme', callback); return () => { window.removeEventListener('storage', callback); window.removeEventListener('knupick-theme', callback); }; },
    () => { const value = localStorage.getItem('theme'); return (value && ['light','dark','system'].includes(value) ? value : 'system') as Theme; },
    () => 'system' as Theme,
  );
  const [isDark, setIsDark] = useState(false);
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);

  // 테마 변경 시 적용
  useEffect(() => {
    const root = document.documentElement;

    const applyTheme = (dark: boolean) => {
      if (dark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
      setIsDark(dark);
    };

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(mediaQuery.matches);

      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches);
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      applyTheme(theme === 'dark');
    }
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    localStorage.setItem('theme', newTheme);
    window.dispatchEvent(new Event('knupick-theme'));
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
