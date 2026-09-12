import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { env } from '@/env';
import { POST as legacyChat } from '@/lib/legacy/chat';
import { withUsageMeter } from '@/lib/usage-meter';
import { withChatTrace, traceChat } from '@/lib/legacy/chat-trace';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Legacy follow-up repair only. No v2 switch with missing DB dependencies.
export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const mode = env.CHAT_AGENTIC_RAG ? 'agentic' : 'vanilla';
  const run = async () => {
    const started = Date.now();
    traceChat('request');
    try {
      const response = await legacyChat(request);
      response.headers.set('X-Request-Id', requestId);
      response.headers.set('X-Chat-Version', mode);
      traceChat('response', { status: response.status, durationMs: Date.now() - started });
      return response;
    } catch (error) {
      traceChat('response', { outcome: 'error', errorCode: 'REQUEST_FAILED', durationMs: Date.now() - started });
      throw error;
    }
  };
  return withChatTrace({ requestId, mode }, () =>
    process.env.NODE_ENV !== 'production' && env.EVALUATION_AS_OF ? withUsageMeter(run) : run());
}
