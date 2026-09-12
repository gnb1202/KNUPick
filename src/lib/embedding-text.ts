import { ACTIVITY_TYPES } from './constants';
const CAMPUS_LABELS: Record<string, string> = {
  common: '공통',
  kongju: '공주(신관) 캠퍼스',
  cheonan: '천안 캠퍼스',
  yesan: '예산 캠퍼스',
};

interface EmbeddingSource {
  title: string;
  summary?: string | null;
  content?: string | null;
  keywords?: string[] | null;
  activity_types?: number[] | null;
  campus?: string | null;
  deadline?: string | null;
  event_start_date?: string | null;
}

export function buildEmbeddingText(post: EmbeddingSource): string {
  const parts: string[] = [];

  parts.push(`제목: ${post.title}`);

  if (post.summary) {
    parts.push(`요약: ${post.summary}`);
  }

  if (post.activity_types && post.activity_types.length > 0) {
    const typeNames = post.activity_types
      .map((id) => ACTIVITY_TYPES.find((t) => t.id === id)?.name)
      .filter(Boolean)
      .join(', ');
    if (typeNames) parts.push(`활동유형: ${typeNames}`);
  }

  if (post.keywords && post.keywords.length > 0) {
    parts.push(`키워드: ${post.keywords.join(', ')}`);
  }

  if (post.campus && CAMPUS_LABELS[post.campus]) {
    parts.push(`캠퍼스: ${CAMPUS_LABELS[post.campus]}`);
  }

  if (post.deadline) {
    parts.push(`마감일: ${post.deadline}`);
  }

  if (post.event_start_date) {
    parts.push(`행사 시작일: ${post.event_start_date}`);
  }

  // 본문은 임베딩에 포함하지 않는다.
  // 짧은 한국어 query와의 cosine similarity가 본문 길이만큼 dilute되어서,
  // 제목/요약/키워드/활동유형/캠퍼스/마감일 만으로 의미 밀도를 높인다.

  return parts.join('\n');
}
