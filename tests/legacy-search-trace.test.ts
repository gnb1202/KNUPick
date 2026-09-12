import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { withChatTrace } from '@/lib/legacy/chat-trace';

const mocks = vi.hoisted(() => ({ embed: vi.fn(), batch: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('@/lib/embeddings', () => ({ generateEmbedding: mocks.embed, generateEmbeddingsBatch: mocks.batch, EMBEDDING_MODEL_ID: 'text-embedding-3-small', EMBEDDING_DIMENSIONS: 1024 }));
vi.mock('@/lib/openai', () => ({ OPENAI_CONFIG: { SIMILARITY_THRESHOLD: 0.36 } }));
vi.mock('@/lib/chat-clock', () => ({ chatDate: () => '2026-09-12' }));
import { searchPosts, mergeDiscoveryResults, type SearchedPost } from '@/lib/legacy/post-search';

let log: ReturnType<typeof vi.spyOn>;
let builder: Record<string, ReturnType<typeof vi.fn>>;
const traced = <T>(run: () => T) => withChatTrace({ requestId: 'server-request', mode: 'agentic' }, run);
const records = () => log.mock.calls.map(args => JSON.parse(String(args[0])));
beforeEach(() => {
  vi.resetAllMocks();
  log = vi.spyOn(console, 'info').mockImplementation(() => {});
  mocks.embed.mockResolvedValue([1, 0]);
  mocks.batch.mockResolvedValue([[1, 0], [0, 1]]);
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

it('passes topic and all normalized filters to the filtered RPC without using a metadata-only fallback', async () => {
  await traced(() => searchPosts({ semantic_query: '컴퓨터공학', activity_types: [1, 99, 1], campus: 'cheonan', deadline_to: '2026-09-30' }, 'private question'));
  expect(records()[0]).toMatchObject({ path: 'filtered_semantic', semanticApplied: true,
    filters: { activity_types: [1], campus: 'cheonan', deadline_to: '2026-09-30', include_expired: false, limit: 5 } });
  expect(mocks.rpc).toHaveBeenCalledWith('legacy_match_posts_filtered_at', {
    query_embedding: [1, 0], match_threshold: 0.36, match_count: 5, include_expired: false, as_of: '2026-09-12',
    filter_activity_types: [1], filter_campus: 'cheonan', filter_deadline_from: null, filter_deadline_to: '2026-09-30',
  });
  expect(mocks.embed).toHaveBeenCalledWith('컴퓨터공학');
  expect(mocks.from).not.toHaveBeenCalled();
});

it('preserves metadata-only category and campus searches without an embedding call', async () => {
  await traced(() => searchPosts({ activity_types: [1, 99, 1], campus: 'cheonan' }, '공모전'));
  expect(records()[0]).toMatchObject({ path: 'filter', semanticApplied: false });
  expect(builder.overlaps).toHaveBeenCalledWith('activity_types', [1]);
  expect(builder.in).toHaveBeenCalledWith('campus', ['common', 'cheonan']);
  expect(mocks.embed).not.toHaveBeenCalled();
});

it('does not silently drop topic filters when the new RPC is absent or returns zero matches', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } });
  await expect(traced(() => searchPosts({ semantic_query: '인공지능', activity_types: [1] }, '질문'))).rejects.toThrow('VECTOR_LOOKUP_FAILED');
  expect(mocks.from).not.toHaveBeenCalled();
  expect(await traced(() => searchPosts({ semantic_query: '인공지능', activity_types: [1] }, '질문'))).toEqual([]);
  expect(mocks.from).not.toHaveBeenCalled();
});

it('identifies the full-question fallback without logging its text', async () => {
  await traced(() => searchPosts({ include_expired: true }, 'private question'));
  expect(records()[0]).toMatchObject({ path: 'fallback', queryChars: 16, filters: { include_expired: true } });
  expect(mocks.embed).toHaveBeenCalledWith('private question');
  expect(JSON.stringify(records())).not.toContain('private question');
});

it('searches each discovery topic with the same hard conditions and merges without dropping an empty topic', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: [{ post: { id: 766, title: '반도체 교육' }, similarity: 0.6 }], error: null });
  const posts = await traced(() => searchPosts({ discovery_queries: ['전자회로', '반도체'], campus: 'cheonan', activity_types: [6], deadline_to: '2026-09-30' }, 'private question'));
  expect(posts.map(post => post.id)).toEqual([766]);
  expect(mocks.batch).toHaveBeenCalledWith(['전자회로', '반도체']);
  expect(mocks.embed).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
  for (const [rpc, args] of mocks.rpc.mock.calls) {
    expect(rpc).toBe('legacy_match_posts_filtered_at');
    expect(args).toMatchObject({ match_threshold: 0.36, match_count: 20, filter_activity_types: [6], filter_campus: 'cheonan', filter_deadline_to: '2026-09-30', include_expired: false });
  }
  expect(records()[0]).toMatchObject({ path: 'filtered_discovery', queryCount: 2 });
  expect(JSON.stringify(records())).not.toMatch(/전자회로|반도체|private/);
});

it('deduplicates discovery topics and post IDs and keeps deterministic RRF order', async () => {
  mocks.batch.mockResolvedValue([[1, 0]]);
  await searchPosts({ discovery_queries: [' 반도체 ', '반도체'] }, '질문');
  expect(mocks.batch).toHaveBeenCalledWith(['반도체']);
  expect(mocks.rpc).toHaveBeenCalledOnce();
  const post = (id: number, similarity: number) => ({ id, similarity } as SearchedPost);
  const result = mergeDiscoveryResults([[post(2, 0.8), post(1, 0.7)], [post(1, 0.75), post(3, 0.9)]], 5);
  expect(result.map(post => post.id)).toEqual([1, 2, 3]);
  expect(result[0].similarity).toBe(0.75);
  expect(mergeDiscoveryResults([[post(1, 0.7), post(1, 0.7)], [post(2, 0.8)]], 1)[0].id).toBe(2);
});

it.each([[], ['a', 'b', 'c', 'd'], [''], ['a'.repeat(81)], ['a', null]].map(queries => ({ queries })))('rejects invalid discovery topics $queries before provider calls', async ({ queries }) => {
  await expect(searchPosts({ discovery_queries: queries as string[] }, '질문')).rejects.toThrow('INVALID_SEARCH_PLAN');
  expect(mocks.batch).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('rejects simultaneous precise and discovery queries instead of relaxing the precise subject', async () => {
  await expect(searchPosts({ semantic_query: '인공지능', discovery_queries: ['반도체'] }, '질문')).rejects.toThrow('INVALID_SEARCH_PLAN');
  expect(mocks.batch).not.toHaveBeenCalled();
});

it('fails discovery on a missing embedding or RPC failure rather than hiding a failed topic', async () => {
  mocks.batch.mockResolvedValueOnce([[1, 0], null]);
  await expect(traced(() => searchPosts({ discovery_queries: ['회로', '반도체'] }, '질문'))).rejects.toThrow('EMBEDDING_FAILED');
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'private' } });
  await expect(traced(() => searchPosts({ discovery_queries: ['회로', '반도체'] }, '질문'))).rejects.toThrow('VECTOR_LOOKUP_FAILED');
  expect(records().at(-1)).toMatchObject({ outcome: 'error' });
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
