import puppeteer from 'puppeteer';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Local visual/interaction review. All application APIs are intercepted.
const base = process.env.UI_TEST_URL || 'http://127.0.0.1:3014';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const before = process.argv.includes('--before');
const output = resolve('backups/brand-review', before ? 'before' : 'after');
mkdirSync(output, { recursive: true });
const date = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const titles = [
  '2026학년도 2학기 교내 장학금 신청 안내',
  '지역의 문제를 함께 푸는 공공데이터 아이디어 공모전',
  '가을학기 국제교류 프로그램 참가자 모집',
  '현직자와 함께하는 직무 탐색 워크숍',
  '우리 지역을 기록하는 대학생 서포터즈 모집',
  '겨울방학 현장실습 참여 학생 모집 안내',
];
const posts = titles.map((title, i) => ({
  id: i + 1, title,
  content: '지원 조건과 신청 기간을 확인한 뒤 공지 원문에서 신청해 주세요.',
  summary: [
    '이번 학기 장학 제도와 지원 자격을 확인하세요. 신청 서류와 접수 방법을 안내합니다.',
    '데이터로 지역의 변화를 제안해 보세요. 아이디어를 나누고 팀으로 도전할 수 있어요.',
    '새로운 언어와 문화를 경험할 기회. 프로그램별 지원 조건과 선발 일정을 확인하세요.',
  ][i % 3],
  original_url: `https://example.invalid/notice/${i + 1}`,
  posted_date: date(-i), deadline: date([2, 7, 12, 18, 22, 30][i]),
  activity_types: [[7], [1], [2], [6], [3], [4]][i],
  keywords: ['재학생', '모집'], campus: ['common', 'kongju', 'cheonan', 'yesan'][i % 4],
}));
const browser = await puppeteer.launch({ headless: true });
const errors = [];
let statsScenario = 'normal';
const statsRequests = [];
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin !== new URL(base).origin) {
      if (url.hostname === 'cdn.jsdelivr.net' && /pretendard/.test(url.pathname)) return void request.continue();
      return void request.abort();
    }
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/posts/stats') {
        statsRequests.push(statsScenario);
        return void request.respond({ status: statsScenario === 'error' ? 503 : 200, contentType: 'application/json', body: JSON.stringify(statsScenario === 'error' ? { error: 'Unavailable' } : { date: date(0), timeZone: 'Asia/Seoul', todayCount: statsScenario === 'zero' ? 0 : 1, recentCount: posts.length }) });
      }
      const types = url.searchParams.get('activityTypes')?.split(',').map(Number);
      const campus = url.searchParams.get('campus');
      const filtered = posts.filter(p => (!types || p.activity_types.some(t => types.includes(t))) && (!campus || p.campus === campus || p.campus === 'common') && (url.searchParams.get('posted') !== 'today' || (statsScenario !== 'zero' && p.posted_date === date(0))));
      return void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ posts: filtered, total: filtered.length, departments: [] }) });
    }
    void request.continue();
  });
  await page.setViewport({ width: 1440, height: 1040, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
  if (!before) {
    await page.goto(`${base}/?noticeView=overview`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.querySelector('[data-stat="recent"]')?.innerText === '6');
    assert.equal(await page.$eval('.notice-summary', el => el.dataset.variant), 'user');
    assert.equal(await page.$('.notice-comparison'), null);
    assert(await page.$eval('.notice-summary', el => el.innerText.includes('최근 30일') && !el.innerText.includes('누적 공지')));
  }
  await page.goto(`${base}/?preview=b&compare=notices&noticeView=user`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.innerText.includes('2026학년도 2학기 교내 장학금'));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(output, 'desktop-light.png'), fullPage: true });
  if (before) {
    console.log(`Baseline saved: ${output}`);
  } else {
    assert.equal(await page.$eval('h1', el => el.innerText.replace(/\s/g, '')), '당신을위한공지,여기서PICK');
    await page.focus('[aria-label="공지 검색"]');
    await page.keyboard.type('장학금');
    await page.waitForFunction(() => document.querySelectorAll('.notice-card').length === 1);
    await page.click('[aria-label="검색어 지우기"]');
    await page.waitForFunction(() => document.querySelectorAll('.notice-card').length === 6);
    await page.focus('[aria-label="공지 검색"]');
    await page.keyboard.type('없는공지검색어');
    await page.waitForFunction(() => document.querySelectorAll('.notice-card').length === 0);
    await page.screenshot({ path: resolve(output, 'empty-search.png'), fullPage: true });
    await page.locator('::-p-text(전체 보기)').click();
    await page.waitForFunction(() => document.querySelectorAll('.notice-card').length === 6 && document.querySelector('[aria-label="공지 검색"]').value === '');
    await page.click('.activity-filters button[data-type="7"]');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('types') === '7' && document.querySelectorAll('.notice-card').length === 1);
    assert.equal(await page.$eval('.activity-filters button[data-type="7"]', el => el.getAttribute('aria-pressed')), 'true');
    await page.click('[data-variant-option="overview"]');
    await page.waitForFunction(() => document.querySelector('.notice-summary').dataset.variant === 'overview');
    assert.equal(await page.$eval('[data-stat="recent"]', el => el.innerText), '6');
    assert.equal(new URL(page.url()).searchParams.get('types'), '7');
    await page.click('.activity-filters button[data-type="1"]');
    await page.waitForFunction(() => document.querySelectorAll('.notice-card').length === 2);
    await page.click('.activity-filters button[data-type="all"]');
    await page.waitForFunction(() => document.querySelectorAll('.notice-card').length === 6);
    await page.click('[data-action="today"]');
    await page.waitForFunction(() => document.querySelectorAll('.notice-card').length === 1 && new URL(location.href).searchParams.get('period') === 'today');
    await page.click('[data-variant-option="user"]');
    await page.waitForFunction(() => document.querySelector('.notice-summary').dataset.variant === 'user');
    assert.equal(new URL(page.url()).searchParams.get('period'), 'today');
    await page.click('.notice-active-period button');
    await page.waitForFunction(() => document.querySelectorAll('.notice-card').length === 6);
    await page.screenshot({ path: resolve(output, 'notice-user-desktop.png'), fullPage: true });
    await page.click('[data-variant-option="overview"]');
    await page.waitForFunction(() => document.querySelector('.notice-summary').dataset.variant === 'overview');
    await page.screenshot({ path: resolve(output, 'notice-overview-desktop.png'), fullPage: true });
    await page.focus('.brand-lockup');
    await page.keyboard.press('Tab');
    const focus = await page.$eval('.site-nav a', el => ({ style: getComputedStyle(el).outlineStyle, width: getComputedStyle(el).outlineWidth }));
    assert.notEqual(focus.style, 'none');
    assert.notEqual(focus.width, '0px');
    await page.evaluate(() => document.activeElement.blur());
    await page.evaluate(() => { localStorage.setItem('theme', 'dark'); window.dispatchEvent(new Event('knupick-theme')); });
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
    await page.screenshot({ path: resolve(output, 'desktop-dark.png'), fullPage: true });
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.screenshot({ path: resolve(output, 'mobile-dark.png'), fullPage: true });
    await page.evaluate(() => { localStorage.setItem('theme', 'light'); window.dispatchEvent(new Event('knupick-theme')); });
    await page.waitForFunction(() => !document.documentElement.classList.contains('dark'));
    await page.screenshot({ path: resolve(output, 'mobile-light.png'), fullPage: true });
    await page.screenshot({ path: resolve(output, 'notice-overview-mobile.png'), fullPage: true });
    await page.click('[data-variant-option="user"]');
    await page.waitForFunction(() => document.querySelector('.notice-summary').dataset.variant === 'user');
    await page.screenshot({ path: resolve(output, 'notice-user-mobile.png'), fullPage: true });
    for (const variant of ['overview', 'user']) {
      await page.click(`[data-variant-option="${variant}"]`);
      await page.waitForFunction(value => document.querySelector('.notice-summary').dataset.variant === value, {}, variant);
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewport({ width, height: 900 });
        const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
        assert(overflow.scroll <= overflow.client + 1, `Horizontal overflow for ${variant} at ${width}: ${JSON.stringify(overflow)}`);
        assert(await page.$$eval('.campus-tabs button', buttons => buttons.every(button => button.getBoundingClientRect().height < 50)), `Campus labels wrap at ${width}`);
        await page.click('.department-trigger');
        const menu = await page.$eval('.department-menu', el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, width: innerWidth }));
        assert(menu.left >= 0 && menu.right <= menu.width, `Department menu overflows at ${width}`);
        await page.keyboard.press('Escape');
      }
    }
    await page.setViewport({ width: 390, height: 844 });
    await page.click('[aria-label="AI에게 물어보기"]');
    await page.waitForSelector('textarea');
    await page.screenshot({ path: resolve(output, 'mobile-chat.png'), fullPage: true });
    await page.click('[aria-label="닫기"]');
    statsScenario = 'zero';
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.querySelector('[data-stat="today"]').innerText === '0');
    assert.equal(await page.$eval('[data-stat="recent"]', el => el.innerText), '6');
    assert.equal((await page.$$('.notice-card')).length, 6);
    await page.click('[data-action="today"]');
    await page.waitForSelector('.notice-today-empty');
    await page.screenshot({ path: resolve(output, 'notice-today-empty.png'), fullPage: true });
    await page.click('.notice-today-empty button');
    await page.waitForFunction(() => document.querySelectorAll('.notice-card').length === 6);
    statsScenario = 'error';
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.notice-stats-error');
    assert.equal(await page.$eval('[data-stat="today"]', el => el.innerText), '—');
    assert.equal(await page.$eval('[data-stat="recent"]', el => el.innerText), '—');
    statsScenario = 'normal';
    // Reload preserves the scroll position. Center the retry target below the sticky header.
    await page.$eval('.notice-stats-error button', button => button.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.waitForFunction(() => {
      const button = document.querySelector('.notice-stats-error button');
      const rect = button.getBoundingClientRect();
      return !button.disabled && document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('button') === button;
    });
    await page.click('.notice-stats-error button');
    await page.waitForFunction(() => document.querySelector('[data-stat="today"]').innerText === '1');
    await page.goto(`${base}/calendar`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.calendar-day');
    await page.click(`.calendar-day[data-date="${date(2)}"]`);
    await page.waitForFunction(title => document.querySelector('.calendar-details').innerText.includes(title), {}, titles[0]);
    await page.screenshot({ path: resolve(output, 'mobile-calendar.png'), fullPage: true });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewport({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Calendar overflow at ${width}`);
      const cellWidth = await page.$eval('.calendar-day', el => el.getBoundingClientRect().width);
      assert(cellWidth > 30, `Collapsed calendar at ${width}`);
    }
    await page.screenshot({ path: resolve(output, 'desktop-calendar.png'), fullPage: true });
    await page.setViewport({ width: 390, height: 844 });
    for (const path of ['login', 'signup']) {
      await page.goto(`${base}/${path}`, { waitUntil: 'networkidle0' });
      assert.equal(await page.$eval('h1', el => el.innerText), 'KNUPICK');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} overflow`);
      await page.screenshot({ path: resolve(output, `mobile-${path}.png`), fullPage: true });
    }
    assert.deepEqual(errors, []);
    writeFileSync(resolve(output, 'review.json'), JSON.stringify({ mockedAPIs: true, errors, checks: ['notice layout comparison/filter persistence', 'today filter and return', 'zero notices/empty state', 'failed counts/retry', 'search', 'empty results/reset', 'clear', 'multiple category filtering/reset', 'keyboard focus', 'theme switch', 'both variants at 320/390/768/1440px without overflow', 'department menu/Escape', 'chat panel', 'calendar date details and responsive layout', 'login/signup branding'], screenshots: output }, null, 2));
    console.log(`Brand UI review passed. Mocked APIs; no paid calls. Screenshots: ${output}`);
  }
} catch (error) {
  const pages = await browser.pages();
  const failedPage = pages[pages.length - 1];
  await failedPage.screenshot({ path: resolve(output, 'failure.png'), fullPage: true });
  console.error(JSON.stringify({ statsRequests, state: await failedPage.evaluate(() => ({
    url: location.href, summary: document.querySelector('.notice-summary')?.textContent,
    retry: (() => { const button = document.querySelector('.notice-stats-error button'); if (!button) return null; const rect = button.getBoundingClientRect(); return { disabled: button.disabled, top: rect.top, bottom: rect.bottom, hit: document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.outerHTML.slice(0, 200) }; })(),
  })) }));
  throw error;
} finally {
  await browser.close();
}
