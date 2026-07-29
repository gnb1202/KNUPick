/**
 * 환경변수 검증 + 타입 안전 접근.
 *
 * - 시작 시점에 모든 env가 schema와 맞는지 검증한다 (누락/형식 오류는 즉시 throw).
 * - server vs client(NEXT_PUBLIC_) 분리 — 클라이언트 번들에는 server 변수가 절대 포함되지 않는다.
 * - boolean/url/optional 등을 zod로 강제하여 분산된 fallback/검증 로직을 한 곳으로 통합.
 *
 * 사용처: `import { env } from '@/env'` → `env.OPENAI_API_KEY` 식.
 *
 * NOTE: VERCEL, AWS_LAMBDA_FUNCTION_NAME 같은 런타임 자동 주입 변수는 여기서 검증하지 않는다
 * (런타임이 알아서 채움 — 단순 detection 용도).
 */
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

// "true"/"false" 문자열 → boolean. zod 4: transform 이후 default는 transformed 타입(boolean).
const booleanFromString = (defaultValue: boolean) =>
  z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .default(defaultValue);

export const env = createEnv({
  // ==========================================================
  // 서버 전용 (클라이언트 번들에 절대 포함되지 않음)
  // ==========================================================
  server: {
    // Supabase
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),

    // OpenAI (챗봇 답변 생성 + 임베딩)
    OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
    // 1024차원은 posts.embedding vector(1024)에 맞춘 값. text-embedding-3-small은
    // dimensions 파라미터로 축소를 네이티브 지원한다(MRL). 모델을 바꾸면 재임베딩 필요.
    OPENAI_EMBED_MODEL: z.string().min(1).default('text-embedding-3-small'),
    // 게시물 분석/요약용 (LLM_PROVIDER=openai일 때). 챗봇 답변용 CHAT_MODEL과 별개 —
    // 분석은 건수가 많고 정형 출력이라 저렴한 모델로 충분하다.
    OPENAI_LLM_MODEL: z.string().min(1).default('gpt-4o-mini'),

    // 크롤링 / Cron 인증
    CRON_SECRET: z.string().min(1, 'CRON_SECRET is required'),

    // 임베딩 공급자 — openai(기본) | ollama.
    // 로컬 GPU가 없으면 bge-m3를 띄울 수 없어 openai가 기본값이다.
    // GPU 복구 시 EMBEDDING_PROVIDER=ollama 한 줄로 되돌릴 수 있지만,
    // 두 모델은 벡터 공간이 달라 전환할 때마다 전체 재임베딩이 필수다.
    EMBEDDING_PROVIDER: z.enum(['openai', 'ollama']).default('openai'),

    // Ollama (로컬 LLM 분석 + 임베딩)
    OLLAMA_HOST: z.string().url().default('http://localhost:11434'),
    OLLAMA_MODEL: z.string().min(1).optional(),         // LLM_ENABLED=true일 때만 의미 있음 (아래에서 conditional 검증)
    OLLAMA_EMBED_MODEL: z.string().min(1).default('bge-m3'),

    // 게시물 분석/요약 공급자 — openai(기본) | ollama.
    // EMBEDDING_PROVIDER와 같은 패턴. Ollama 경로 코드는 그대로 남아 있어
    // 로컬 GPU 복구 시 LLM_PROVIDER=ollama 한 줄로 되돌릴 수 있다.
    // (임베딩과 달리 재생성 없이 즉시 전환 가능 — 벡터가 아니라 텍스트 산출물이라서)
    LLM_PROVIDER: z.enum(['openai', 'ollama']).default('openai'),

    // 마스터 스위치. false면 공급자와 무관하게 분석을 건너뛰고
    // categorizer.ts의 키워드 폴백이 대신 처리한다.
    LLM_ENABLED: booleanFromString(false),
    CHAT_AGENTIC_RAG: booleanFromString(false),

    // CLOVA OCR (이미지 공지 분석 — 선택)
    CLOVA_OCR_URL: z.string().url().optional(),
    CLOVA_OCR_SECRET: z.string().min(1).optional(),
  },

  // ==========================================================
  // 클라이언트 노출 (NEXT_PUBLIC_*) — 모든 번들에 포함됨
  // ==========================================================
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  },

  // Next.js client 번들에 client 변수만 자동 inline되도록 명시
  runtimeEnv: {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_EMBED_MODEL: process.env.OPENAI_EMBED_MODEL,
    OPENAI_LLM_MODEL: process.env.OPENAI_LLM_MODEL,
    CRON_SECRET: process.env.CRON_SECRET,
    EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER,
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    OLLAMA_HOST: process.env.OLLAMA_HOST,
    OLLAMA_MODEL: process.env.OLLAMA_MODEL,
    OLLAMA_EMBED_MODEL: process.env.OLLAMA_EMBED_MODEL,
    LLM_ENABLED: process.env.LLM_ENABLED,
    CHAT_AGENTIC_RAG: process.env.CHAT_AGENTIC_RAG,
    CLOVA_OCR_URL: process.env.CLOVA_OCR_URL,
    CLOVA_OCR_SECRET: process.env.CLOVA_OCR_SECRET,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },

  // 빌드 시점에는 env 검증 스킵 (CI/Vercel 빌드가 env 없이도 통과)
  skipValidation: process.env.SKIP_ENV_VALIDATION === 'true',

  // 빈 문자열은 undefined로 (".env에 KEY="만 있는 경우 missing 처리)
  emptyStringAsUndefined: true,
});

// ==========================================================
// 의존성 검증 (conditional)
// ==========================================================
// 시작 시점에 fail-fast — Vercel 빌드 통과 + 로컬 dev에서 즉시 발견.
// server에서만 평가 (typeof window === 'undefined') — t3-env가 client에서
// server var 접근을 막으므로 client 번들에선 이 블록 자체가 skip된다.
if (typeof window === 'undefined') {
  // OLLAMA_MODEL은 Ollama 경로를 실제로 쓸 때만 필요하다.
  // LLM_PROVIDER=openai면 Ollama가 없어도 LLM_ENABLED=true가 정상 동작한다.
  if (env.LLM_ENABLED && env.LLM_PROVIDER === 'ollama' && !env.OLLAMA_MODEL) {
    throw new Error(
      'OLLAMA_MODEL is required when LLM_ENABLED=true and LLM_PROVIDER=ollama. ' +
        'Set it in .env.local (e.g. OLLAMA_MODEL=gemma4:e4b-it-q4_K_M), ' +
        'switch to LLM_PROVIDER=openai, ' +
        'or set LLM_ENABLED=false to fall back to keyword analysis.'
    );
  }
}
