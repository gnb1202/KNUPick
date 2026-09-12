import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { currentUsageMeter } from '@/lib/usage-meter';

const mocks = vi.hoisted(() => ({
  env: { CHAT_AGENTIC_RAG: true, EVALUATION_AS_OF: '' },
  legacy: vi.fn(),
}));
vi.mock('@/env', () => ({ env: mocks.env }));
vi.mock('@/lib/legacy/chat', () => ({ POST: mocks.legacy }));
import { POST } from '@/app/api/chat/route';
beforeEach(() => {
  mocks.env.CHAT_AGENTIC_RAG = true;
  mocks.env.EVALUATION_AS_OF = '';
  mocks.legacy.mockResolvedValue(Response.json({ error: 'Invalid context' }, { status: 400 }));
});
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
