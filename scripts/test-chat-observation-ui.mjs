import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import nextEnv from '@next/env';
import puppeteer from 'puppeteer';
nextEnv.loadEnvConfig(process.cwd(), true);
const url = process.env.CHAT_UI_URL || 'http://127.0.0.1:3026';
if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw Error('Use a local verification server');
const origin = new URL(url).origin, authOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
const owner = randomUUID(), requestId = randomUUID();
const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'test@example.invalid', created_at: new Date().toISOString() };
const expires = Math.floor(Date.now() / 1000) + 3600;
const jwt = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: owner, exp: expires, role: 'authenticated' })).toString('base64url'), 'fixture-signature'].join('.');
const session = { access_token: jwt, refresh_token: 'fixture-refresh', expires_at: expires, expires_in: 3600, token_type: 'bearer', user };
const storageKey = `sb-${new URL(authOrigin).hostname.split('.')[0]}-auth-token`;
const chats = [], votes = [], errors = [], blocked = [];
let feedback = { rating: null, reasons: [], comment: null, updatedAt: null }, failVote = true, holdChat = false, pending;
let review = { review_verdict: 'unreviewed', review_reasons: [], review_comment: null, reviewed_by: null, reviewed_at: null }, failReview = true;
let failList = false;
const failedId = randomUUID(), staleId = randomUUID(), now = new Date().toISOString();
const versions = { model: 'gpt-4o', mode: 'agentic', deployment: 'fixture-build', planningPrompt: 'fixture-prompt-v1' };
const summaries = () => [
  { request_id: requestId, started_at: now, status: 'completed', question: '관측 대화', duration_ms: 1500, first_text_ms: 1000, error_code: null,
    versions, result_count: 2, usage: { version: 'chat-embedding-v1', complete: true, calls: [{ id: 1, kind: 'chat', model: 'gpt-4o', inputTokens: 1000, outputTokens: 100, complete: true }] },
    capture_truncated: false, feedback_rating: feedback.rating, review_verdict: review.review_verdict, review_reasons: review.review_reasons },
  { request_id: failedId, started_at: now, status: 'error', question: '실패한 질문', duration_ms: 3000, first_text_ms: null, error_code: 'SEARCH_FAILED',
    versions: { ...versions, planningPrompt: 'fixture-prompt-v2' }, result_count: null, usage: null, capture_truncated: false, feedback_rating: null, review_verdict: 'unreviewed', review_reasons: [] },
  { request_id: staleId, started_at: new Date(Date.now() - 600000).toISOString(), status: 'in_progress', question: '종료 누락', duration_ms: null, first_text_ms: null, error_code: null,
    versions, result_count: null, usage: null, capture_truncated: false, feedback_rating: null, review_verdict: 'unreviewed', review_reasons: [] },
];
const detail = () => ({ ...summaries()[0], tester_user_id: owner, session_id: randomUUID(), previous_request_id: null, ended_at: now,
  expires_at: new Date(Date.now() + 86400000).toISOString(), effective_status: 'completed', revision: 3, consent_version: 'chat-observation-v1',
  feedback_reasons: feedback.reasons, feedback_comment: feedback.comment, feedback_updated_at: feedback.updatedAt, ...review,
  payload: { question: '관측 대화', answer: '관측 테스트 답변', versions, history: [{ role: 'user', content: '관측 대화' }], reference: null,
    search: { path: 'metadata', resultCount: 2, args: { semantic_query: '컴퓨터공학' } }, posts: [],
    evidence: [{ ref: 'E1', post_id: 1, url: 'https://example.invalid/notice', text_content: '<script>window.fixtureXss=true</script> 신청 마감 원문', content_hash: 'fixture-hash', start_offset: 0, end_offset: 50 },
      { ref: 'E2', url: 'javascript:window.fixtureXss=true', text_content: '위험한 링크' }],
    calls: [{ seq: 1, name: 'search_posts', startedMs: 200, durationMs: 150, status: 'success', input: { topic: '컴퓨터공학' }, output: { resultCount: 2 } }],
    usage: summaries()[0].usage, captureTruncated: false, redactionVersion: 'pii-patterns-v1', schemaVersion: 'chat-observation-v1' } });
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 1000 });
  await page.evaluateOnNewDocument((key, value) => localStorage.setItem(key, JSON.stringify(value)), storageKey, session);
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', async request => {
    const target = new URL(request.url());
    const json = (body, status = 200) => request.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (target.origin === authOrigin) {
      if (target.pathname.includes('/auth/v1/user')) return json(user);
      if (target.pathname.includes('/rest/v1/profiles')) return json({ id: owner, username: 'test-observer', is_admin: false });
      return json([]);
    }
    if (target.origin !== origin) { blocked.push(target.origin); return request.abort(); }
    if (target.pathname === '/api/chat/observation-access') return json({ canRead: true, canRecord: true });
    if (target.pathname === '/api/admin/chat-observations') {
      assert.equal(request.headers().authorization, `Bearer ${jwt}`);
      if (failList) { failList = false; return json({ error: '검증용 목록 실패' }, 503); }
      return json({ rows: summaries(), hasMore: false, limit: 200, asOf: now, from: new Date(Date.now() - 7 * 86400000).toISOString() });
    }
    if (target.pathname.startsWith('/api/admin/chat-observations/')) {
      assert.equal(request.headers().authorization, `Bearer ${jwt}`);
      if (!target.pathname.endsWith(requestId)) return json({ error: '기록을 찾을 수 없어요.' }, 404);
      if (request.method() === 'PATCH') {
        if (failReview) { failReview = false; return json({ error: '검증용 검토 저장 실패' }, 503); }
        const value = JSON.parse(request.postData()), reset = value.verdict === 'unreviewed';
        review = { review_verdict: value.verdict, review_reasons: reset ? [] : value.reasons, review_comment: reset ? null : value.comment?.replace(/me@example.org/g, '[이메일]') ?? null,
          reviewed_by: reset ? null : owner, reviewed_at: reset ? null : new Date().toISOString() };
        return json({ review });
      }
      return json(detail());
    }
    if (target.pathname === '/api/chat/feedback') {
      assert.equal(request.headers().authorization, `Bearer ${jwt}`);
      const value = JSON.parse(request.postData()); votes.push(value);
      if (failVote) { failVote = false; return json({ error: '검증용 저장 실패' }, 503); }
      feedback = { rating: value.rating, reasons: value.rating ? value.reasons : [], comment: value.rating ? value.comment?.replace(/me@example.org/g, '[이메일]') ?? null : null, updatedAt: new Date().toISOString() };
      return json({ feedback });
    }
    if (target.pathname === '/api/chat') {
      chats.push({ headers: request.headers(), body: JSON.parse(request.postData()) });
      if (holdChat) { pending = request; return; }
      const captured = request.headers()['x-chat-observation'] === 'chat-observation-v1';
      const events = [{ type: 'text', delta: captured ? '관측 테스트 답변' : '일반 대화 응답' }, { type: 'done', requestId, contextToken: 'fixture-context' }];
      return request.respond({ status: 200, contentType: 'text/event-stream', headers: { 'X-Request-Id': requestId, ...(captured ? { 'X-Chat-Observation': 'requested' } : {}) },
        body: events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') });
    }
    if (target.pathname.startsWith('/api/')) return json({ posts: [], total: 0, departments: [] });
    return request.continue();
  });
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.click('button[aria-label="AI에게 물어보기"]');
  const input = 'textarea[placeholder="뭐든지 물어보세요"]';
  await page.waitForSelector('input[aria-label="품질 확인용 대화 기록"]');
  const send = async question => {
    await page.type(input, question); await page.keyboard.press('Enter');
    await page.waitForFunction(selector => !document.querySelector(selector)?.disabled, {}, input);
  };
  await send('일반 대화');
  assert.equal(chats[0].headers['x-chat-observation'], undefined);
  assert.equal(await page.$$eval('[data-chat-feedback]', els => els.length), 0);
  await page.click('input[aria-label="품질 확인용 대화 기록"]');
  await page.waitForFunction(() => !document.body.innerText.includes('일반 대화 응답'));
  await send('관측 대화');
  await page.waitForSelector('[data-chat-feedback]');
  assert.equal(chats[1].body.messages.length, 1);
  assert.match(chats[1].headers['x-chat-session-id'], /^[a-f0-9-]{36}$/);
  assert.equal(chats[1].headers.authorization, `Bearer ${jwt}`);
  await page.click('button[aria-label="도움이 되지 않았어요"]');
  await page.waitForFunction(() => document.body.innerText.includes('검증용 저장 실패'));
  assert.equal(await page.$eval('button[aria-label="도움이 되지 않았어요"]', e => e.getAttribute('aria-pressed')), 'false');
  await page.$$eval('[data-chat-feedback] button', els => els.find(e => e.textContent === '다시 저장').click());
  await page.waitForSelector('[data-chat-feedback] fieldset');
  const choices = await page.$$('[data-chat-feedback] input[type="checkbox"]'); await choices[2].click();
  await page.type('textarea[aria-label="답변 평가 추가 의견"]', '날짜 확인 필요 me@example.org');
  await page.$$eval('[data-chat-feedback] button', els => els.find(e => e.textContent === '사유 저장').click());
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="답변 평가 추가 의견"]')?.value.includes('[이메일]'));
  assert.deepEqual(feedback.reasons, ['fact']); assert.equal(votes.at(-1).requestId, requestId);
  await page.screenshot({ path: '../observation-feedback-desktop.png' });
  await page.setViewport({ width: 390, height: 844 });
  await page.screenshot({ path: '../observation-feedback-mobile.png' });
  await page.locator('button[aria-label="닫기"]').click();
  await page.locator('button[aria-label="AI에게 물어보기"]').click();
  await page.waitForSelector('[data-chat-feedback]', { visible: true });
  assert.equal(await page.$eval('button[aria-label="도움이 되지 않았어요"]', e => e.getAttribute('aria-pressed')), 'true');
  await page.locator('button[aria-label="도움이 됐어요"]').click();
  await page.waitForFunction(() => document.querySelector('button[aria-label="도움이 됐어요"]')?.getAttribute('aria-pressed') === 'true');
  await page.locator('button[aria-label="도움이 됐어요"]').click();
  await page.waitForFunction(() => document.querySelector('button[aria-label="도움이 됐어요"]')?.getAttribute('aria-pressed') === 'false');
  assert.equal(feedback.rating, null); assert.deepEqual(feedback.reasons, []); assert.equal(feedback.comment, null);
  holdChat = true;
  await page.type(input, '중단할 질문'); await page.keyboard.press('Enter');
  await page.waitForSelector('.chat-waiting');
  await page.$$eval('button', els => els.find(e => e.textContent === '중지').click());
  await page.waitForFunction(() => document.body.innerText.includes('답변 생성을 중지했어요.'));
  assert.equal(await page.$$eval('.chat-waiting', els => els.length), 0);
  if (pending) await pending.abort().catch(() => {});
  await page.setViewport({ width: 1440, height: 1050 });
  await page.goto(`${origin}/admin/chat-observations`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-review-row]');
  assert.equal(await page.$eval('[data-review-count]', e => e.textContent), '3건');
  assert.match(await page.$eval('.observation-metrics', e => e.textContent), /종료 미확인 1/);
  const versionOptions = await page.$$eval('select[aria-label="실행 버전"] option', els => els.map(e => e.value));
  assert.equal(versionOptions.length, 3);
  await page.select('select[aria-label="실행 버전"]', versionOptions[1]);
  assert.equal(await page.$eval('[data-review-count]', e => e.textContent), '2건');
  await page.select('select[aria-label="실행 버전"]', '');
  await page.locator(`[data-review-row="${requestId}"]`).click();
  await page.waitForSelector('select[aria-label="검토 판정"]');
  assert.equal(await page.evaluate(() => window.fixtureXss), undefined);
  assert.equal(await page.$$eval('.observation-detail a[href^="javascript:"]', els => els.length), 0);
  assert.match(await page.$eval('.observation-detail', e => e.textContent), /fixture-hash/);
  await page.select('select[aria-label="검토 판정"]', 'issue');
  await page.locator('.observation-review input[type="checkbox"]').click();
  await page.type('textarea[aria-label="검토 메모"]', '원문 검토 me@example.org');
  await page.locator('.observation-review button').click();
  await page.waitForFunction(() => document.body.innerText.includes('검증용 검토 저장 실패'));
  assert.equal(review.review_verdict, 'unreviewed');
  assert.doesNotMatch(await page.$eval('.observation-review', e => e.textContent), /검토가 저장됐습니다/);
  await page.locator('.observation-review button').click();
  await page.waitForFunction(() => document.body.innerText.includes('검토가 저장됐습니다.'));
  assert.equal(review.review_verdict, 'issue'); assert.equal(review.review_comment, '원문 검토 [이메일]');
  assert.equal(feedback.rating, null);
  await page.select('select[aria-label="검토 사유"]', 'intent');
  assert.equal(await page.$eval('[data-review-count]', e => e.textContent), '1건');
  await page.select('select[aria-label="검토 사유"]', 'fact');
  assert.equal(await page.$eval('[data-review-count]', e => e.textContent), '0건');
  await page.select('select[aria-label="검토 사유"]', '');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: '../observation-review-desktop.png' });
  await page.setViewport({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: '../observation-review-mobile.png' });
  await page.select('select[aria-label="검토 대상"]', 'issue');
  assert.equal(await page.$eval('[data-review-count]', e => e.textContent), '1건');
  await page.select('select[aria-label="검토 판정"]', 'unreviewed');
  await page.locator('.observation-review button').click();
  await page.waitForFunction(() => document.querySelector('[data-review-count]')?.textContent === '0건');
  assert.deepEqual(review.review_reasons, []); assert.equal(review.review_comment, null);
  await page.select('select[aria-label="검토 대상"]', '');
  await page.locator(`[data-review-row="${failedId}"]`).click();
  await page.waitForFunction(() => document.body.innerText.includes('기록을 찾을 수 없어요.'));
  assert.equal(await page.$('select[aria-label="검토 판정"]'), null);
  failList = true;
  await page.locator('.observation-page header button').click();
  await page.waitForFunction(() => document.body.innerText.includes('검증용 목록 실패'));
  assert.equal(await page.$$eval('[data-review-row]', els => els.length), 0);
  await page.locator('.observation-page header button').click();
  await page.waitForSelector('[data-review-row]');
  await page.evaluate(key => { localStorage.removeItem(key); }, storageKey);
  const anonymous = await browser.newPage(); await anonymous.setRequestInterception(true);
  anonymous.on('request', request => new URL(request.url()).origin === origin ? request.continue() : request.abort());
  await anonymous.goto(`${origin}/admin/chat-observations`, { waitUntil: 'networkidle0' });
  await anonymous.waitForFunction(() => document.body.innerText.includes('허용된 테스트 계정으로 로그인해주세요.'));
  assert.equal(await anonymous.$('[data-review-row]'), null); await anonymous.close();
  assert.deepEqual(errors, []);
  const result = { passed: true, scenarios: ['explicit opt-in and new conversation', 'authenticated capture headers', 'unobserved answers have no feedback',
    'failed save remains unselected and can retry', 'reasons and redacted note', 'feedback survives close and reopen', 'vote switch and withdrawal', 'generation stop',
    'owner review list and version filters', 'missing finalization denominator', 'escaped evidence and safe source links',
    'review failure retry redaction and independence', 'review filters and reset', 'missing detail and list retry', 'mobile overflow and unauthenticated page'],
    modelCalls: 0, productionRequests: 0, blockedExternalOrigins: [...new Set(blocked)] };
  await writeFile('../observation-ui-verification.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally { await browser.close(); }
