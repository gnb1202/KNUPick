import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { currentUsageMeter } from '@/lib/usage-meter';
import { currentChatTrace, traceChat } from '@/lib/legacy/chat-trace';

const mocks = vi.hoisted(() => ({
  env: { CHAT_AGENTIC_RAG: true, EVALUATION_AS_OF: '' },
  legacy: vi.fn(),
}));
vi.mock('@/env', () => ({ env: mocks.env }));
vi.mock('@/lib/legacy/chat', () => ({ POST: mocks.legacy }));
import { POST } from '@/app/api/chat/route';
beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  mocks.env.CHAT_AGENTIC_RAG = true;
  mocks.env.EVALUATION_AS_OF = '';
  mocks.legacy.mockResolvedValue(Response.json({ error: 'Invalid context' }, { status: 400 }));
});
afterEach(() => vi.restoreAllMocks());
it('adds request identity and the real legacy mode even on validation errors', async () => {
  const response = await POST(new NextRequest('http://localhost/api/chat'));
  expect(response.status).toBe(400);
  expect(response.headers.get('x-request-id')).toMatch(/^[a-f0-9-]{36}$/);
  expect(response.headers.get('x-chat-version')).toBe('agentic');
});
it('reports vanilla mode without introducing a v2 dependency', async () => {
  mocks.env.CHAT_AGENTIC_RAG = false;
  const response = await POST(new NextRequest('http://localhost/api/chat'));
  expect(response.headers.get('x-chat-version')).toBe('vanilla');
});
it('meters evaluation only inside the scoped request', async () => {
  mocks.env.EVALUATION_AS_OF = '2026-09-11';
  mocks.legacy.mockImplementation(async () => Response.json({ metered: Boolean(currentUsageMeter()) }));
  const response = await POST(new NextRequest('http://localhost/api/chat'));
  expect(await response.json()).toEqual({ metered: true });
  expect(currentUsageMeter()).toBeUndefined();
});

it('uses the same server identity in concurrent request logs and response headers', async () => {
  mocks.legacy.mockImplementation(async () => {
    const before = currentChatTrace()?.requestId;
    await new Promise(resolve => setTimeout(resolve, 1));
    traceChat('plan', { action: 'search_posts' });
    return Response.json({ before, after: currentChatTrace()?.requestId });
  });
  const responses = await Promise.all([1, 2].map(() => POST(new NextRequest('http://localhost/api/chat', { headers: { 'x-request-id': 'client-controlled' } }))));
  const ids = responses.map(response => response.headers.get('x-request-id'));
  expect(new Set(ids).size).toBe(2);
  for (const [index, response] of responses.entries()) expect(await response.json()).toEqual({ before: ids[index], after: ids[index] });
  const logs = vi.mocked(console.info).mock.calls.map(args => JSON.parse(String(args[0])));
  for (const id of ids) expect(logs.filter(row => row.requestId === id).map(row => row.event)).toEqual(['chat.request', 'chat.plan', 'chat.response']);
  expect(JSON.stringify(logs)).not.toContain('client-controlled');
  expect(currentChatTrace()).toBeUndefined();
});
