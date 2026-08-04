# KNUPick — AI 시스템 설계·구축·운영 사례

> CSC Partners "AI 시스템 개발 및 전략 담당자" 채용 지원용 프로젝트 사례.
> 공고 요구사항에 대한 직접 매핑은 §2를, 의사결정 사례는 §3을 참조.

---

## 1. 프로젝트 개요

**KNUPick** ([knu-pick.vercel.app](https://knu-pick.vercel.app))

공주대학교 학생을 위한 공지 큐레이션 서비스. 학교 게시판의 공지를 자동 수집·LLM 분석·개인화 추천·챗봇 검색까지 4단계 AI 파이프라인으로 처리.

- **역할**: 단독 설계·구현·운영 (인프라 + 백엔드 + AI)
- **운영 환경**: Vercel (production), Supabase (DB), Ollama (로컬 LLM)
- **데이터 규모**: 게시물 100~200건/주 누적, 사용자 인터랙션 기록 (조회·클릭·북마크)
- **AI 비용**: GPT-4o ~$0.001/요청, OpenAI 임베딩 백필 1회 ~$0.005, 로컬 LLM은 비용 0

---

## 2. 채용 공고 요구사항과의 매핑

| 공고 요구사항 | KNUPick에서의 경험 | 위치 |
|--------------|-------------------|------|
| **사내 AI 시스템 개발** | LLM 기반 공지 분석·검색·추천 시스템 설계·구축·운영 | 전체 |
| **업무 자동화 (RPA)** | 학교 게시판 크롤링 → LLM 분석 → DB 저장 파이프라인 (현재는 수동 트리거. 스케줄러 미구현 — §5.1) | `src/lib/crawler.ts`, `src/app/api/crawl/route.ts` |
| **OCR** | 이미지 공지(포스터)를 CLOVA OCR + LLM 분석 파이프라인으로 텍스트화 | `src/lib/llm.ts:analyzeImagePostWithLLM` |
| **자연어 처리 (NLP)** | 게시글에서 요약·활동유형 8종 분류·마감일·키워드 자동 추출 | `src/lib/llm.ts:analyzePostWithLLM` |
| **사내 챗봇 (LLM API 기반)** | Agentic RAG 챗봇 — GPT-4o function calling으로 query 의도 추출 → DB 빌더 검색 + 임베딩 fallback → 자연어 답변 (SSE 스트리밍) | `src/app/api/chat/route.ts`, `src/lib/post-search.ts` |
| **OpenAI / LLM API 통합** | production은 OpenAI (gpt-4o 챗봇 / gpt-4o-mini 분석 / text-embedding-3-small). Ollama(Gemma, bge-m3)는 로컬 개발 환경에서 사용하며, 공급자 플래그로 전환 가능 | `src/lib/openai.ts`, `src/lib/embeddings.ts`, `src/lib/llm.ts` |
| **AI 도입 효율 평가 + KPI** | 임베딩 모델 3종 비교 정량 측정, prompt 튜닝 전후 정확도 측정 (94→100%) | §3.2, §3.3 |
| **이상 진단 / 모델 모니터링** | URL dedupe 버그 발견 (production 매일 0건 inserted), timezone 버그 발견·수정 | §3.4, §3.5 |
| **AI 운영 문서 / 가이드라인** | ADR (Architecture Decision Record) 작성 — 의사결정 근거 + 측정 + 거절한 대안 보존 | `docs/adr/001-chatbot-search-architecture.md` |
| **데이터 처리·분석** | Supabase pgvector + HNSW 인덱스 시맨틱 검색, RLS 정책 설계, RPC 함수 작성 | `supabase/schema.sql` |
| **논리적·수학적 사고력** | Cosine similarity 분포 분석으로 임베딩 한계 진단, threshold 결정 | §3.2 |

**솔직한 한계 (§5에서 추가)**: Python/PyTorch 직접 사용 경험은 없습니다. KNUPick은 TypeScript 스택입니다. 다만 LLM API 통합·prompt 엔지니어링·시스템 설계·AI 운영 경험은 언어 무관 transferable이라 판단합니다.

---

## 3. 주요 의사결정 사례

### 3.1 Vanilla RAG → Agentic RAG 전환

**문제**: 챗봇이 한국어 짧은 query에 부정확한 결과 반환. 예) "이번달 마감 공모전" 검색 시 무관한 게시물이 카드에 노출.

**측정**: 4개 baseline query에서 임베딩 similarity 절대값이 0.15~0.42 좁은 구간에 평탄 분포 → **분별력 부족**.

**원인 진단**:
- 사용자 query: 1~3 단어, 정보량 적음 ("공모전")
- 게시물 임베딩 텍스트: 제목+요약+키워드+활동유형+캠퍼스+마감일 (정보량 많음)
- 길이/정보량 비대칭이 cosine similarity를 평탄하게 만듦

**검증으로 거절한 대안**:
- 임베딩 모델 변경 (`text-embedding-3-small` → `large` → `bge-m3`): 측정 결과 본질 해결 X. similarity 절대값만 약간 분리됨, 분별력은 유사.
- 임베딩 텍스트 강화 / 키워드 hardcoding: 단편적 개선만 가능.

**채택**: GPT-4o function calling으로 query를 구조화 데이터로 번역.
```
"공모전" → activity_types=[1] (태그 필터)
"이번달" → deadline_from/to (날짜 범위)
"통일 모의 국무회의" → semantic_query (임베딩 검색)
```

**결과** (4개 baseline + 회귀 2개):
- 분류 정확도: vanilla RAG에서 1/4 적절 → agentic RAG **6/6 (100%)**
- 응답 시간: 5~10초 (LLM 호출 2배지만 'posts' 이벤트 즉시 송출로 체감 단축)

**문서**: `docs/adr/001-chatbot-search-architecture.md` — 채택/거절 모두 기록.

---

### 3.2 임베딩 모델 비교 (정량 평가)

**1차 측정 (2026-05)** — 103개 게시물 + 동일 4개 query:

| 모델 | 차원 | similarity 분포 |
|------|-----|---------------|
| OpenAI `text-embedding-3-small` | 1536 (기본) | 0.15~0.22 |
| OpenAI `text-embedding-3-large` | 1536 | 0.15~0.22 |
| **bge-m3** (Ollama 로컬) | 1024 | 0.30~0.42 |

당시 결정은 bge-m3 채택 (분포가 넓고 비용 0). 임계값은 0.30으로 설정.

**2차 측정 (2026-07)** — 로컬 GPU를 쓸 수 없게 되어 재평가. 이때 1차 측정의 방법론 결함을 발견했다.

- `posts.embedding`이 `vector(1024)`인데 1차에서는 OpenAI를 1536차원 그대로 비교했다. `dimensions` 파라미터로 1024로 축소하면(MRL) 스키마 변경 없이 쓸 수 있다는 것을 놓쳤다.
- 더 근본적으로, **모델 간 similarity 절대값을 비교한 것 자체가 잘못**이었다. 값의 크기는 모델마다 스케일이 다를 뿐, 검색 품질을 결정하는 건 **관련 질의와 무관 질의의 분리 폭**이다.

`scripts/measure-similarity.ts`로 신호군/대조군을 나눠 다시 측정:

| 모델 | 관련 질의 top1 | 무관 질의 top1 최대 | 분리 폭 |
|------|--------------|------------------|--------|
| `text-embedding-3-small` (dimensions=1024) | 0.4213 ~ 0.5824 | 0.3025 | **0.1188** |

**의사결정**: OpenAI로 전환, 임계값 0.30 → **0.36** (두 분포의 중간).

기존 0.30을 그대로 뒀다면 무관 질의("내일 날씨 어때")의 최상위 결과가 0.3025로 통과해, 챗봇이 엉뚱한 공지를 근거로 답했을 것이다. **임계값은 모델에 종속적이므로 모델 교체 시 반드시 재측정해야 한다**는 것을 수치로 확인했다.

**transferable insight**: 두 가지다. ① 벤치마크가 아니라 본인 도메인 데이터로 측정할 것. ② 그런데 "측정했다"는 것만으로 안전하지 않다 — 1차 측정은 실제로 수행됐지만 비교 축이 틀려서 잘못된 결론을 냈다. **무엇을 재는지가 재는 행위보다 중요하다.**

---

### 3.3 Prompt 엔지니어링 (정확도 94% → 100%)

**작업**: Gemma의 활동유형 분류 정확도 측정 후 개선.

**도구**: `scripts/test-llm-accuracy.ts` — 8개 카테고리 × 16개 baseline case로 자동 측정.

**1차 측정**: 16/16 분류 중 1건 오류 (학생기자단을 "기타"로 오분류) — 94%.

**개선 1**: `CLASSIFICATION_RULES`에 ID 3 (서포터즈/기자단) 명시 룰 추가 + few-shot 예시 추가.
**측정**: 100%로 상승. 그러나 인턴십의 event_start/end 추출이 회귀 (94%).

**개선 2**: `EVENT_DATE_RULES` 키워드에 "근무기간/인턴십기간/실습기간" 추가.
**최종**: 모든 항목 16/16 (100%) 달성.

**transferable insight**: prompt 변경 시 한 곳만 보지 말고 회귀 테스트 자동화 필수. 1차 개선이 다른 케이스를 깨뜨리는 패턴은 흔함.

---

### 3.4 Production 버그 발견 — URL Dedupe

**증상**: 수동 크롤 트리거 시 18.6분 소요 후 `inserted: 0`. LLM 분석 150건 모두 unique constraint 충돌로 폐기.

**진단**:
- DB의 `original_url`은 historically `?layout=unknown` suffix 포함
- 크롤러 list 페이지가 반환하는 URL은 단순 형식
- `existingUrls` 비교 시 mismatch → 모든 게시물이 "신규"로 분류

**영향**: 크롤을 돌릴 때마다 DB가 비어있지 않은 한 항상 0건 inserted로 끝난다. initial commit부터 있던 버그이며, 스케줄러를 붙였다면 매 회차가 무의미하게 돌았을 것이다.

**수정**:
- `normalizeOriginalUrl()` 헬퍼 추가 (`?layout=unknown` 제거)
- 1차 dedupe + detail crawl 후 2차 안전망 (LLM 분석 비용 절감)
- 23505 unique 충돌은 INFO 격하 (dedupe 누락 신호 보존)

**측정**:
- 응답 시간 18.6분 → **27초** (97% 단축)
- LLM 호출 150회 → 0회 (비용 절감)
- Insert error 노이즈 150건 → 0건

**transferable insight**: production-grade 버그는 단위 테스트가 아니라 "DB가 비어있지 않은 상태"라는 환경 조건에서만 드러남. 통합 환경 검증의 가치.

---

### 3.5 Timezone 버그 — KST 기반 fix

**증상**: 5월 1일 마감 공지가 5월 2일 KST에도 챗봇 답변에 노출됨.

**진단**: 만료 필터가 `new Date().toISOString().slice(0, 10)` (UTC) 사용. KST 5/2 새벽 시간대(UTC 5/1)에는 today가 5/1로 평가 → 5/1 마감 게시물 통과.

**수정**: `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })` 기반 `todayKST()` 헬퍼.

**검증**: `UTC: 2026-05-01 | KST: 2026-05-02` (실제 시점 차이 확인) → 재테스트 후 만료 게시물 정확히 제외.

**transferable insight**: 글로벌 서비스가 아니어도 timezone 버그는 흔함. 특히 Vercel(UTC) + 한국 사용자(KST) 조합.

---

### 3.6 환경변수 검증 — Fail-Fast 도입

**문제**: 환경변수 검증 로직이 6개 파일에 분산. 누락된 키가 첫 API 호출 시점에 발견돼 사용자가 503 에러를 봄 (실제 경험: rate-limit RPC 누락 사례).

**채택**: `@t3-oss/env-nextjs` + `zod` schema 도입. 시작 시점 검증 + 타입 안전 + server/client 자동 분리.

**미묘한 trade-off**:
- Eager validation = 12-factor app 원칙. 다만 production에서 의미 없는 env(예: Ollama)를 강제하면 잘못.
- Lazy validation = production 친화적이지만 fail-late.
- **채택**: Conditional schema + default를 production 친화적 값으로. 두 트레이드오프 모두 해결.
  현재 조건은 `LLM_ENABLED && LLM_PROVIDER === 'ollama' && !OLLAMA_MODEL → throw` — 공급자를 도입하면서, Ollama 경로를 실제로 쓸 때만 Ollama 설정을 요구하도록 좁혔다.

**위치**: `src/env.ts`.

**실제로 값을 한 사례**: OpenAI 전환분을 배포할 때 Vercel 빌드가 실패했다. `OPENAI_API_KEY`가 Preview/Production 스코프에 등록돼 있지 않았고, 검증이 빌드 시점에 이를 잡았다. 검증이 없었다면 배포는 성공하고 **런타임에 챗봇과 임베딩만 조용히 실패**했을 것이다 — 실제로 그 전까지 production 시맨틱 검색이 그런 상태였다(§3.8).

**transferable insight**: "best practice"는 도그마가 아니라 도메인 컨텍스트에 맞는 균형점. 다만 fail-fast는 불편한 만큼 값을 한다 — 조용한 실패보다 시끄러운 실패가 낫다.

---

### 3.7 보안 계층 — RLS + GRANT/REVOKE 이중 방어

**구조**:
1. **Secret 격리**: `.env.local`로 service_role key 등 서버 전용 secret 분리
2. **GRANT/REVOKE**: `bookmarks`, `crawl_logs`, `post_clicks`, `post_views`, `rate_limits` 등 anon/authenticated SELECT 회수 (서비스 롤만 사용)
3. **RLS 정책**: 10개 테이블 + 13개 정책. `auth.uid() = user_id` 패턴으로 행 단위 보호
4. **service_role bypass**: 서버 라우트만 우회 (의도)

**산출물**: `supabase/schema.sql` — 단일 파일로 모든 보안 계층 멱등 적용 가능.

---

### 3.8 Production 무음 실패 — 임베딩 검색이 에러 없이 0건

**증상**: production 챗봇이 "관련 공지를 찾지 못했어요"만 반환. **에러 로그는 하나도 없음.**

**진단**: `generateEmbedding()`이 Ollama `/api/embed`를 호출하는데, `OLLAMA_HOST` 기본값이 `http://localhost:11434`다. Vercel 서버리스에는 Ollama가 없으니 fetch가 실패하고, `catch`가 이를 삼켜 `null`을 반환한다. 호출부는 `if (!emb) return []` — 즉 **실패가 "에러"가 아니라 "결과 0건"으로 표현**되어 모니터링에 걸리지 않았다.

**핵심 문제**: 로컬에서는 Ollama가 떠 있어 완벽히 동작했다. 환경 차이가 기능을 조용히 무력화했고, 로컬 테스트로는 절대 발견할 수 없었다.

**수정**: 임베딩 공급자를 OpenAI로 전환 (`EMBEDDING_PROVIDER` 기본값 `openai`). `posts.embedding`이 `vector(1024)`이므로 `text-embedding-3-small`을 `dimensions=1024`로 축소해 **DB 마이그레이션 없이** 교체.

**검증**: production에서 "이번 여름에 신청할 수 있는 장학금" → 5건, similarity 0.4974~0.5653.

**transferable insight**: `catch` 안에서 fallback 값을 반환하는 코드는 실패를 정상 응답으로 위장한다. 빈 결과가 "데이터가 없음"인지 "조회에 실패함"인지 구분되지 않으면, 장애는 사용자만 알고 개발자는 모른다.

---

### 3.9 크롤러 페이지 범위 — 두 달치 데이터 누락

**증상**: DB의 게시물 날짜가 4월 말과 7월에만 몰려 있고 5~6월이 비어 있음.

**진단**: `crawlAllPosts(10)`으로 페이지 수가 하드코딩돼 있었다. 로그를 보니 10페이지 시점에 `hasMore: true`였는데도 상한에 걸려 중단했다. 크롤을 오래 안 돌리면 그 사이 게시물이 10페이지 밖으로 밀려나 영구히 누락된다.

부수적으로 `hasMore` 계산도 틀려 있었다 — `page * 10 < totalPosts`로 페이지당 10건을 가정했지만 실제 목록은 12건씩 내려온다.

**수정**: `?pages=N` 파라미터로 조정 가능하게 변경(상한 50), `hasMore`는 실제 페이지 크기 기준으로 계산.

**transferable insight**: 상한값은 "정상 동작"과 "조용한 데이터 손실"의 경계다. 상한에 도달했는데 더 가져올 게 남아 있다면 그건 최소한 로그로 남아야 한다.

---

## 4. 운영 측면

### 4.1 모니터링·진단

- `crawl_logs` 테이블에 매 크롤 회차 통계 누적 (total/new/llmAnalyzed/duration)
- 콘솔 로그를 의미 단위로 정리: `Found 150 posts, 0 new, 150 already in DB` 같은 한 줄 요약
- 23505 unique 충돌은 ERROR가 아닌 INFO로 격하 → 진짜 에러만 모니터링 시그널로

### 4.2 회귀 테스트

- `scripts/test-llm-accuracy.ts` — 16 baseline case로 LLM 분류 정확도 자동 측정
- Playwright MCP로 챗봇 4개 시나리오 E2E 테스트 (정확/부분/무관/인사) — 4/4 합격

### 4.3 비용 관리

- 배치 작업은 실측 기반으로 비용을 먼저 뽑고 실행한다. 스크립트가 샘플 N건을 실제 호출해 건당 토큰을 재고 전체에 외삽한 뒤, `--execute` 없이는 DB에 쓰지 않는다 (`scripts/reembed-posts.ts`, `scripts/backfill-analysis.ts`)
- 실적: 게시물 101건 요약·분류 백필 **$0.04**, 108건 재임베딩 **$0.0003**
- 챗봇 답변 gpt-4o (요청당 ~$0.001), 게시물 분석은 gpt-4o-mini로 분리 — 건수가 많고 정형 출력이라 저렴한 모델로 충분
- Rate limit RPC로 IP당 분당 제한 (남용 차단)

### 4.4 Feature Flag

- `CHAT_AGENTIC_RAG=true|false` env 토글로 vanilla RAG vs agentic RAG 즉시 롤백 가능. Vanilla 코드는 `handleVanillaRAG` 함수로 보존
- `EMBEDDING_PROVIDER=openai|ollama`, `LLM_PROVIDER=openai|ollama` — 로컬 GPU 복구 시 env 한 줄로 되돌릴 수 있도록 Ollama 경로 코드를 삭제하지 않고 유지. 프롬프트는 두 공급자가 공유
- 단 임베딩 공급자 전환은 벡터 공간이 달라 **전체 재임베딩이 필수**다. 이를 잊지 않도록 `posts.embedding_model` 컬럼에 벡터 출처를 기록하고, 재임베딩 스크립트가 이 값으로 대상과 재개 지점을 판단한다

---

## 5. 정직한 한계와 학습 의지

### 5.1 채용 공고 대비 부족한 부분

- **Python / PyTorch 직접 사용 경험 X**: KNUPick은 TypeScript 스택. 다만 LLM API 통합·prompt 엔지니어링·시스템 운영 경험은 언어 무관 transferable. 입사 시 Python 학습은 빠르게 가능하다고 판단.
- **ML 모델 fine-tuning 경험 X**: GPT-4o, Gemma, bge-m3는 모두 사전학습 모델 활용. Fine-tuning은 학습 의지 있음.
- **단독 운영**: 팀 협업·코드 리뷰 경험 limited. 다만 의사결정을 ADR로 명시적으로 남기는 습관은 팀 환경에서도 직접 활용 가능.
- **크롤링 스케줄러 미구현**: `vercel.json`에 cron이 없어 현재는 수동 트리거로 동작한다. 파이프라인 자체는 완성돼 있고 인증(`CRON_SECRET`)과 실행 시간 상한(`maxDuration`)도 준비돼 있으나, 스케줄 등록은 하지 않은 상태다. 붙이려면 `LLM_ENABLED`/`LLM_PROVIDER`를 배포 환경에도 등록해야 신규 게시물에 요약이 생성된다.

### 5.2 공고 요구사항에 정확히 부합하는 부분

- **사내 AI 시스템 개발/도입/운영 경험**: KNUPick이 정확히 이 형태 (단일 도메인 + LLM 통합 + 운영)
- **LLM API 통합 (OpenAI, Anthropic, 로컬)**: 이미 production에서 다중 모델 통합·전환 경험
- **챗봇 구축**: vanilla RAG → agentic RAG로 진화시킨 의사결정 사례
- **데이터 처리·분석**: pgvector + HNSW + RPC 함수 작성, RLS 설계
- **AI 운영 모니터링·개선**: production 버그 발견·측정·수정 사례 다수
- **AI 운영 문서**: ADR + README + schema.sql 모두 코드와 함께 git 관리

---

## 6. 핵심 산출물 (코드 위치)

| 영역 | 파일 |
|------|------|
| 챗봇 (Agentic RAG) | `src/app/api/chat/route.ts`, `src/lib/post-search.ts` |
| LLM 분석 (Gemma) | `src/lib/llm.ts:analyzePostWithLLM` |
| 임베딩 (bge-m3) | `src/lib/embeddings.ts` |
| 크롤링 + dedupe | `src/lib/crawler.ts`, `src/app/api/crawl/route.ts` |
| OCR + 이미지 분석 | `src/lib/llm.ts:analyzeImagePostWithLLM` |
| 환경변수 검증 | `src/env.ts` |
| DB 스키마 | `supabase/schema.sql` |
| ADR 문서 | `docs/adr/001-chatbot-search-architecture.md` |
| 회귀 테스트 | `scripts/test-llm-accuracy.ts` |

---

## 7. 정량 요약

| 지표 | 수치 |
|------|------|
| LLM 분류 정확도 (8개 카테고리 × 16 baseline) | **100%** (튜닝 후) |
| 챗봇 E2E 합격 (4 baseline + 회귀) | **4/4** |
| 임베딩 모델 정량 비교 | 3종 (small/large/bge-m3) |
| 수정한 production-grade 버그 | URL dedupe (97% 시간 단축) + KST timezone |
| 통합한 외부 LLM API | 3종 (OpenAI GPT-4o, Ollama Gemma, Ollama bge-m3) + CLOVA OCR |
| 작성한 ADR | 1건 (아키텍처 의사결정 보존) |
| RLS 정책 + 보안 계층 | 13개 정책 + GRANT/REVOKE 이중 방어 |

---

## 8. 한 줄 요약

> KNUPick은 단일 LLM API 호출 데모가 아닌, **production 환경에서 LLM을 도입·운영·개선한 사례**입니다. 측정·의사결정·문서화 사이클을 직접 경험했고, 동일 패턴을 사내 AI 시스템 운영에 그대로 적용 가능하다고 봅니다.
