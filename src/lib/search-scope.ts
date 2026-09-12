import type { SearchPlan } from './search-plan';
import { dateRange, type RelativePeriod } from './dates';

export const SEARCH_SCOPE_VERSION = 'subject-scope-v1';
// Normalization permits spacing/punctuation and the conventional 대/대학교
// abbreviation. It does not replace distinct institutions with similar names.
export const normalizeSubject = (s:string) => s.normalize('NFKC').toLowerCase()
  .replace(/(\d{4})(?:학년도|년도)/g,'$1년').replace(/(\d{4})\s*[-–]\s*([12])\s*학기/g,'$1년$2학기')
  .replace(/근로\s*장학생/g,'근로학생')
  .replace(/대학교/g,'대').replace(/[^가-힣a-z0-9]/g,'');
const typeSignals: Record<number,RegExp> = {
  1:/공모전|경진대회|경연대회/,2:/대외활동/,3:/서포터즈|기자단/,
  4:/인턴|채용(?!\s*설명회)|취업/,5:/봉사/,6:/교육|특강|강연|세미나|워크숍|설명회/,
  7:/장학금|장학\s*지원|근로장학/,8:/기타/,
};

export function enforceSearchScope(plan:SearchPlan, question:string, asOf:string, previous?:SearchPlan):SearchPlan {
  if (!['list','detail'].includes(plan.intent)) return plan;
  let result={...plan};
  // A classifier's inference is not an explicit user category. Keep inherited
  // filters, and never retry an empty query with a broader category policy.
  const types=plan.activity_types?.filter(type=>typeSignals[type]?.test(question) ||
    (plan.inherit_previous && previous?.activity_types?.includes(type)));
  result.activity_types=types?.length?types:undefined;
  const source=normalizeSubject(question);
  const subjects=[...new Set(plan.subject_terms ?? [])];
  const inheritedTerms=[...(previous?.subject_terms??[]),...(plan.inherit_previous && plan.primary_subject
    ? previous?.subject_alternatives?.find(t=>normalizeSubject(t.primary_subject)===normalizeSubject(plan.primary_subject!))?.subject_terms??[] : [])];
  for (const term of subjects) {
    if (normalizeSubject(term).length<2) throw new Error('UNGROUNDED_SUBJECT');
    if (!source.includes(normalizeSubject(term)) &&
        !((plan.inherit_previous || plan.reference_index || plan.reference_indices) && inheritedTerms.some(t=>normalizeSubject(t)===normalizeSubject(term))))
      throw new Error('UNGROUNDED_SUBJECT');
  }
  // Exact institution and round names also survive an omitted model field.
  // Multiple institutions require an explicit choice/union interpretation.
  if (!plan.subject_alternatives && /학점\s*교류/.test(question)) {
    const names=[...new Set(question.match(/[가-힣]+?(?:대학교|대)(?=의?\s|학점교류)/g) ?? [])];
    if (names.length===1) subjects.push(names[0]);
  }
  const rounds=[...question.matchAll(/(?:추가\s*\(?\s*)?(\d+)\s*차/g)];
  if(!plan.subject_alternatives && rounds.length===1 && /입실|모집|신청|접수/.test(question)) subjects.push(rounds[0][1]+'차');
  if(subjects.length && /(?:또는|중\s*하나|말고|제외)/.test(question) && subjects.some(t=>
    new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*(?:말고|제외)').test(question)))
    throw new Error('EXCLUDED_SUBJECT');
  result.subject_terms=[...new Map(subjects.map(t=>[normalizeSubject(t),t])).values()];
  if(!result.subject_terms.length) delete result.subject_terms;
  if(result.subject_terms && result.subject_terms.length>5) throw new Error('TOO_MANY_SUBJECTS');

  const temporal=[...question.matchAll(/(오늘|내일|어제|지난\s*달)(?:에)?\s*(?:신청[이을]?\s*|접수[가를]?\s*)?(열리|개최|진행|마감|끝나)/g)];
  if(temporal.length===1 && !/부터|까지|제외|말고/.test(question)) {
    const [,word,action]=temporal[0];
    const period=({'오늘':'today','내일':'tomorrow','어제':'yesterday','지난달':'last_month'} as Record<string,RelativePeriod>)[word.replace(/\s/g,'')];
    const range=dateRange(period,asOf);
    result={...result,period:undefined,date_from:range.from,date_to:range.to,
      date_target:/마감|끝나/.test(action)?'deadline':'event'};
  }
  // A semester in a notice name is not an application window, including when
  // the same request also excludes a re-announcement.
  if (/\d\s*학기/.test(question) && !/(?:\d\s*[월일]|이번\s*(?:달|주)|다음\s*(?:달|주)|오늘|내일|어제|지난\s*달|부터|까지|학기\s*(?:에|중|동안|내에|마감))/.test(question)
      && !plan.inherit_previous) result={...result,date_from:undefined,date_to:undefined,period:undefined};
  if (result.intent==='list' && /누가|누구|어떻게|몇\s*학점/.test(question) && !/찾아|보여|검색/.test(question))
    result.intent='detail';
  return result;
}
