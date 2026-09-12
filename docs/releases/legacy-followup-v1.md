# legacy-followup-v1 배포 기록과 절차

공지의 후속 질문에서 모델이 날짜·시간을 만들어 내던 경로를 제한하는 별도 변경 묶음이다. 2026-09-11 로컬 검증 후 **2026-09-12 운영 반영 완료**했다.

반영 전 인증된 Vercel 조회에서 운영 별칭이 아래 기준 커밋의 `dpl_B7B7gxHFcGHNoK9YbqaxrL2iZaX4` 배포를 가리킴을 확인했다. 운영은 Node.js 24.x, `CHAT_AGENTIC_RAG=true`이며 대상 Supabase 프로젝트도 일치했다. `.vercelignore`로 로컬 환경 파일·MCP 설정·빌드 결과를 배포 입력에서 제외했다.

## 기준과 범위

- 기준 커밋: `3cb2a3614964cf3bfce0615eceebbb5c8aa4ee04`. 브랜치: `codex/legacy-followup-release`.
- GitHub의 최근 성공 Production 기록(ID `6008267859`, 2026-08-20 18:28:56 UTC)을 기준으로 분리하고 실제 운영 별칭과 커밋도 일치함을 확인했다. 이후 다른 운영 변경 위에 재적용할 때는 과거 기준을 그대로 덮어쓰지 않고 필요한 변경만 옮겨 재검증한다.
- 서버: 서명된 카드 순서 검증, 참조 공지 재조회, 원문 근거 선행 SSE, GPT-4o의 근거 ID 선택, 서버의 원문 인용. 검색 프롬프트에서도 신청 단계·업무시간·대화 기록의 사실성을 구분한다.
- UI: 카드 번호, `contextToken` 전달·갱신, 근거 펼치기·출처, 인용 표시, 만료 토큰 복구, 완료 이벤트 없이 연결이 끊기는 경우 오류 표시. 새 카드가 오면 이전 순서의 토큰을 지워 다른 공지를 참조하는 일을 막는다.
- 공통 의존성: 기존 날짜·참조·텍스트 도우미와 사용량 계측을 포함했다. `evidence.ts`는 타입만 가져왔으며 v2 근거 테이블 조회는 포함하지 않는다.
- DB: 기존 `202609080005_legacy_clock.sql` 한 개. legacy 벡터 검색용 `legacy_match_posts_at`을 추가하고 `service_role`에만 실행을 허용한다. 기존 데이터·함수는 삭제하지 않는다.
- 일반 검색·추천·인증·북마크·관리자·크롤링의 직접 구현 파일은 기준 커밋 그대로다. 공유 임베딩 함수에는 기존 텍스트 생성을 분리하고 사용량·타임아웃 처리를 포함했다. 임베딩 모델·차원과 프로덕션 직접 의존성의 고정 버전은 바꾸지 않았다.
- 라우트는 legacy만 호출한다. 이 묶음은 v2 전환, 인증 보강 배포, 새 추천 알고리즘이나 디자인 변경을 포함하지 않는다. 운영에 더 최신 인증 보강이 있다면 반드시 유지해야 하며 과거 기준으로 되돌리지 않는다.

## 2026-09-11 로컬 검증 범위

| 확인 | 결과·한계 |
|---|---|
| Vitest | 4파일·36개 통과. 위조·만료·모호한 참조, 공지 재조회, 근거 선택 실패, 원문 인용, SSE·헤더 등을 모의 API로 검증 |
| DB | 위 36개 중 PGlite/pgvector 테스트가 최소 스키마에서 추가·검색·날짜 경계·권한 거절·함수 제거 후 데이터 보존·재적용 확인. 운영 DDL은 미실행 |
| 브라우저 | 6가지 확인: 카드 번호, 토큰·근거 표시, SSE 완료 누락, 새 카드 이후 이전 토큰 폐기, 만료 토큰 초기화, 다음 요청 복구. 모든 API 응답을 모의 처리하고 외부 출처 요청을 차단 |
| 타입·빌드 | TypeScript 검사·Next.js 프로덕션 빌드 통과. 기존 browser-mapping 데이터 갱신 안내가 남음 |
| lint | 변경 소스·테스트·설정에 한정해 오류·경고 0개. 기준 커밋 전체 lint가 깨끗하다고 주장하지 않음 |
| 실제 모델 | 이전 별도 실측 3건에서 마감·제출 방법 원문을 골랐고 미제공 점수는 생성하지 않음. 이 묶음의 선택 도우미는 당시 파일과 SHA-256 일치. 전체 대화 성공률 검증은 아님 |

브라우저의 새 카드 후 연결 중단 사례는 수정 전 빌드에서 이전 토큰이 전송되는 실패를 재현한 뒤 수정했다. 9월 11일 준비 단계의 유료 모델 호출·운영 DB 쓰기는 0회다. 9월 12일에는 아래 RPC를 실제 반영했으며 추가 모델 호출은 여전히 0회다. 이전 3건의 비용 30.036원은 이미 별도로 정산했다.

## 2026-09-12 운영 반영 결과

- 코드 커밋 `094b4ed646b0103ce490b3a772d9d7f84141cda6`, 배포 `dpl_2D1GVhqiPHZ5RgE514y6bwb1yrjp`. CLI로 소스를 업로드했으며 배포 당시에는 GitHub에 푸시하지 않았다. 결과를 기록하는 후속 문서 커밋은 배포 코드 커밋과 별개다.
- 같은 날 배포한 변경만 `codex/legacy-followup-release`에 푸시하고 [PR #5](https://github.com/gnb1202/KNUPick/pull/5)를 열었다. 기준 `main`은 여전히 `3cb2a361...`이며 35개 변경 파일의 범위·해시와 기존 운영 패키지 191개의 버전 유지를 확인했다. 배포 코드 이후의 차이는 README와 이 기록뿐이다. PR 생성 후 첫 Vercel 미리보기 빌드는 통과했으며, 이 시점에는 `main` 병합과 운영 재배포를 하지 않았다.
- `--prod --skip-domain`으로 Node.js 24.x 원격 빌드와 별도 URL의 무료 API 검증 3건을 완료한 뒤 `vercel promote`로 [운영 도메인](https://knu-pick.vercel.app)을 전환했다. 이후 실제 별칭이 새 배포를 가리킴을 확인했다.
- 홈·일반 공지 목록 HTTP 200, 실제 클라이언트 번들의 토큰·근거 UI·연결 중단 처리 포함을 확인했다. 빈 메시지 400, 변조 토큰 400, 토큰 없는 번호 참조의 안내 SSE 200을 운영에서도 각각 확인했다. `X-Request-Id`, `X-Chat-Version: agentic`, SSE의 `X-Chat-Grounding-Version: legacy-followup-v1`이 확인됐다.
- Supabase `tqqnckapynzllekjgbvo`에 기존 `202609080005_legacy_clock.sql`만 적용했다. MCP 운영 이력은 **`20260912091149 / legacy_clock`**이다. 파일명 시각과 MCP 적용 시각은 다르며 이 대응을 보존한다. 누적 마이그레이션의 CLI 일괄 적용이나 전체 이력 정합성을 검증했다는 뜻은 아니다.
- 운영 RPC는 772의 기존 벡터로 772를 유사도 1로 반환하고 embedding을 노출하지 않았다. 서비스 역할은 실행 가능, 익명·일반 사용자 권한은 거절됐다. REST 익명 요청도 401/`42501`로 거절됐다. 게시물 271건과 기존 함수·권한은 유지됐다.
- `CHAT_CONTEXT_SECRET`을 운영 전용 sensitive 환경 변수로 추가했다. 비밀값은 로그·패치·보고서에 남기지 않았다. 기존 모델·검색 모드·의존성 버전·Node.js 설정은 유지했다. `vercel curl`이 보호된 배포 검증용으로 자동 발급한 임시 우회 토큰은 검증 후 폐기했고 배포 보호 설정과 CLI 로그인은 유지했다.
- 이번에는 무료 경로와 배포 상태만 검증했다. 운영에서 실제 모델 답변을 다시 생성하거나 RAG 정확도·CTR 개선을 측정하지 않았다. 비용 장부와 이전 미정산 예약은 유지했다.

인용이 길고 OCR 표가 평탄화되어 읽기 어려울 수 있다. 최저 점수 등이 없을 때 직접적인 확인 불가 안내가 부족하다. 첫 검색의 모든 사실성, AI 공모전 복합 검색, 다중 공지 비교, 추천 관련성 개선을 완료했다고 주장하지 않는다.

## 로컬 재현

이 작업 트리의 `.env.local`은 검증용 가짜 API 값이며 Git·패치에서 제외한다. 가짜 값으로 만든 `.next`도 배포하지 않는다. 재현 시 필요한 키 목록은 `.env.local.example`을 따른다. 브라우저 테스트에는 로컬 Chrome이 필요하며 Puppeteer가 설치된 브라우저를 찾을 수 있어야 한다.

```powershell
npm ci
npm test -- --maxWorkers=2
npm run typecheck
npm run build
# 별도 터미널에서 검증 서버 실행
npm start -- --hostname 127.0.0.1 --port 3026
# 다른 터미널에서 실행: API 모의 처리, 외부 네트워크 차단
npm run test:chat-ui
```

`npm run test:chat-ui`는 `CHAT_UI_URL`을 지정하지 않으면 위 3026 포트를 사용한다. 출력은 이 작업 트리의 부모 폴더에 `ui-verification.json`, `chat-followup-desktop.png`로 저장한다. 소스 수정 후에는 다시 빌드하고 검증 서버를 재시작해야 한다. 서버 중단은 해당 터미널의 Ctrl+C로 한다.

## 재배포 시 확인 순서

1. Vercel의 현재 별칭·배포 커밋·환경 변수를 읽어 기준과 비교한다. 실제 운영 코드에 이미 있는 보안 수정과 다른 기능을 보존할 수 있는지 확인한다. 현재 작업 공간 전체나 다른 v2 마이그레이션을 이 릴리스에 섞지 않는다.
2. 이전 배포 ID·환경 변수 설정·대상 DB 함수 정의·권한을 보존한다. 운영의 `posts.embedding`은 `vector(1024)`이며 기존 `increment_rate_limit(text,int,int)`가 있는지 확인한다. 현재 확인된 `increment_rate_limit`의 익명 실행 권한은 별도 보안 검토 항목으로 남아 있다.
3. **`supabase/migrations/202609080005_legacy_clock.sql`만** 대상 DB에 적용한다. SQL Editor나 동일 SQL 실행 수단을 사용하고, 누적 폴더 전체의 `supabase db push`는 이 묶음의 명령이 아니다. 새 함수는 추가형이므로 기존 앱을 먼저 중단할 필요는 없다.
4. 새 함수의 반환값이 `post` JSON·`similarity`인지, `post`에 embedding이 노출되지 않는지, service role만 실행할 수 있는지 확인한다. REST 스키마 캐시가 반영되어 `PGRST202`가 해소됐는지도 읽기 전용 호출로 확인한다.
5. 운영용 `CHAT_CONTEXT_SECRET`을 최소 32자로 생성해 모든 앱 인스턴스에 동일하게 설정한다. 로컬 검증 값은 사용하지 않는다. 기존 `CHAT_AGENTIC_RAG`·임베딩 설정은 유지하고, `EVALUATION_AS_OF`는 운영에 설정하지 않는다. 키 교체 시 기존 1시간 토큰은 무효가 된다.
6. 서버와 챗봇 UI를 함께 배포한다. 실제 운영 Supabase 공개 URL·anon key 등으로 새로 빌드한다. 검증용 `.env.local`·`.next`·node_modules를 업로드하지 않는다.
7. 빈 메시지 요청의 400과 `X-Request-Id`, `X-Chat-Version`을 무료 확인한다. 정상 SSE에서는 `X-Chat-Grounding-Version: legacy-followup-v1`, 카드·근거·완료 토큰을 확인한다. 실제 모델 점검이 필요하면 기존 비용 장부에서 호출 전 예약하고 정해진 소수 질문만 실행한다. 실패 시 자동 유료 반복은 하지 않는다.

## 롤백

서버와 UI를 함께 직전 정상 배포로 복귀시킨다. 인증·권한 보강이 이미 운영에 있으면 이를 유지한다. 추가된 RPC는 기존 앱과 충돌하지 않으므로 남겨 둘 수 있다. 제거가 필요하면 모든 새 호출자가 롤백된 것을 먼저 확인한 뒤 `legacy_match_posts_at(jsonb,double precision,integer,boolean,date)` 하나만 제거한다. 게시물·임베딩·다른 함수·권한은 되돌리지 않는다. 이전 토큰의 재사용을 막아야 할 때만 서명 키를 교체한다.

## 전달물

작업 트리의 부모 폴더에 `legacy-followup-v1.patch`, `manifest.json`, 기존 브라우저 결과·화면을 보존한다. 운영 증거는 `vercel-preflight.json`, `database-before.json`, `database-after.json`, `rpc-verification.json`, `environment-change.json`, `deployment-dry-run.json`, `deployment-free-checks.json`, `deployment-before-promotion.json`, `production-verification.json`, `verification-cleanup.json`이다. 비밀값은 포함하지 않는다. manifest에는 기준·현재·배포 코드 커밋, 변경 파일·해시와 검증 범위가 있다. 패치는 기준 커밋에 대한 변경이며, 이후 다른 운영 기준에는 먼저 차이를 검토한다.

이번 배포의 롤백 대상은 `dpl_B7B7gxHFcGHNoK9YbqaxrL2iZaX4`다. 필요할 때 `npx --yes vercel@59.16.0 rollback dpl_B7B7gxHFcGHNoK9YbqaxrL2iZaX4 --scope gnb1202-navercoms-projects`로 앱을 복귀하고 별칭·응답을 확인한다. 이 기록을 위해 운영 롤백을 실제 실행하지는 않았다.
