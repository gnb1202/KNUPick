import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';

const url = process.env.CHAT_UI_URL || 'http://127.0.0.1:3026';
if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw Error('Use a local verification server');
const post = { id: 772, title: '교환학생 선발 안내', summary: '접수 일정과 제출 방법',
  original_url: 'https://www.kongju.ac.kr/bbs/KNU/2132/431798/artclView.do?layout=unknown',
  deadline: '2026-10-11', event_start_date: null, activity_types: [8], campus: 'common' };
const source = '이메일 접수: 10월 11일까지. 실물서류 제출: 10월 13일까지. <script>window.sourceExecuted=true</script>';
const evidence = { ref: 'E1', post_id: 772, source_key: 'body', kind: 'body', url: post.original_url,
  text_content: source, start_offset: 0, end_offset: source.length };
const sse = events => events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join('');
const requests = [], errors = [], externalRequests = [];
const searchError = '공지 검색 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.';
const planError = '요청을 검색 조건으로 처리하지 못했어요. 잠시 후 다시 시도해주세요.';
const answerError = '답변 생성 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.';
const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', async request => {
    const target = new URL(request.url());
    if (target.origin !== new URL(url).origin) {
      externalRequests.push(target.origin);
      await request.abort(); return;
    }
    if (target.pathname === '/api/chat') {
      requests.push(JSON.parse(request.postData()));
      const index = requests.length - 1;
      if (index === 4) {
        await request.respond({ status: 400, contentType: 'application/json',
          body: JSON.stringify({ code: 'INVALID_CONTEXT', error: '이전 공지 연결 정보가 만료되었어요.' }) }); return;
      }
      const events = index === 0 ? [
        { type: 'posts', posts: [post, { ...post, id: 669, title: '다른 교환학생 안내' }] },
        { type: 'text', delta: '공지 두 건을 찾았어요.' }, { type: 'done', contextToken: 'signed-first' },
      ] : index === 1 ? [
        { type: 'posts', posts: [post] }, { type: 'evidence', evidence: [evidence] },
        { type: 'text', delta: '> 이메일 접수: 10월 11일까지\\. 실물서류 제출: 10월 13일까지\\. [E1]' },
        { type: 'done', contextToken: 'signed-followup' },
      ] : index === 2 ? [
        { type: 'posts', posts: [{ ...post, id: 100, title: '연결 중단 직전 새 공지' }] },
        { type: 'text', delta: '완료 이벤트 없는 응답' },
      ] : index === 3 ? [
        { type: 'posts', posts: [post] }, { type: 'text', delta: '새 공지 검색 완료' },
        { type: 'done', contextToken: 'signed-recovery' },
      ] : index === 6 ? [{ type:'error',code:'SEARCH_FAILED',message:searchError }]
      : index === 7 ? [{ type:'error',code:'SEARCH_PLAN_FAILED',message:planError }]
      : index === 8 ? [{ type:'posts',posts:[post] },{ type:'evidence',evidence:[evidence] },
        { type:'text',delta:'참가 대상은' },{ type:'error',code:'ANSWER_FAILED',message:answerError }]
      : index === 9 ? [{ type:'text',delta:'오류 후 복구 완료' },{ type:'done' }]
      : [
        { type: 'posts', posts: [] }, { type: 'text', delta: '새 검색 준비 완료' }, { type: 'done' },
      ];
      await request.respond({ status: 200, contentType: 'text/event-stream', body: sse(events) }); return;
    }
    if (target.pathname.startsWith('/api/')) {
      await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ posts: [], total: 0, departments: [] }) }); return;
    }
    await request.continue();
  });
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.click('button[aria-label="AI에게 물어보기"]');
  const input = 'textarea';
  await page.waitForSelector(input, { visible: true });
  const send = async (question, expected) => {
    await page.type(input, question);
    await page.keyboard.press('Enter');
    await page.waitForFunction(text => document.body.innerText.includes(text) && !document.querySelector('textarea')?.disabled, {}, expected);
  };
  await send('교환학생 공지 찾아줘', '공지 두 건을 찾았어요.');
  assert.equal(requests[0].contextToken, undefined);
  assert.ok(await page.evaluate(() => document.body.innerText.includes('1. 교환학생 선발 안내') && document.body.innerText.includes('2. 다른 교환학생 안내')));
  await send('첫 번째 공지의 마감은 언제야?', '실물서류 제출: 10월 13일까지.');
  assert.equal(requests[1].contextToken, 'signed-first');
  await page.click('[data-chat-evidence] summary');
  assert.equal(await page.$eval('[data-chat-evidence] a', element => element.href), post.original_url);
  assert.equal(await page.evaluate(() => window.sourceExecuted), undefined);
  assert.equal(await page.$$eval('[data-chat-evidence] script', elements => elements.length), 0);
  assert.ok(await page.$eval('[data-chat-evidence]', element => element.textContent.includes('<script>window.sourceExecuted=true</script>')));
  await page.screenshot({ path: '../quality-chat-followup-desktop.png' });
  await send('다른 공지 검색해줘', '답변 연결이 중단되었습니다. 다시 시도해주세요.');
  assert.equal(requests[2].contextToken, 'signed-followup');
  await send('새 공지 검색', '새 공지 검색 완료');
  assert.equal(requests[3].contextToken, undefined);
  await send('그 공지의 지원 조건은?', '이전 공지 연결 정보가 만료되었어요.');
  assert.equal(requests[4].contextToken, 'signed-recovery');
  await send('새 검색', '새 검색 준비 완료');
  assert.equal(requests[5].contextToken, undefined);
  await send('검색 실패 확인',searchError);
  assert.ok(await page.$eval('[data-chat-error]',element=>element.textContent.length>0));
  await send('계획 실패 확인',planError);
  await send('응답 중단 확인',answerError);
  assert.ok(await page.evaluate(()=>document.body.innerText.includes('답변이 중단되어 아래 내용은 일부만 표시됩니다.')));
  assert.ok(await page.evaluate(()=>document.body.innerText.includes('참가 대상은')));
  await page.$$eval('[data-chat-error]',elements=>elements.at(-1).scrollIntoView({block:'center',behavior:'instant'}));
  await page.screenshot({path:'../quality-chat-error-desktop.png'});
  await page.setViewport({width:390,height:844});
  await page.$$eval('[data-chat-error]',elements=>elements.at(-1).scrollIntoView({block:'center',behavior:'instant'}));
  await page.screenshot({path:'../quality-chat-error-mobile.png'});
  await send('다시 검색', '오류 후 복구 완료');
  assert.equal(requests[9].contextToken,undefined);
  assert.ok(requests[9].messages.filter(m=>m.role==='assistant').every(m=>!m.content.includes('참가 대상은')&&!m.content.includes(searchError)&&!m.content.includes(planError)));
  assert.ok(requests.every(request => request.messages.length <= 29 && request.messages.every(message => message.content.length <= 2000)));
  assert.deepEqual(errors, []);
  const result = { passed: true, scenarios: ['numbered cards', 'token round trip and source rendering', 'missing SSE completion', 'stale token reset after new cards', 'invalid token reset', 'next request recovery', 'search error message', 'planning error message', 'partial answer error and recovery without failed history'],
    requests: requests.length, externalRequestsBlocked: [...new Set(externalRequests)], modelCalls: 0, productionRequests: 0 };
  await writeFile('../quality-ui-verification.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
