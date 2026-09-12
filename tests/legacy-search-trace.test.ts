import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { withChatTrace } from '@/lib/legacy/chat-trace';

const mocks = vi.hoisted(() => ({ embed: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('@/lib/embeddings', () => ({ generateEmbedding: mocks.embed, EMBEDDING_MODEL_ID: 'text-embedding-3-small', EMBEDDING_DIMENSIONS: 1024 }));
vi.mock('@/lib/openai', () => ({ OPENAI_CONFIG: { SIMILARITY_THRESHOLD: 0.36 } }));
vi.mock('@/lib/chat-clock', () => ({ chatDate: () => '2026-09-12' }));
import { searchPosts } from '@/lib/legacy/post-search';

let log: ReturnType<typeof vi.spyOn>;
let builder: Record<string, ReturnType<typeof vi.fn>>;
const traced = <T>(run: () => T) => withChatTrace({ requestId: 'server-request', mode: 'agentic' }, run);
const records = () => log.mock.calls.map(args => JSON.parse(String(args[0])));
beforeEach(() => {
  vi.resetAllMocks();
  log = vi.spyOn(console, 'info').mockImplementation(() => {});
  mocks.embed.mockResolvedValue([1, 0]);
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  builder = Object.fromEntries(['select', 'overlaps', 'in', 'gte', 'lte', 'or', 'order', 'limit'].map(name => [name, vi.fn()]));
  for (const fn of Object.values(builder)) fn.mockReturnValue(builder);
  builder.limit.mockResolvedValue({ data: [], error: null });
  mocks.from.mockReturnValue(builder);
});
afterEach(() => vi.restoreAllMocks());

it('records an empty semantic search with its cutoff and fingerprint but no raw question or tool reasoning', async () => {
  const query = '컴퓨터공학';
  const posts = await traced(() => searchPosts({ semantic_query: query, ...{ reasoning: 'private reasoning', unknown: 'secret' } }, 'private question'));
  expect(posts).toEqual([]);
  expect(records()[0]).toMatchObject({ event: 'chat.search_start', requestId: 'server-request', path: 'semantic', threshold: 0.36,
    model: 'text-embedding-3-small', dimensions: 1024, queryChars: query.length,
    querySha256: createHash('sha256').update(query).digest('hex'), filters: { include_expired: false, limit: 5 } });
  expect(records()[1]).toMatchObject({ event: 'chat.search_end', outcome: 'empty', resultCount: 0, topSimilarity: null });
  expect(JSON.stringify(records())).not.toMatch(/컴퓨터공학|private|secret|reasoning/);
  expect(mocks.rpc).toHaveBeenCalledOnce();
  expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ match_threshold: 0.36, match_count: 5 });
});

it('records returned public IDs and scores without the notice text or embedding vector', async () => {
  const post = { id: 649, title: 'private title', content: 'private content' };
  mocks.rpc.mockResolvedValue({ data: [{ post, similarity: 0.45 }], error: null });
  const result = await traced(() => searchPosts({ semantic_query: 'private query' }, 'private user'));
  expect(result).toEqual([{ ...post, similarity: 0.45 }]);
  expect(records()[1]).toMatchObject({ outcome: 'success', postIds: [649], topSimilarity: 0.45, resultCount: 1 });
  expect(JSON.stringify(records())).not.toMatch(/private|query_embedding/);
});

it('exposes the existing ignored-semantic limitation of combined filters without altering the query', async () => {
  await traced(() => searchPosts({ semantic_query: '컴퓨터공학', activity_types: [1, 99, 1], campus: 'cheonan', deadline_to: '2026-09-30' }, 'private question'));
  expect(records()[0]).toMatchObject({ path: 'filter', semanticApplied: false,
    filters: { activity_types: [1], campus: 'cheonan', deadline_to: '2026-09-30', include_expired: false, limit: 5 } });
  expect(builder.overlaps).toHaveBeenCalledWith('activity_types', [1]);
  expect(builder.in).toHaveBeenCalledWith('campus', ['common', 'cheonan']);
  expect(mocks.embed).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('identifies the full-question fallback without logging its text', async () => {
  await traced(() => searchPosts({ include_expired: true }, 'private question'));
  expect(records()[0]).toMatchObject({ path: 'fallback', queryChars: 16, filters: { include_expired: true } });
  expect(mocks.embed).toHaveBeenCalledWith('private question');
  expect(JSON.stringify(records())).not.toContain('private question');
});

it.each(['embedding', 'vector', 'filter', 'exception'])('does not turn a %s failure into an empty result or log upstream secrets', async kind => {
  if (kind === 'embedding') mocks.embed.mockResolvedValue(null);
  if (kind === 'vector') mocks.rpc.mockResolvedValue({ data: null, error: { message: 'private credentials' } });
  if (kind === 'filter') builder.limit.mockResolvedValue({ data: null, error: { message: 'private credentials' } });
  if (kind === 'exception') mocks.rpc.mockRejectedValue(new Error('private credentials'));
  await expect(traced(() => searchPosts(kind === 'filter' ? { activity_types: [1] } : { semantic_query: 'private query' }, 'private user'))).rejects.toThrow();
  expect(records().at(-1)).toMatchObject({ outcome: 'error', errorCode: {
    embedding: 'EMBEDDING_FAILED', vector: 'VECTOR_LOOKUP_FAILED', filter: 'FILTER_LOOKUP_FAILED', exception: 'SEARCH_FAILED',
  }[kind] });
  expect(records().at(-1)).not.toHaveProperty('resultCount');
  expect(JSON.stringify(records())).not.toContain('private');
});
