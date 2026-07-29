import { ACTIVITY_TYPES } from './constants';
import { openai } from './openai';
import { env } from '@/env';

// posts.embedding이 vector(1024)이고 HNSW 인덱스가 이 차원에 묶여 있다.
// 바꾸려면 schema.sql의 컬럼/인덱스/match_posts를 모두 손봐야 한다.
export const EMBEDDING_DIMENSIONS = 1024;

// openai(기본) | ollama. 두 모델은 벡터 공간이 다르므로 전환 시 전체 재임베딩 필수.
const PROVIDER = env.EMBEDDING_PROVIDER;
const OPENAI_EMBED_MODEL = env.OPENAI_EMBED_MODEL;
const OLLAMA_HOST = env.OLLAMA_HOST;
const OLLAMA_EMBED_MODEL = env.OLLAMA_EMBED_MODEL;

// posts.embedding_model에 기록할 값. 벡터 공간이 섞이지 않도록 출처를 남긴다.
export const EMBEDDING_MODEL_ID =
  PROVIDER === 'openai' ? OPENAI_EMBED_MODEL : OLLAMA_EMBED_MODEL;

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

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

// 429(rate limit)와 5xx만 재시도한다. 401/400은 재시도해도 동일하게 실패.
function isRetryable(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  return status === 429 || (typeof status === 'number' && status >= 500);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function openaiEmbed(inputs: string[]): Promise<(number[] | null)[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await openai.embeddings.create({
        model: OPENAI_EMBED_MODEL,
        input: inputs,
        dimensions: EMBEDDING_DIMENSIONS,
      });
      // 응답 순서가 요청 순서와 같다고 보장되지 않으므로 index로 되맞춘다.
      const byIndex = new Map(res.data.map((d) => [d.index, d.embedding]));
      return inputs.map((_, i) => byIndex.get(i) ?? null);
    } catch (error) {
      if (attempt >= MAX_RETRIES || !isRetryable(error)) {
        console.error('OpenAI embed failed:', error);
        return inputs.map(() => null);
      }
      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
      console.warn(`OpenAI embed retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`);
      await sleep(delay);
    }
  }
}

// Ollama /api/embed는 input에 string[] 도 받음 → 그대로 batch 처리
async function ollamaEmbed(inputs: string[]): Promise<(number[] | null)[]> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, input: inputs }),
    });
    if (!res.ok) {
      console.error('Ollama embed failed:', res.status, await res.text());
      return inputs.map(() => null);
    }
    const data = (await res.json()) as { embeddings?: number[][] };
    if (!data.embeddings) return inputs.map(() => null);
    return inputs.map((_, i) => data.embeddings![i] || null);
  } catch (error) {
    console.error('Ollama embed failed:', error);
    return inputs.map(() => null);
  }
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const [embedding] = await generateEmbeddingsBatch([text]);
  return embedding ?? null;
}

export async function generateEmbeddingsBatch(
  texts: string[]
): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  return PROVIDER === 'openai' ? openaiEmbed(texts) : ollamaEmbed(texts);
}

export async function embedPost(post: EmbeddingSource): Promise<number[] | null> {
  const text = buildEmbeddingText(post);
  return generateEmbedding(text);
}
