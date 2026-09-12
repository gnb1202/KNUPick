import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { env } from '@/env';
import { POST as legacyChat } from '@/lib/legacy/chat';
import { withUsageMeter } from '@/lib/usage-meter';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Legacy follow-up repair only. No v2 switch with missing DB dependencies.
export async function POST(request: NextRequest) {
  const run = async () => {
    const response = await legacyChat(request);
    response.headers.set('X-Request-Id', randomUUID());
    response.headers.set('X-Chat-Version', env.CHAT_AGENTIC_RAG ? 'agentic' : 'vanilla');
    return response;
  };
  return process.env.NODE_ENV !== 'production' && env.EVALUATION_AS_OF ? withUsageMeter(run) : run();
}
