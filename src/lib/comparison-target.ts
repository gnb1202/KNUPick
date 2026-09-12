export const COMPARISON_TARGET_VERSION = 'comparison-target-v2';

const ordinal = '(?:첫\\s*번째|두\\s*번째|세\\s*번째|네\\s*번째|\\d+\\s*번(?:째)?)';
const prefix = '(?:(?:지금|방금|앞서|이전|위에서)\\s*)?(?:(?:보여\\s*준|찾은|검색된)\\s*)?(?:(?:그|이)\\s+)?';
const selection = new RegExp('^' + prefix + '(?:' + ordinal + '(?:\\s*(?:공지|카드)?\\s*(?:와|과|,|및|랑)\\s*' + ordinal + ')+\\s*(?:공지|카드)|(?:두|세|각|모든)\\s*공지|공지들)');
const numberedNotice = new RegExp(ordinal + '\\s*(?:공지|카드)');
const namedPrevious = /^(?:(?:앞서|방금|이전)\s*)?(?:찾은|보여\s*준|검색된)\s+[가-힣A-Za-z0-9 ]{1,80}?\s*공지들/;

/** Project only a shared, leading card selection. Per-card assignments and
 * relational comparisons need clarification; never erase their scope. */
export function comparisonQuestion(question: string): string | null {
  const text = question.trim();
  if (/말고|제외|빼고|대신|차이|공통점|더\s|어느|어떤\s*공지|저렴|비싸/.test(text)) return null;
  const match = text.match(selection) ?? text.match(namedPrevious);
  if (!match || !/^(?:\s|의|에|은|는|을|를|도|[.,?!]|$)/.test(text.slice(match[0].length))) return null;
  const tail = text.slice(match[0].length);
  if (numberedNotice.test(tail) || /다른\s*공지|각\s*공지|두\s*공지|세\s*공지|공지들|전자는|후자는/.test(tail)) return null;
  return ('이 공지' + tail.replace(/^\s*(?:모두|둘\s*다)\s*/, ' '))
    .replace(/비교(?=해|하|를|\s|[?.!]|$)/g, '설명').replace(/\s+/g, ' ').trim();
}

/** A narrow textual guard for observed cross-notice claims. It is not an
 * entailment judge: names and arbitrary paraphrases still require review. */
export function crossNoticeClaim(text: string): boolean {
  const normalized = text.normalize('NFKC');
  return numberedNotice.test(normalized) || /(?:다른|두|세|각|양쪽|모든)\s*공지|공지들|전자는|후자는/.test(normalized);
}

export const comparisonTargetPrompt = '\n현재 요청은 선택된 공지 한 개에 대한 설명이다. question은 서버가 이 공지로 한정한 질문이다. '
  + '각 statements 항목의 post_id는 제공된 answerTarget.post_id와 같아야 한다. text에서는 이 공지 또는 항목 이름으로 설명한다. '
  + '첫 번째·두 번째 공지, 다른 공지, 두 공지 전체를 설명하거나 비교하지 않는다. 공지 번호와 제목은 서버가 표시한다. '
  + '정보 부재도 이 공지의 제공된 근거 범위에서만 말한다.';
