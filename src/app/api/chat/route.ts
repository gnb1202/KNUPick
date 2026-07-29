import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabase';
import { openai, OPENAI_CONFIG } from '@/lib/openai';
import { generateEmbedding } from '@/lib/embeddings';
import { ACTIVITY_TYPES } from '@/lib/constants';
import { searchPosts, SEARCH_POSTS_TOOL, SearchedPost, SearchPostsArgs, todayKST } from '@/lib/post-search';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const CHAT_RATE_LIMIT = 12;
const CHAT_RATE_WINDOW_MS = 60_000;
const VALID_ROLES = new Set(['user', 'assistant']);
const MAX_MESSAGES = 30;
const MAX_CONTENT_LENGTH = 2000;

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const CAMPUS_LABELS: Record<string, string> = {
  common: '공통',
  kongju: '공주(신관)',
  cheonan: '천안',
  yesan: '예산',
};

function buildContextBlock(posts: SearchedPost[]): string {
  if (posts.length === 0) return '(검색된 관련 공지가 없습니다.)';
  return posts
    .map((p, i) => {
      const types = p.activity_types
        .map((id) => ACTIVITY_TYPES.find((t) => t.id === id)?.name)
        .filter(Boolean)
        .join(', ');
      const lines = [
        `[#${i + 1}] ${p.title}`,
        `- ID: ${p.id}`,
        `- 캠퍼스: ${CAMPUS_LABELS[p.campus] || p.campus}`,
        types && `- 활동유형: ${types}`,
        p.posted_date && `- 게시일: ${p.posted_date}`,
        p.deadline && `- 마감일: ${p.deadline}`,
        p.event_start_date && `- 행사 시작: ${p.event_start_date}`,
        p.event_end_date && `- 행사 종료: ${p.event_end_date}`,
        p.summary && `- 요약: ${p.summary}`,
        p.original_url && `- 링크: ${p.original_url}`,
      ].filter(Boolean);
      return lines.join('\n');
    })
    .join('\n\n');
}

function postsToWire(posts: SearchedPost[]) {
  return posts.map((p) => ({
    id: p.id,
    title: p.title,
    summary: p.summary,
    original_url: p.original_url,
    deadline: p.deadline,
    event_start_date: p.event_start_date,
    activity_types: p.activity_types,
    campus: p.campus,
    similarity: p.similarity,
  }));
}

const VANILLA_SYSTEM_PROMPT = `너는 공주대학교 공지사항 통합 서비스 'KNUPick'의 친절한 한국어 챗봇이야.
사용자의 질문에 대해 아래 [관련 공지] 컨텍스트만을 근거로 답변해.

규칙:
1. 컨텍스트에 없는 정보는 추측하지 말고 "관련 공지를 찾지 못했어요"라고 답변할 것
2. 마감일/시작일 등 날짜 정보가 있으면 명확히 언급할 것
3. 답변은 간결하게, 핵심만 2~4문장으로
4. 관련 공지를 추천할 때는 "[#1]" 같은 번호로 참조 (UI에서 카드로 표시됨)
5. 마크다운 사용 금지 (일반 텍스트로만 답변)
6. 사용자가 친근하게 말하면 친근하게, 정중하게 말하면 정중하게 톤 맞추기`;

function agenticSystemPrompt(today: string): string {
  return `너는 공주대학교 공지사항 통합 서비스 'KNUPick'의 친절한 한국어 챗봇이야.
공지·혜택·마감·모집·자리·공고 관련 질문이면 반드시 search_posts 도구를 호출해서 DB에서 직접 찾고,
그 결과(tool 메시지)만 근거로 답변해. 결과 외 내용 추측 금지.

[오늘 날짜] ${today}  (Asia/Seoul)

# 도구 사용 규칙
1. search_posts의 reasoning 필드를 먼저 채우면서 추론하라. 그 다음 다른 인자를 정확히 결정.
2. "근로장학"은 [7], "인턴/채용"은 [4], "공모전·경진대회"는 [1], "특강·세미나"는 [6], "봉사"는 [5], "기자단·서포터즈"는 [3].
3. "이번달/이번주/다음달"은 오늘 날짜 기준으로 deadline_from, deadline_to 계산.
4. "예산캠/천안캠/공주캠/신관캠"이 보이면 campus 필드 채워라. "공주" 또는 "신관" → "kongju".
5. 고유명사("통일 모의 국무회의", "AIVLE", "K-공유대학")는 semantic_query에 그대로.
6. 일반 인사·메타 질문은 도구 호출 없이 답변.

# Examples (사용자 → 호출 인자)

User: "이번달 마감 공모전이나 경진대회"
→ search_posts({
    reasoning: "이번달=${today.slice(0,7)} 마감 + 공모전/경진대회 카테고리. activity_types=[1] + 마감 범위.",
    activity_types: [1],
    deadline_from: "${today}",
    deadline_to: "${today.slice(0,7)}-31"
  })

User: "통일 관련 공모전 알려줘"
→ search_posts({
    reasoning: "공모전 카테고리 + '통일' 주제어. 카테고리는 activity_types=[1], 주제어는 semantic_query.",
    activity_types: [1],
    semantic_query: "통일"
  })

User: "근로장학 자리 있어?"
→ search_posts({
    reasoning: "근로장학은 [7] 장학금/지원 카테고리. '자리'는 정보 요청 신호.",
    activity_types: [7],
    semantic_query: "근로장학"
  })

User: "예산캠 봉사활동 있어?"
→ search_posts({
    reasoning: "봉사활동은 [5], 예산캠은 campus=yesan.",
    activity_types: [5],
    campus: "yesan"
  })

User: "인턴십이나 채용 공고 있어?"
→ search_posts({
    reasoning: "인턴/채용 카테고리 [4]. 만료 안 된 공고 기본.",
    activity_types: [4]
  })

User: "AIVLE 캠프 신청 어떻게 해?"
→ search_posts({
    reasoning: "AIVLE은 고유명사라 semantic_query. 카테고리는 교육/특강 [6].",
    activity_types: [6],
    semantic_query: "AIVLE"
  })

User: "안녕"
→ 도구 호출 없이 인사로 답변.

# 답변 형식 (3단계로 결정)

도구 결과를 사용자 query와 비교해서 다음 3단계 중 하나로 답해라.

## 단계 1 — 정확 매칭
결과 제목·요약이 사용자 query의 핵심어와 직접 부합 (예: "공모전" query에 실제 공모전들).
\`\`\`
짧은 인트로 한 문장. (검색 의도 + 결과 개수 + 정렬 기준)

• [#1] 제목 — 마감 M/D 또는 시작 M/D
• [#2] 제목 — 마감 M/D
• ...

자세한 내용은 카드를 눌러보세요.
\`\`\`

## 단계 2 — 부분 매칭
결과가 같은 카테고리이지만 정확 매칭은 아님 (예: "근로장학 자리" query에 멘토·등록금 지원 같은 [7] 카테고리 변형). 정직하게 짚되 비슷한 분야로 안내.
\`\`\`
'X'에 정확히 맞는 공지는 못 찾았지만, 비슷한 분야로 N건 찾았어요:

• [#1] 제목 — 마감 M/D
• [#2] 제목 — 마감 M/D
• ...

자세한 내용은 카드를 눌러보세요.
\`\`\`

## 단계 3 — 완전 무관 또는 0건
결과가 query와 의미적으로 완전히 동떨어지거나 0건 (예: "IT 인턴십" query에 강의평가가 떴다).
\`\`\`
관련 공지를 찾지 못했어요. (한 문장으로 비슷한 분야 제안 가능)
\`\`\`

판단은 결과의 제목·요약을 사용자 입장에서 봤을 때 "도움이 되는지" 기준으로. 의심스러우면 단계 2로.

# 답변 규칙 (위반 금지)

1. **마크다운·링크 절대 금지.** [텍스트](url) 형식 사용 금지. 추천은 오직 [#1] [#2] 같은 카드 번호로만 (UI가 자동으로 카드를 보여줌).
2. **불릿 기호는 ASCII '•' 또는 '-'만.** 마크다운 *, ** 굵은 글씨 금지.
3. 마감일/시작일 명시. 형식: "5/16 마감" 또는 "시작 5/20".
4. 사용자 톤(친근/정중)에 맞춰서.`;
}

function sseEncoder() {
  const encoder = new TextEncoder();
  return (obj: unknown) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);
}

function sseResponse(readable: ReadableStream): Response {
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

// ────────────────────────────────────────────────────────────────────
// Vanilla RAG (기존 흐름 — flag OFF 시 fallback)
// ────────────────────────────────────────────────────────────────────
async function handleVanillaRAG(
  client: OpenAI,
  messages: ChatMessage[],
  lastUserContent: string,
): Promise<Response> {
  const queryEmbedding = await generateEmbedding(lastUserContent);
  let matchedPosts: SearchedPost[] = [];
  if (queryEmbedding && supabaseAdmin) {
    const { data, error } = await supabaseAdmin.rpc('match_posts', {
      query_embedding: queryEmbedding,
      match_threshold: OPENAI_CONFIG.SIMILARITY_THRESHOLD,
      match_count: OPENAI_CONFIG.MAX_CONTEXT_POSTS,
      include_expired: false,
    });
    if (error) console.error('match_posts error:', error);
    matchedPosts = (data as SearchedPost[]) ?? [];
  }

  const stream = await client.chat.completions.create({
    model: OPENAI_CONFIG.CHAT_MODEL,
    stream: true,
    temperature: 0.3,
    messages: [
      { role: 'system', content: VANILLA_SYSTEM_PROMPT },
      {
        role: 'system',
        content: `[관련 공지]\n${buildContextBlock(matchedPosts)}\n\n오늘 날짜: ${todayKST()}`,
      },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });

  const sse = sseEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      controller.enqueue(sse({ type: 'posts', posts: postsToWire(matchedPosts) }));
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || '';
          if (delta) controller.enqueue(sse({ type: 'text', delta }));
        }
        controller.enqueue(sse({ type: 'done' }));
      } catch (err) {
        console.error('[chat] vanilla stream error:', err);
        controller.enqueue(sse({ type: 'error', message: '답변 생성 중 오류가 발생했어요.' }));
      } finally {
        controller.close();
      }
    },
  });
  return sseResponse(readable);
}

// ────────────────────────────────────────────────────────────────────
// Agentic RAG (function calling 기반)
// ────────────────────────────────────────────────────────────────────
async function handleAgenticRAG(
  client: OpenAI,
  messages: ChatMessage[],
  lastUserContent: string,
): Promise<Response> {
  const today = todayKST();
  const systemPrompt = agenticSystemPrompt(today);
  const baseMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  // 1차: tool call 결정
  const first = await client.chat.completions.create({
    model: OPENAI_CONFIG.CHAT_MODEL,
    temperature: 0.2,
    max_tokens: 512,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [SEARCH_POSTS_TOOL as any],
    tool_choice: 'auto',
    messages: baseMessages,
  });

  const firstMessage = first.choices[0]?.message;
  const toolCalls = firstMessage?.tool_calls ?? [];

  const sse = sseEncoder();

  // (a) tool 호출 없음 → 1차 응답을 그대로 답변으로 송출
  if (toolCalls.length === 0) {
    const directContent = firstMessage?.content ?? '';
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(sse({ type: 'posts', posts: [] }));
        if (directContent) controller.enqueue(sse({ type: 'text', delta: directContent }));
        controller.enqueue(sse({ type: 'done' }));
        controller.close();
      },
    });
    return sseResponse(readable);
  }

  // (b) tool 호출 있음 → 첫 번째 tool call만 처리 (single function call 패턴)
  const toolCall = toolCalls[0];
  let parsedArgs: SearchPostsArgs = {};
  try {
    // OpenAI SDK v6: function-typed tool calls expose .function on the union
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fnCall = (toolCall as any).function;
    parsedArgs = fnCall?.arguments ? JSON.parse(fnCall.arguments) : {};
  } catch (e) {
    console.error('[chat] tool args JSON parse failed:', e);
  }
  console.log('[chat] tool args:', JSON.stringify(parsedArgs));

  const posts = await searchPosts(parsedArgs, lastUserContent);
  console.log(`[chat] searchPosts returned ${posts.length} rows`);

  // 2차: tool result + stream
  const stream = await client.chat.completions.create({
    model: OPENAI_CONFIG.CHAT_MODEL,
    stream: true,
    temperature: 0.3,
    messages: [
      ...baseMessages,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      firstMessage as any,
      {
        role: 'tool' as const,
        tool_call_id: toolCall.id,
        content: JSON.stringify({
          posts: posts.map((p, i) => ({
            ref: `#${i + 1}`,
            id: p.id,
            title: p.title,
            summary: p.summary,
            campus: CAMPUS_LABELS[p.campus] || p.campus,
            activity_types: p.activity_types
              .map((id) => ACTIVITY_TYPES.find((t) => t.id === id)?.name)
              .filter(Boolean),
            deadline: p.deadline,
            event_start_date: p.event_start_date,
            event_end_date: p.event_end_date,
            original_url: p.original_url,
          })),
        }),
      },
    ],
  });

  const readable = new ReadableStream({
    async start(controller) {
      // 검색 결과 카드 즉시 송출 (답변 생성 전)
      controller.enqueue(sse({ type: 'posts', posts: postsToWire(posts) }));
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || '';
          if (delta) controller.enqueue(sse({ type: 'text', delta }));
        }
        controller.enqueue(sse({ type: 'done' }));
      } catch (err) {
        console.error('[chat] agentic stream error:', err);
        controller.enqueue(sse({ type: 'error', message: '답변 생성 중 오류가 발생했어요.' }));
      } finally {
        controller.close();
      }
    },
  });
  return sseResponse(readable);
}

// ────────────────────────────────────────────────────────────────────
// Entry
// ────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  if (!openai) {
    return new Response(JSON.stringify({ error: 'OpenAI not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!supabaseAdmin) {
    return new Response(JSON.stringify({ error: 'Database not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ip = getClientIp(request);
  let rl;
  try {
    rl = await checkRateLimit(`chat:${ip}`, CHAT_RATE_LIMIT, CHAT_RATE_WINDOW_MS);
  } catch (err) {
    console.error('[chat] rate-limit DB error:', err);
    return new Response(JSON.stringify({ error: 'Service unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!rl.ok) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(rl.retryAfterSec),
      },
    });
  }

  let body: { messages: ChatMessage[] };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (messages.length > MAX_MESSAGES) {
    return new Response(JSON.stringify({ error: 'Too many messages' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const allMessagesValid = messages.every(
    (m) =>
      m &&
      typeof m === 'object' &&
      VALID_ROLES.has(m.role) &&
      typeof m.content === 'string' &&
      m.content.length <= MAX_CONTENT_LENGTH,
  );
  if (!allMessagesValid) {
    return new Response(JSON.stringify({ error: 'Invalid message format' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUserMessage) {
    return new Response(JSON.stringify({ error: 'No user message' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return OPENAI_CONFIG.AGENTIC_RAG_ENABLED
    ? handleAgenticRAG(openai, messages, lastUserMessage.content)
    : handleVanillaRAG(openai, messages, lastUserMessage.content);
}
