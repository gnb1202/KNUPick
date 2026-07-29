'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { ACTIVITY_TYPES, ACTIVITY_COLORS, DEPARTMENTS_WITH_KEYWORDS } from '@/lib/constants';
import type { Campus } from '@/types';

const CAMPUS_TABS: { value: Campus | null; label: string }[] = [
  { value: null, label: '전체' },
  { value: 'kongju', label: '공주' },
  { value: 'cheonan', label: '천안' },
  { value: 'yesan', label: '예산' },
];

interface FilterPanelProps {
  selectedDepartment: number | null;
  onDepartmentChange: (id: number | null) => void;
  selectedActivityTypes: number[];
  onActivityTypeToggle: (id: number) => void;
  selectedCampus: Campus | null;
  onCampusChange: (campus: Campus | null) => void;
  showExpired: boolean;
  onShowExpiredChange: (show: boolean) => void;
  sort: string;
  onSortChange: (sort: string) => void;
  resultCount: number;
}

export default function FilterPanel({
  selectedDepartment,
  onDepartmentChange,
  selectedActivityTypes,
  onActivityTypeToggle,
  selectedCampus,
  onCampusChange,
  showExpired,
  onShowExpiredChange,
  sort,
  onSortChange,
  resultCount,
}: FilterPanelProps) {
  const [deptOpen, setDeptOpen] = useState(false);
  const [deptQuery, setDeptQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDeptOpen(false);
      }
    };
    if (deptOpen) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [deptOpen]);

  const grouped = useMemo(() => {
    const m: Record<string, { college: string; depts: { id: number; name: string }[] }[]> = {};
    DEPARTMENTS_WITH_KEYWORDS.forEach((d, idx) => {
      if (!m[d.campus]) m[d.campus] = [];
      const g = m[d.campus].find((g) => g.college === d.college);
      const dept = { id: idx + 1, name: d.name };
      if (g) g.depts.push(dept);
      else m[d.campus].push({ college: d.college, depts: [dept] });
    });
    return m;
  }, []);

  const filteredDepts = useMemo(() => {
    if (!deptQuery.trim()) return null;
    return DEPARTMENTS_WITH_KEYWORDS.map((d, idx) => ({ ...d, id: idx + 1 })).filter(
      (d) =>
        d.name.toLowerCase().includes(deptQuery.toLowerCase()) ||
        d.college.toLowerCase().includes(deptQuery.toLowerCase())
    );
  }, [deptQuery]);

  const selectedDept = selectedDepartment
    ? DEPARTMENTS_WITH_KEYWORDS[selectedDepartment - 1]
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 활동유형 칩 바 */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <FilterChip
          active={selectedActivityTypes.length === 0}
          onClick={() => {
            // 전체 클릭 시 모든 선택 해제
            selectedActivityTypes.forEach((id) => onActivityTypeToggle(id));
          }}
        >
          전체
        </FilterChip>
        {ACTIVITY_TYPES.map((at) => {
          const on = selectedActivityTypes.includes(at.id);
          const color = ACTIVITY_COLORS[at.id];
          return (
            <FilterChip
              key={at.id}
              active={on}
              activeColor={color}
              onClick={() => onActivityTypeToggle(at.id)}
            >
              <span>{at.icon}</span>
              {at.name}
            </FilterChip>
          );
        })}
      </div>

      {/* 캠퍼스 탭 + 학과 + 정렬 + 마감 토글 */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        {/* 캠퍼스 탭 */}
        <div style={{ display: 'flex', gap: 2 }}>
          {CAMPUS_TABS.map((c) => {
            const active = selectedCampus === c.value;
            return (
              <button
                key={c.value || 'all'}
                onClick={() => onCampusChange(c.value)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  padding: '6px 12px',
                  fontSize: 13,
                  fontWeight: 700,
                  color: active ? 'var(--accent)' : 'var(--text-dim)',
                  borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                  transition: 'color .15s',
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* 학과 셀렉터 */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setDeptOpen((v) => !v)}
            className="btn-press"
            style={{
              all: 'unset',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 999,
              border: '1px solid var(--border-soft)',
              background: selectedDept ? 'var(--accent-soft)' : 'var(--surface)',
              color: selectedDept ? 'var(--accent)' : 'var(--text-mute)',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
            {selectedDept ? selectedDept.name : '학과 선택'}
            {selectedDept && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onDepartmentChange(null);
                }}
                style={{
                  marginLeft: 2,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  color: '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 800,
                }}
              >
                ×
              </span>
            )}
          </button>
          {deptOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                width: 320,
                maxHeight: 380,
                background: 'var(--surface)',
                border: '1px solid var(--border-soft)',
                borderRadius: 14,
                boxShadow: 'var(--shadow-pop)',
                zIndex: 30,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ padding: 10, borderBottom: '1px solid var(--border-soft)' }}>
                <input
                  autoFocus
                  type="text"
                  value={deptQuery}
                  onChange={(e) => setDeptQuery(e.target.value)}
                  placeholder="학과 검색"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 10,
                    border: '1px solid var(--border-soft)',
                    background: 'var(--surface-2)',
                    fontSize: 13,
                    color: 'var(--text)',
                  }}
                />
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {filteredDepts ? (
                  filteredDepts.length > 0 ? (
                    <div style={{ padding: 6 }}>
                      {filteredDepts.map((d) => (
                        <DeptItem
                          key={d.id}
                          active={selectedDepartment === d.id}
                          onClick={() => {
                            onDepartmentChange(d.id);
                            setDeptOpen(false);
                            setDeptQuery('');
                          }}
                          name={d.name}
                          sub={`${d.campus} · ${d.college}`}
                        />
                      ))}
                    </div>
                  ) : (
                    <p style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                      검색 결과가 없습니다
                    </p>
                  )
                ) : (
                  Object.entries(grouped).map(([campus, colleges]) => (
                    <div key={campus} style={{ padding: 6 }}>
                      <div
                        style={{
                          padding: '8px 12px',
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--text-dim)',
                          letterSpacing: 0.8,
                          textTransform: 'uppercase',
                        }}
                      >
                        {campus} 캠퍼스
                      </div>
                      {colleges.map((cg) => (
                        <div key={cg.college} style={{ marginBottom: 4 }}>
                          <div
                            style={{
                              padding: '4px 12px',
                              fontSize: 12,
                              fontWeight: 600,
                              color: 'var(--text-mute)',
                            }}
                          >
                            {cg.college}
                          </div>
                          {cg.depts.map((d) => (
                            <DeptItem
                              key={d.id}
                              active={selectedDepartment === d.id}
                              onClick={() => {
                                onDepartmentChange(d.id);
                                setDeptOpen(false);
                                setDeptQuery('');
                              }}
                              name={d.name}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* 결과 카운트 */}
        <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>
          {resultCount.toLocaleString()}건
        </span>

        {/* 마감 숨김 */}
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--text-mute)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={!showExpired}
            onChange={(e) => onShowExpiredChange(!e.target.checked)}
            style={{ accentColor: 'var(--accent)' }}
          />
          마감 숨기기
        </label>

        {/* 정렬 */}
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value)}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-soft)',
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >
          <option value="latest">최신순</option>
          <option value="deadline">마감 임박순</option>
        </select>
      </div>
    </div>
  );
}

function FilterChip({
  children,
  active,
  activeColor,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  activeColor?: string;
  onClick: () => void;
}) {
  // activeColor가 없는 "전체" 칩은 accent 사용 (다크모드에서도 또렷)
  const bg = active ? activeColor || 'var(--accent)' : 'var(--surface)';
  return (
    <button
      onClick={onClick}
      className="btn-press"
      style={{
        all: 'unset',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 14px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        background: bg,
        color: active ? '#fff' : 'var(--text-mute)',
        border: `1px solid ${active ? 'transparent' : 'var(--border-soft)'}`,
        transition: 'all .15s',
      }}
    >
      {children}
    </button>
  );
}

function DeptItem({
  active,
  onClick,
  name,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  name: string;
  sub?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        display: 'block',
        width: '100%',
        padding: '8px 12px',
        borderRadius: 8,
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? '#fff' : 'var(--text)',
        boxSizing: 'border-box',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--surface-2)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
      {sub && (
        <div style={{ fontSize: 11, color: active ? 'rgba(255,255,255,0.8)' : 'var(--text-dim)' }}>
          {sub}
        </div>
      )}
    </button>
  );
}
