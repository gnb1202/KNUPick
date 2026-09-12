'use client';

import { useEffect, useRef, useState } from 'react';
import { isChosungOnly } from '@/lib/search';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  showSuggestions?: boolean;
}
const SUGGESTED_KEYWORDS = ['장학금', '공모전', '해커톤', '인턴', '디자인', 'ㅈㅎㄱ'];

export default function SearchBar({
  value, onChange, placeholder = '어떤 기회를 찾고 있나요?', className = '', showSuggestions = true,
}: SearchBarProps) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setFocused(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`search-field ${className}`} onFocus={() => setFocused(true)}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setFocused(false); }}>
      <div className="search-control">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/></svg>
        <input ref={inputRef} type="search" aria-label="공지 검색" value={value}
          onChange={event => onChange(event.target.value)} placeholder={placeholder} autoComplete="off" />
        {value && isChosungOnly(value) && <span className="search-shortcut">초성 검색</span>}
        {value ? <button type="button" className="icon-control" aria-label="검색어 지우기"
          onClick={() => { onChange(''); inputRef.current?.focus(); }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button> : <kbd className="search-shortcut">Ctrl / ⌘ K</kbd>}
      </div>
      {showSuggestions && focused && !value && (
        <div className="search-suggestions">
          <div className="search-suggestions-label">이런 기회를 찾아보세요 · 초성 검색도 가능해요</div>
          <div className="search-suggestions-list">
            {SUGGESTED_KEYWORDS.map(keyword => <button type="button" key={keyword}
              onClick={() => { onChange(keyword); inputRef.current?.focus(); }}>{keyword}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}
