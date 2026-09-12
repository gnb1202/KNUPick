import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';

const storage = new AsyncLocalStorage<{ requestId: string; mode: 'agentic' | 'vanilla' }>();
export const withChatTrace = storage.run.bind(storage);
export const currentChatTrace = () => storage.getStore();

// Only server-selected metadata belongs here. Never pass messages, tool reasoning,
// context tokens, vectors, credentials, or upstream error objects.
export function traceChat(event: 'request' | 'response' | 'plan' | 'search_start' | 'search_end' | 'stream_end', fields: {
  status?: number;
  durationMs?: number;
  action?: 'search_posts' | 'chat_guidance';
  reason?: string;
  outcome?: 'success' | 'empty' | 'error';
  errorCode?: string;
  path?: 'fallback' | 'semantic' | 'filter';
  queryChars?: number;
  querySha256?: string;
  semanticApplied?: boolean;
  filters?: { activity_types?: number[]; campus?: string; deadline_from?: string; deadline_to?: string; include_expired: boolean; limit: number };
  asOf?: string;
  threshold?: number;
  model?: string;
  dimensions?: number;
  resultCount?: number;
  postIds?: number[];
  topSimilarity?: number | null;
} = {}) {
  const context = currentChatTrace();
  if (!context) return;
  console.info(JSON.stringify({ event: `chat.${event}`, traceVersion: 'legacy-search-trace-v1', ...context, ...fields }));
}

export function queryTrace(text: string) {
  return { queryChars: text.length, querySha256: createHash('sha256').update(text).digest('hex') };
}
