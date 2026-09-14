# 테스트 대화 관측

## 범위와 상태

2026-09-13. A 대기 화면, B 실행 기록, C1 답변 피드백, C2 검토 화면·표본 통계를 구현하고 로컬 검증을 마쳤다. 운영 DB·운영 배포는 변경하지 않았다. 일반 검색·추천·검색 정책과 모델은 유지한다. A `b7da7d1`, B `832447b`, C1 `6e6c2cf`로 나누었고 C2는 이 문서와 함께 별도 커밋한다.

기본 수집은 OFF다. 허용된 테스트 계정이 채팅의 기록 전환을 켜면 새 대화를 시작한다. 질문·대화·검색 인자·공지·실제 전달 근거·실행 호출·답변·버전·사용량을 서버 요청 ID에 연결한다. 로그에는 메타데이터만 남긴다. 이메일·휴대전화·학번 패턴을 마스킹하지만 완전한 익명화를 보장하지 않는다. legacy는 본문과 덧붙인 OCR을 하나의 content에 저장하므로 별도 OCR 출처를 추정하지 않는다.

## 실행 및 접근

- 서버 환경: `CHAT_OBSERVABILITY_MODE=off|testers`, `CHAT_OBSERVER_USER_IDS=허용 사용자 UUID 목록`(쉼표 구분). 로컬 재현 시 `CHAT_BUILD_SHA`에 검증하는 커밋을 지정한다. Vercel에서는 `VERCEL_GIT_COMMIT_SHA`를 우선한다.
- 일반 채팅 요청은 기존대로 로그인 없이 사용한다. 관측 요청은 Bearer 인증과 서버 허용 목록을 모두 통과해야 한다. 관리자 프로필이나 `x-user-id`로 권한을 얻을 수 없다.
- 관측 요청 헤더는 `X-Chat-Observation: chat-observation-v1`, `X-Chat-Session-Id` UUID, 선택적 `X-Chat-Previous-Request-Id`다. 사용자 원문·서명 토큰을 헤더에 넣지 않는다.
- `GET /api/chat/observation-access`는 현재 계정의 읽기·수집 가능 여부를 반환한다. `GET /api/admin/chat-observations/[requestId]`는 본인 기록만 반환하며 만료·타인·없는 행을 구분해 노출하지 않는다.
- 이전 기록을 확인하지 못하면 부모 기록 연결만 생략한다. 질문 처리는 계속하며 공지 참조는 기존 서명 토큰으로 검증한다. 다른 세션임이 확인된 부모 연결은 거절한다.

## 저장과 한계

시작·근거 체크포인트·종료 시 저장한다. 저장은 직렬 처리하고, DB도 단조 증가 revision과 종료 상태를 확인해 늦은 쓰기를 무시한다. 저장 오류는 답변 오류로 전파하지 않는다. 각 저장은 시간 제한을 두고 `after()`에서 최종 작업을 기다린다. 하드 종료 시에는 체크포인트만 남을 수 있으며 5분 이상 종료되지 않은 행은 조회 시 unknown으로 표시한다. 서버가 답변을 생성·전송한 기록이며 사용자 열람 증거는 아니다.

관측 활성화는 기존 재시도 정책을 변경하지 않는다. 개발 평가의 SDK 재시도 0 정책은 별도로 유지한다. provider-reported 사용량은 응답에서 확보된 토큰이고, 사용량을 반환하지 않은 실패·SDK 내부 재시도의 비용까지 확정하지 못한다. 미확보 사용량을 0원으로 표시하면 안 된다. 캡처가 256 KiB를 넘으면 이력·호출·카드 등을 줄이고 `captureTruncated`를 표시한다.

## DB와 보관

추가 마이그레이션은 `20260913091908_chat_observations.sql`, `20260913094532_chat_feedback.sql`, `20260913095902_chat_observation_reviews.sql` 순서다. 새 테이블은 RLS를 켜고 anon/authenticated의 직접 접근을 제거한다. 서비스 역할만 쓰기 RPC를 실행한다. 기존 공지 데이터는 수정하지 않는다.

`PUT /api/chat/feedback`는 본인의 완료된 관측 답변에 평가를 저장한다. 한 요청에 한 평가만 유지하며 변경·철회할 수 있다. 사유는 최대 3개, 메모는 최대 500자이며 개인정보 패턴을 마스킹한다. 실행 RPC는 피드백 열을 변경하지 않는다. 클라이언트는 저장 실패 시 선택을 확정하지 않고 재시도를 제공한다. 수집 OFF에서는 새 피드백도 차단한다.

30일 만료 행은 조회에서 제외한다. `vercel.json`에 매일 UTC 00:00의 `/api/internal/chat-observations/purge` 호출을 정의했다. `CRON_SECRET` Bearer 인증을 요구하며 수집 OFF에서도 삭제는 동작한다. 운영 수집을 켜기 전에 마이그레이션, 실제 스케줄 호출·삭제, 허용 계정의 권한 검증을 먼저 완료한다. 이 커밋은 운영 활성화를 수행하지 않는다.

이번 로컬 DB는 `backups/rag-local/supabase/config.toml`의 `knupick-rag-eval`이다. DB 포트는 56422다. 릴리스 체크아웃에는 config.toml이 없으므로 작업 디렉터리 없이 `supabase --local`을 실행하면 다른 로컬 프로젝트의 기본 포트로 연결할 수 있다. 로컬 보안 점검에는 해당 `backups/rag-local` 작업 디렉터리를 명시한다. CLI 2.106.0의 db query는 여러 SQL 명령이 들어 있는 파일 실행에 실패해, 이 프로젝트 컨테이너의 psql로 트랜잭션 적용했다.

## 검증과 롤백

- `npm test -- --maxWorkers=2`: 116개 통과. PGlite의 실제 SQL에서 RLS·함수 권한·늦은 쓰기·보관 만료·사용자 삭제·피드백·검토 분리와 제약을 확인했다. 통계의 분모·미확인·백분위·단가 미등록도 검증했다.
- `npm run test:chat-observation-ui`: 로컬 모의 응답으로 15개 시나리오 통과. 명시적 수집 전환, 인증 헤더, 피드백·검토 저장 실패·재시도, 사유·메모, 창 재열기, 평가 변경·철회, 생성 중단, 버전 필터·미확인 건수·안전한 원문 표시·비로그인 화면을 확인했다. 데스크톱·모바일 화면도 확인했다.
- `npm run test:chat-observation-local`: 실제 Next.js·전용 로컬 Supabase에서 질문과 후속 질문 2건을 연결했다. 실제 Auth, 실제 DB 검색·원문, `after()` 종료 저장, SSE 요청 ID, 피드백·검토 분리, 타인 기록 404, 목록 JSON 투영, 직접 Data API 거절을 확인했다. 모델 응답 3회는 루프백 모의 서버다. 임시 로컬 계정과 관련 기록은 종료 시 삭제한다. 운영 데이터나 실제 모델의 답변 품질 검증은 아니다.
- 타입 검사·변경 파일 lint·빌드·기존 UI 9개 시나리오 통과. 실제 핸들러의 근거 연결·중단·사용량 계측은 모의 모델로 검증했다. 유료 모델 호출 0회.
- 전용 로컬 Supabase에 마이그레이션을 적용하고 anon/authenticated 조회 거절, anon RPC 거절, service role 실행 권한을 확인했다. 해당 DB의 security advisors는 warn 이상 0건이었다.
- 운영으로의 전환은 별도다. 관측을 끄면 새로운 원문 수집을 멈추고 기존 만료 삭제는 계속한다. UI는 해당 커밋을 되돌릴 수 있다. 롤백을 위해 기록 테이블을 삭제할 필요는 없다.

구현 근거: [Supabase 서버 사용자 검증](https://supabase.com/docs/reference/javascript/auth-getuser), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Next.js after](https://nextjs.org/docs/app/api-reference/functions/after). Supabase changelog의 관련 변경을 확인했으며 패키지 업그레이드는 하지 않았다.

## 검토 화면과 통계

채팅의 ‘내 테스트 기록 검토’ 또는 `/admin/chat-observations`에서 본인 기록을 조회한다. `GET /api/admin/chat-observations?days=7|14|30`은 해당 기간에 저장된 최신 200건의 요약을 반환한다. 200건을 넘으면 일부 표본임을 표시한다. 대화 전체·근거·답변은 상세 요청에서만 반환한다. 모든 조회는 인증·소유자·만료를 검증하고 `no-store`다. 계정 변경 시 기존 화면과 진행 중 요청을 해제한다.

질문·이력·실제 검색 조건·카드·실제 전달한 근거 스냅샷/해시/구간·호출 순서/입출력/지연·답변·버전을 확인할 수 있다. 원문 링크는 http(s)만 허용하며 텍스트를 HTML로 실행하지 않는다. PDF/HWP 분석이나 모델의 내부 추론 기록은 추가하지 않는다.

`PATCH /api/admin/chat-observations/[requestId]`는 `verdict`(unreviewed/pass/issue/uncertain), 선택 사유 최대 3개와 메모 500자를 받는다. 수집 OFF에서도 기존 기록을 검토할 수 있다. 사용자 평가와 별도 열에 저장하고 판정자·시각을 남긴다. 미검토로 되돌리면 판정 사유·메모·판정자·시각을 지운다. 생성 중인 답변은 검토를 막고, 5분이 지난 종료 미확인 기록은 검토할 수 있다.

기간·전체 버전 값·상태·검토 대상 필터를 적용한 같은 표본에서 아래 통계를 계산한다.

- 완료/실패/시간 초과/중단/진행/종료 미확인, 검색 0건/결과 수가 확보된 검색.
- 평가 참여/완료 답변, 👎/평가 제출, 검토/표본 및 문제·보류·미검토 건수. 미평가를 긍정으로 취급하지 않는다.
- 완료 답변 중 지연 값이 확보된 표본의 첫 조각·전체 p50/p95(가까운 상위 순위 방식)와 각 표본 수.
- 확보된 입력·출력 토큰, 사용량 누락·불완전 요청/호출, 축약된 기록. 저장 자체가 실패한 요청은 관측할 수 없어 전체 누락률은 표시하지 않는다.
- `openai-standard-2026-09-13` 단가 스냅샷: [GPT-4o](https://developers.openai.com/api/docs/models/gpt-4o) 입력 $2.50·출력 $10/백만 토큰, [text-embedding-3-small](https://developers.openai.com/api/docs/models/text-embedding-3-small) $0.02/백만 토큰. 완전한 사용량과 등록 모델만 USD 합계·요청당 평균에 포함한다. 캐시 할인·미확보 SDK 재시도·세금·환율은 반영하지 않으며 청구액으로 표시하지 않는다. 모델 변경 시 단가를 검증·버전 갱신하기 전까지 비용은 미확보다.

[기존 고정 평가 요약](../../public/chat-evaluation-baseline.md)은 공개된 합계와 한계만 포함한다. 과거 v2 평가와 현재 legacy 관측을 같은 성능 수치로 섞지 않는다. 새 LLM 자동 채점·대형 평가셋·유료 품질 재평가는 수행하지 않았다.

## 로컬 재현과 운영 전환 순서

일반 테스트와 타입·lint·빌드는 외부 모델이 필요하지 않다. UI 검증에는 `npm run dev -- --hostname 127.0.0.1 --port 3026` 서버를 켜고 `npm run test:chat-ui`, `npm run test:chat-observation-ui`를 실행한다. 실제 DB 연결 검증 전에는 이 서버를 종료한다. 동일 체크아웃에서 dev와 build를 동시에 실행하지 않는다.

`test:chat-observation-local`은 KNUPick 전용 DB(56421/56422)와 위 세 마이그레이션이 필요하다. 기본 작업 경로는 앱 기준 `../../../rag-local`이고 다른 위치에서는 `CHAT_LOCAL_SUPABASE_WORKDIR`로 지정한다. project_id·로컬 주소를 검증하고 CLI가 반환한 로컬 키를 메모리에서만 사용한다. 3027 포트가 비어 있어야 한다. Next dev 서버·모의 모델 서버·임시 테스트 계정을 만들고 정리한다. 출력에는 키나 대화 원문을 남기지 않는다.

운영 전환 순서는 세 마이그레이션 적용, 접근 권한 확인, 기본 OFF 앱 배포, 삭제 cron의 실제 호출·만료 삭제 확인, 허용 계정의 testers 모드 활성화다. 문제가 있으면 모드를 off로 되돌린 뒤 재배포하며 만료 삭제는 유지한다. 운영 사용자 대화와 운영 모델의 품질은 로컬 모의 검증만으로 보증하지 않는다.

## 2026-09-14 운영 반영

사용자가 운영 반영 진행과 테스트 로그인 아이디 `gnb1202`를 지정했다. 최신 main `68a44e5`의 홈 화면 변경을 병합한 뒤 테스트 116개·타입·빌드·기존 UI 9개·관측 UI 15개를 다시 확인했다.

Supabase 플러그인의 연결 계정이 다른 프로젝트여서 KNUPICK이 확인된 CLI 계정을 사용했다. 별도 `backups/observation-rollout` 작업 폴더를 KNUPICK에 연결하고, 원격 마이그레이션 이력을 읽어온 뒤 이번 3개 파일만 복사했다. dry-run에 정확히 3개만 나타난 것을 확인한 후 적용했다. 원격 이력의 버전·이름과 로컬 파일이 일치한다. 기존 공지 272건·사용자 3명은 유지했다.

운영 관측 테이블의 RLS가 켜져 있고 anon/authenticated는 직접 SELECT·쓰기 RPC 권한이 없다. service_role만 쓰기 RPC를 호출한다. 보안 점검에서 새 warn 이상은 없었다. 기존 [increment_rate_limit search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [public vector 확장](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [유출 비밀번호 보호](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) 경고 3개는 별도 기존 항목이다.

운영은 최초 OFF 배포 후 만료 기록과 미만료 기록을 구분하는 삭제 확인을 거쳐 `gnb1202` 한 계정만 활성화한다. 이 계정도 채팅에서 ‘품질 확인용 대화 기록’을 직접 켜야 기록하며 전환하면 새 대화를 시작한다. 비로그인과 다른 계정은 수집할 수 없다. 환경 변경은 기존 배포에 소급되지 않으므로 재배포 완료 여부와 Vercel cron 등록을 함께 확인한다. 실제 배포·만료 삭제 확인 결과는 프로젝트 작업 자료 `backups/observation-rollout/production-verification.json`과 `docs/current-plan.md`에 보존한다.
