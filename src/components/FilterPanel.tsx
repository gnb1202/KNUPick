'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { ACTIVITY_TYPES, DEPARTMENTS_WITH_KEYWORDS } from '@/lib/constants';
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
  onActivityTypesClear: () => void;
  selectedCampus: Campus | null;
  onCampusChange: (campus: Campus | null) => void;
  showExpired: boolean;
  onShowExpiredChange: (show: boolean) => void;
  sort: string;
  onSortChange: (sort: string) => void;
}

export default function FilterPanel({
  selectedDepartment,
  onDepartmentChange,
  selectedActivityTypes,
  onActivityTypeToggle,
  onActivityTypesClear,
  selectedCampus,
  onCampusChange,
  showExpired,
  onShowExpiredChange,
  sort,
  onSortChange,
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
    <div className="filter-panel">
      {/* 활동유형 칩 바 */}
      <div className="activity-filters" aria-label="활동 유형">
        <FilterChip
          active={selectedActivityTypes.length === 0}
          typeId="all"
          onClick={onActivityTypesClear}
        >
          전체
        </FilterChip>
        {ACTIVITY_TYPES.map((at) => {
          const on = selectedActivityTypes.includes(at.id);
          return (
            <FilterChip
              key={at.id}
              active={on}
              typeId={String(at.id)}
              onClick={() => onActivityTypeToggle(at.id)}
            >
              <span className="category-icon" aria-hidden="true">{at.icon}</span>
              {at.name}
            </FilterChip>
          );
        })}
      </div>

      {/* 캠퍼스 탭 + 학과 + 정렬 + 마감 토글 */}
      <div className="filter-controls">
        {/* 캠퍼스 탭 */}
        <div className="campus-tabs" aria-label="캠퍼스">
          {CAMPUS_TABS.map((c) => {
            const active = selectedCampus === c.value;
            return (
              <button
                key={c.value || 'all'}
                onClick={() => onCampusChange(c.value)}
                type="button"
                aria-pressed={active}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* 학과 셀렉터 */}
        <div ref={dropdownRef} className="department-control" onKeyDown={event => { if (event.key === 'Escape') { setDeptOpen(false); dropdownRef.current?.querySelector('button')?.focus(); } }}>
          <button
            onClick={() => setDeptOpen((v) => !v)}
            type="button"
            className="department-trigger"
            aria-expanded={deptOpen}
            aria-controls="department-menu"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
            {selectedDept ? selectedDept.name : '학과 선택'}

          </button>
          {deptOpen && (
            <div id="department-menu" className="department-menu" aria-label="학과 선택">
              <div style={{ padding: 10, borderBottom: '1px solid var(--border-soft)' }}>
                <input
                  autoFocus
                  type="text"
                  value={deptQuery}
                  onChange={(e) => setDeptQuery(e.target.value)}
                  placeholder="학과 검색"
                  aria-label="학과 검색"
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
                <DeptItem active={!selectedDepartment} name="모든 학과" onClick={() => { onDepartmentChange(null); setDeptOpen(false); setDeptQuery(''); }} />
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

        <div className="filter-spacer" style={{ flex: 1 }} />

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
          aria-label="공지 정렬"
          value={sort}
          onChange={(e) => onSortChange(e.target.value)}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-soft)',
            borderRadius: 8,
            padding: '10px 12px',
            minHeight: 44,
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

function FilterChip({ children, active, typeId, onClick }: {
  children: React.ReactNode;
  active: boolean;
  typeId: string;
  onClick: () => void;
}) {
  return <button type="button" className="filter-chip" data-type={typeId} aria-pressed={active} onClick={onClick}>{children}</button>;
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
        background: active ? 'var(--action)' : 'transparent',
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
