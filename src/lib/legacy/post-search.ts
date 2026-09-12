import { chatDate } from '../chat-clock';
import { supabaseAdmin } from '../supabase';
import { generateEmbedding, generateEmbeddingsBatch, EMBEDDING_MODEL_ID, EMBEDDING_DIMENSIONS } from '../embeddings';
import { OPENAI_CONFIG } from '../openai';
import { queryTrace, traceChat } from './chat-trace';

export class PostSearchError extends Error {
  constructor(readonly code: 'DATABASE_UNAVAILABLE' | 'EMBEDDING_FAILED' | 'VECTOR_LOOKUP_FAILED' | 'FILTER_LOOKUP_FAILED' | 'INVALID_SEARCH_PLAN') {
    super(code);
  }
}

export interface SearchPostsArgs {
  activity_types?: number[];
  deadline_from?: string;
  deadline_to?: string;
  campus?: 'kongju' | 'cheonan' | 'yesan';
  semantic_query?: string;
  discovery_queries?: string[];
  include_expired?: boolean;
  limit?: number;
}

export interface SearchedPost {
  id: number;
  title: string;
  summary: string | null;
  content?: string | null;
  original_url: string | null;
  posted_date: string | null;
  deadline: string | null;
  event_start_date: string | null;
  event_end_date: string | null;
  activity_types: number[];
  keywords: string[];
  campus: string;
  similarity?: number;
}

const POST_COLUMNS =
  'id, title, summary, content, original_url, posted_date, deadline, event_start_date, event_end_date, activity_types, keywords, campus';

const ACTIVITY_TYPE_IDS = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
const CAMPUS_VALUES = new Set(['kongju', 'cheonan', 'yesan']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 오늘 날짜를 KST(Asia/Seoul) 기준 YYYY-MM-DD로 반환.
 * 단순 toISOString().slice(0,10)은 UTC 기준이라 KST 0~9시 사이에는 전날이 됨.
 * posts.deadline은 date 타입(시간대 무관)이라 KST 기준으로 비교해야 사용자 인식과 일치.
 */
export function todayKST(): string {
  return chatDate();
}

function sanitizeArgs(args: SearchPostsArgs): SearchPostsArgs {
  const clean: SearchPostsArgs = {};
  if (Array.isArray(args.activity_types)) {
    const ids = args.activity_types.filter((n) => Number.isInteger(n) && ACTIVITY_TYPE_IDS.has(n));
    if (ids.length) clean.activity_types = [...new Set(ids)];
  }
  if (typeof args.deadline_from === 'string' && DATE_RE.test(args.deadline_from)) {
    clean.deadline_from = args.deadline_from;
  }
  if (typeof args.deadline_to === 'string' && DATE_RE.test(args.deadline_to)) {
    clean.deadline_to = args.deadline_to;
  }
  if (typeof args.campus === 'string' && CAMPUS_VALUES.has(args.campus)) {
    clean.campus = args.campus as SearchPostsArgs['campus'];
  }
  if (typeof args.semantic_query === 'string' && args.semantic_query.trim()) {
    clean.semantic_query = args.semantic_query.trim();
  }
  if (args.discovery_queries !== undefined) {
    if (!Array.isArray(args.discovery_queries) || args.discovery_queries.length < 1 || args.discovery_queries.length > 3 ||
        args.discovery_queries.some(query => typeof query !== 'string' || !query.trim() || query.trim().length > 80) || clean.semantic_query)
      throw new PostSearchError('INVALID_SEARCH_PLAN');
    clean.discovery_queries = [...new Set(args.discovery_queries.map(query => query.trim()))];
  }
  if (typeof args.include_expired === 'boolean') clean.include_expired = args.include_expired;
  if (Number.isInteger(args.limit) && args.limit! > 0 && args.limit! <= 20)
    clean.limit = args.limit;
  return clean;
}

async function embeddingSearch(
  text: string,
  limit: number,
  args: SearchPostsArgs,
  filtered = false
): Promise<SearchedPost[]> {
  if (!supabaseAdmin) throw new PostSearchError('DATABASE_UNAVAILABLE');
  const emb = await generateEmbedding(text);
  if (!emb) throw new PostSearchError('EMBEDDING_FAILED');
  return matchEmbedding(emb, limit, args, filtered);
}

async function matchEmbedding(emb: number[], limit: number, args: SearchPostsArgs, filtered: boolean): Promise<SearchedPost[]> {
  if (!supabaseAdmin) throw new PostSearchError('DATABASE_UNAVAILABLE');
  const { data, error } = await supabaseAdmin.rpc(filtered ? 'legacy_match_posts_filtered_at' : 'legacy_match_posts_at', {
    as_of: chatDate(),
    query_embedding: emb,
    match_threshold: OPENAI_CONFIG.SIMILARITY_THRESHOLD,
    match_count: limit,
    include_expired: args.include_expired ?? false,
    ...(filtered ? {
      filter_activity_types: args.activity_types ?? null,
      filter_campus: args.campus ?? null,
      filter_deadline_from: args.deadline_from ?? null,
      filter_deadline_to: args.deadline_to ?? null,
    } : {}),
  });
  if (error) {
    throw new PostSearchError('VECTOR_LOOKUP_FAILED');
  }
  return (data ?? []).map((r: { post: SearchedPost; similarity: number }) => ({
    ...r.post,
    similarity: r.similarity,
  }));
}

// Equal-weight RRF (k=60). No below-cutoff padding; duplicate IDs use one card.
export function mergeDiscoveryResults(lists: SearchedPost[][], limit: number): SearchedPost[] {
  const merged = new Map<number, { post: SearchedPost; score: number }>();
  for (const list of lists) {
    const seen = new Set<number>();
    for (const [rank, post] of list.entries()) {
      if (seen.has(post.id)) continue;
      seen.add(post.id);
      const entry = merged.get(post.id) ?? { post, score: 0 };
      entry.score += 1 / (60 + rank + 1);
      if ((post.similarity ?? -1) > (entry.post.similarity ?? -1)) entry.post = post;
      merged.set(post.id, entry);
    }
  }
  return [...merged.values()].sort((a, b) => b.score - a.score ||
    (b.post.similarity ?? -1) - (a.post.similarity ?? -1) || a.post.id - b.post.id).slice(0, limit).map(entry => entry.post);
}

export async function searchPosts(
  rawArgs: SearchPostsArgs,
  fallbackQuery: string
): Promise<SearchedPost[]> {
  const args = sanitizeArgs(rawArgs);
  const limit = args.limit ?? 5;
  const hasFilters = !!(
    args.activity_types?.length ||
    args.deadline_from ||
    args.deadline_to ||
    args.campus
  );
  const hasSemantic = !!args.semantic_query;
  const hasDiscovery = !!args.discovery_queries?.length;
  const path = hasDiscovery ? hasFilters ? 'filtered_discovery' : 'discovery'
    : hasFilters ? hasSemantic ? 'filtered_semantic' : 'filter' : hasSemantic ? 'semantic' : 'fallback';
  const usesEmbedding = hasDiscovery || hasSemantic || !hasFilters;
  const { semantic_query, discovery_queries, ...filters } = args;
  const started = Date.now();
  traceChat('search_start', {
    path, ...queryTrace(discovery_queries ? JSON.stringify(discovery_queries) : semantic_query ?? (hasFilters ? '' : fallbackQuery)),
    queryCount: discovery_queries?.length ?? (usesEmbedding ? 1 : 0),
    semanticApplied: usesEmbedding,
    filters: { ...filters, include_expired: args.include_expired ?? false, limit },
    asOf: todayKST(), threshold: usesEmbedding ? OPENAI_CONFIG.SIMILARITY_THRESHOLD : undefined,
    model: usesEmbedding ? EMBEDDING_MODEL_ID : undefined, dimensions: usesEmbedding ? EMBEDDING_DIMENSIONS : undefined,
  });
  try {
    const posts = await executeSearch(args, fallbackQuery, hasFilters, hasSemantic, limit);
    traceChat('search_end', { outcome: posts.length ? 'success' : 'empty', path,
      resultCount: posts.length, postIds: posts.map(post => post.id),
      topSimilarity: posts.reduce<number | null>((max, post) => typeof post.similarity === 'number' && Number.isFinite(post.similarity)
        ? Math.max(max ?? -1, post.similarity) : max, null), durationMs: Date.now() - started });
    return posts;
  } catch (error) {
    traceChat('search_end', { outcome: 'error', path,
      errorCode: error instanceof PostSearchError ? error.code : 'SEARCH_FAILED', durationMs: Date.now() - started });
    throw error;
  }
}

async function executeSearch(args: SearchPostsArgs, fallbackQuery: string, hasFilters: boolean, hasSemantic: boolean, limit: number): Promise<SearchedPost[]> {
  if (!supabaseAdmin) throw new PostSearchError('DATABASE_UNAVAILABLE');

  if (args.discovery_queries?.length) {
    const embeddings = await generateEmbeddingsBatch(args.discovery_queries);
    if (embeddings.length !== args.discovery_queries.length || embeddings.some(embedding => !embedding)) throw new PostSearchError('EMBEDDING_FAILED');
    const lists = await Promise.all(embeddings.map(embedding => matchEmbedding(embedding!, 20, args, hasFilters)));
    return mergeDiscoveryResults(lists, limit);
  }

  // Case A: 빈 인자 → 마지막 user message로 임베딩 fallback
  if (!hasFilters && !hasSemantic) {
    return embeddingSearch(fallbackQuery, limit, args);
  }

  // Case B: topic search, with metadata conditions applied inside the RPC.
  if (hasSemantic) {
    return embeddingSearch(args.semantic_query!, limit, args, hasFilters);
  }

  // Case C: metadata-only search keeps its existing date ordering.
  let query = supabaseAdmin.from('posts').select(POST_COLUMNS);

  if (args.activity_types?.length) query = query.overlaps('activity_types', args.activity_types);
  if (args.campus) query = query.in('campus', ['common', args.campus]);
  if (args.deadline_from) query = query.gte('deadline', args.deadline_from);
  if (args.deadline_to) query = query.lte('deadline', args.deadline_to);
  if (!args.include_expired) {
    const today = todayKST();
    // Same deadline -> event end -> event start fallback as the vector RPCs.
    query = query.or(`deadline.gte.${today},and(deadline.is.null,event_end_date.gte.${today}),and(deadline.is.null,event_end_date.is.null,event_start_date.gte.${today}),and(deadline.is.null,event_end_date.is.null,event_start_date.is.null)`);
  }

  // 마감 필터가 있으면 마감 빠른 순, 없으면 최신 게시일 순
  const orderByDeadline = !!(args.deadline_from || args.deadline_to);
  query = query
    .order(orderByDeadline ? 'deadline' : 'posted_date', {
      ascending: orderByDeadline,
      nullsFirst: false,
    })
    .limit(20);

  const { data, error } = await query;
  if (error) {
    throw new PostSearchError('FILTER_LOOKUP_FAILED');
  }
  return ((data as SearchedPost[]) ?? []).slice(0, limit);
}

// OpenAI function calling tool definition
// 설계 노트:
// - description 첫 줄은 "When to use" 명확히 (도구 호출 트리거 강화)
// - reasoning 파라미터로 LLM이 자기 결정을 설명하면서 신중해짐 (정확도 향상 패턴)
// - 활동유형/캠퍼스 매핑은 description에 키워드 단위로 풍부하게
// - examples는 system prompt의 별도 섹션에 둔다 (OpenAI 권장)
export const SEARCH_POSTS_TOOL = {
  type: 'function',
  function: {
    name: 'search_posts',
    description:
      '공주대학교 공지를 DB에서 검색한다. ' +
      '사용자가 공지·공모전·대외활동·서포터즈·기자단·인턴·채용·취업·봉사·특강·세미나·교육·캠프·' +
      '장학금·근로장학·학습튜터·멘토링·기숙사·마감·모집·자리·공고를 묻거나, ' +
      '"~있어?" "~알려줘" "~보여줘" 같이 정보를 요청하면 반드시 호출한다. ' +
      '단순 인사("안녕")나 서비스 메타 질문에는 호출하지 않는다.',
    parameters: {
      type: 'object',
      properties: {
        reasoning: {
          type: 'string',
          description:
            '한 문장으로 적어라: 사용자 의도 + 어떤 인자로 검색할지 결정한 근거. ' +
            '예: "사용자가 봉사활동을 예산캠퍼스로 한정해서 물어봤으므로 activity_types=[5], campus=yesan". ' +
            '이 필드를 먼저 채우면서 추론한 뒤 다른 인자를 정확히 채워라.',
        },
        activity_types: {
          type: 'array',
          items: { type: 'integer', enum: [1, 2, 3, 4, 5, 6, 7, 8] },
          description:
            '활동유형 ID 배열. 사용자 표현을 다음 매핑으로 변환:\n' +
            '- 1=공모전: "공모전", "공모", "경진대회", "콘테스트", "대회", "해커톤"\n' +
            '- 2=대외활동: "대외활동", "활동", "프로그램", "캠프(외부)"\n' +
            '- 3=서포터즈/기자단: "서포터즈", "기자단", "학생기자단", "학보", "홍보대사", "앰배서더", "크루"\n' +
            '- 4=인턴십/채용: "인턴", "인턴십", "채용", "취업", "신입공채", "직원모집"\n' +
            '- 5=봉사활동: "봉사", "봉사활동", "자원봉사"\n' +
            '- 6=교육/특강: "특강", "세미나", "워크숍", "교육", "강연", "캠프(교내)", "AIVLE"\n' +
            '- 7=장학금/지원: "장학금", "장학", "근로장학", "학습튜터", "멘토링", "지원금"\n' +
            '- 8=기타: "기숙사", "학생생활관", "강의평가", "행정"\n' +
            '여러 분야면 합집합. 예: "공모전이나 대외활동" → [1,2].',
        },
        deadline_from: {
          type: 'string',
          description:
            'YYYY-MM-DD. system 메시지의 [오늘 날짜] 기준으로 계산.\n' +
            '- "이번달" → 오늘 ~ 이번달 말일\n' +
            '- "이번주" → 오늘 ~ 이번주 일요일\n' +
            '- "다음달" → 다음달 1일\n' +
            '- "마감 임박" → 오늘 ~ 7일 후',
        },
        deadline_to: {
          type: 'string',
          description: 'YYYY-MM-DD. deadline_from과 짝지어 사용.',
        },
        campus: {
          type: 'string',
          enum: ['kongju', 'cheonan', 'yesan'],
          description:
            '캠퍼스 매핑 (common은 자동 포함되므로 인자에 넣지 마라):\n' +
            '- "공주캠", "공주캠퍼스", "신관캠", "신관캠퍼스" → "kongju"\n' +
            '- "천안캠", "천안캠퍼스" → "cheonan"\n' +
            '- "예산캠", "예산캠퍼스" → "yesan"\n' +
            '사용자가 캠퍼스를 명시하지 않으면 비워라.',
        },
        semantic_query: {
          type: 'string',
          description:
            '고유명사·주제의 의미 검색용. 필터와 함께 사용하면 모든 필터 안에서 이 주제로 검색한다. ' +
            '정확한 공지명·명시한 관심 분야는 보존한다. 전공만 밝힌 탐색 요청은 discovery_queries를 사용한다. 두 필드는 함께 넣지 마라. ' +
            '예: "통일 모의 국무회의", "AIVLE 캠프", "K-공유대학". ' +
            '활동유형 필터로 좁힐 수 없는 주제어가 있을 때만. 일반 카테고리어("공모전", "장학금")는 ' +
            'semantic_query에 넣지 말고 activity_types로 풀어라.',
        },
        discovery_queries: {
          type: 'array', minItems: 1, maxItems: 3,
          items: { type: 'string', minLength: 1, maxLength: 80 },
          description: '전공만 밝히고 볼 만한 공지를 묻는 넓은 탐색에만 사용. 대표 실무·학습 주제를 최대 3개로 나누고 항목 하나에 주제 하나만 적는다. 서로 다른 분야를 한 항목에 섞지 마라. semantic_query와 함께 쓰지 마라. 명시한 주제·공지명 검색을 넓히는 데 쓰지 마라. 지원 자격을 뜻하지 않는다.',
        },
        include_expired: {
          type: 'boolean',
          description: '기본 false. 사용자가 "지난 공지", "끝난 공지"를 명시할 때만 true.',
        },
        limit: { type: 'integer', description: '기본 5. 1~20.' },
      },
      required: ['reasoning'],
      additionalProperties: false,
    },
  },
} as const;
