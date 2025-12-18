'use client';

import { useRouter } from 'next/navigation';

interface EmptyStateProps {
  onResetFilters?: () => void;
}

export default function EmptyState({ onResetFilters }: EmptyStateProps) {
  const router = useRouter();

  const handleViewAll = () => {
    router.push('/');
  };

  const handleViewContests = () => {
    router.push('/?types=1');
  };

  const handleViewScholarships = () => {
    router.push('/?types=7');
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {/* 아이콘 */}
      <div className="w-24 h-24 mb-6 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
        <svg
          className="w-12 h-12 text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>

      {/* 텍스트 */}
      <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
        조건에 맞는 활동이 없어요
      </h3>
      <p className="text-slate-500 dark:text-slate-400 max-w-md mb-6">
        다른 학과를 선택하거나 활동 유형 필터를 변경해보세요.
        <br />
        새로운 활동이 올라오면 바로 확인할 수 있어요!
      </p>

      {/* 추천 버튼들 */}
      <div className="flex flex-wrap justify-center gap-3 mb-6">
        <button
          onClick={handleViewAll}
          className="px-4 py-2 bg-[#033885] text-white text-sm font-medium rounded-lg
                     hover:bg-[#022a66] transition-colors btn-press"
        >
          전체 활동 보기
        </button>
        <button
          onClick={handleViewContests}
          className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300
                     text-sm font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600
                     transition-colors btn-press"
        >
          🏆 공모전 보기
        </button>
        <button
          onClick={handleViewScholarships}
          className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300
                     text-sm font-medium rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600
                     transition-colors btn-press"
        >
          💰 장학금 보기
        </button>
      </div>

      {/* 팁 */}
      <div className="p-4 bg-[#033885]/5 dark:bg-[#033885]/10 rounded-xl max-w-sm">
        <p className="text-sm text-[#033885] dark:text-blue-400 font-medium">
          💡 Tip: 필터를 모두 해제하면 전체 활동을 볼 수 있어요
        </p>
      </div>
    </div>
  );
}
