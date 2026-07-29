/**
 * LLM 분류 정확도 측정 스크립트
 *
 * 사용법:
 *   npx tsx scripts/test-llm-accuracy.ts
 *
 * .env.local의 OLLAMA_HOST / OLLAMA_MODEL을 사용한다.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// .env.local 수동 로드
function loadEnvLocal() {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  } catch (err) {
    console.warn('.env.local 로드 실패:', err);
  }
}
loadEnvLocal();

import { analyzePostWithLLM } from '../src/lib/llm';
import { ACTIVITY_TYPES } from '../src/lib/constants';

interface TestCase {
  id: string;
  title: string;
  content: string;
  expected: {
    activity_types: number[];
    deadline?: string | null;
    event_start_date?: string | null;
    event_end_date?: string | null;
  };
}

const TEST_CASES: TestCase[] = [
  // 1: 공모전
  {
    id: 'C1-공모전',
    title: '제15회 대학생 창업 아이디어 공모전 안내',
    content: '주제: 사회문제를 해결하는 혁신적인 창업 아이디어. 참가대상: 전국 대학생. 접수기간: 2026.05.01 ~ 2026.06.30. 시상: 최우수상 1팀 (상금 500만원). 접수방법: 공식 홈페이지 온라인 접수.',
    expected: { activity_types: [1], deadline: '2026-06-30' },
  },
  {
    id: 'C2-경진대회',
    title: '2026 SW 해커톤 경진대회 참가팀 모집',
    content: '주제: AI 기반 캠퍼스 라이프 솔루션. 참가자격: 대학(원)생 4인 1팀. 신청기간: 2026.05.10까지. 행사일: 2026.06.15(토) 09:00 ~ 06.16(일) 18:00. 장소: 본관 대강당.',
    expected: { activity_types: [1], deadline: '2026-05-10', event_start_date: '2026-06-15', event_end_date: '2026-06-16' },
  },

  // 2: 대외활동
  {
    id: 'C3-대외활동',
    title: '청년 글로벌 리더십 프로그램 참가자 모집',
    content: '문화체육관광부 주관 청년 해외 교류 프로그램. 모집인원: 50명. 활동기간: 2026.07.01 ~ 2026.08.15. 신청기간: 2026.05.01 ~ 2026.05.30. 활동 내용: 해외 봉사 및 문화 교류.',
    expected: { activity_types: [2], deadline: '2026-05-30', event_start_date: '2026-07-01', event_end_date: '2026-08-15' },
  },

  // 3: 서포터즈/기자단
  {
    id: 'C4-서포터즈',
    title: '제8기 환경부 그린서포터즈 모집 안내',
    content: '환경 정책 홍보 및 콘텐츠 제작을 담당할 서포터즈. 모집인원: 30명. 활동기간: 2026.06 ~ 2026.11(6개월). 모집기간: 2026.05.20까지. 혜택: 활동비 월 20만원, 수료증.',
    expected: { activity_types: [3], deadline: '2026-05-20' },
  },
  {
    id: 'C5-기자단',
    title: '대학신문 학생기자단 9기 모집',
    content: '교내 행사 취재 및 기사 작성 담당. 모집인원: 8명. 활동기간: 1년. 신청마감: 2026.05.15. 활동비 지급.',
    expected: { activity_types: [3], deadline: '2026-05-15' },
  },

  // 4: 인턴십/채용
  {
    id: 'C6-채용',
    title: '카카오 2026 신입 개발자 공개 채용',
    content: '모집부문: 백엔드, 프론트엔드, 안드로이드. 자격: 4년제 대학 졸업(예정)자. 접수기간: 2026.05.10 ~ 2026.05.31 23:59. 전형절차: 서류전형 → 코딩테스트 → 인터뷰.',
    expected: { activity_types: [4], deadline: '2026-05-31' },
  },
  {
    id: 'C7-인턴십',
    title: '삼성전자 동계 인턴십 모집',
    content: '근무기간: 2026.06.30 ~ 2026.08.30 (8주). 자격: 재학생/휴학생. 지원기간: ~ 2026.05.20. 인턴 종료 후 정규직 전환 평가 진행.',
    expected: { activity_types: [4], deadline: '2026-05-20', event_start_date: '2026-06-30', event_end_date: '2026-08-30' },
  },

  // 5: 봉사활동
  {
    id: 'C8-봉사',
    title: '5월 어르신 도시락 배달 봉사자 모집',
    content: '독거노인 대상 도시락 전달. 봉사일시: 2026.05.18(토) 10:00 ~ 14:00. 봉사장소: 공주시 사회복지관. 모집기간: 2026.05.10까지. 봉사시간 4시간 인정.',
    expected: { activity_types: [5], deadline: '2026-05-10', event_start_date: '2026-05-18' },
  },

  // 6: 교육/특강 - 취업박람회 포함 (어려운 케이스)
  {
    id: 'C9-특강',
    title: '데이터 분석 전문가 초청 특강 안내',
    content: '연사: 카카오 OOO 데이터 사이언티스트. 일시: 2026.05.20(화) 18:00 ~ 20:00. 장소: 산학협력관 세미나실. 신청: 사전등록 (~ 5.18). 무료.',
    expected: { activity_types: [6], deadline: '2026-05-18', event_start_date: '2026-05-20' },
  },
  {
    id: 'C10-취업박람회',
    title: '2026 봄 채용 박람회 안내',
    content: '참여기업: 100여개. 일시: 2026.05.25(수) 10:00 ~ 17:00. 장소: 본관 대강당. 사전등록 우대. 모의면접, 컨설팅 부스 운영.',
    expected: { activity_types: [6], event_start_date: '2026-05-25' },
  },
  {
    id: 'C11-워크숍',
    title: '취업 자기소개서 작성 워크숍',
    content: '대상: 4학년 및 대학원생. 일시: 2026.05.22(목) 14:00 ~ 17:00. 강사: 외부 채용 컨설턴트. 신청기간: ~ 2026.05.20. 정원 30명 선착순.',
    expected: { activity_types: [6], deadline: '2026-05-20', event_start_date: '2026-05-22' },
  },

  // 7: 장학금/지원 - 근로장학(튜터/멘토링) 포함
  {
    id: 'C12-장학금',
    title: '2026학년도 1학기 국가장학금 신청 안내',
    content: '신청대상: 재학생 및 신입생 전체. 신청기간: 2026.05.01 ~ 2026.05.31 18:00. 신청방법: 한국장학재단 홈페이지(www.kosaf.go.kr).',
    expected: { activity_types: [7], deadline: '2026-05-31' },
  },
  {
    id: 'C13-튜터',
    title: '2026-1학기 학습튜터 모집 (근로장학)',
    content: '자격: 평점 3.5 이상 재학생. 활동내용: 후배 학습 멘토링 주 8시간. 활동기간: 2026.05 ~ 2026.06. 시급 1만원. 모집기간: ~ 2026.05.05.',
    expected: { activity_types: [7], deadline: '2026-05-05' },
  },
  {
    id: 'C14-멘토링',
    title: '신입생 멘토링 프로그램 멘토 모집',
    content: '담당교수와 함께 신입생 학교적응 지원. 활동시간 인정 및 멘토 활동비 지급. 모집기간: 2026.05.10까지.',
    expected: { activity_types: [7], deadline: '2026-05-10' },
  },

  // 8: 기타 - 기숙사, 행정
  {
    id: 'C15-기숙사',
    title: '2026학년도 2학기 학생생활관 입실신청 안내',
    content: '신청기간: 2026.06.10 ~ 2026.06.25. 신청방법: 학생생활관 홈페이지 온라인. 입실일: 2026.08.25(월). 자세한 사항은 첨부파일 참조.',
    expected: { activity_types: [8], deadline: '2026-06-25' },
  },
  {
    id: 'C16-강의평가',
    title: '2026학년도 1학기 강의평가 기간 안내',
    content: '강의평가 기간: 2026.06.10(수) ~ 2026.06.20(토) 17:00. 미참여 시 성적조회 제한. 참여 방법: 통합정보시스템 로그인.',
    expected: { activity_types: [8], deadline: '2026-06-20' },
  },
];

function setEquals(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((x) => sa.has(x));
}

function namesOf(ids: number[]): string {
  return ids.map((id) => ACTIVITY_TYPES.find((t) => t.id === id)?.name || `?${id}`).join('+');
}

async function main() {
  console.log(`\n=== LLM 분류 정확도 측정 ===`);
  console.log(`모델: ${process.env.OLLAMA_MODEL || '(기본값)'}`);
  console.log(`호스트: ${process.env.OLLAMA_HOST || 'http://localhost:11434'}`);
  console.log(`테스트 케이스: ${TEST_CASES.length}개\n`);

  let typeCorrect = 0;
  let deadlineCorrect = 0;
  let eventStartCorrect = 0;
  let eventEndCorrect = 0;
  const failures: string[] = [];
  const start = Date.now();

  for (const tc of TEST_CASES) {
    const t0 = Date.now();
    const result = await analyzePostWithLLM(tc.title, tc.content);
    const elapsed = Date.now() - t0;

    if (!result) {
      console.log(`${tc.id} ❌ NULL (${elapsed}ms)`);
      failures.push(`${tc.id}: NULL 응답`);
      continue;
    }

    const typeMatch = setEquals(result.activity_types, tc.expected.activity_types);
    const dlMatch =
      tc.expected.deadline === undefined ||
      result.deadline === tc.expected.deadline ||
      (tc.expected.deadline === null && !result.deadline);
    const esMatch =
      tc.expected.event_start_date === undefined ||
      result.event_start_date === tc.expected.event_start_date;
    const eeMatch =
      tc.expected.event_end_date === undefined ||
      result.event_end_date === tc.expected.event_end_date;

    if (typeMatch) typeCorrect++;
    if (dlMatch) deadlineCorrect++;
    if (esMatch) eventStartCorrect++;
    if (eeMatch) eventEndCorrect++;

    const flags = `${typeMatch ? '✅' : '❌'}T ${dlMatch ? '✅' : '❌'}D ${esMatch ? '✅' : '❌'}S ${eeMatch ? '✅' : '❌'}E`;
    console.log(
      `${tc.id} ${flags} (${elapsed}ms)\n` +
        `  expected: types=[${namesOf(tc.expected.activity_types)}] deadline=${tc.expected.deadline ?? '-'} start=${tc.expected.event_start_date ?? '-'} end=${tc.expected.event_end_date ?? '-'}\n` +
        `  actual:   types=[${namesOf(result.activity_types)}] deadline=${result.deadline ?? '-'} start=${result.event_start_date ?? '-'} end=${result.event_end_date ?? '-'}\n` +
        `  summary:  ${result.summary?.slice(0, 80) ?? '-'}\n` +
        `  keywords: ${result.keywords?.slice(0, 5).join(', ') ?? '-'}`
    );

    if (!typeMatch || !dlMatch || !esMatch || !eeMatch) {
      failures.push(
        `${tc.id} (${flags}): expected types=[${namesOf(tc.expected.activity_types)}] dl=${tc.expected.deadline ?? '-'}, got types=[${namesOf(result.activity_types)}] dl=${result.deadline ?? '-'}`
      );
    }
  }

  const totalSec = ((Date.now() - start) / 1000).toFixed(1);
  const n = TEST_CASES.length;
  console.log(`\n=== 결과 (${totalSec}s) ===`);
  console.log(`activity_types: ${typeCorrect}/${n} (${((typeCorrect / n) * 100).toFixed(0)}%)`);
  console.log(`deadline:       ${deadlineCorrect}/${n} (${((deadlineCorrect / n) * 100).toFixed(0)}%)`);
  console.log(`event_start:    ${eventStartCorrect}/${n} (${((eventStartCorrect / n) * 100).toFixed(0)}%)`);
  console.log(`event_end:      ${eventEndCorrect}/${n} (${((eventEndCorrect / n) * 100).toFixed(0)}%)`);

  if (failures.length > 0) {
    console.log(`\n=== 실패 케이스 (${failures.length}) ===`);
    for (const f of failures) console.log(`- ${f}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
