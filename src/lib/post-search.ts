import { supabaseAdmin } from './supabase';
import { generateEmbedding } from './embeddings';
import { OPENAI_CONFIG } from './openai';

export interface SearchPostsArgs {
  activity_types?: number[];
  deadline_from?: string;
  deadline_to?: string;
  campus?: 'kongju' | 'cheonan' | 'yesan';
  semantic_query?: string;
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
  'id, title, summary, original_url, posted_date, deadline, event_start_date, event_end_date, activity_types, keywords, campus';

const ACTIVITY_TYPE_IDS = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
const CAMPUS_VALUES = new Set(['kongju', 'cheonan', 'yesan']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 오늘 날짜를 KST(Asia/Seoul) 기준 YYYY-MM-DD로 반환.
 * 단순 toISOString().slice(0,10)은 UTC 기준이라 KST 0~9시 사이에는 전날이 됨.
 * posts.deadline은 date 타입(시간대 무관)이라 KST 기준으로 비교해야 사용자 인식과 일치.
 */
export function todayKST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
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
  if (typeof args.include_expired === 'boolean') clean.include_expired = args.include_expired;
  if (Number.isInteger(args.limit) && args.limit! > 0 && args.limit! <= 20) clean.limit = args.limit;
  return clean;
}

async function embeddingSearch(text: string, limit: number, includeExpired = false): Promise<SearchedPost[]> {
  if (!supabaseAdmin) return [];
  const emb = await generateEmbedding(text);
  if (!emb) return [];
  const { data, error } = await supabaseAdmin.rpc('match_posts', {
    query_embedding: emb,
    match_threshold: OPENAI_CONFIG.SIMILARITY_THRESHOLD,
    match_count: limit,
    include_expired: includeExpired,
  });
  if (error) {
    console.error('[post-search] match_posts error:', error);
    return [];
  }
  return (data as SearchedPost[]) ?? [];
}

export async function searchPosts(rawArgs: SearchPostsArgs, fallbackQuery: string): Promise<SearchedPost[]> {
  if (!supabaseAdmin) return [];
  const args = sanitizeArgs(rawArgs);
  const limit = args.limit ?? 5;
  const hasFilters = !!(args.activity_types?.length || args.deadline_from || args.deadline_to || args.campus);
  const hasSemantic = !!args.semantic_query;

  // Case A: 빈 인자 → 마지막 user message로 임베딩 fallback
  if (!hasFilters && !hasSemantic) {
    return embeddingSearch(fallbackQuery, limit, args.include_expired);
  }

  // Case B: semantic only → 기존 match_posts RPC
  if (hasSemantic && !hasFilters) {
    return embeddingSearch(args.semantic_query!, limit, args.include_expired);
  }

  // Case C: 필터 (또는 필터 + semantic) → supabase builder
  let query = supabaseAdmin.from('posts').select(POST_COLUMNS);

  if (args.activity_types?.length) query = query.overlaps('activity_types', args.activity_types);
  if (args.campus) query = query.in('campus', ['common', args.campus]);
  if (args.deadline_from) query = query.gte('deadline', args.deadline_from);
  if (args.deadline_to) query = query.lte('deadline', args.deadline_to);
  if (!args.include_expired && !args.deadline_from) {
    query = query.or(`deadline.gte.${todayKST()},deadline.is.null`);
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
    console.error('[post-search] builder error:', error);
    return [];
  }
  // MVP: filter+semantic 결합 시 reranking 생략. SQL 정렬을 신뢰.
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
            '고유명사·자유 표현 임베딩 검색용. 예: "통일 모의 국무회의", "AIVLE 캠프", "K-공유대학". ' +
            '활동유형 필터로 좁힐 수 없는 주제어가 있을 때만. 일반 카테고리어("공모전", "장학금")는 ' +
            'semantic_query에 넣지 말고 activity_types로 풀어라.',
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
