import OpenAI from 'openai';
import { env } from '@/env';

export const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export const OPENAI_CONFIG = {
  CHAT_MODEL: 'gpt-4o',
  MAX_CONTEXT_POSTS: 5,
  // text-embedding-3-small(dimensions=1024) 실측 분포 — scripts/measure-similarity.ts:
  //   관련 질의 top1 0.42~0.58 / 무관 질의 top1 최대 0.30
  // 두 분포 중간인 0.36을 임계로 잡는다. 관련 질의는 상위 10건이 모두 0.376 이상이라
  // 결과 수가 줄지 않으면서 무관 질의는 전부 걸러진다.
  // 주의: 이 값은 임베딩 모델에 종속적이다. 모델을 바꾸면 반드시 재측정할 것
  // (이전 bge-m3 기준값은 0.30이었고, 그대로 두면 무관 질의가 통과했다).
  SIMILARITY_THRESHOLD: 0.36,
  // CHAT_AGENTIC_RAG=true면 GPT-4o function calling 기반 검색, 아니면 vanilla RAG
  AGENTIC_RAG_ENABLED: env.CHAT_AGENTIC_RAG,
} as const;
