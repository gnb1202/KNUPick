import { z } from 'zod';
import { dateRange, todayKST, validDate } from './dates';
import { normalizeSubject } from './search-scope';

const date = z.string().refine(validDate, '실제 날짜가 아닙니다.');
export const searchPlanSchema = z
  .object({
    intent: z.enum(['list', 'detail', 'conversation', 'clarify']).default('list'),
    message: z.string().max(500).optional(),
    activity_types: z.array(z.number().int().min(1).max(8)).max(8).optional(),
    campus: z.enum(['kongju', 'cheonan', 'yesan']).optional(),
    campuses: z.array(z.enum(['kongju','cheonan','yesan'])).min(2).max(3).optional(),
    semantic_query: z.string().trim().min(1).max(200).optional(),
    excluded_terms: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
    date_target: z.enum(['deadline', 'event']).default('deadline'),
    period: z.enum(['today','tomorrow','yesterday','last_month','this_week', 'next_week', 'this_month', 'next_month', 'soon']).optional(),
    subject_terms: z.array(z.string().trim().min(2).max(60)).max(5).optional(),
    primary_subject: z.string().trim().min(2).max(100).optional(),
    subject_alternatives: z.array(z.object({
      primary_subject: z.string().trim().min(2).max(60),
      subject_terms: z.array(z.string().trim().min(2).max(60)).max(5).default([]),
    }).strict()).min(2).max(3).optional(),
    date_from: date.optional(),
    date_to: date.optional(),
    include_expired: z.boolean().default(false),
    limit: z.number().int().min(1).max(20).default(5),
    inherit_previous: z.boolean().default(false),
    reference_index: z.number().int().min(1).max(20).optional(),
    reference_indices: z.array(z.number().int().min(1).max(20)).min(1).max(3).optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.period && (p.date_from || p.date_to))
      ctx.addIssue({ code: 'custom', message: 'Use period OR explicit dates' });
    if (p.date_from && p.date_to && p.date_from > p.date_to)
      ctx.addIssue({ code: 'custom', message: 'Date range is reversed' });
    if (p.reference_indices && (p.reference_index || new Set(p.reference_indices).size!==p.reference_indices.length))
      ctx.addIssue({code:'custom',message:'Use unique reference_indices OR reference_index'});
    if(p.campuses && (p.campus || new Set(p.campuses).size!==p.campuses.length))
      ctx.addIssue({code:'custom',message:'Use unique campuses OR campus'});
    if (p.subject_alternatives && p.primary_subject)
      ctx.addIssue({code:'custom',message:'Use subject_alternatives OR primary_subject'});
  });
export type SearchPlan = z.infer<typeof searchPlanSchema>;
// The provider's strict schema represents absent optional fields as null.
// Only known nullable fields are omitted; unexpected keys still fail validation.
export function normalizeModelPlan(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  return Object.fromEntries(Object.entries(raw).filter(([key,value]) =>
    value !== null || !Object.hasOwn(searchPlanSchema.shape,key)));
}
export function enforceExplicitMonth(plan: SearchPlan, question: string): SearchPlan {
  if(/제외|말고|아닌|않/.test(question))return plan;
  const matches=[...question.matchAll(/(20\d{2})년\s*(1[0-2]|0?[1-9])월(?:에|중에?)\s*(?:접수[가를]?\s*|신청[이을]?\s*)?(마감|끝나|열리|시작)/g)];
  if(matches.length!==1 || !['list','detail'].includes(plan.intent))return plan;
  const [,year,month,action]=matches[0];
  const from=`${year}-${month.padStart(2,'0')}-01`;
  const range=dateRange('this_month',from);
  return {...plan,period:undefined,date_target:/마감|끝나/.test(action)?'deadline':'event',date_from:range.from,date_to:range.to};
}
export function enforceQuestionConstraints(plan: SearchPlan, question: string): SearchPlan {
  if(/제외|말고|아닌|않|포함\s*(?:하지|안)/.test(question))return plan;
  let result=enforceExplicitMonth(plan,question);
  if(!['list','detail'].includes(result.intent))return result;
  // A semester in a notice name is not its application deadline: recruitment
  // often closes before the semester starts. Keep genuinely requested dates.
  const academicTitle=/\d\s*학기/.test(question);
  const explicitWindow=/(?:\d\s*[월일]|이번\s*(?:달|주)|다음\s*(?:달|주)|곧|이내|부터|까지|학기\s*(?:에|중|동안|내에|마감))/.test(question);
  if(academicTitle && !explicitWindow && !result.inherit_previous) {
    result={...result,date_from:undefined,date_to:undefined,period:undefined};
  }
  if(/(?:마감된|종료된|끝난|지난)\s*공지도?\s*포함/.test(question))result={...result,include_expired:true};
  return result;
}
export function resolvePlan(raw: unknown, previous?: SearchPlan, today = todayKST()): SearchPlan {
  const parsed = searchPlanSchema.parse(raw);
  if ((parsed.inherit_previous || parsed.reference_index || parsed.reference_indices) && !previous)
    throw new Error('MISSING_CONTEXT');
  // Only explicitly supplied fields override an inherited plan; schema defaults must not erase context.
  const explicit = raw as Record<string, unknown>;
  const base =
    parsed.inherit_previous && previous
      ? { ...previous, ...explicit, intent: parsed.intent, reference_index: parsed.reference_index, reference_indices: parsed.reference_indices }
      : parsed;
  if (parsed.inherit_previous && previous) {
    if(explicit.campus) delete base.campuses;
    if(explicit.campuses) delete base.campus;
    // An explicit new target replaces the inherited target representation.
    if (explicit.primary_subject) {
      if (previous.subject_alternatives) {
        const target=previous.subject_alternatives.find(t=>normalizeSubject(t.primary_subject)===normalizeSubject(parsed.primary_subject!));
        if (!target) throw new Error('INVALID_UNION_NARROWING');
        if (!Object.hasOwn(explicit,'subject_terms'))
          base.subject_terms=[...new Set([...(previous.subject_terms??[]),...target.subject_terms])];
      }
      delete base.subject_alternatives;
    }
    if (explicit.subject_alternatives) delete base.primary_subject;
  }
  if ('period' in explicit || 'date_from' in explicit || 'date_to' in explicit) {
    delete base.period;
    delete base.date_from;
    delete base.date_to;
    Object.assign(
      base,
      Object.fromEntries(
        Object.entries(explicit).filter(([k]) => ['period', 'date_from', 'date_to'].includes(k))
      )
    );
  }
  const plan = searchPlanSchema.parse(base);
  if (plan.period) {
    const range = dateRange(plan.period, today);
    plan.date_from = range.from;
    plan.date_to = range.to;
    delete plan.period;
  }
  return plan;
}

export const SEARCH_PLAN_TOOL = {
  type: 'function' as const,
  function: {
    name: 'plan_search',
    description:
      '질문을 한 개의 검색 계획으로 변환한다. 조건이 모호하면 clarify. 이전 결과는 inherit_previous 또는 reference_index로 참조한다.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        intent: { type: 'string', enum: ['list', 'detail', 'conversation', 'clarify'] },
        message: {
          type: 'string',
          description: '인사 또는 필요한 확인 질문. 공지 사실을 작성하지 않는다.',
        },
        activity_types: {
          type: 'array',
          items: { type: 'integer', enum: [1, 2, 3, 4, 5, 6, 7, 8] },
          description:
            '1공모전 2대외활동 3서포터즈/기자단 4인턴/채용 5봉사 6교육/특강 7장학금/근로장학 8기타',
        },
        campus: { type: 'string', enum: ['kongju', 'cheonan', 'yesan'] },
        semantic_query: {
          type: 'string',
          description:
            '카테고리 외 핵심 주제어. AI 공모전의 AI처럼 복합 조건에서도 반드시 보존한다.',
        },
        subject_terms: { type:'array',items:{type:'string'},maxItems:5,
          description:'질문에서 그대로 인용한 특정 공지의 식별 명칭·기관·차수. 모두 포함하는 공지를 찾는다. 넓은 주제 검색은 null. 답변에서 확인할 미지의 사실은 넣지 않는다.' },
        excluded_terms: { type: 'array', items: { type: 'string' } },
        date_target: { type: 'string', enum: ['deadline', 'event'] },
        period: {
          type: 'string',
          enum: ['today','tomorrow','yesterday','last_month','this_week', 'next_week', 'this_month', 'next_month', 'soon'],
          description: '상대 날짜는 서버 계산. explicit date와 함께 사용 금지.',
        },
        date_from: { type: 'string', description: '명시한 연도·월·날짜의 시작일 YYYY-MM-DD. 예: 2027년 3월 마감 => 2027-03-01. 상대 날짜는 null.' },
        date_to: { type: 'string', description: '명시한 날짜 범위의 마지막 날 YYYY-MM-DD. 월말까지 포함. 상대 날짜는 null.' },
        include_expired: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 20 },
        inherit_previous: { type: 'boolean' },
        reference_index: { type: 'integer', minimum: 1, maximum: 20 },
        reference_indices: { type: 'array', items: { type: 'integer', minimum: 1, maximum: 20 }, minItems: 1, maxItems: 3,
          description: '이전 카드 중 여러 공지의 번호. 단일 reference_index와 함께 사용하지 않는다. 최대 3개.' },
      },
      required: ['intent'],
    },
  },
};
// Strict function calling requires all properties to be present; null means unspecified.
export const STRICT_SEARCH_PLAN_TOOL = {...SEARCH_PLAN_TOOL,function:{...SEARCH_PLAN_TOOL.function,strict:true,
  parameters:{...SEARCH_PLAN_TOOL.function.parameters,
    properties:Object.fromEntries(Object.entries(SEARCH_PLAN_TOOL.function.parameters.properties).map(([key,value]) =>
      [key,key==='intent'?value:{anyOf:[value,{type:'null'}]}])),
    required:Object.keys(SEARCH_PLAN_TOOL.function.parameters.properties),
  },
}};
// Only purpose-v1 sends this extended tool to the planner. Other retrieval
// versions keep their existing tool payload and may parse signed old contexts.
export const PRIMARY_SEARCH_PLAN_TOOL = {...STRICT_SEARCH_PLAN_TOOL,function:{...STRICT_SEARCH_PLAN_TOOL.function,
  parameters:{...STRICT_SEARCH_PLAN_TOOL.function.parameters,
    properties:{...STRICT_SEARCH_PLAN_TOOL.function.parameters.properties,
      primary_subject:{anyOf:[{type:'string',description:'사용자가 지정한 공지의 주목적 또는 고유 사업명을 질문에서 그대로 인용. 제목/사업명 항목에서 찾는다. 넓은 주제·혜택·본문 언급 탐색은 null. 연도·대상자·장소·모집 문구를 덧붙이지 않는다.'},{type:'null'}]}},
    required:[...STRICT_SEARCH_PLAN_TOOL.function.parameters.required,'primary_subject'],
  },
}};

// The union experiment keeps the previous tool contracts available for rollback.
export const UNION_SEARCH_PLAN_TOOL = {...PRIMARY_SEARCH_PLAN_TOOL,function:{...PRIMARY_SEARCH_PLAN_TOOL.function,
  parameters:{...PRIMARY_SEARCH_PLAN_TOOL.function.parameters,
    properties:{...PRIMARY_SEARCH_PLAN_TOOL.function.parameters.properties,
      subject_alternatives:{anyOf:[{type:'array',minItems:2,maxItems:3,description:'서로 다른 이름의 공지를 함께/각각 또는 A 혹은 B로 찾을 때만 2~3개 대상. 대상 안의 조건은 AND, 대상끼리는 OR. 공통 날짜·캠퍼스·제외 조건은 상위 필드. 사용 시 상위 primary_subject는 null.',
        items:{type:'object',additionalProperties:false,required:['primary_subject','subject_terms'],properties:{
          primary_subject:{type:'string',description:'이 대상의 핵심 공지 이름을 질문에서 그대로 인용. 최대 60자.'},
          subject_terms:{type:'array',items:{type:'string'},maxItems:5,description:'이 대상에만 붙는 명시 기관·차수. 없으면 빈 배열. 공통 조건은 상위 subject_terms.'},
        }}},{type:'null'}]}},
    required:[...PRIMARY_SEARCH_PLAN_TOOL.function.parameters.required,'subject_alternatives'],
  },
}};
