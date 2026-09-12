import { expect, it } from 'vitest';
import { explicitReferencePlan } from '@/lib/chat-references';
import { resolvePlan } from '@/lib/search-plan';
const previous = { ids: [603,604,555,528], plan: resolvePlan({subject_terms:['BI 디자인 공모전'],primary_subject:'BI 디자인 공모전',include_expired:true}) };
it('uses all signed cards only when their count agrees, retaining signed display order', () => {
  for (const [count,word] of [[2,'두'],[3,'세']] as const) {
    const p = { ids: previous.ids.slice(0,count).reverse(), plan: previous.plan };
    const result = explicitReferencePlan('그 '+word+' 공지의 비용을 각각 알려줘',p);
    expect(result?.reference_indices).toEqual(Array.from({length:count},(_,i)=>i+1));
  }
  expect(explicitReferencePlan('그 두 공지의 비용은?',previous)?.intent).toBe('clarify');
  expect(() => explicitReferencePlan('그 두 공지의 비용은?')).toThrow('INVALID_REFERENCE');
  for(const q of ['그 두 공지 말고 새 공지', '그 두 공지의 차이점은?', '그 두 공지를 참고해 다른 공지를 찾아줘',
    '그 두 공지의 첫 번째 공지는 비용, 두 번째 공지는 서류'])
    expect(explicitReferencePlan(q,{...previous,ids:[1,2]})).toBeUndefined();
});
it('selects explicit single and multiple signed cards in requested order without reparsing their subject',()=>{
  expect(explicitReferencePlan('첫 번째 공지에서 누가 응모할 수 있는지, 디자인 항목과 상금을 정리해줘.',previous))
    .toMatchObject({intent:'detail',reference_index:1,inherit_previous:false,include_expired:true});
  expect(explicitReferencePlan('지금 보여준 두 번째 공지의 신청 대상과 방법, 마감 시각을 설명해줘.',previous)?.reference_index).toBe(2);
  expect(explicitReferencePlan('첫 번째와 두 번째 공지의 입실 비용과 제출서류 목록을 각각 비교해줘.',previous)?.reference_indices).toEqual([1,2]);
  expect(explicitReferencePlan('2번 공지와 1번 공지의 방법을 비교해줘',previous)?.reference_indices).toEqual([2,1]);
  expect(previous.plan.reference_index).toBeUndefined();
});
it('rejects absent, empty and out-of-range references and asks for a bounded multi-selection',()=>{
  expect(()=>explicitReferencePlan('첫 번째 공지의 조건은?')).toThrow('INVALID_REFERENCE');
  expect(()=>explicitReferencePlan('두 번째 공지의 방법은?',{...previous,ids:[]})).toThrow('INVALID_REFERENCE');
  expect(()=>explicitReferencePlan('0번 공지의 대상은?',previous)).toThrow('INVALID_REFERENCE');
  expect(()=>explicitReferencePlan('첫 번째와 5번 공지의 조건은?',previous)).toThrow('INVALID_REFERENCE');
  expect(explicitReferencePlan('1번과 2번과 3번과 4번 공지의 방법을 비교해줘',previous)?.intent).toBe('clarify');
});
it('leaves new topics, excluded cards, bus numbers and partial ambiguous selections to normal planning',()=>{
  for(const question of ['그 공모전은 지금도 접수할 수 있어?','2026년 2차 공모전 공지를 찾아줘','1번 버스의 운행 시간은?',
    '첫 번째 말고 두 번째 공지의 대상은?','첫 번째 공지 대신 새로운 AI 공모전을 찾아줘',
    '첫 번째 공지의 대상과 두 번째 공지의 비용은?','첫 번째 공지 또는 두 번째 공지를 골라줘',
    '첫 번째 공지를 참고해서 AI 교육을 찾아줘'])
    expect(explicitReferencePlan(question,previous)).toBeUndefined();
});
