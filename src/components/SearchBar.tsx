'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { isChosungOnly } from '@/lib/search';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  showSuggestions?: boolean;
}

const SUGGESTED_KEYWORDS = ['해커톤', '장학금', 'ㅈㅎㄱ', '인턴', '디자인', 'ㄱㅁㅈ'];

export default function SearchBar({
  value,
  onChange,
  placeholder = "공지를 검색해보세요. 'ㅈㅎㄱ'처럼 초성도 가능해요",
  className = '',
  showSuggestions = true,
}: SearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClear = useCallback(() => {
    onChange('');
    inputRef.current?.focus();
  }, [onChange]);

  // Ctrl/Cmd + K 단축키
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const showHint = showSuggestions && isFocused && value.length === 0;
  const isChosung = value && isChosungOnly(value);

  return (
    <div className={className} style={{ position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'var(--surface)',
          border: `1px solid ${isFocused ? 'var(--accent)' : 'var(--border-soft)'}`,
          borderRadius: 14,
          padding: '12px 16px',
          transition: 'border-color .15s, box-shadow .15s',
          boxShadow: isFocused
            ? '0 0 0 3px color-mix(in oklab, var(--accent) 16%, transparent)'
            : 'none',
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            color: isFocused ? 'var(--accent)' : 'var(--text-dim)',
            flexShrink: 0,
          }}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 150)}
          placeholder={placeholder}
          style={{
            all: 'unset',
            flex: 1,
            fontSize: 14,
            color: 'var(--text)',
          }}
        />
        {isChosung && (
          <span
            style={{
              padding: '3px 8px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              flexShrink: 0,
            }}
          >
            초성 검색
          </span>
        )}
        {value && (
          <button
            onClick={handleClear}
            title="지우기"
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: 4,
              borderRadius: '50%',
              color: 'var(--text-dim)',
              display: 'inline-flex',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {showHint && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            background: 'var(--surface)',
            border: '1px solid var(--border-soft)',
            borderRadius: 12,
            padding: 12,
            zIndex: 20,
            boxShadow: 'var(--shadow-pop)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-dim)',
              fontWeight: 700,
              marginBottom: 8,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
            }}
          >
            추천 검색어
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SUGGESTED_KEYWORDS.map((k) => (
              <button
                key={k}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(k);
                }}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  padding: '5px 12px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border-soft)',
                }}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
