import { NextRequest, after } from 'next/server';
import { randomUUID } from 'node:crypto';
import { env } from '@/env';
import { POST as legacyChat } from '@/lib/legacy/chat';
import { withUsageMeter } from '@/lib/usage-meter';
import { withChatTrace, traceChat } from '@/lib/legacy/chat-trace';
import { ChatObservation, withObservation } from '@/lib/chat-observation';
import { requestObservationIdentity, requireTester, validateObservationParent, writeObservation, observationError, ObservationHttpError } from '@/lib/chat-observation-store';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Legacy follow-up repair only. No v2 switch with missing DB dependencies.
export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  const mode = env.CHAT_AGENTIC_RAG ? 'agentic' : 'vanilla';
  const run = async () => {
    const started = Date.now();
    let observation: ChatObservation | undefined;
    traceChat('request');
    try {
      let identity = requestObservationIdentity(request);
      let response: Response;
      if (identity) {
        const userId = await requireTester(request, true);
        try { await validateObservationParent(userId, identity); }
        catch (error) {
          if (!(error instanceof ObservationHttpError) || ![404, 503].includes(error.status)) throw error;
          // A missing capture must not break the independently signed card context.
          identity = { ...identity, previousRequestId: undefined };
          console.warn(JSON.stringify({ event: 'chat.capture_parent_unavailable', requestId }));
        }
        observation = new ChatObservation(requestId, userId, identity, writeObservation, request.signal, started);
        const capture = observation;
        after(async () => { capture.finish('unknown', 'FINALIZATION_MISSING'); await capture.flush(); });
        response = await withUsageMeter(() => withObservation(capture, () => legacyChat(request)), Boolean(
          process.env.NODE_ENV !== 'production' && env.EVALUATION_AS_OF));
        if (!response.headers.get('content-type')?.includes('text/event-stream'))
          capture.finish(response.ok ? 'completed' : 'error', response.ok ? undefined : `HTTP_${response.status}`);
        response.headers.set('X-Chat-Observation', 'requested');
        response.headers.set('Cache-Control', 'no-store');
      } else response = await legacyChat(request);
      response.headers.set('X-Request-Id', requestId);
      response.headers.set('X-Chat-Version', mode);
      traceChat('response', { status: response.status, durationMs: Date.now() - started });
      return response;
    } catch (error) {
      observation?.finish('error', 'REQUEST_FAILED');
      traceChat('response', { outcome: 'error', errorCode: 'REQUEST_FAILED', durationMs: Date.now() - started });
      if (observation || error instanceof ObservationHttpError) {
        const response = observationError(error);
        response.headers.set('X-Request-Id', requestId);
        response.headers.set('X-Chat-Version', mode);
        return response;
      }
      throw error;
    }
  };
  return withChatTrace({ requestId, mode }, () =>
    process.env.NODE_ENV !== 'production' && env.EVALUATION_AS_OF ? withUsageMeter(run) : run());
}
