import { searchPlanSchema, type SearchPlan } from './search-plan';
import { comparisonQuestion } from './comparison-target';

export const SIGNED_REFERENCE_VERSION = 'signed-reference-v2';
type Previous = { ids: number[]; plan: SearchPlan };
const ordinal = '(?:첫\\s*번째|두\\s*번째|세\\s*번째|네\\s*번째|\\d+\\s*번(?:째)?)';
const selection = new RegExp('^(?:(?:지금|방금|앞서|이전|위에서)\\s*)?(?:(?:보여\\s*준|찾은|검색된)\\s*)?(' + ordinal +
  '(?:\\s*(?:공지|카드)?\\s*(?:와|과|,|및|랑)\\s*' + ordinal + ')*)\\s*(?:공지|카드)(?=\\s|[의에은는을를도.,?!]|$)');
const indexOf = (s: string) => /^첫/.test(s) ? 1 : /^두/.test(s) ? 2 : /^세/.test(s) ? 3 : /^네/.test(s) ? 4 : Number.parseInt(s, 10);

export function validatePlanReferences(plan: SearchPlan, ids: number[]) {
  const indices = plan.reference_indices ?? (plan.reference_index ? [plan.reference_index] : []);
  if (indices.some(index => !ids[index - 1])) throw new Error('INVALID_REFERENCE');
}

/** Only an unambiguous card selection at the start of the current question can
 * bypass planning. The caller must verify the signed context before using it. */
export function explicitReferencePlan(question: string, previous?: Previous): SearchPlan | undefined {
  if (/말고|제외|빼고|아닌|대신|새로|다른|다시\s*(?:찾|검색)/.test(question)) return;
  const shared = question.trim().match(/^(?:(?:그|이)\s+)?(두|세)\s*공지(?=\s|[의에은는을를도.,?!]|$)/);
  if (shared && comparisonQuestion(question) !== null && !/찾|검색/.test(question.trim().slice(shared[0].length))) {
    if (!previous?.ids.length) throw new Error('INVALID_REFERENCE');
    const count = shared[1] === '두' ? 2 : 3;
    if (previous.ids.length !== count)
      return searchPlanSchema.parse({ intent: 'clarify', message: '어떤 공지를 뜻하는지 카드 번호를 골라주세요. 선택한 공지를 각각 확인하겠습니다.' });
    return searchPlanSchema.parse({ ...previous.plan, intent: 'detail', message: undefined, inherit_previous: false,
      reference_index: undefined, reference_indices: Array.from({ length: count }, (_, i) => i + 1) });
  }
  const match = question.trim().match(selection);
  if (!match) return;
  if (/찾|검색/.test(question.trim().slice(match[0].length))) return;
  const indices = [...new Set([...match[1].matchAll(new RegExp(ordinal, 'g'))].map(m => indexOf(m[0])))];
  // A later selection or alternative needs normal interpretation, not a
  // partial match that silently answers only the first requested notice.
  const all = [...question.matchAll(new RegExp(ordinal, 'g'))].map(m => indexOf(m[0]));
  if (all.some(index => !indices.includes(index))) return;
  if (!previous?.ids.length || indices.some(index => !previous.ids[index - 1])) throw new Error('INVALID_REFERENCE');
  if (indices.length > 3) return searchPlanSchema.parse({ intent: 'clarify', message: '공지 번호를 최대 3개 골라주세요. 선택한 공지를 각각 확인하겠습니다.' });
  return searchPlanSchema.parse({ ...previous.plan, intent: 'detail', message: undefined, inherit_previous: false,
    reference_index: indices.length === 1 ? indices[0] : undefined,
    reference_indices: indices.length > 1 ? indices : undefined });
}
