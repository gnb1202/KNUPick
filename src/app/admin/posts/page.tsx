'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Post } from '@/types';
import { ACTIVITY_TYPES } from '@/lib/constants';

export default function AdminPostsPage() {
  const router = useRouter();
  const { user, profile, isLoading: authLoading } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const pageSize = 12;

  // 편집 상태
  const [editActivityTypes, setEditActivityTypes] = useState<number[]>([]);
  const [editDeadline, setEditDeadline] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const fetchPosts = useCallback(async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set('search', search);

      const res = await fetch(`/api/admin/posts?${params}`, {
        headers: { 'x-user-id': user.id },
      });

      if (!res.ok) throw new Error('Failed to fetch posts');

      const data = await res.json();
      setPosts(data.posts);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [user, page, search]);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login');
        return;
      }
      if (!profile?.is_admin) {
        router.push('/');
        return;
      }
      fetchPosts();
    }
  }, [authLoading, user, profile, router, fetchPosts]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const handleDelete = async (postId: number) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const res = await fetch(`/api/admin/posts?id=${postId}`, {
        method: 'DELETE',
        headers: { 'x-user-id': user!.id },
      });

      if (!res.ok) throw new Error('Failed to delete post');

      fetchPosts();
      setIsModalOpen(false);
    } catch (err) {
      alert('삭제 실패: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  // 모달 열기 (편집 상태 초기화)
  const openModal = (post: Post) => {
    setSelectedPost(post);
    setEditActivityTypes([...post.activity_types]);
    setEditDeadline(post.deadline || '');
    setHasChanges(false);
    setIsModalOpen(true);
  };

  // 활동유형 토글
  const toggleActivityType = (typeId: number) => {
    setEditActivityTypes((prev) => {
      const newTypes = prev.includes(typeId)
        ? prev.filter((t) => t !== typeId)
        : [...prev, typeId];
      // 최소 1개 유지
      if (newTypes.length === 0) return prev;
      setHasChanges(true);
      return newTypes;
    });
  };

  // 마감일 변경
  const handleDeadlineChange = (value: string) => {
    setEditDeadline(value);
    setHasChanges(true);
  };

  // 저장
  const handleSave = async () => {
    if (!selectedPost || !user || isSaving) return;

    setIsSaving(true);
    try {
      const res = await fetch('/api/admin/posts', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
        },
        body: JSON.stringify({
          id: selectedPost.id,
          activity_types: editActivityTypes,
          deadline: editDeadline || null,
        }),
      });

      if (!res.ok) throw new Error('Failed to update post');

      // 성공 시 목록 새로고침 및 모달 상태 업데이트
      fetchPosts();
      setSelectedPost({
        ...selectedPost,
        activity_types: editActivityTypes,
        deadline: editDeadline || null,
      });
      setHasChanges(false);
      alert('저장되었습니다.');
    } catch (err) {
      alert('수정 실패: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const getActivityTypeName = (id: number) => {
    return ACTIVITY_TYPES.find((t) => t.id === id)?.name || `Type ${id}`;
  };

  const totalPages = Math.ceil(total / pageSize);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#033885]"></div>
      </div>
    );
  }

  if (!profile?.is_admin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* 헤더 */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              게시글 관리
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* 검색 */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="제목으로 검색..."
              className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#033885] focus:border-transparent"
            />
            <button
              type="submit"
              className="px-6 py-2 bg-[#033885] text-white rounded-lg hover:bg-[#022a66] transition-colors"
            >
              검색
            </button>
          </div>
        </form>

        {/* 통계 */}
        <div className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          총 {total.toLocaleString()}개의 게시글
        </div>

        {/* 에러 */}
        {error && (
          <div className="mb-4 p-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg">
            {error}
          </div>
        )}

        {/* 테이블 */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    제목
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    활동유형
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    캠퍼스
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    마감일
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    작성일
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    작업
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {isLoading ? (
                  // 로딩 시 pageSize만큼 스켈레톤 행 표시
                  Array.from({ length: pageSize }).map((_, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-3">
                        <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded animate-pulse w-3/4"></div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded animate-pulse w-16"></div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded animate-pulse w-12"></div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded animate-pulse w-20"></div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded animate-pulse w-20"></div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded animate-pulse w-12 ml-auto"></div>
                      </td>
                    </tr>
                  ))
                ) : (
                  posts.map((post) => (
                    <tr key={post.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openModal(post)}
                          className="text-left text-slate-900 dark:text-white hover:text-[#033885] dark:hover:text-blue-400 font-medium line-clamp-2"
                        >
                          {post.title}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {post.activity_types.map((typeId) => (
                            <span
                              key={typeId}
                              className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded"
                            >
                              {getActivityTypeName(typeId)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {post.campus === 'common' ? '공통' : post.campus === 'kongju' ? '공주' : '천안'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {post.deadline || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                        {post.posted_date}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={post.original_url || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-slate-400 hover:text-[#033885] dark:hover:text-blue-400"
                            title="원문 보기"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                          <button
                            onClick={() => handleDelete(post.id)}
                            className="p-1 text-slate-400 hover:text-red-500"
                            title="삭제"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              이전
            </button>
            <span className="text-sm text-slate-600 dark:text-slate-400">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              다음
            </button>
          </div>
        )}
      </main>

      {/* 상세 모달 */}
      {isModalOpen && selectedPost && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white pr-8">
                  {selectedPost.title}
                </h2>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                {/* 활동유형 편집 */}
                <div>
                  <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">활동유형</h3>
                  <div className="flex flex-wrap gap-2">
                    {ACTIVITY_TYPES.filter((t) => t.id !== 8).map((type) => {
                      const isSelected = editActivityTypes.includes(type.id);
                      return (
                        <button
                          key={type.id}
                          onClick={() => toggleActivityType(type.id)}
                          className={`px-3 py-1 text-sm rounded-full transition-colors ${
                            isSelected
                              ? 'bg-[#033885] text-white'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                          }`}
                        >
                          {type.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 마감일 편집 */}
                <div>
                  <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">마감일</h3>
                  <input
                    type="date"
                    value={editDeadline}
                    onChange={(e) => handleDeadlineChange(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-[#033885] focus:border-transparent"
                  />
                  {editDeadline && (
                    <button
                      onClick={() => handleDeadlineChange('')}
                      className="mt-1 text-xs text-slate-500 hover:text-red-500"
                    >
                      마감일 삭제
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">캠퍼스</h3>
                    <p className="text-slate-900 dark:text-white">
                      {selectedPost.campus === 'common' ? '공통' : selectedPost.campus === 'kongju' ? '공주' : '천안'}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">작성일</h3>
                    <p className="text-slate-900 dark:text-white">{selectedPost.posted_date}</p>
                  </div>
                  <div className="col-span-2">
                    <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">원문 링크</h3>
                    <a
                      href={selectedPost.original_url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#033885] hover:underline truncate block"
                    >
                      {selectedPost.original_url || '-'}
                    </a>
                  </div>
                </div>

                {selectedPost.keywords && selectedPost.keywords.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">키워드</h3>
                    <div className="flex flex-wrap gap-1">
                      {selectedPost.keywords.map((keyword, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedPost.content && (
                  <div>
                    <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">내용</h3>
                    <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap text-sm">
                      {selectedPost.content}
                    </p>
                  </div>
                )}

                <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <button
                    onClick={handleSave}
                    disabled={!hasChanges || isSaving}
                    className="flex-1 py-2 text-center bg-[#033885] text-white rounded-lg hover:bg-[#022a66] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        저장 중...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        저장
                      </>
                    )}
                  </button>
                  <a
                    href={selectedPost.original_url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-2 text-center border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    원문 보기
                  </a>
                  <button
                    onClick={() => handleDelete(selectedPost.id)}
                    className="px-6 py-2 border border-red-500 text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
