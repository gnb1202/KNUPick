'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { DEPARTMENTS_WITH_KEYWORDS } from '@/lib/constants';
import type { Campus } from '@/types';

const CAMPUS_OPTIONS: { value: Campus | null; label: string }[] = [
  { value: null, label: '전체 캠퍼스' },
  { value: 'kongju', label: '공주 캠퍼스' },
  { value: 'cheonan', label: '천안 캠퍼스' },
  { value: 'yesan', label: '예산 캠퍼스' },
];

interface FilterPanelProps {
  selectedDepartment: number | null;
  onDepartmentChange: (id: number | null) => void;
  selectedCampus: Campus | null;
  onCampusChange: (campus: Campus | null) => void;
  isMobileOpen?: boolean;
  onMobileToggle?: () => void;
  showExpired?: boolean;
  onShowExpiredChange?: (show: boolean) => void;
}

export default function FilterPanel({ selectedDepartment, onDepartmentChange, selectedCampus, onCampusChange, isMobileOpen = false, onMobileToggle, showExpired = false, onShowExpiredChange }: FilterPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 바깥 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // 캠퍼스별로 그룹화
  const groupedDepartments = useMemo(() => {
    const grouped: Record<string, { college: string; departments: { id: number; name: string }[] }[]> = {};

    DEPARTMENTS_WITH_KEYWORDS.forEach((dept, index) => {
      if (!grouped[dept.campus]) {
        grouped[dept.campus] = [];
      }

      const collegeGroup = grouped[dept.campus].find(g => g.college === dept.college);
      if (collegeGroup) {
        collegeGroup.departments.push({ id: index + 1, name: dept.name });
      } else {
        grouped[dept.campus].push({
          college: dept.college,
          departments: [{ id: index + 1, name: dept.name }],
        });
      }
    });

    return grouped;
  }, []);

  // 검색 필터링
  const filteredDepartments = useMemo(() => {
    if (!searchQuery) return null;

    return DEPARTMENTS_WITH_KEYWORDS
      .map((dept, index) => ({ ...dept, id: index + 1 }))
      .filter(dept =>
        dept.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        dept.college.toLowerCase().includes(searchQuery.toLowerCase())
      );
  }, [searchQuery]);

  const selectedDeptInfo = selectedDepartment
    ? DEPARTMENTS_WITH_KEYWORDS[selectedDepartment - 1]
    : null;

  // 선택된 필터 개수 계산
  const activeFilterCount = (selectedCampus ? 1 : 0) + (selectedDepartment ? 1 : 0);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-4 mb-4">
      {/* 모바일 토글 버튼 */}
      <button
        onClick={onMobileToggle}
        className="lg:hidden w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-[#033885]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span className="font-semibold text-slate-900 dark:text-white">필터</span>
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-[#033885] text-white rounded-full">
              {activeFilterCount}
            </span>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-slate-500 transition-transform duration-200 ${isMobileOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 필터 내용 - 모바일에서 조건부, 데스크톱에서 항상 표시 */}
      <div className={`${isMobileOpen ? 'block' : 'hidden'} lg:block mt-4 lg:mt-0`}>
        {/* 캠퍼스 선택 */}
        <div className="mb-4">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-2">
          캠퍼스
        </h2>
        <div className="flex flex-wrap gap-2">
          {CAMPUS_OPTIONS.map((option) => (
            <button
              key={option.value || 'all'}
              onClick={() => onCampusChange(option.value)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors
                ${selectedCampus === option.value
                  ? 'bg-[#033885] text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* 마감됨 표시 토글 */}
      {onShowExpiredChange && (
        <div className="mb-4">
          <button
            onClick={() => onShowExpiredChange(!showExpired)}
            className="flex items-center gap-2 w-full"
          >
            <div
              className={`relative w-10 h-5 rounded-full transition-colors ${
                showExpired ? 'bg-[#033885]' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  showExpired ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </div>
            <span className="text-sm text-slate-700 dark:text-slate-300">
              마감된 일정 표시
            </span>
          </button>
        </div>
      )}

      <hr className="border-slate-200 dark:border-slate-600 mb-4" />

      {/* 학과 선택 */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-900 dark:text-white">
          학과 선택
        </h2>
        {selectedDepartment && (
          <button
            onClick={() => onDepartmentChange(null)}
            className="text-sm text-[#033885] hover:underline"
          >
            초기화
          </button>
        )}
      </div>

      {/* 선택된 학과 표시 */}
      {selectedDeptInfo && (
        <div className="mb-3 p-3 bg-[#033885]/10 rounded-xl">
          <p className="text-sm text-[#033885] font-medium">
            {selectedDeptInfo.campus} · {selectedDeptInfo.college}
          </p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">
            {selectedDeptInfo.name}
          </p>
        </div>
      )}

      {/* 검색 입력 및 드롭다운 */}
      <div ref={dropdownRef}>
        <div className="relative mb-3">
          <input
            type="text"
            placeholder="학과 검색..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-700 rounded-xl
                       text-slate-900 dark:text-white placeholder-slate-400
                       focus:outline-none focus:ring-2 focus:ring-[#033885]/50
                       transition-all duration-200"
          />
          <svg
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* 드롭다운 목록 */}
        {isOpen && (
        <div className="max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-600 rounded-xl">
          {filteredDepartments ? (
            // 검색 결과
            filteredDepartments.length > 0 ? (
              <div className="p-2">
                {filteredDepartments.map((dept) => (
                  <button
                    key={dept.id}
                    onClick={() => {
                      onDepartmentChange(dept.id);
                      setSearchQuery('');
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors
                      ${selectedDepartment === dept.id
                        ? 'bg-[#033885] text-white'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                  >
                    <p className="text-sm font-medium">{dept.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-300">
                      {dept.campus} · {dept.college}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="p-4 text-center text-slate-500 dark:text-slate-400">검색 결과가 없습니다</p>
            )
          ) : (
            // 전체 목록 (캠퍼스별)
            Object.entries(groupedDepartments).map(([campus, colleges]) => (
              <div key={campus} className="p-2">
                <p className="px-3 py-1 text-xs font-bold text-slate-400 dark:text-slate-300 uppercase">
                  {campus} 캠퍼스
                </p>
                {colleges.map((collegeGroup) => (
                  <div key={collegeGroup.college} className="mb-2">
                    <p className="px-3 py-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
                      {collegeGroup.college}
                    </p>
                    {collegeGroup.departments.map((dept) => (
                      <button
                        key={dept.id}
                        onClick={() => {
                          onDepartmentChange(dept.id);
                          setSearchQuery('');
                          setIsOpen(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors
                          ${selectedDepartment === dept.id
                            ? 'bg-[#033885] text-white'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                          }`}
                      >
                        {dept.name}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
        )}
      </div>

      </div>
    </div>
  );
}
