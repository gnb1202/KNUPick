// Real Next.js + local Supabase, deterministic loopback model. No paid provider calls.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';

const workdir = resolve(process.env.CHAT_LOCAL_SUPABASE_WORKDIR || '../../../rag-local');
assert.match(readFileSync(resolve(workdir, 'supabase/config.toml'), 'utf8'), /project_id\s*=\s*"knupick-rag-eval"/);
const status = JSON.parse(execFileSync('supabase', ['status', '--workdir', workdir, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }));
const api = new URL(status.API_URL); assert.equal(api.hostname, '127.0.0.1'); assert.equal(api.port, '56421');
const admin = createClient(api.href, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const auth = createClient(api.href, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const tag = `observation-${randomUUID()}`, userIds = [];
let child, modelCalls = 0, output = '', mockFailure;
const model = createServer(async (request, response) => {
  try {
    assert.equal(request.url, '/v1/chat/completions');
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8')); modelCalls++;
    const usage = { prompt_tokens: 120, completion_tokens: 20, total_tokens: 140 };
    if (input.stream) {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const chunk of [{ choices: [{ delta: { content: '로컬 연결 검증 답변입니다. 근거 원문을 확인해주세요.' }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] }, { choices: [], usage }])
        response.write(`data: ${JSON.stringify({ id: 'local-mock', object: 'chat.completion.chunk', model: 'gpt-4o', ...chunk })}\n\n`);
      response.end('data: [DONE]\n\n'); return;
    }
    const message = input.response_format
      ? { role: 'assistant', content: JSON.stringify({ refs: ['E1'] }) }
      : { role: 'assistant', content: null, tool_calls: [{ id: 'local-tool', type: 'function', function: { name: 'search_posts', arguments: JSON.stringify({ campus: 'cheonan', include_expired: true, limit: 2 }) } }] };
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ id: 'local-mock', object: 'chat.completion', model: 'gpt-4o', choices: [{ index: 0, message, finish_reason: input.response_format ? 'stop' : 'tool_calls' }], usage }));
  } catch (error) { mockFailure = error; response.writeHead(500); response.end('local fixture failure'); }
});
await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
const modelUrl = `http://127.0.0.1:${model.address().port}/v1`;
const port = 3027, origin = `http://127.0.0.1:${port}`;
const createUser = async suffix => {
  const email = `${tag}-${suffix}@example.invalid`, password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username: `${tag}-${suffix}` } });
  assert.equal(error, null, 'Local test user creation must succeed'); userIds.push(data.user.id);
  const signed = await auth.auth.signInWithPassword({ email, password }); assert.equal(signed.error, null, 'Local login must succeed');
  return { id: data.user.id, token: signed.data.session.access_token };
};
try {
  const owner = await createUser('owner'), stranger = await createUser('other');
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: api.origin, NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
      OPENAI_API_KEY: 'local-fixture-key', OPENAI_BASE_URL: modelUrl, OPENAI_EMBED_MODEL: 'text-embedding-3-small', EMBEDDING_PROVIDER: 'openai',
      CHAT_AGENTIC_RAG: 'true', CHAT_OBSERVABILITY_MODE: 'testers', CHAT_OBSERVER_USER_IDS: `${owner.id},${stranger.id}`,
      CHAT_CONTEXT_SECRET: 'local-observation-context-secret-32-characters', CHAT_BUILD_SHA: 'local-integration-fixture',
      CRON_SECRET: 'local-observation-cron', LLM_ENABLED: 'false', EVALUATION_AS_OF: '', NODE_ENV: 'development' } });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output = (output + chunk.toString()).slice(-64000); });
  const request = async (path, { method = 'GET', token = owner.token, body, headers = {} } = {}) => {
    const response = await fetch(origin + path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
    return response;
  };
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (child.exitCode !== null) throw Error('Local Next server exited');
    try { const response = await request('/api/chat/observation-access', { token: '' }); if (response.status === 401) { ready = true; break; } } catch {}
    await delay(250);
  }
  assert.ok(ready, 'Local Next server must be ready');
  const sessionId = randomUUID();
  const chat = async (question, extra = {}, parent) => {
    const response = await request('/api/chat', { method: 'POST', body: { messages: [{ role: 'user', content: question }], ...extra }, headers: {
      'X-Chat-Observation': 'chat-observation-v1', 'X-Chat-Session-Id': sessionId, ...(parent ? { 'X-Chat-Previous-Request-Id': parent } : {}) } });
    assert.equal(response.status, 200);
    const events = (await response.text()).split('\n\n').filter(frame => frame.startsWith('data: ')).map(frame => JSON.parse(frame.slice(6)));
    assert.equal(events.at(-1).type, 'done', 'Real chat must terminate normally');
    const requestId = response.headers.get('x-request-id'); assert.equal(events.at(-1).requestId, requestId);
    let row;
    for (let i = 0; i < 20; i++) {
      const stored = await request(`/api/admin/chat-observations/${requestId}`);
      if (stored.ok) { row = await stored.json(); if (row.status === 'completed') break; }
      await delay(100);
    }
    assert.equal(row?.status, 'completed', 'after() must persist terminal state');
    assert.equal(row.payload.answer, events.filter(e => e.type === 'text').map(e => e.delta).join(''));
    assert.ok(row.payload.evidence.length > 0, 'Local notices must supply evidence');
    assert.ok(row.payload.usage.complete); assert.ok(row.payload.calls.length > 0);
    return { row, events, requestId };
  };
  const first = await chat('천안 공지 보여줘. 지난 공지도 포함해줘.');
  const followup = await chat('첫 번째 공지의 신청 방법은?', { contextToken: first.events.at(-1).contextToken }, first.requestId);
  assert.equal(followup.row.previous_request_id, first.requestId);
  assert.equal(followup.row.payload.reference.selectedPostId, first.events.find(e => e.type === 'posts').posts[0].id);
  const vote = await request('/api/chat/feedback', { method: 'PUT', body: { requestId: first.requestId, rating: 'down', reasons: ['fact'], comment: '연결 확인 me@example.org' } });
  assert.equal(vote.status, 200); assert.equal((await vote.json()).feedback.comment, '연결 확인 [이메일]');
  const verdict = await request(`/api/admin/chat-observations/${first.requestId}`, { method: 'PATCH', body: { verdict: 'uncertain', reasons: ['grounding'], comment: '모의 답변이므로 품질 판정 보류' } });
  assert.equal(verdict.status, 200);
  const final = await (await request(`/api/admin/chat-observations/${first.requestId}`)).json();
  assert.equal(final.review_verdict, 'uncertain'); assert.equal(final.feedback_rating, 'down'); assert.equal(final.payload.answer, first.row.payload.answer);
  assert.equal((await request(`/api/admin/chat-observations/${first.requestId}`, { token: stranger.token })).status, 404);
  assert.equal((await request('/api/chat/feedback', { token: stranger.token, method: 'PUT', body: { requestId: first.requestId, rating: 'up' } })).status, 404);
  const listing = await request('/api/admin/chat-observations?days=7'); assert.equal(listing.status, 200); const list = await listing.json();
  assert.equal(list.rows.length, 2); assert.equal(list.rows.find(r => r.request_id === first.requestId).result_count, 2);
  assert.equal(list.rows[0].payload, undefined); assert.ok(list.rows[0].versions.model);
  const denied = await fetch(`${api.origin}/rest/v1/chat_observations?select=request_id`, { headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${owner.token}` } });
  assert.ok([401, 403].includes(denied.status), 'Browser token cannot directly read private table');
  if (mockFailure) throw mockFailure;
  assert.ok(!output.includes('chat.capture_failed'), 'No failed local capture writes');
  assert.ok(!output.includes('천안 공지 보여줘. 지난 공지도 포함해줘.'), 'Question text must stay out of server logs');
  assert.ok(!output.includes('로컬 연결 검증 답변입니다.'), 'Answer text must stay out of server logs');
  const result = { passed: true, database: 'knupick-rag-eval', requests: 2, mockModelCalls: modelCalls, paidModelCalls: 0, productionRequests: 0,
    scenarios: ['real auth and owner scope', 'SSE ID and after terminal persistence', 'live database evidence and follow-up linkage', 'feedback and review independence', 'JSON summary projection', 'private Data API denied'] };
  await writeFile('../observation-local-verification.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally {
  if (child && child.exitCode === null) {
    const closed = new Promise(resolve => child.once('close', resolve));
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else child.kill('SIGTERM');
    await closed;
  }
  await new Promise(resolve => model.close(resolve));
  for (const id of userIds) {
    await admin.from('rate_limits').delete().eq('key', `chat-observation-write:${id}`);
    const deleted = await admin.auth.admin.deleteUser(id); assert.equal(deleted.error, null, 'Remove only the temporary local test user');
  }
}
