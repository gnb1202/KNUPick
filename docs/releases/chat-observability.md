# 테스트 대화 관측

## 범위와 상태

2026-09-13. A 대기 화면, B 실행 기록, C1 답변 피드백을 구현했다. C2 검토 화면은 다음 커밋에서 이어서 구현한다. 운영 DB·운영 배포는 변경하지 않았다. 일반 검색·추천·검색 정책과 모델은 유지한다.

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

추가 마이그레이션은 `20260913091908_chat_observations.sql`, `20260913094532_chat_feedback.sql`이다. 새 테이블은 RLS를 켜고 anon/authenticated의 직접 접근을 제거한다. 서비스 역할만 쓰기 RPC를 실행한다. 기존 공지 데이터는 수정하지 않는다.

`PUT /api/chat/feedback`는 본인의 완료된 관측 답변에 평가를 저장한다. 한 요청에 한 평가만 유지하며 변경·철회할 수 있다. 사유는 최대 3개, 메모는 최대 500자이며 개인정보 패턴을 마스킹한다. 실행 RPC는 피드백 열을 변경하지 않는다. 클라이언트는 저장 실패 시 선택을 확정하지 않고 재시도를 제공한다. 수집 OFF에서는 새 피드백도 차단한다.

30일 만료 행은 조회에서 제외한다. `vercel.json`에 매일 UTC 00:00의 `/api/internal/chat-observations/purge` 호출을 정의했다. `CRON_SECRET` Bearer 인증을 요구하며 수집 OFF에서도 삭제는 동작한다. 운영 수집을 켜기 전에 마이그레이션, 실제 스케줄 호출·삭제, 허용 계정의 권한 검증을 먼저 완료한다. 이 커밋은 운영 활성화를 수행하지 않는다.

이번 로컬 DB는 `backups/rag-local/supabase/config.toml`의 `knupick-rag-eval`이다. DB 포트는 56422다. 릴리스 체크아웃에는 config.toml이 없으므로 작업 디렉터리 없이 `supabase --local`을 실행하면 다른 로컬 프로젝트의 기본 포트로 연결할 수 있다. 로컬 보안 점검에는 해당 `backups/rag-local` 작업 디렉터리를 명시한다. CLI 2.106.0의 db query는 여러 SQL 명령이 들어 있는 파일 실행에 실패해, 이 프로젝트 컨테이너의 psql로 트랜잭션 적용했다.

## 검증과 롤백

- `npm test -- --maxWorkers=2`: 110개 통과. PGlite의 실제 SQL에서 RLS·함수 권한·늦은 쓰기·보관 만료·사용자 삭제·피드백 유지와 제약을 확인했다.
- `npm run test:chat-observation-ui`: 로컬 모의 응답으로 8개 시나리오 통과. 명시적 수집 전환, 인증 헤더, 저장 실패·재시도, 사유·메모, 창 재열기, 평가 변경·철회, 생성 중단을 확인했다. 데스크톱·모바일 화면도 확인했다.
- 타입 검사·변경 파일 lint·빌드·기존 UI 9개 시나리오 통과. 실제 핸들러의 근거 연결·중단·사용량 계측은 모의 모델로 검증했다. 유료 모델 호출 0회.
- 전용 로컬 Supabase에 마이그레이션을 적용하고 anon/authenticated 조회 거절, anon RPC 거절, service role 실행 권한을 확인했다. 해당 DB의 security advisors는 warn 이상 0건이었다.
- 운영으로의 전환은 별도다. 관측을 끄면 새로운 원문 수집을 멈추고 기존 만료 삭제는 계속한다. UI는 해당 커밋을 되돌릴 수 있다. 롤백을 위해 기록 테이블을 삭제할 필요는 없다.

구현 근거: [Supabase 서버 사용자 검증](https://supabase.com/docs/reference/javascript/auth-getuser), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Next.js after](https://nextjs.org/docs/app/api-reference/functions/after). Supabase changelog의 관련 변경을 확인했으며 패키지 업그레이드는 하지 않았다.
