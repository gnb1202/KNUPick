import { buildEmbeddingText } from './embedding-text';
export { buildEmbeddingText } from './embedding-text';
import { openai } from './openai';
import { beginUsage, currentUsageMeter } from './usage-meter';
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

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

// 429(rate limit)와 5xx만 재시도한다. 401/400은 재시도해도 동일하게 실패.
function isRetryable(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  return status === 429 || (typeof status === 'number' && status >= 500);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function openaiEmbed(inputs: string[], signal?: AbortSignal): Promise<(number[] | null)[]> {
  for (let attempt = 0; ; attempt++) {
    const usage = beginUsage('embedding', OPENAI_EMBED_MODEL);
    try {
      const res = await openai.embeddings.create({
        model: OPENAI_EMBED_MODEL,
        input: inputs,
        dimensions: EMBEDDING_DIMENSIONS,
      }, { signal, timeout: 20_000, maxRetries: 0 });
      usage?.observe(res.usage); usage?.finish();
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
async function ollamaEmbed(inputs: string[], signal?: AbortSignal): Promise<(number[] | null)[]> {
  currentUsageMeter()?.unsupported();
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/embed`, {
      method: 'POST',
      signal: signal ?? AbortSignal.timeout(20_000),
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

export async function generateEmbedding(text: string, signal?: AbortSignal): Promise<number[] | null> {
  const [embedding] = await generateEmbeddingsBatch([text], signal);
  return embedding ?? null;
}

export async function generateEmbeddingsBatch(
  texts: string[], signal?: AbortSignal
): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  return PROVIDER === 'openai' ? openaiEmbed(texts, signal) : ollamaEmbed(texts, signal);
}

export async function embedPost(post: Parameters<typeof buildEmbeddingText>[0]): Promise<number[] | null> {
  const text = buildEmbeddingText(post);
  return generateEmbedding(text);
}
