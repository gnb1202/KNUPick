'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { ACTIVITY_TYPES, DEPARTMENTS_WITH_KEYWORDS } from '@/lib/constants';
import type { Campus } from '@/types';

const CAMPUS_OPTIONS: { value: Campus; label: string }[] = [
  { value: 'kongju', label: '공주 캠퍼스' },
  { value: 'cheonan', label: '천안 캠퍼스' },
  { value: 'yesan', label: '예산 캠퍼스' },
];

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, isLoading, updateProfile, signOut, deleteAccount } = useAuth();

  const [nickname, setNickname] = useState('');
  const [campus, setCampus] = useState<Campus | null>(null);
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [preferredTypes, setPreferredTypes] = useState<number[]>([]);
  const [customKeywords, setCustomKeywords] = useState<string[]>([]);
  const [excludedKeywords, setExcludedKeywords] = useState<string[]>([]);
  const [newCustomKeyword, setNewCustomKeyword] = useState('');
  const [newExcludedKeyword, setNewExcludedKeyword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [profileKey, setProfileKey] = useState<string | null>(null);

  // 프로필 데이터로 폼 초기화 (프로필 ID가 변경될 때만)
  if (profile && profileKey !== profile.id) {
    setNickname(profile.nickname || '');
    setCampus(profile.campus);
    setDepartmentId(profile.department_id);
    setPreferredTypes(profile.preferred_activity_types || []);
    setCustomKeywords(profile.custom_keywords || []);
    setExcludedKeywords(profile.excluded_keywords || []);
    setProfileKey(profile.id);
  }

  // 비로그인 상태 리다이렉트 (로그아웃/탈퇴 중이 아닐 때만)
  useEffect(() => {
    if (!isLoading && !user && !isLoggingOut && !isDeleting) {
      router.push('/login');
    }
  }, [isLoading, user, router, isLoggingOut, isDeleting]);

  const handleActivityTypeToggle = (id: number) => {
    setPreferredTypes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const handleAddCustomKeyword = () => {
    const keyword = newCustomKeyword.trim();
    if (keyword && !customKeywords.includes(keyword)) {
      setCustomKeywords([...customKeywords, keyword]);
      setNewCustomKeyword('');
    }
  };

  const handleRemoveCustomKeyword = (keyword: string) => {
    setCustomKeywords(customKeywords.filter(k => k !== keyword));
  };

  const handleAddExcludedKeyword = () => {
    const keyword = newExcludedKeyword.trim();
    if (keyword && !excludedKeywords.includes(keyword)) {
      setExcludedKeywords([...excludedKeywords, keyword]);
      setNewExcludedKeyword('');
    }
  };

  const handleRemoveExcludedKeyword = (keyword: string) => {
    setExcludedKeywords(excludedKeywords.filter(k => k !== keyword));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    const { error } = await updateProfile({
      nickname: nickname || null,
      campus,
      department_id: departmentId,
      preferred_activity_types: preferredTypes,
      custom_keywords: customKeywords,
      excluded_keywords: excludedKeywords,
    });

    if (error) {
      setMessage({ type: 'error', text: '저장에 실패했습니다. 다시 시도해주세요.' });
      setIsSaving(false);
      return;
    }

    setMessage({ type: 'success', text: '프로필이 저장되었습니다! 홈으로 이동합니다…' });
    setIsSaving(false);

    setTimeout(() => {
      router.push('/');
    }, 600);
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
      router.push('/');
    } catch (err) {
      console.error('Logout error:', err);
      setIsLoggingOut(false);
    }
  };

  const handleDeleteAccount = async () => {
    const ok = window.confirm(
      '정말로 회원탈퇴하시겠습니까?\n\n프로필, 북마크 등 모든 정보가 영구 삭제되며 복구할 수 없습니다.'
    );
    if (!ok) return;

    setIsDeleting(true);
    setMessage(null);
    const { error } = await deleteAccount();
    if (error) {
      setMessage({ type: 'error', text: error.message });
      setIsDeleting(false);
      return;
    }
    router.push('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-500">로딩 중...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // 선택된 캠퍼스의 학과만 필터링
  const filteredDepartments = campus
    ? DEPARTMENTS_WITH_KEYWORDS.filter((dept) => {
        const campusName =
          campus === 'kongju' ? '공주' :
          campus === 'cheonan' ? '천안' :
          campus === 'yesan' ? '예산' : '';
        return dept.campus === campusName;
      })
    : DEPARTMENTS_WITH_KEYWORDS;

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="text-slate-500 hover:text-[#033885] transition-colors">
            ← 홈으로
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            프로필 설정
          </h1>
          <button
            onClick={handleLogout}
            className="text-red-500 hover:text-red-600 text-sm"
          >
            로그아웃
          </button>
        </div>

        {/* 프로필 폼 */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 메시지 */}
          {message && (
            <div
              className={`p-3 rounded-lg text-sm ${
                message.type === 'success'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* 기본 정보 */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              기본 정보
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  아이디
                </label>
                <input
                  type="text"
                  value={profile?.username || ''}
                  disabled
                  className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-700 rounded-xl
                           text-slate-500 dark:text-slate-400 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  닉네임 (선택)
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-700 rounded-xl
                           text-slate-900 dark:text-white placeholder-slate-400
                           focus:outline-none focus:ring-2 focus:ring-[#033885]/50
                           transition-all duration-200"
                  placeholder="닉네임 입력"
                />
              </div>
            </div>
          </div>

          {/* 캠퍼스 & 학과 */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              소속 정보
            </h2>

            <div className="space-y-4">
              {/* 캠퍼스 선택 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  캠퍼스
                </label>
                <div className="flex flex-wrap gap-2">
                  {CAMPUS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setCampus(option.value);
                        setDepartmentId(null); // 캠퍼스 변경 시 학과 초기화
                      }}
                      className={`px-4 py-2 text-sm rounded-xl transition-colors
                        ${campus === option.value
                          ? 'bg-[#033885] text-white'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                        }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 학과 선택 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  학과
                </label>
                <select
                  value={departmentId || ''}
                  onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-700 rounded-xl
                           text-slate-900 dark:text-white
                           focus:outline-none focus:ring-2 focus:ring-[#033885]/50
                           transition-all duration-200"
                >
                  <option value="">학과 선택</option>
                  {filteredDepartments.map((dept) => {
                    const deptIndex = DEPARTMENTS_WITH_KEYWORDS.indexOf(dept) + 1;
                    return (
                      <option key={deptIndex} value={deptIndex}>
                        {dept.college} - {dept.name}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>

          {/* 관심 활동유형 */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              관심 활동유형
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              관심 있는 활동유형을 선택하면 해당 공고를 우선적으로 보여드려요
            </p>

            <div className="flex flex-wrap gap-2">
              {ACTIVITY_TYPES.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => handleActivityTypeToggle(type.id)}
                  className={`px-4 py-2 text-sm rounded-xl transition-colors
                    ${preferredTypes.includes(type.id)
                      ? 'bg-[#033885] text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                >
                  {type.name}
                </button>
              ))}
            </div>
          </div>

          {/* 맞춤 키워드 */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              맞춤 키워드
            </h2>

            {/* 관심 키워드 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                관심 키워드
              </label>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                이 키워드가 포함된 공지를 우선적으로 보여드려요
              </p>

              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newCustomKeyword}
                  onChange={(e) => setNewCustomKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomKeyword();
                    }
                  }}
                  className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 rounded-xl
                           text-slate-900 dark:text-white placeholder-slate-400
                           focus:outline-none focus:ring-2 focus:ring-[#033885]/50
                           transition-all duration-200"
                  placeholder="예: 해커톤, 창업, AI"
                />
                <button
                  type="button"
                  onClick={handleAddCustomKeyword}
                  className="px-4 py-2.5 bg-[#033885] text-white rounded-xl
                           hover:bg-[#022a66] transition-colors"
                >
                  추가
                </button>
              </div>

              {customKeywords.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {customKeywords.map((keyword) => (
                    <span
                      key={keyword}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg text-sm"
                    >
                      {keyword}
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomKeyword(keyword)}
                        className="ml-1 hover:text-blue-800 dark:hover:text-blue-200"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 제외 키워드 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                제외 키워드
              </label>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                이 키워드가 포함된 공지는 숨겨드려요
              </p>

              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newExcludedKeyword}
                  onChange={(e) => setNewExcludedKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddExcludedKeyword();
                    }
                  }}
                  className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 rounded-xl
                           text-slate-900 dark:text-white placeholder-slate-400
                           focus:outline-none focus:ring-2 focus:ring-[#033885]/50
                           transition-all duration-200"
                  placeholder="예: 대학원, 석사"
                />
                <button
                  type="button"
                  onClick={handleAddExcludedKeyword}
                  className="px-4 py-2.5 bg-slate-500 text-white rounded-xl
                           hover:bg-slate-600 transition-colors"
                >
                  추가
                </button>
              </div>

              {excludedKeywords.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {excludedKeywords.map((keyword) => (
                    <span
                      key={keyword}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm"
                    >
                      {keyword}
                      <button
                        type="button"
                        onClick={() => handleRemoveExcludedKeyword(keyword)}
                        className="ml-1 hover:text-red-800 dark:hover:text-red-200"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 저장 버튼 */}
          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-3 bg-[#033885] text-white font-semibold rounded-xl
                     hover:bg-[#022a66] transition-colors duration-200
                     disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? '저장 중...' : '프로필 저장'}
          </button>
        </form>

        {/* 회원탈퇴 영역 */}
        <div className="mt-10 pt-6 border-t border-slate-200 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-2">
            계정 관리
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            탈퇴 시 프로필, 북마크 등 모든 정보가 영구 삭제됩니다.
          </p>
          <button
            type="button"
            onClick={handleDeleteAccount}
            disabled={isDeleting}
            className="px-4 py-2 text-sm text-red-600 dark:text-red-400
                     border border-red-200 dark:border-red-900/50 rounded-lg
                     hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? '탈퇴 처리 중...' : '회원탈퇴'}
          </button>
        </div>
      </div>
    </div>
  );
}
