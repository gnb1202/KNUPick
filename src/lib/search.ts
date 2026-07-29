import { getChoseong } from 'es-hangul';

// 한글 초성 목록
const CHOSEONGS = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

/**
 * 문자가 한글 초성인지 확인
 */
function isChosung(char: string): boolean {
  return CHOSEONGS.includes(char);
}

/**
 * 검색어가 초성으로만 구성되어 있는지 확인
 */
export function isChosungOnly(str: string): boolean {
  if (!str.trim()) return false;
  return str.split('').every((char) => isChosung(char) || char === ' ');
}

/**
 * 초성 검색을 포함한 통합 검색 함수
 * @param text 검색 대상 텍스트
 * @param query 검색어
 * @returns 매칭 여부
 */
export function searchWithChosung(text: string, query: string): boolean {
  if (!query.trim()) return true;
  if (!text) return false;

  const normalizedText = text.toLowerCase();
  const normalizedQuery = query.toLowerCase().trim();

  // 1. 일반 텍스트 검색 (포함 여부)
  if (normalizedText.includes(normalizedQuery)) {
    return true;
  }

  // 2. 초성 검색 (검색어가 초성으로만 구성된 경우)
  // 예: "ㅈㅎㄱ"으로 "장학금" 검색
  if (isChosungOnly(normalizedQuery)) {
    const textChosung = getChoseong(text);
    if (textChosung.includes(normalizedQuery)) {
      return true;
    }
  }

  return false;
}

/**
 * 여러 필드에서 검색
 * @param fields 검색할 필드 배열
 * @param query 검색어
 * @returns 매칭 여부
 */
export function searchInFields(fields: (string | null | undefined)[], query: string): boolean {
  return fields.some((field) => field && searchWithChosung(field, query));
}
