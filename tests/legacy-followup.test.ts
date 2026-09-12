import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { signContext, verifyContext } from '@/lib/chat-context';
import { searchPlanSchema } from '@/lib/search-plan';

const mocks = vi.hoisted(() => ({
  create: vi.fn(), search: vi.fn(), embed: vi.fn(), from: vi.fn(), rpc: vi.fn(),
  config: { CHAT_MODEL: 'chat-test', AGENTIC_RAG_ENABLED: true, SIMILARITY_THRESHOLD: 0.36, MAX_CONTEXT_POSTS: 5 },
  env: { CHAT_CONTEXT_SECRET: 'test-context-secret-with-at-least-32-characters' as string | undefined },
}));
vi.mock('@/env', () => ({ env: mocks.env }));
vi.mock('@/lib/openai', () => ({ openai: { chat: { completions: { create: mocks.create } } }, OPENAI_CONFIG: mocks.config }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('@/lib/embeddings', () => ({ generateEmbedding: mocks.embed }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ ok: true }), getClientIp: () => 'test' }));
vi.mock('@/lib/legacy/post-search', () => ({ searchPosts: mocks.search, SEARCH_POSTS_TOOL: {}, todayKST: () => '2026-09-11' }));
import { POST } from '@/lib/legacy/chat';
import { followupEvidence, followupRequest, renderFollowup } from '@/lib/legacy/chat-followup';
import { withUsageMeter } from '@/lib/usage-meter';
import exchangeSource from './fixtures/legacy-exchange-source.json';

const wrong = '이메일 접수 마감은 2026년 10월 11일 오후 3시까지이며, 실물 서류 제출 마감은 2026년 10월 11일 오후 6시까지입니다.';
const question = '그 공지의 이메일 접수와 실물서류 제출 마감은 각각 언제야?';
const post = { id: 772, title: '독일·프랑스 교환학생 선발 안내', summary: '이전 요약',
  content: '이메일 접수: 10월 11일까지. 실물서류 제출: 10월 13일까지.\n국제교류과 업무시간: 평일 09:00 ~ 18:00.',
  original_url: 'https://www.kongju.ac.kr/bbs/KNU/2132/431798/artclView.do?layout=unknown',
  posted_date: '2026-09-11', deadline: '2026-10-11', event_start_date: null, event_end_date: null,
  activity_types: [8], keywords: [], campus: 'common' };
const token = (ids = [772], now?: number) => signContext(ids, searchPlanSchema.parse({}), mocks.env.CHAT_CONTEXT_SECRET!, now);
const request = (content: string, contextToken?: string, history = true) => new NextRequest('http://localhost/api/chat', {
  method: 'POST', body: JSON.stringify({ contextToken, messages: [
    ...(history ? [{ role: 'user', content: '독일·프랑스 교환학생 공지 찾아줘.' }, { role: 'assistant', content: wrong }] : []),
    { role: 'user', content },
  ] }),
});
const events = async (response: Response) => (await response.text()).trim().split('\n\n').map(line => JSON.parse(line.slice(6)));
const answer = (rows: { type: string; delta?: string }[]) => rows.filter(row => row.type === 'text').map(row => row.delta).join('');
const completion = (content: string) => ({ choices: [{ finish_reason: 'stop', message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
let query: { select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; abortSignal: ReturnType<typeof vi.fn>; maybeSingle: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.config.AGENTIC_RAG_ENABLED = true;
  mocks.env.CHAT_CONTEXT_SECRET = 'test-context-secret-with-at-least-32-characters';
  query = { select: vi.fn(), eq: vi.fn(), abortSignal: vi.fn(), maybeSingle: vi.fn() };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.abortSignal.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data: post, error: null }); mocks.from.mockReturnValue(query);
  mocks.search.mockResolvedValue([]); mocks.rpc.mockResolvedValue({ data: [], error: null }); mocks.embed.mockResolvedValue([1, 0]);
  mocks.create.mockResolvedValue(completion(wrong));
});

it('does not publish the recorded fabricated dates from a no-tool completion', async () => {
  const rows = await events(await POST(request('접수 마감은 언제야?', undefined, false)));
  expect(answer(rows)).not.toContain('오후 3시');
  expect(answer(rows)).not.toContain('오후 6시');
  expect(answer(rows)).toContain('검색');
});

it('does not use assistant history as notice evidence when signed context is missing', async () => {
  const rows = await events(await POST(request(question)));
  expect(answer(rows)).not.toContain('오후 3시');
  expect(answer(rows)).toContain('다시 검색');
  expect(mocks.create).not.toHaveBeenCalled();
});

it('asks for a card number when the recorded five-card result makes “그 공지” ambiguous', async () => {
  const contextToken = token([772, 669, 664, 606, 670]);
  const rows = await events(await POST(request(question, contextToken)));
  expect(answer(rows)).toContain('카드 번호');
  expect(rows.at(-1).contextToken).toBe(contextToken);
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});

it.each([true, false])('re-fetches the selected notice in agentic=%s and quotes current source, excluding fabricated history', async agentic => {
  mocks.config.AGENTIC_RAG_ENABLED = agentic;
  query.maybeSingle.mockResolvedValue({ data: { ...post, id: 669, content: '변경 공지: 실물서류는 10월 15일까지 제출하세요.' }, error: null });
  mocks.create.mockResolvedValue(completion('{"refs":["E1"]}'));
  const rows = await events(await POST(request('두 번째 공지의 실물서류 마감은 언제야?', token([772, 669]))));
  expect(query.eq).toHaveBeenCalledWith('id', 669);
  expect(query.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  expect(rows.map((e: { type: string }) => e.type)).toEqual(['posts', 'evidence', 'text', 'done']);
  expect(rows[0].posts.map((p: { id: number }) => p.id)).toEqual([669]);
  expect(answer(rows)).toContain('10월 15일까지');
  expect(answer(rows)).not.toContain('오후 3시');
  expect(answer(rows)).toContain('[E1]');
  expect(JSON.stringify(mocks.create.mock.calls[0][0])).not.toContain(wrong);
  expect(JSON.stringify(mocks.create.mock.calls[0][0])).not.toContain('이전 요약');
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.create.mock.calls[0][1]).toMatchObject({ maxRetries: 0 });
  expect(mocks.search).not.toHaveBeenCalled();
  expect(mocks.embed).not.toHaveBeenCalled();
  const next = verifyContext(rows.at(-1).contextToken, mocks.env.CHAT_CONTEXT_SECRET!);
  expect(next.ids).toEqual([669]);
});

it('allows a singular follow-up after a confirmed single-card response and records only the selector usage', async () => {
  mocks.create.mockResolvedValue(completion('{"refs":["E1"]}'));
  const rows = await withUsageMeter(async () => events(await POST(request(question, token()))));
  expect(answer(rows)).toContain('10월 11일까지');
  expect(answer(rows)).toContain('10월 13일까지');
  expect(answer(rows)).not.toContain('오후 6시');
  expect(rows.at(-1).usageReport).toMatchObject({ complete: true, calls: [{ kind: 'chat', inputTokens: 10, outputTokens: 5 }] });
});

it.each(['tampered', 'expired', 'wrong-type'])('rejects %s context before any model or notice lookup', async kind => {
  const contextToken = kind === 'expired' ? token([772], Date.now() - 3_600_001)
    : kind === 'tampered' ? token() + 'x' : 123;
  const response = await POST(request(question, contextToken as string));
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: 'INVALID_CONTEXT' });
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});

it('does not guess a missing, out-of-range or comparative reference', async () => {
  for (const [text, ids] of [['두 번째 공지 신청 방법', [772]], ['첫 번째와 두 번째 공지 마감 비교', [772, 669]], [question, []]] as const) {
    const rows = await events(await POST(request(text, token([...ids]))));
    expect(answer(rows)).not.toContain('오후 3시');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  }
});

it.each([
  { data: null, error: null, status: 422, code: 'INVALID_REFERENCE' },
  { data: null, error: { message: 'database unavailable' }, status: 503, code: 'REFERENCE_LOOKUP_FAILED' },
])('distinguishes lookup failure $code from no search results', async result => {
  query.maybeSingle.mockResolvedValue(result);
  const response = await POST(request(question, token()));
  expect(response.status).toBe(result.status);
  expect(await response.json()).toMatchObject({ code: result.code });
  expect(mocks.create).not.toHaveBeenCalled();
});

it('does not answer from summary when body/OCR is missing', async () => {
  query.maybeSingle.mockResolvedValue({ data: { ...post, content: null, summary: wrong }, error: null });
  const rows = await events(await POST(request(question, token())));
  expect(answer(rows)).toContain('본문·OCR 근거가 없어요');
  expect(answer(rows)).not.toContain('오후 3시');
  expect(rows[1].evidence).toEqual([]);
  expect(mocks.create).not.toHaveBeenCalled();
});

it.each([
  wrong,
  JSON.stringify({ refs: ['E1'], answer: wrong }),
  '{"refs":["E99"]}',
  '{"refs":["E1","E1"]}',
])('rejects generated facts or invalid selections, preserving cards and context (%s)', async content => {
  mocks.create.mockResolvedValue(completion(content));
  const rows = await events(await POST(request(question, token())));
  expect(rows.map((e: { type: string }) => e.type)).toEqual(['posts', 'evidence', 'error']);
  expect(rows.at(-1)).toMatchObject({ code: 'DETAIL_SELECTION_FAILED', contextToken: expect.any(String) });
  expect(answer(rows)).toBe('');
  expect(JSON.stringify(rows.at(-1))).not.toContain('오후 3시');
});

it.each(['length', 'refusal', 'network'])('does not retry or publish a partial selection after %s', async failure => {
  if (failure === 'network') mocks.create.mockRejectedValue(new Error('network'));
  else mocks.create.mockResolvedValue({ choices: [{ finish_reason: failure === 'length' ? 'length' : 'stop',
    message: { content: '{"refs":["E1"]}', refusal: failure === 'refusal' ? 'refused' : null } }] });
  const rows = await events(await POST(request(question, token())));
  expect(rows.at(-1).code).toBe('DETAIL_SELECTION_FAILED');
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(answer(rows)).toBe('');
});

it('sends cards and evidence before the selector completes', async () => {
  let release!: (value: ReturnType<typeof completion>) => void;
  mocks.create.mockReturnValue(new Promise(resolve => { release = resolve; }));
  const response = await POST(request(question, token()));
  const reader = response.body!.getReader(), decoder = new TextDecoder();
  expect(decoder.decode((await reader.read()).value)).toContain('"type":"posts"');
  expect(decoder.decode((await reader.read()).value)).toContain('"type":"evidence"');
  release(completion('{"refs":["E1"]}'));
  expect(decoder.decode((await reader.read()).value)).toContain('"type":"text"');
  expect(decoder.decode((await reader.read()).value)).toContain('"type":"done"');
  expect((await reader.read()).done).toBe(true);
});

it.each([true, false])('issues signed card order on ordinary search in agentic=%s', async agentic => {
  mocks.config.AGENTIC_RAG_ENABLED = agentic;
  const posts = [post, { ...post, id: 669 }];
  const stream = async function* () { yield { choices: [{ delta: { content: '공지 두 건을 찾았어요.' } }] }; };
  if (agentic) {
    mocks.search.mockResolvedValue(posts);
    mocks.create.mockResolvedValueOnce({ choices: [{ message: { tool_calls: [{ id: 'tool', function: { arguments: '{}' } }] } }] });
  } else mocks.rpc.mockResolvedValue({ data: posts.map(post => ({ post, similarity: 0.5 })), error: null });
  mocks.create.mockResolvedValueOnce(stream());
  const response = await POST(request('교환학생 선발 공지 찾아줘', undefined, false));
  expect(response.headers.get('X-Chat-Grounding-Version')).toBe('legacy-followup-v1');
  const rows = await events(response);
  expect(verifyContext(rows.at(-1).contextToken, mocks.env.CHAT_CONTEXT_SECRET!).ids).toEqual([772, 669]);
});

it('keeps legacy search usable without a secret but refuses unsigned references', async () => {
  mocks.env.CHAT_CONTEXT_SECRET = undefined;
  expect(answer(await events(await POST(request('안녕', undefined, false))))).toContain('공지 검색');
  const rows = await events(await POST(request(question)));
  expect(answer(rows)).toContain('다시 검색');
  expect(mocks.create).toHaveBeenCalledTimes(1);
});

it('bounds evidence and quotes without cutting source text or breaking the next history request', () => {
  const large = { ...post, content: ('공지 근거입니다. '.repeat(80) + '\n').repeat(15) };
  const evidence = followupEvidence(large, question);
  expect(evidence).toHaveLength(8);
  for (const e of evidence) {
    expect(e.text_content.length).toBeLessThanOrEqual(1000);
    expect(large.content.slice(e.start_offset, e.end_offset)).toBe(e.text_content);
  }
  const text = renderFollowup('{"refs":["E1","E2"]}', evidence);
  expect(text.length).toBeLessThanOrEqual(2000);
  expect(text).toContain('[E1]');
  expect(followupRequest('chat-test', question, evidence).max_tokens).toBe(256);
});

it('preserves both application dates in the captured OCR while keeping office hours in their original context', async () => {
  const actual = { ...post, ...exchangeSource };
  query.maybeSingle.mockResolvedValue({ data: actual, error: null });
  mocks.create.mockImplementation(async (params: ReturnType<typeof followupRequest>) => {
    const payload = JSON.parse(params.messages[1].content as string);
    const e = payload.evidence.find((e: { text_content: string }) =>
      e.text_content.includes('이메일접수') && e.text_content.includes('10. 11.(일)') && e.text_content.includes('10. 13.(화)'));
    expect(e).toBeDefined();
    return completion(JSON.stringify({ refs: [e.ref] }));
  });
  const rows = await events(await POST(request(question, token())));
  const text = answer(rows);
  expect(text).toContain('10\\. 11\\.\\(일\\)');
  expect(text).toContain('10\\. 13\\.\\(화\\)');
  expect(text).not.toContain('오후 3시');
  expect(text).not.toContain('오후 6시');
  for (const e of rows[1].evidence)
    expect(actual.content.slice(e.start_offset, e.end_offset)).toBe(e.text_content);
});

it('preserves the signed card context across no-tool guidance', async () => {
  const contextToken = token();
  const rows = await events(await POST(request('고마워', contextToken)));
  expect(rows.at(-1).contextToken).toBe(contextToken);
});

it('retains observed usage even when a paid selector response fails validation', async () => {
  const rows = await withUsageMeter(async () => events(await POST(request(question, token()))));
  expect(rows.at(-1)).toMatchObject({ type: 'error', usageReport: { complete: true, calls: [{ inputTokens: 10, outputTokens: 5 }] } });
});
