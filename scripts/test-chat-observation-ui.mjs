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
  assert.deepEqual(errors, []);
  const result = { passed: true, scenarios: ['explicit opt-in and new conversation', 'authenticated capture headers', 'unobserved answers have no feedback',
    'failed save remains unselected and can retry', 'reasons and redacted note', 'feedback survives close and reopen', 'vote switch and withdrawal', 'generation stop'],
    modelCalls: 0, productionRequests: 0, blockedExternalOrigins: [...new Set(blocked)] };
  await writeFile('../observation-ui-verification.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally { await browser.close(); }
