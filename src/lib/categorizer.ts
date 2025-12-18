import { ACTIVITY_TYPES } from './constants';

/**
 * 텍스트에서 활동유형을 자동 분류
 */
export function categorizeActivityTypes(title: string, content: string): number[] {
  const text = `${title} ${content}`.toLowerCase();
  const matchedTypes: number[] = [];

  for (const activityType of ACTIVITY_TYPES) {
    // 기타(id: 8)는 다른 카테고리가 없을 때만 추가
    if (activityType.id === 8) continue;

    const hasMatch = activityType.keywords.some((keyword) =>
      text.includes(keyword.toLowerCase())
    );

    if (hasMatch) {
      matchedTypes.push(activityType.id);
    }
  }

  // 매칭되는 유형이 없으면 '기타' 추가
  if (matchedTypes.length === 0) {
    matchedTypes.push(8);
  }

  return matchedTypes;
}

/**
 * 텍스트에서 키워드 추출 (학과 매칭용)
 */
export function extractKeywords(title: string, content: string): string[] {
  const text = `${title} ${content}`;
  const keywords: Set<string> = new Set();

  // 주요 키워드 패턴들
  const keywordPatterns = [
    // IT/SW
    /SW|소프트웨어|프로그래밍|코딩|IT|개발|해커톤|앱|웹|알고리즘|인공지능|AI|빅데이터|데이터/gi,
    // 디자인/예술
    /디자인|UX|UI|그래픽|영상|미디어|콘텐츠|예술|미술|음악|영화/gi,
    // 마케팅/경영
    /마케팅|홍보|SNS|콘텐츠|브랜드|광고|경영|창업|스타트업|비즈니스/gi,
    // 교육
    /교육|교사|임용|학교|강의|수업/gi,
    // 의료/보건
    /의료|건강|병원|헬스케어|간호|보건/gi,
    // 공학
    /공학|기계|전자|전기|화학|건축|토목|환경/gi,
    // 농업/식품
    /농업|식품|식물|동물|축산|원예|조경/gi,
    // 어학/글로벌
    /영어|외국어|글로벌|국제|해외|통역|번역/gi,
    // 봉사/사회
    /봉사|사회|복지|나눔|기부/gi,
  ];

  for (const pattern of keywordPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach((match) => keywords.add(match.toLowerCase()));
    }
  }

  return Array.from(keywords);
}

/**
 * 마감일 파싱 시도
 */
export function parseDeadline(text: string): string | null {
  // 1. 축약 연도 형식 먼저 처리: 'YY. MM. DD 또는 'YY.MM.DD (예: '26. 1. 11)
  const shortYearPattern = /'(\d{2})[.\s]+(\d{1,2})[.\s]+(\d{1,2})[.\s]*[^\d]*?(까지|마감)?/g;
  const shortYearMatches = [...text.matchAll(shortYearPattern)];

  if (shortYearMatches.length > 0) {
    // 마지막 매칭을 사용 (보통 마감일이 나중에 나옴)
    const lastMatch = shortYearMatches[shortYearMatches.length - 1];
    const year = 2000 + parseInt(lastMatch[1]);
    const month = parseInt(lastMatch[2]);
    const day = parseInt(lastMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // 2. 다양한 날짜 패턴 매칭
  const patterns = [
    // YYYY.MM.DD 또는 YYYY-MM-DD
    /마감[:\s]*(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})/,
    /(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})\s*(까지|마감)/,
    // MM.DD 또는 MM/DD (현재 연도 가정)
    /마감[:\s]*(\d{1,2})[.\-\/](\d{1,2})/,
    /(\d{1,2})[.\-\/](\d{1,2})\s*(까지|마감)/,
    // ~MM.DD
    /~\s*(\d{1,2})[.\-\/](\d{1,2})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        if (match.length >= 4 && match[1].length === 4) {
          // YYYY.MM.DD 형식
          const year = parseInt(match[1]);
          const month = parseInt(match[2]);
          const day = parseInt(match[3]);
          return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        } else if (match.length >= 3) {
          // MM.DD 형식 (현재 연도)
          const year = new Date().getFullYear();
          const month = parseInt(match[1]);
          const day = parseInt(match[2]);
          return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}
