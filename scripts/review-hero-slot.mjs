import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';

const base = process.env.UI_TEST_URL || 'http://127.0.0.1:3028';
assert(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = resolve('backups/hero-slot-review');
mkdirSync(output, {recursive:true});
const words = ['공지,', '공모전,', '대외활동,', '인턴십,', '봉사활동,', '교육,', '장학금,', '공지,'];
const errors=[];
const browser=await puppeteer.launch({headless:true});
try {
  const page=await browser.newPage();
  page.on('pageerror', error=>errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request=>{
    const url=new URL(request.url());
    if (url.origin !== new URL(base).origin) {
      if (url.hostname === 'cdn.jsdelivr.net' && /pretendard/.test(url.pathname)) return void request.continue();
      return void request.abort();
    }
    if (url.pathname.startsWith('/api/')) return void request.respond({status:200,contentType:'application/json',body:JSON.stringify(url.pathname==='/api/posts/stats'
      ? {date:'2026-09-13',timeZone:'Asia/Seoul',todayCount:0,recentCount:201}
      : {posts:[],total:0,departments:[]})});
    void request.continue();
  });
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'},{name:'prefers-color-scheme',value:'light'}]);
  await page.goto(base,{waitUntil:'networkidle0'});
  await page.waitForSelector('.hero-slot-track');
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.$eval('h1',el=>el.getAttribute('aria-label')),'당신을 위한 공지, 여기서 PICK');
  assert.equal(await page.$eval('.hero-word-slot',el=>el.getAttribute('aria-hidden')),'true');

  async function sample(time) {
    return page.evaluate(async time=>{
      const animation=document.querySelector('.hero-slot-track').getAnimations()[0];
      animation.pause();
      animation.currentTime=time;
      await new Promise(requestAnimationFrame);
      const viewport=document.querySelector('.hero-word-slot').getBoundingClientRect();
      const center=viewport.top+viewport.height/2;
      const word=[...document.querySelectorAll('.hero-slot-item')].find(el=>{
        const rect=el.getBoundingClientRect();
        return rect.top<=center && rect.bottom>center;
      });
      const heading=document.querySelector('h1').getBoundingClientRect();
      const search=document.querySelector('.hero-search').getBoundingClientRect();
      return {word:word?.textContent, heading:{x:heading.x,y:heading.y,width:heading.width,height:heading.height},searchY:search.y,slot:{left:viewport.left,right:viewport.right,height:viewport.height},scroll:document.documentElement.scrollWidth,width:innerWidth};
    },time);
  }

  for (const width of [320,390,768,1440]) {
    await page.setViewport({width,height:900});
    const initial=await sample(1000);
    for (let index=0;index<words.length;index++) {
      const state=await sample(index*3000+1000);
      assert.equal(state.word,words[index],`Sequence at ${width}/${index}`);
      assert.deepEqual(state.heading,initial.heading,`Heading moved at ${width}/${index}`);
      assert.equal(state.searchY,initial.searchY,`Search moved at ${width}/${index}`);
      assert(state.scroll<=width && state.slot.left>=0 && state.slot.right<=width,`Overflow at ${width}/${index}`);
    }
    await sample(7000);
    await page.screenshot({path:resolve(output,`hero-${width}.png`)});
  }
  // The outgoing first word must travel down, then wrap to an identical first row.
  await sample(2400);
  const before=await page.$eval('.hero-slot-item:last-child',el=>el.getBoundingClientRect().top);
  await sample(2700);
  const moving=await page.$eval('.hero-slot-item:last-child',el=>el.getBoundingClientRect().top);
  assert(moving>before,'The reel must move downward');
  assert.equal((await sample(20999)).word,'공지,');
  assert.equal((await sample(21001)).word,'공지,');

  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'},{name:'prefers-color-scheme',value:'dark'}]);
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.hero-slot-track')).animationName==='none');
  const reduced=await page.$eval('.hero-word-slot',el=>{
    const rect=el.getBoundingClientRect();
    return document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2)?.textContent;
  });
  assert.equal(reduced,'공지,');
  await page.screenshot({path:resolve(output,'hero-reduced-dark.png')});
  assert.deepEqual(errors,[]);
  writeFileSync(resolve(output,'review.json'),JSON.stringify({passed:true,words,widths:[320,390,768,1440],direction:'down',intervalMs:3000,transitionMs:600,reducedMotion:'공지',errors,mockedAPIs:true},null,2));
  console.log(`Hero slot review passed: sequence, downward motion, wrap, stable layout and reduced motion. ${output}`);
} finally {await browser.close();}
