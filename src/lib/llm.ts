/**
 * LLM 클라이언트 (게시글 분석/요약)
 *
 * 공급자는 LLM_PROVIDER로 고른다:
 *   - openai (기본) : OPENAI_LLM_MODEL. 로컬 GPU 불필요.
 *   - ollama        : 로컬 OLLAMA_MODEL. GPU 있는 환경용.
 * LLM_ENABLED=false면 공급자와 무관하게 null을 반환하고,
 * 호출부(crawl route)가 categorizer.ts 키워드 폴백으로 처리한다.
 *
 * 프롬프트는 두 공급자가 공유한다 — 튜닝된 자산이라 분기시키지 않는다.
 */

import { APP_CONFIG } from './constants';
import { openai } from './openai';
import { env } from '@/env';

// LLM 설정 (env 의존성 검증은 src/env.ts에서 일괄 처리)
const OLLAMA_HOST = env.OLLAMA_HOST;
const LLM_ENABLED = env.LLM_ENABLED;
const LLM_PROVIDER = env.LLM_PROVIDER;
const OPENAI_LLM_MODEL = env.OPENAI_LLM_MODEL;

export const OLLAMA_MODEL = env.OLLAMA_MODEL ?? '';

// 로그/진단용 — 지금 실제로 어떤 모델이 도는지.
export const LLM_MODEL_ID = LLM_PROVIDER === 'openai' ? OPENAI_LLM_MODEL : OLLAMA_MODEL;

/**
 * OpenAI 토큰 사용량 누적 (프로세스 수명 기준).
 * 배치 스크립트가 실제 비용을 추정치가 아닌 실측으로 보고하기 위한 것.
 * Ollama 경로에서는 증가하지 않는다.
 */
export const llmUsage = { calls: 0, promptTokens: 0, completionTokens: 0 };

interface OllamaResponse {
  model: string;
  response: string;
  done: boolean;
}

interface LLMAnalysisResult {
  summary: string | null;
  activity_types: number[];
  deadline: string | null;
  event_start_date: string | null;
  event_end_date: string | null;
  keywords: string[];
}

/**
 * Ollama API 호출
 */
async function callOllama(prompt: string): Promise<string | null> {
  if (!LLM_ENABLED) {
    return null;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), APP_CONFIG.LLM.TIMEOUT);

    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        think: false,  // gemma4 등 thinking 모드 모델에서 reasoning 비활성화 (응답 비어있음 방지)
        options: {
          temperature: 0.3,  // 일관성 있는 응답
          num_predict: 500,  // 최대 토큰 수
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('Ollama API error:', response.status);
      return null;
    }

    const data: OllamaResponse = await response.json();
    return data.response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('LLM request timeout');
    } else {
      console.error('LLM error:', error);
    }
    return null;
  }
}

/**
 * OpenAI API 호출
 *
 * 이 파일의 프롬프트는 전부 JSON 출력을 요구하고 호출부가 parseJsonResponse로
 * 받으므로 json_object 모드를 강제한다 (마크다운 펜스/서두 설명이 섞이지 않음).
 */
async function callOpenAI(prompt: string): Promise<string | null> {
  try {
    const response = await openai.chat.completions.create(
      {
        model: OPENAI_LLM_MODEL,
        temperature: 0.3,
        max_tokens: 800,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      },
      { timeout: APP_CONFIG.LLM.TIMEOUT }
    );

    if (response.usage) {
      llmUsage.calls++;
      llmUsage.promptTokens += response.usage.prompt_tokens;
      llmUsage.completionTokens += response.usage.completion_tokens;
    }

    return response.choices[0]?.message?.content ?? null;
  } catch (error) {
    console.error('OpenAI LLM error:', error);
    return null;
  }
}

/**
 * 공급자 분기. 모든 분석 함수는 이 함수를 거친다.
 */
async function callLLM(prompt: string): Promise<string | null> {
  if (!LLM_ENABLED) return null;
  return LLM_PROVIDER === 'openai' ? callOpenAI(prompt) : callOllama(prompt);
}

/**
 * JSON 응답 파싱 (LLM 응답에서 JSON 추출)
 * - 마크다운 코드 블록 처리
 * - Greedy 매칭 방지
 */
function parseJsonResponse<T>(response: string): T | null {
  try {
    // 1. 마크다운 코드 블록 제거 (```json ... ``` 또는 ``` ... ```)
    const cleaned = response.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1');

    // 2. 첫 유효한 JSON 객체만 추출 (greedy 방지 - 중첩 1단계까지 지원)
    const jsonMatch = cleaned.match(/\{(?:[^{}]|\{[^{}]*\})*\}/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch {
    console.error('JSON parse error:', response.slice(0, 200));
    return null;
  }
}

/**
 * activity_types 검증 (문자열 → 숫자 변환 포함)
 */
function validateActivityTypes(types: unknown): number[] {
  if (!Array.isArray(types)) return [];
  return types
    .map(t => typeof t === 'string' ? parseInt(t, 10) : t)
    .filter(id => Number.isInteger(id) && id >= 1 && id <= 8);
}

/**
 * deadline 검증 (다양한 날짜 형식 지원)
 */
function validateDeadline(deadline: unknown): string | null {
  if (typeof deadline !== 'string' || !deadline) return null;

  // YYYY-MM-DD 형식
  if (/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return deadline;

  // YYYY.MM.DD 또는 YYYY/MM/DD → 변환
  const normalized = deadline.replace(/[./]/g, '-');
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;

  return null;
}

/**
 * 본문 요약 생성 (200자 이내)
 * - 영어 프롬프트 + Few-shot 예시
 */
export async function summarizePost(title: string, content: string): Promise<string | null> {
  const truncatedContent = content.slice(0, APP_CONFIG.LLM.MAX_CONTENT_LENGTH);

  const prompt = `<TASK>
Summarize this Korean university announcement in under 200 characters (Korean).
Include key info: target audience, period, application method.
If there are attachments (첨부파일, 붙임, 별첨) mentioned, add "자세한 내용은 안내문을 확인하세요." at the end.
</TASK>

<INPUT>
Title: ${title}
Content: ${truncatedContent}
</INPUT>

<OUTPUT_FORMAT>
Respond with ONLY valid JSON, no explanation:
{"summary": "Korean summary here"}
</OUTPUT_FORMAT>

<EXAMPLE>
Input Title: "2025학년도 1학기 국가장학금 신청 안내"
Input Content: "신청대상: 재학생 및 신입생 전체, 신청기간: 2024.11.21 ~ 2024.12.26(목) 18:00, 신청방법: 한국장학재단 홈페이지"
Output: {"summary": "2025학년도 1학기 국가장학금 신청 안내입니다. 전체 재학생과 신입생이 대상이며, 한국장학재단 홈페이지를 통해 12월 26일 18시까지 신청 가능합니다."}
</EXAMPLE>

Respond with JSON only:`;

  const response = await callLLM(prompt);
  if (!response) return null;

  const parsed = parseJsonResponse<{ summary: string }>(response);
  if (parsed?.summary) {
    return parsed.summary.slice(0, APP_CONFIG.LLM.SUMMARY_MAX_LENGTH);
  }
  return null;
}

/**
 * 활동유형 분류 (LLM 기반)
 * - 영어 프롬프트 + 분류 규칙 + Few-shot 예시
 */
export async function classifyActivityTypesWithLLM(title: string, content: string): Promise<number[] | null> {
  const truncatedContent = content.slice(0, APP_CONFIG.LLM.MAX_CONTENT_LENGTH);

  const prompt = `<TASK>
Classify this announcement into activity types (select ALL that apply).
</TASK>

<ACTIVITY_TYPES>
1=공모전(contest/competition), 2=대외활동(external activity), 3=서포터즈(supporters/ambassadors),
4=인턴십/채용(internship/job - actual hiring ONLY), 5=봉사활동(volunteer),
6=교육/특강(education/seminar/job fair), 7=장학금/지원(scholarship/support/tutor programs),
8=기타(dormitory/administrative)
</ACTIVITY_TYPES>

<RULES>
- Job fairs, career seminars → 6 (NOT 4)
- 학습튜터, 멘토링, 순찰대 → 7 (paid student worker, NOT 5)
- 기숙사, 학생생활관 → 8
</RULES>

<INPUT>
Title: ${title}
Content: ${truncatedContent}
</INPUT>

<OUTPUT_FORMAT>
Respond with ONLY valid JSON: {"activity_types": [1, 2]}
Numbers only, not strings.
</OUTPUT_FORMAT>

<EXAMPLES>
Good: {"activity_types": [1, 6]}
Bad: {"activity_types": ["1", "6"]}  // strings not allowed
</EXAMPLES>

Respond with JSON only:`;

  const response = await callLLM(prompt);
  if (!response) return null;

  const parsed = parseJsonResponse<{ activity_types: unknown }>(response);
  if (parsed?.activity_types) {
    return validateActivityTypes(parsed.activity_types);
  }
  return null;
}

/**
 * 마감일 추출 (LLM 기반)
 * - 영어 프롬프트 + 규칙 + Few-shot 예시
 */
export async function extractDeadlineWithLLM(title: string, content: string): Promise<string | null> {
  const truncatedContent = content.slice(0, APP_CONFIG.LLM.MAX_CONTENT_LENGTH);
  const today = new Date().toISOString().split('T')[0];

  const prompt = `<TASK>
Extract the application/submission DEADLINE from this announcement.
Today: ${today}
</TASK>

<RULES>
- "12월 말까지" → last day of December (YYYY-12-31)
- "2주 후 마감" → calculate from today
- A date at END followed by department name is POSTING DATE, not deadline
- If no deadline found → null
</RULES>

<INPUT>
Title: ${title}
Content: ${truncatedContent}
</INPUT>

<OUTPUT_FORMAT>
Respond with ONLY valid JSON: {"deadline": "YYYY-MM-DD"} or {"deadline": null}
</OUTPUT_FORMAT>

<EXAMPLES>
Input: "신청기간: 2025.1.5~2025.1.20"
Output: {"deadline": "2025-01-20"}

Input: "2025. 1. 15. 학생처" (posting date at end)
Output: {"deadline": null}
</EXAMPLES>

Respond with JSON only:`;

  const response = await callLLM(prompt);
  if (!response) return null;

  const parsed = parseJsonResponse<{ deadline: unknown }>(response);
  return validateDeadline(parsed?.deadline);
}

/**
 * 키워드 추출 (LLM 기반 - 학과 매칭용)
 * - 영어 프롬프트 + 한글 키워드 출력 (DEPARTMENT_KEYWORDS 호환)
 */
export async function extractKeywordsWithLLM(title: string, content: string): Promise<string[] | null> {
  const truncatedContent = content.slice(0, APP_CONFIG.LLM.MAX_CONTENT_LENGTH);

  const prompt = `<TASK>
Extract relevant field keywords in KOREAN for department matching (max 10).
Keywords should match these categories used in the system.
</TASK>

<CATEGORIES>
IT/SW: SW, 소프트웨어, 프로그래밍, 코딩, IT, 개발, 해커톤, 앱, 웹, AI, 인공지능
디자인: 디자인, UX, UI, 그래픽, 영상, 콘텐츠
경영/마케팅: 경영, 마케팅, 창업, 스타트업, 비즈니스
교육: 교육, 교사, 임용
공학: 기계, 전자, 전기, 화학, 건축, 토목
농업/식품: 농업, 식품, 원예, 축산
의료/보건: 의료, 간호, 건강, 병원
예술: 음악, 미술, 영화, 공연
어학: 영어, 외국어, 글로벌, 통역
</CATEGORIES>

<INPUT>
Title: ${title}
Content: ${truncatedContent}
</INPUT>

<OUTPUT_FORMAT>
Respond with ONLY valid JSON.
Use KOREAN keywords that match the categories above.
{"keywords": ["SW", "개발", "프로그래밍"]}
</OUTPUT_FORMAT>

<EXAMPLES>
Input: "2025 SW 해커톤 참가자 모집"
Output: {"keywords": ["SW", "개발", "프로그래밍", "해커톤", "IT"]}

Input: "간호학과 취업박람회 안내"
Output: {"keywords": ["간호", "의료", "취업", "건강"]}
</EXAMPLES>

Respond with JSON only:`;

  const response = await callLLM(prompt);
  if (!response) return null;

  const parsed = parseJsonResponse<{ keywords: string[] }>(response);
  if (parsed?.keywords && Array.isArray(parsed.keywords)) {
    return [...new Set(parsed.keywords)].slice(0, 10);
  }
  return null;
}

/**
 * 통합 분석 (한 번의 호출로 모든 분석 수행)
 * - XML 태그 기반 구조화된 프롬프트
 * - Few-shot 예시 포함
 */
export async function analyzePostWithLLM(title: string, content: string): Promise<LLMAnalysisResult | null> {
  const truncatedContent = content.slice(0, APP_CONFIG.LLM.MAX_CONTENT_LENGTH);
  const today = new Date().toISOString().split('T')[0];

  const prompt = `<TASK>
Analyze this Korean university announcement and extract structured information.
Today's date: ${today}
</TASK>

<INPUT>
Title: ${title}
Content: ${truncatedContent}
</INPUT>

<SUMMARY_RULES>
- DO NOT repeat the title in summary. The title is already visible to users.
- Focus on key info NOT in title: deadline, location, eligibility, how to apply.
- Under 200 characters in Korean.
- If attachments mentioned (첨부파일, 붙임, 별첨), end with "안내문 확인."
</SUMMARY_RULES>

<ACTIVITY_TYPES>
1=공모전(contest/competition), 2=대외활동(external activity), 3=서포터즈(supporters/ambassadors),
4=인턴십/채용(internship/job - actual hiring ONLY), 5=봉사활동(volunteer),
6=교육/특강(education/seminar/job fair), 7=장학금/지원(scholarship/support/tutor programs),
8=기타(dormitory/administrative)
</ACTIVITY_TYPES>

<CLASSIFICATION_RULES>
MUST classify as ID 3 (서포터즈/기자단): 서포터즈, 기자단, 학생기자단, 학보, 학보사, 신문사, 방송국, 홍보대사, 앰배서더, 크루
MUST classify as ID 6 (교육/특강): 채용설명회, 취업박람회, 세미나, 워크숍
MUST classify as ID 7 (장학금/지원): 학습지원단, 학습튜터, 멘토링, 캠퍼스순찰대 (these are 근로장학 paid positions)
MUST classify as ID 8 (기타): 기숙사, 학생생활관, 입실신청, 행정 공지
</CLASSIFICATION_RULES>

<DEADLINE_RULES>
- deadline = application/registration deadline (end date of 모집기간, 신청기간, 접수기간)
- Keywords: 마감, 까지, 접수기간, 신청기간, 모집기간
- "모집기간: ~ 12. 23.(화)" → deadline: 12/23
- A date at END followed by department name (e.g., "2025. 12. 15. 학생처") is POSTING DATE, not deadline
- "12월 말까지" → last day of month (YYYY-12-31)
- IMPORTANT: "XX 기간 안내" notices (강의평가, 성적열람, 이의신청) use END date as deadline!
  - "강의평가 기간: 12. 19. ~ 12. 31." → deadline: 12/31 (NOT event!)
  - These mean "complete within this period", so treat as deadline
- CRITICAL: If only "기간 내 신청하시기 바랍니다" without specific date → deadline = null
  - "붙임 참조", "첨부파일 참조" with no date in content → DO NOT fabricate, use null!
  - NO guessing/assuming dates! Only use dates explicitly stated in content!
- If no deadline found → null
</DEADLINE_RULES>

<EVENT_DATE_RULES>
- event_start_date = actual event/education/activity start date
- event_end_date = actual event/education/activity end date
- Keywords: 운영일시, 교육기간, 활동기간, 행사일, 봉사일시, 일시/장소, 진행기간, 근무기간, 인턴십기간, 실습기간
- "운영일시: 2025. 12. 29.(월) ~ 2026. 1. 10.(토)" → event_start_date: 12/29, event_end_date: 1/10
- "봉사일시: 12. 22.(월) 09:30" → event_start_date: 12/22, event_end_date: null
- "교육기간: 2026. 1. 5. ~ 4. 30." → event_start_date: 1/5, event_end_date: 4/30
- 모집기간/신청기간 is NOT event! Use deadline instead
- Service end dates (운영 종료일, 이용 종료일) are NOT events! Use deadline instead
  - "CU: 12월 4일까지, 학생생활관: 12월 19일까지" → deadline: 12/19 (latest date), event: null
- If no event date found → null
</EVENT_DATE_RULES>

<OUTPUT_FORMAT>
Respond with ONLY valid JSON, no explanation, no markdown:
{"summary": "...", "activity_types": [1], "deadline": "YYYY-MM-DD", "event_start_date": "YYYY-MM-DD", "event_end_date": "YYYY-MM-DD", "keywords": ["..."]}

IMPORTANT: activity_types must be numbers (not strings), keywords in Korean. Use null for missing dates.
</OUTPUT_FORMAT>

<EXAMPLES>
Example 1 (Education course - deadline and event dates differ):
Input Title: "DSC공유대학 SOLIDWORKS 전문가 과정 안내"
Input Content: "모집기간: ~ 2025. 12. 23.(화) 11:00까지, 운영일시: 2025. 12. 29.(월) ~ 2026. 1. 10.(토), 2주간"
Output: {"summary": "12월 23일까지 모집, 12월 29일부터 2주간 운영.", "activity_types": [6], "deadline": "2025-12-23", "event_start_date": "2025-12-29", "event_end_date": "2026-01-10", "keywords": ["설계", "솔리드웍스", "교육"]}

Example 2 (Volunteer - volunteer date and deadline differ):
Input Title: "12월 빵나눔 봉사자 모집"
Input Content: "봉사일시: 25. 12. 22.(월) 09:30 ~ 3시간, 모집기간: 12. 11.(목) ~ 12. 17.(수) 11:00까지"
Output: {"summary": "12월 22일 봉사, 17일까지 모집.", "activity_types": [5], "deadline": "2025-12-17", "event_start_date": "2025-12-22", "event_end_date": null, "keywords": ["봉사", "빵나눔"]}

Example 3 (Seminar - single event date):
Input Title: "별의별 과학특강(12월) 안내"
Input Content: "일시/장소: 2025.12.20(토) 14:00~15:30 / 국립중앙과학관"
Output: {"summary": "12월 20일 14시, 국립중앙과학관에서 진행.", "activity_types": [6], "deadline": null, "event_start_date": "2025-12-20", "event_end_date": null, "keywords": ["과학", "특강"]}

Example 4 (Scholarship - no event date):
Input Title: "국가장학금 신청 안내"
Input Content: "신청기간: 2024.11.21 ~ 2024.12.26(목) 18:00"
Output: {"summary": "12월 26일 18시까지 신청.", "activity_types": [7], "deadline": "2024-12-26", "event_start_date": null, "event_end_date": null, "keywords": ["장학금", "국가장학금"]}

Example 5 (Period notice - deadline only, NOT event):
Input Title: "2025학년도 2학기 강의평가 기간 안내"
Input Content: "강의평가 기간: 2025. 12. 19.(금) ~ 12. 31.(수), 17:00"
Output: {"summary": "12월 31일 17시까지 강의평가 완료.", "activity_types": [8], "deadline": "2025-12-31", "event_start_date": null, "event_end_date": null, "keywords": ["강의평가", "성적"]}

Example 6a (Student reporters/supporters - ID 3, NOT 8):
Input Title: "대학신문 학생기자단 9기 모집"
Input Content: "교내 행사 취재 및 기사 작성. 모집인원 8명. 활동기간 1년. 신청마감: 2025.5.15. 활동비 지급."
Output: {"summary": "교내 취재 활동 1년. 5월 15일까지 모집.", "activity_types": [3], "deadline": "2025-05-15", "event_start_date": null, "event_end_date": null, "keywords": ["기자단", "학보", "취재"]}

Example 6 (No date in content - deadline null):
Input Title: "2026학년도 학생생활관 입실신청 안내"
Input Content: "붙임과 같이 입실신청을 받고자 하오니 기간 내 신청하시기 바랍니다. 2025. 12. 12. 학생생활관"
Output: {"summary": "붙임 참조하여 기간 내 입실 신청.", "activity_types": [8], "deadline": null, "event_start_date": null, "event_end_date": null, "keywords": ["기숙사", "입실"]}

Example 7 (WRONG - don't do this):
Output: {"activity_types": ["1", "2"]}  // strings not allowed, use numbers [1, 2]
Output: {"event_start_date": "2025-12-11"}  // registration period start is NOT event!
Output: {"event_start_date": "2025-12-19", "event_end_date": "2025-12-31"}  // period notice is NOT event! use deadline!
Output: {"deadline": "2025-12-23"}  // "기간 내 신청" only, no specific date = DO NOT fabricate! use null!
</EXAMPLES>

Respond with JSON only:`;

  const response = await callLLM(prompt);
  if (!response) return null;

  console.log('LLM raw response:', response.slice(0, 500));

  const parsed = parseJsonResponse<LLMAnalysisResult>(response);
  if (parsed) {
    return {
      summary: parsed.summary?.slice(0, APP_CONFIG.LLM.SUMMARY_MAX_LENGTH) || null,
      activity_types: validateActivityTypes(parsed.activity_types),
      deadline: validateDeadline(parsed.deadline),
      event_start_date: validateDeadline(parsed.event_start_date),
      event_end_date: validateDeadline(parsed.event_end_date),
      keywords: [...new Set(parsed.keywords || [])].slice(0, 10),
    };
  }
  return null;
}

/**
 * LLM 연결 테스트
 */
export async function testLLMConnection(): Promise<boolean> {
  if (LLM_PROVIDER === 'openai') {
    // 키 존재만 확인한다. 실제 유효성까지 보려면 매 크롤마다 왕복이 하나 늘고,
    // 키가 틀렸더라도 각 분석이 null을 반환해 키워드 폴백으로 안전하게 떨어진다.
    const available = !!env.OPENAI_API_KEY;
    console.log(`LLM 연결 상태: ${available ? '성공' : 'OPENAI_API_KEY 없음'}`);
    console.log(`사용 모델: ${OPENAI_LLM_MODEL} (openai)`);
    return available;
  }

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!response.ok) return false;

    const data = await response.json();
    const hasModel = data.models?.some((m: { name: string }) =>
      m.name.includes(OLLAMA_MODEL.split(':')[0])
    );

    console.log(`LLM 연결 상태: ${hasModel ? '성공' : '모델 없음'}`);
    console.log(`사용 모델: ${OLLAMA_MODEL}`);

    return hasModel;
  } catch (error) {
    console.error('LLM 연결 실패:', error);
    return false;
  }
}

/**
 * LLM 활성화 여부
 */
export function isLLMEnabled(): boolean {
  return LLM_ENABLED;
}

// ============================================
// 이미지 공지 분석 (CLOVA OCR → LLM 텍스트 분석)
//
// CLOVA OCR은 네이버 클라우드 API라 로컬 GPU와 무관하게 항상 쓸 수 있다.
// 2단계 분석만 LLM_PROVIDER를 따르므로, LLM_PROVIDER=openai면 GPU 없이도
// 이미지 공지 파이프라인 전체가 동작한다.
// ============================================

const CLOVA_OCR_URL = env.CLOVA_OCR_URL || '';
const CLOVA_OCR_SECRET = env.CLOVA_OCR_SECRET || '';

/**
 * CLOVA OCR로 이미지에서 텍스트 추출
 */
async function extractTextWithClovaOCR(imageUrl: string): Promise<string | null> {
  if (!CLOVA_OCR_URL || !CLOVA_OCR_SECRET) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), APP_CONFIG.LLM.VISION_TIMEOUT);

    const response = await fetch(CLOVA_OCR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OCR-SECRET': CLOVA_OCR_SECRET,
      },
      body: JSON.stringify({
        version: 'V2',
        requestId: `knupick-${Date.now()}`,
        timestamp: Date.now(),
        images: [
          {
            format: 'jpg',
            name: 'notice-image',
            url: imageUrl,
          },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('CLOVA OCR API error:', response.status);
      return null;
    }

    const data = await response.json();

    // OCR 결과에서 텍스트 추출
    const fields = data.images?.[0]?.fields;
    if (!fields || fields.length === 0) {
      console.log('CLOVA OCR: 텍스트 없음');
      return null;
    }

    const extractedText = fields
      .map((field: { inferText: string }) => field.inferText)
      .join(' ');

    console.log(`CLOVA OCR 추출 (${fields.length}개 필드, ${extractedText.length}자): ${extractedText.slice(0, 100)}...`);
    return extractedText;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('CLOVA OCR timeout');
    } else {
      console.error('CLOVA OCR error:', error);
    }
    return null;
  }
}

/**
 * 여러 이미지에서 OCR 텍스트 추출 후 합치기
 */
export async function extractTextsFromImages(imageUrls: string[]): Promise<string | null> {
  const limitedUrls = imageUrls.slice(0, APP_CONFIG.LLM.VISION_MAX_IMAGES);
  const texts: string[] = [];

  for (const url of limitedUrls) {
    const text = await extractTextWithClovaOCR(url);
    if (text) texts.push(text);
  }

  if (texts.length === 0) return null;
  return texts.join('\n');
}

/**
 * 이미지 공지 분석 (CLOVA OCR → EXAONE 텍스트 분석)
 */
export async function analyzeImagePostWithLLM(title: string, imageUrls: string[]): Promise<LLMAnalysisResult | null> {
  // 1단계: CLOVA OCR로 텍스트 추출
  const ocrText = await extractTextsFromImages(imageUrls);
  if (!ocrText) {
    console.log('OCR 텍스트 추출 실패, 이미지 분석 스킵');
    return null;
  }

  // 2단계: 추출된 텍스트를 일반 텍스트 분석 경로로 넘긴다 (공급자는 LLM_PROVIDER)
  console.log(`OCR 텍스트로 ${LLM_MODEL_ID} 분석 시작: ${ocrText.slice(0, 80)}...`);
  return analyzePostWithLLM(title, ocrText);
}

/**
 * CLOVA OCR 연결 테스트
 */
export async function testVisionModelConnection(): Promise<boolean> {
  const available = !!(CLOVA_OCR_URL && CLOVA_OCR_SECRET);
  console.log(`CLOVA OCR 상태: ${available ? '사용 가능' : '미설정'}`);
  return available;
}
