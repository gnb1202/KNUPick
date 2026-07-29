'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import Calendar from '@/components/Calendar';
import { Post } from '@/types';
import { ActivityChip } from '@/components/atoms';

export default function CalendarPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showExpired, setShowExpired] = useState(false);

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const response = await fetch('/api/posts?pageSize=200&sort=latest');
        const data = await response.json();
        const postsWithDates = data.posts.filter(
          (post: Post) => post.deadline !== null || post.event_start_date !== null
        );
        setPosts(postsWithDates);
      } catch (error) {
        console.error('Failed to fetch posts:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPosts();
  }, []);

  const isExpired = (s: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(s);
    d.setHours(0, 0, 0, 0);
    return d < today;
  };

  const selectedDateItems = selectedDate
    ? posts.flatMap((post) => {
        const items: { post: Post; type: 'deadline' | 'event_start' | 'event_end' }[] = [];
        if (post.deadline?.split('T')[0] === selectedDate) {
          if (showExpired || !isExpired(post.deadline)) items.push({ post, type: 'deadline' });
        }
        if (post.event_start_date?.split('T')[0] === selectedDate) {
          if (showExpired || !isExpired(post.event_start_date))
            items.push({ post, type: 'event_start' });
        }
        if (
          post.event_end_date?.split('T')[0] === selectedDate &&
          post.event_end_date !== post.event_start_date
        ) {
          if (showExpired || !isExpired(post.event_end_date))
            items.push({ post, type: 'event_end' });
        }
        return items;
      })
    : [];

  const formatDate = (s: string) => {
    const d = new Date(s);
    const wk = ['일', '월', '화', '수', '목', '금', '토'];
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${wk[d.getDay()]})`;
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Header />

      <main
        style={{
          maxWidth: 1240,
          margin: '0 auto',
          padding: '32px 24px 64px',
        }}
      >
        {/* 페이지 헤딩 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            paddingBottom: 16,
            marginBottom: 24,
            borderBottom: '1px solid var(--border-soft)',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1.5,
                color: 'var(--text-dim)',
                marginBottom: 6,
                textTransform: 'uppercase',
              }}
            >
              Deadline Calendar · 마감 캘린더
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: 32,
                fontWeight: 800,
                letterSpacing: -0.7,
                color: 'var(--text)',
              }}
            >
              마감 캘린더
            </h1>
          </div>

          {/* 마감 표시 토글 */}
          <button
            onClick={() => setShowExpired(!showExpired)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              borderRadius: 999,
              border: '1px solid var(--border-soft)',
              background: 'var(--surface)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-mute)',
            }}
          >
            <span
              style={{
                position: 'relative',
                display: 'inline-block',
                width: 32,
                height: 18,
                borderRadius: 999,
                background: showExpired ? 'var(--accent)' : 'var(--surface-2)',
                transition: 'background .15s',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: showExpired ? 16 : 2,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'left .15s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                }}
              />
            </span>
            마감된 일정 표시
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 360px',
            gap: 24,
          }}
          className="max-lg:grid-cols-1"
        >
          {/* 캘린더 */}
          <div>
            {isLoading ? (
              <div
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 24,
                  height: 600,
                }}
                className="animate-pulse"
              />
            ) : (
              <Calendar
                posts={posts}
                onDateSelect={setSelectedDate}
                selectedDate={selectedDate}
                showExpired={showExpired}
              />
            )}
          </div>

          {/* 선택된 날짜 패널 */}
          <aside
            style={{
              position: 'sticky',
              top: 88,
              alignSelf: 'start',
              background: 'var(--surface)',
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-lg)',
              padding: 20,
              maxHeight: 'calc(100vh - 120px)',
              overflowY: 'auto',
            }}
          >
            {selectedDate ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>
                  {new Date(selectedDate).toLocaleDateString('ko-KR', { weekday: 'long' })}
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: 'var(--text)',
                    letterSpacing: -0.5,
                    marginTop: 4,
                    marginBottom: 16,
                  }}
                >
                  {formatDate(selectedDate)}
                </div>
                {selectedDateItems.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-mute)' }}>
                    이 날에는 일정이 없어요.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {selectedDateItems.map((item, i) => {
                      const typeLabel =
                        item.type === 'deadline'
                          ? '마감'
                          : item.type === 'event_start'
                            ? '시작'
                            : '종료';
                      const typeBg =
                        item.type === 'deadline'
                          ? '#FF5A4E'
                          : item.type === 'event_start'
                            ? '#10B981'
                            : '#94A3B8';
                      return (
                        <a
                          key={`${item.post.id}-${item.type}-${i}`}
                          href={item.post.original_url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="card-hover"
                          style={{
                            display: 'block',
                            padding: 14,
                            border: '1px solid var(--border-soft)',
                            borderRadius: 12,
                            textDecoration: 'none',
                            background: 'var(--surface)',
                          }}
                        >
                          <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 700,
                                background: typeBg,
                                color: '#fff',
                              }}
                            >
                              {typeLabel}
                            </span>
                            {item.post.activity_types[0] && (
                              <ActivityChip typeId={item.post.activity_types[0]} size="sm" />
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: 'var(--text)',
                              lineHeight: 1.4,
                            }}
                          >
                            {item.post.title}
                          </div>
                          {item.post.summary && (
                            <div
                              style={{
                                fontSize: 12,
                                color: 'var(--text-mute)',
                                marginTop: 4,
                                lineHeight: 1.5,
                              }}
                              className="line-clamp-2"
                            >
                              {item.post.summary}
                            </div>
                          )}
                        </a>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div
                style={{
                  textAlign: 'center',
                  padding: '24px 8px',
                  color: 'var(--text-mute)',
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.4 }}>📅</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                  날짜를 선택하세요
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                  캘린더에서 날짜를 클릭하면
                  <br />해당 날짜의 일정을 볼 수 있어요
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
