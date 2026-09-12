# 전공 탐색과 복합 검색 보강

2026-09-12. 이 변경은 운영 legacy 챗봇의 검색 경로만 보강한다. 일반 검색, 개인화 추천, 기존 후속 질문의 원문 인용·서명된 카드 참조, 새 디자인은 유지한다. 기준 main은 2dbd273이며 배포 상태는 PR #7과 Vercel 배포 기록에서 확인한다.

## 확인한 문제와 최종 변경

운영의 “하이 나 컴퓨터공학과 4학년인데 공고 추천좀”에 0건이 반환됐다. KST 20:23:26 요청의 로그는 HTTP 200·검색 0건이며 원래 검색 인자는 기록되지 않았다. 별도 읽기 전용 조회에서 컴퓨터공학 0.328655, 컴퓨터공학과 4학년 0.340133, 사용자 문장 전체 0.319802로 모두 기존 기준 0.36 초과를 통과하지 못했다. 운영 요청의 정확한 도구 인자를 복원한 결과는 아니다.

- 검색 또는 안내를 명시적으로 선택하게 한다. 전공·주제가 있는데도 주제를 다시 요구하지 않는다. 도구 누락·잘못된 안내는 SEARCH_PLAN_FAILED로 구분한다.
- 넓은 전공 탐색에는 discovery_queries를 최대 3개 사용한다. 각 항목에 하나의 실무·학습 주제를 넣고 임베딩 배치 한 번으로 처리한다. 특정 주제·공지명을 명시한 경우는 기존 semantic_query 한 개를 사용하며 두 필드를 동시에 받지 않는다. 캠퍼스·학년·지원 자격을 전공에서 추정하여 필터로 추가하지 않는다.
- 전공 탐색의 각 주제에서 기존 기준 0.36을 넘는 상위 20개를 조회하고, 동일 가중치 RRF(k=60)로 합쳐 기본 5개를 반환한다. 중복 게시물 ID는 한 번만 반환한다. 기준을 낮추거나 다른 조건으로 빈 결과를 채우지 않는다. 여러 주제를 한 검색어로 합치는 초기 수정은 전자공학 반례에서 0건이어서 채택하지 않았다.
- 필터와 주제어가 함께 있으면 새 legacy_match_posts_filtered_at 함수가 활동유형·캠퍼스·마감 조건을 먼저 적용한 뒤 벡터 검색한다. 기존 구현은 이런 요청에서 주제어를 무시했다. 메타데이터만 있는 검색의 정렬은 유지한다.
- 검색 판단과 답변 프롬프트를 분리한다. 답변은 이번 제목·요약·날짜를 근거로 분야 연관성을 설명하며, 전공이나 학년만으로 지원 자격을 보증하지 않도록 지시한다. 공통 캠퍼스는 개최 장소가 아닌 공지 분류로 전달한다. 이는 프롬프트 지침이며 모든 표현 오류를 차단하는 검증기는 아니다.
- 임베딩·RPC·필터 조회 오류는 정상 0건과 구분하여 SEARCH_FAILED를 반환한다. 이런 경우 답변 모델을 호출하지 않는다.

이것은 전체 v2 전환이나 계획상의 키워드/벡터 하이브리드 검색 출시가 아니다. 이번 legacy 전공 탐색의 RRF는 최대 3개 주제별 벡터 결과를 합친다. 기존 legacy 후보 상한 20개를 유지했다. 별도 v2 계획의 키워드 30개·벡터 30개 결합과 혼동하지 않는다.

## 관측 결과

실제 로컬 API 핸들러, GPT-4o, text-embedding-3-small(1024차원), 운영 DB 271개 공지, 기준 날짜 2026-09-12를 사용했다. 최종 코드 해시는 로컬 discovery-review.json에 기록했다. 같은 제공자 요청은 캐시를 재사용했고, 스트림은 비용 정산을 위해 로컬 검사 도구에서 버퍼링했으므로 화면 스트리밍 지연 평가가 아니다.

| 질문 | 결과와 확인 범위 |
|---|---|
| 컴퓨터공학과 4학년 공고 추천 | 소프트웨어 개발·인공지능·데이터 분석으로 분리, 5개 ID 648·765·649·667·684 반환 |
| 전자공학 전공 공지 추천 | 회로 설계·신호 처리·반도체로 분리, 반도체 교육 ID 766 반환. 여러 주제를 합친 이전 후보는 0건 |
| 컴공인데 천안캠 인공지능 공모전 | 인공지능 주제, 공모전 [1], 천안+공통 캠퍼스 모두 적용. 5건 반환 |
| 독일 프랑스 교환학생 선발 | 정확한 공지 ID 772가 1위. 영어권 ID 669도 후순위로 포함되는 기존 한계 유지 |
| 내일 날씨 | out_of_scope 안내. 임베딩·공지 검색·답변 생성 호출 없음 |

검색 결과를 찾는 것과 사용자에게 실제 지원 자격이 있는 것은 다르다. 컴퓨터공학 결과의 ID 649 요약에는 경기도 소재 대학(원) 재학생·휴학생 제한이 있다. 이 후보를 KNU 학생의 지원 가능 추천으로 해석하면 안 된다. 답변이 이 조건을 생략하거나 공통 공지를 '참여 가능'이라고 일반화할 수 있어 자격 판정은 해결 완료로 표시하지 않는다. 중복 행사 공지도 남는다. 이번 사례는 개발 중 검증한 알려진 질문이며, 별도 정답셋 성능·추천 만족도·CTR 개선을 입증하지 않는다.

## 검증·비용·기록

- 7파일·79개 무료 테스트 통과. 필터를 top-k 전에 적용하는지, 기존 임계값·마감 조건·공통 캠퍼스 포함, 다중 주제 중복 제거·실패 처리·잘못된 입력, RPC 권한과 RLS·롤백, 기존 상세 인용과 카드 참조를 검사했다.
- 타입 검사·변경 파일 lint·빌드가 통과했다. 실제 배포 산출물은 Vercel이 생성하며 로컬 빌드는 가짜 환경 값으로 수행한다.
- 초기 실패와 최종 확인까지 고유 제공자 호출 25개, 관측 사용량 환산 179.175744원, 10% 여유분 포함 장부 증가 197.25원이다. 관리액 24,863.621744원, 25,000원 중단선까지 136.378256원이다. 과거 미정산 예약은 유지했다.
- 공식 요금은 [GPT-4o](https://developers.openai.com/api/docs/models/gpt-4o), [임베딩](https://developers.openai.com/api/docs/models/text-embedding-3-small)를 확인했고 예산 환율 1,600원/$를 사용했다. 위 환산액은 카드 청구서 금액이 아니다.
- 루트 작업 공간의 backups/release/chat-discovery-v1/check-discovery.cjs, discovery-*.json, discovery-review.json 및 공용 비용 캐시에 입력·출력·실패·사용량을 보존했다. 이전 단일 계획 확인과 zero-result-diagnosis.json도 덮어쓰지 않았다.

## DB 적용과 롤백

Supabase CLI로 생성한 migration의 SQL을 PGlite/pgvector에서 검증한 뒤, 운영에 추가 함수만 적용했다. 실제 운영 migration 버전은 20260912115417/legacy_filtered_search이고 파일명도 이 이력에 맞췄다. 함수는 SECURITY INVOKER, 고정 search_path이며 service_role만 실행할 수 있다. 운영 공지 271건과 기존 legacy_match_posts_at은 유지했다. 필터된 작은 집합을 정확하게 정렬하므로 데이터가 크게 늘면 별도의 실행 계획·성능 검토가 필요하다.

적용 후 보안 점검에 신규 항목은 없다. 기존 항목은 [rate_limits 정책 없음](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [increment_rate_limit search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [public의 vector 확장](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [유출 비밀번호 보호 미설정](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)이며 이번 검색 수정과 분리하여 남겼다.

앱을 이전 배포로 되돌려도 새 함수는 기존 호출에 영향을 주지 않는다. 새 호출이 중단된 후 함수만 제거할 수 있다. 공지와 인증을 삭제하거나 되돌리지 않는다.

```sql
DROP FUNCTION public.legacy_match_posts_filtered_at(jsonb,float,int,boolean,date,int[],text,date,date);
```

## 요청 추적

서버 UUID가 X-Request-Id, 완료·오류 SSE, 각 단계 로그를 연결한다. chat.request/plan/search_start/search_end/response/stream_end에서 검색 경로·정규화된 필터·주제 개수·검색어 길이/SHA-256·임계값·모델/차원·반환 ID/개수/최고 점수·지연·오류를 구분한다. 다중 검색의 반환 similarity는 해당 게시물의 최대 유사도이며 최종 정렬 점수 RRF와 다르다. 새 로그에는 대화 원문·도구 reasoning·카드 토큰·벡터·원문·상위 API 오류 객체를 넣지 않는다. HTTP 응답 준비와 SSE 완료도 구분한다. 기존 전역 오류 로그 전체를 개편한 것은 아니다.

재현 명령(격리된 app 작업 폴더):

```powershell
npm test -- --maxWorkers=2
npm run typecheck
npx eslint src/lib/legacy/chat.ts src/lib/legacy/chat-trace.ts src/lib/legacy/post-search.ts tests/legacy-followup.test.ts tests/legacy-search-trace.test.ts tests/legacy-filtered-search-db.test.ts
npm run build
```

## 2026-09-13: 종료 행사·최초 원문 근거·오류 표시 수정

배포 후 읽기 전용 검토에서 종료일 9월 6일·deadline=NULL인 ID 684가 검색되고, ID 649 요약이 원문의 '경기도내 거주 또는'를 빠뜨리며, UI가 서버 SSE 오류를 숨기는 문제를 재현했다. 앞선 '경기도 소재 대학 제한' 설명만으로 자격을 판단해서는 안 된다. 거주 조건에 해당할 가능성도 원문에 있다.

- 검색 후보는 신청 마감일, 없으면 행사 종료일, 그것도 없으면 시작일 순으로 만료를 판단한다. 날짜가 모두 없으면 기존대로 포함하고, include_expired=true는 지난 공지를 허용한다. 두 벡터 RPC와 메타데이터 검색 모두 top-k/limit 전에 적용한다. 활동유형·캠퍼스·명시 마감 범위는 유지한다.
- 최초 답변에도 기존 content의 원문을 전달한다. 조건 표현이 있는 구간을 우선하고 카드당 최대 두 구간, 전체 최대 8개·8,000자를 사용한다. 기존 1,000자/중첩 150자 구간을 재사용한다. 원문이 전달된 공지는 손실된 요약을 답변 모델 입력에서 제외한다. 본문이 없으면 탐색 요약과 자격 판단 금지 상태를 명시한다. 별도 모델·OCR·임베딩 생성은 추가하지 않는다.
- 두 답변 경로에서 카드와 같은 원문 근거를 답변 모델 연결 전에 SSE로 전송한다. 화면에는 근거가 어느 카드의 것인지 표시한다. 기존 후속 질문의 서명·원문 재조회는 유지한다.
- 검색·계획·답변 오류 안내를 화면에 표시하고, 일부 답변은 '중단된 답변'으로 구분한다. 오류와 미완성 답변을 다음 모델 대화 이력에서 제외하며, 오류 후 재검색과 기존 카드 토큰 처리를 검증했다.

검증은 무료 9파일·89개 테스트, 타입 검사·변경 파일 lint·빌드, 실제 브라우저 9시나리오/10요청이다. 긴 본문의 뒤쪽 조건, 거주 OR 조건, 학년·수강 필수 조건, 원문 누락, 근거 한도, 모델 연결·도중 실패, 날짜 경계·우선순위·명시적 과거 검색, 권한/RLS와 정의 복귀를 포함한다. 브라우저는 모든 API 응답을 주입하고 외부 요청을 차단했다. 모델을 새로 호출하지 않았다.

운영 migration 20260912171933/legacy_event_expiry로 기존 두 함수 정의를 교체했다. 공지·임베딩 271개와 service_role 전용·SECURITY INVOKER 권한을 유지했고 보안 점검 신규 항목은 없다. 저장 벡터로 고정한 ID 684 조회는 두 일반 검색에서 제외되고 include_expired=true에서는 반환된다. 실제 조회 코드+운영 DB+기존 임베딩 캐시를 사용한 추가 검증에서 전공 검색은 [648,765,649,667,550], 인공지능+공모전+천안은 [648,550,719,703,693]을 반환했다. 기준 날짜는 2026-09-13이며 메타데이터 전용 경로도 함께 검증했다. 이는 새 운영 질문의 모델 응답 평가가 아니다.

원문 일부 선택은 전체 자격 판정이 아니다. 긴 조건이나 첨부에만 있는 조건은 빠질 수 있고, 답변 모델의 실제 설명 준수율은 유료 재평가하지 않았다. ID 550·719 같은 행사 중복도 이번 세 수정에 포함하지 않는다. 초기 원문 근거가 늘어 답변 입력 토큰은 증가할 수 있다. 개발 관리액은 24,863.621744원으로 유지했다.

앱 롤백 기준은 main 73fef3a와 dpl_FSf3C2W4496R7HdcRKXfH15mX9oD다. DB는 이전 두 migration의 함수 정의를 재적용하거나 로컬 quality-db-rollback.sql을 사용해 복귀할 수 있다. 행·임베딩·인증을 삭제하지 않는다. 로컬 증거는 backups/release/chat-discovery-v1의 quality-db-before/after.json, quality-retrieval-verification.json, quality-ui-verification.json과 quality-chat-*.png에 보존한다. 앱 배포 완료 여부는 PR과 production-quality-fixes-verification.json에서 확인한다.
