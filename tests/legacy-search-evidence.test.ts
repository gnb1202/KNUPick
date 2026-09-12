import { expect, it } from 'vitest';
import { searchEvidence, sourceContext } from '@/lib/legacy/chat-search-evidence';
import type { SearchedPost } from '@/lib/legacy/post-search';
import sources from './fixtures/legacy-search-sources.json';

it('preserves the original residence alternative and fourth-year/course requirements that summaries omitted', () => {
  const posts = sources as SearchedPost[];
  const evidence = searchEvidence(posts);
  const first = sourceContext(posts[0],evidence);
  expect(JSON.stringify(first.source_passages)).toContain('경기도내 거주 또는 경기도내 소재한 대학(원)');
  expect(first.discovery_summary).toBeNull();
  const second = JSON.stringify(sourceContext(posts[1],evidence));
  expect(second).toContain('현재 4학년'); expect(second).toContain('수강 필수');
  for(const e of evidence) expect(e.text_content).toBe(posts.find(p=>p.id===e.post_id)!.content!.slice(e.start_offset,e.end_offset));
});

it('keeps an eligibility passage late in a long body and bounds the total while sharing space across cards', () => {
  const condition = '지원자격: 경기도내 거주 또는 경기도내 소재 대학 재학생 및 휴학생. 필수 서류 확인.';
  const posts = Array.from({length:5},(_,i)=>({ ...sources[0],id:i,content:'소개글 '.repeat(600)+'\n'+condition+'\n'+'기타 안내 '.repeat(500) } as SearchedPost));
  const evidence=searchEvidence(posts);
  expect(evidence).toHaveLength(8);
  expect(new Set(evidence.slice(0,5).map(e=>e.post_id)).size).toBe(5);
  expect(evidence.slice(0,5).every(e=>e.text_content.includes(condition))).toBe(true);
  expect(evidence.every(e=>e.text_content.length<=1000)).toBe(true);
  expect(evidence.reduce((n,e)=>n+e.text_content.length,0)).toBeLessThanOrEqual(8000);
});

it('does not manufacture eligibility evidence from a summary when body/OCR is missing', () => {
  const post={...sources[0],content:null} as SearchedPost;
  expect(searchEvidence([post])).toEqual([]);
  expect(sourceContext(post,[])).toMatchObject({source_passages:[],source_status:expect.stringContaining('자격 판단 금지')});
});
