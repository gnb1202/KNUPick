'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ACTIVITY_TYPES, CAMPUS_LABELS } from '@/lib/constants';
import { ddayLabel } from './atoms';

interface RelatedPost {
  id: number;
  title: string;
  summary: string | null;
  original_url: string | null;
  deadline: string | null;
  event_start_date: string | null;
  activity_types: number[];
  campus: string;
  similarity?: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  posts?: RelatedPost[];
  isStreaming?: boolean;
}

const SUGGESTED_QUESTIONS = [
  '이번 달에 마감인 공모전 알려줘',
  '근로장학 자리 있어?',
  'IT 관련 인턴십 공지 보여줘',
  '교육·특강 신청할 만한 거 있나?',
];

function MiniPostCard({ post }: { post: RelatedPost }) {
  const at = ACTIVITY_TYPES.find((t) => t.id === post.activity_types[0]);
  const dateLabel = post.deadline
    ? ddayLabel(post.deadline)
    : post.event_start_date
      ? `시작 ${new Date(post.event_start_date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}`
      : null;

  return (
    <a
      href={post.original_url || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="card-hover"
      style={{
        display: 'block',
        padding: '12px 14px',
        background: 'var(--surface)',
        border: '1px solid var(--border-soft)',
        borderRadius: 12,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>{at?.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginBottom: 2,
            }}
          >
            {post.title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            {CAMPUS_LABELS[post.campus] || post.campus} · {dateLabel || '마감 미정'}
          </div>
        </div>
        <span
          style={{
            fontSize: 12,
            color: 'var(--text-dim)',
            flexShrink: 0,
          }}
        >
          →
        </span>
      </div>
    </a>
  );
}

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hover, setHover] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  // ESC로 닫기
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      const userMessage: ChatMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: trimmed,
      };
      const assistantId = `a-${Date.now()}`;
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setInput('');
      setIsLoading(true);

      const historyForAPI = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: historyForAPI }),
        });
        if (!res.ok || !res.body) throw new Error('API 호출 실패');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (!data) continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'posts') {
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, posts: parsed.posts } : m))
                );
              } else if (parsed.type === 'text') {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: m.content + parsed.delta } : m
                  )
                );
              } else if (parsed.type === 'done') {
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
                );
              } else if (parsed.type === 'error') {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          content: m.content || '죄송해요, 답변 중 오류가 발생했어요.',
                          isStreaming: false,
                        }
                      : m
                  )
                );
              }
            } catch (e) {
              console.error('SSE parse error:', e);
            }
          }
        }
      } catch (err) {
        console.error('Chat error:', err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: '죄송해요, 답변을 가져오지 못했어요. 잠시 후 다시 시도해주세요.',
                  isStreaming: false,
                }
              : m
          )
        );
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {/* FAB */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          aria-label="AI에게 물어보기"
          style={{
            all: 'unset',
            cursor: 'pointer',
            position: 'fixed',
            right: 24,
            bottom: 24,
            zIndex: 90,
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'var(--accent)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: hover
              ? '0 14px 40px rgba(0,0,0,0.22), 0 0 0 6px color-mix(in oklab, var(--accent) 16%, transparent)'
              : '0 8px 24px rgba(0,0,0,0.18)',
            transition: 'transform .18s, box-shadow .18s',
            transform: hover ? 'translateY(-2px) scale(1.04)' : 'none',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <circle cx="8.5" cy="10" r="0.6" fill="currentColor" />
            <circle cx="12" cy="10" r="0.6" fill="currentColor" />
            <circle cx="15.5" cy="10" r="0.6" fill="currentColor" />
          </svg>
          <span
            style={{
              position: 'absolute',
              top: 6,
              right: 8,
              width: 14,
              height: 14,
              fontSize: 10,
              fontWeight: 800,
              textShadow: '0 1px 2px rgba(0,0,0,0.2)',
            }}
          >
            ✦
          </span>
        </button>
      )}

      {/* 슬라이드 패널 */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-slide-in-right"
            style={{
              width: 'min(480px, 100vw)',
              height: '100%',
              background: 'var(--bg)',
              boxShadow: '-12px 0 48px rgba(0,0,0,0.18)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* 헤더 */}
            <div
              style={{
                padding: '18px 20px',
                background: 'var(--surface)',
                borderBottom: '1px solid var(--border-soft)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'var(--accent)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  fontWeight: 800,
                }}
              >
                ✦
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 800,
                    color: 'var(--text)',
                    letterSpacing: -0.3,
                  }}
                >
                  KNUPick AI 어시스턴트
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>
                  공주대 공지만 참고해 답변해요
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                aria-label="닫기"
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-mute)',
                  background: 'var(--surface-2)',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 메시지 영역 */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              {messages.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div
                    style={{
                      padding: '14px 16px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border-soft)',
                      borderRadius: '16px 16px 16px 4px',
                      fontSize: 14,
                      lineHeight: 1.6,
                      color: 'var(--text)',
                    }}
                  >
                    안녕하세요! 공주대 공지에 대해 무엇이든 물어보세요.
                    <br />
                    <span style={{ color: 'var(--text-dim)' }}>
                      예: 마감 임박 공지 / 특정 활동 / 캠퍼스별 공지
                    </span>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--text-dim)',
                        letterSpacing: 0.8,
                        marginBottom: 8,
                        textTransform: 'uppercase',
                      }}
                    >
                      이런 걸 물어보세요
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {SUGGESTED_QUESTIONS.map((q) => (
                        <button
                          key={q}
                          onClick={() => sendMessage(q)}
                          disabled={isLoading}
                          className="btn-press"
                          style={{
                            all: 'unset',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            padding: '12px 14px',
                            background: 'var(--surface)',
                            border: '1px solid var(--border-soft)',
                            borderRadius: 12,
                            fontSize: 13.5,
                            color: 'var(--text)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            opacity: isLoading ? 0.5 : 1,
                          }}
                        >
                          <span style={{ color: 'var(--accent)', fontWeight: 700 }}>›</span>
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div style={{ maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* 검색된 공지 (assistant only, 응답 시작 전) */}
                    {msg.role === 'assistant' && msg.posts && msg.posts.length > 0 && (
                      <div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: 'var(--text-dim)',
                            letterSpacing: 0.8,
                            marginBottom: 6,
                            textTransform: 'uppercase',
                          }}
                        >
                          ✦ 관련 공지 {msg.posts.length}건
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {msg.posts.map((p) => (
                            <MiniPostCard key={p.id} post={p} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 메시지 본문 */}
                    {(msg.content || msg.isStreaming) && (
                      <div
                        style={{
                          padding: '12px 16px',
                          fontSize: 14,
                          lineHeight: 1.65,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface)',
                          color: msg.role === 'user' ? '#fff' : 'var(--text)',
                          border:
                            msg.role === 'user'
                              ? 'none'
                              : '1px solid var(--border-soft)',
                          borderRadius:
                            msg.role === 'user'
                              ? '16px 16px 4px 16px'
                              : '16px 16px 16px 4px',
                        }}
                      >
                        {msg.content}
                        {msg.isStreaming && !msg.content && (
                          <span style={{ display: 'inline-flex', gap: 4 }}>
                            <span
                              className="dot-pulse"
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: 'var(--text-dim)',
                              }}
                            />
                            <span
                              className="dot-pulse"
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: 'var(--text-dim)',
                                animationDelay: '0.15s',
                              }}
                            />
                            <span
                              className="dot-pulse"
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: 'var(--text-dim)',
                                animationDelay: '0.3s',
                              }}
                            />
                          </span>
                        )}
                        {msg.isStreaming && msg.content && (
                          <span className="cursor-blink">▎</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* 입력창 */}
            <form
              onSubmit={handleSubmit}
              style={{
                padding: 16,
                background: 'var(--surface)',
                borderTop: '1px solid var(--border-soft)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-end',
                  background: 'var(--bg)',
                  border: '1px solid var(--border-soft)',
                  borderRadius: 14,
                  padding: '10px 14px',
                }}
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="뭐든지 물어보세요"
                  rows={1}
                  maxLength={2000}
                  disabled={isLoading}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    // 16px 미만이면 iOS Safari가 포커스 시 화면을 자동 확대한다.
                    fontSize: 16,
                    color: 'var(--text)',
                    resize: 'none',
                    maxHeight: 96,
                    outline: 'none',
                    fontFamily: 'inherit',
                    // 컨테이너는 flex-end라 전송 버튼이 하단에 고정되는데, 한 줄일 때는
                    // 버튼(37px)이 더 높아서 입력 텍스트가 아래로 쏠린다.
                    // 이 줄만 중앙 정렬해 한 줄일 때 세로 가운데에 오게 한다.
                    // 여러 줄로 늘어나면 textarea가 더 높아져 정렬 효과는 자연히 사라진다.
                    alignSelf: 'center',
                  }}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="btn-press"
                  style={{
                    all: 'unset',
                    cursor: !input.trim() || isLoading ? 'not-allowed' : 'pointer',
                    padding: '8px 14px',
                    borderRadius: 10,
                    background: !input.trim() || isLoading ? 'var(--surface-2)' : 'var(--accent)',
                    color: !input.trim() || isLoading ? 'var(--text-dim)' : '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  전송 ↑
                </button>
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: 'var(--text-dim)',
                  textAlign: 'center',
                }}
              >
                Ctrl/⌘ + K 로 검색 · ESC 로 닫기
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
