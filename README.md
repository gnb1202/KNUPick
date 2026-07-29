# KNUPick

공주대학교 학생을 위한 공모전·대외활동·장학금·교육 등 **모든 기회를 한 곳에서** 만나는 공지사항 통합 큐레이션 서비스.

🔗 **서비스 바로가기**: [https://knu-pick.vercel.app](https://knu-pick.vercel.app)

---

## 우리가 풀고자 한 문제

공주대학교 학생들과 인터뷰하며 다음과 같은 공통된 불편을 발견했습니다.

### 1. 공지가 산재되어 있어 매일 학교 사이트를 직접 들어가야 한다
- 학생소식란에는 하루에도 수십 건의 공지가 올라오지만, 메일·앱 알림·푸시 등 **푸시형 채널이 없어** 학생들이 직접 “찾아 들어가야” 합니다.
- 그러다 보니 공모전·장학금·인턴 같은 **놓치면 손해인 기회**를 마감 후에야 알게 되는 사례가 많았습니다.

### 2. 본인과 관련 없는 공지가 너무 많아 피로하다
- 공주·천안·예산 3개 캠퍼스 공지가 하나의 게시판에 섞여 있어, **학과·캠퍼스 단위로 필터링이 불가능**합니다.
- "기숙사 입실"·"강의평가 기간 안내"·"행정 공지"가 "공모전"·"인턴십"과 같은 비중으로 노출되어 학생이 직접 분류해야 합니다.

### 3. 본문을 끝까지 읽어야만 핵심 정보를 알 수 있다
- 학교 공지는 형식이 통일되어 있지 않아, 같은 “마감일”도 본문 중간·맨 끝·첨부파일에 흩어져 있습니다.
- 학생들은 **대상 / 기간 / 신청방법**이라는 3가지를 알고 싶을 뿐인데, 매번 수백 자의 본문을 읽어야 했습니다.

### 4. 이미지로만 올라온 공지는 검색이 안 된다
- 포스터 한 장만 첨부된 공지가 전체의 약 15~20%를 차지합니다.
- 텍스트 본문이 없으니 **검색·필터·요약 모두 불가능**한 “블랙박스 공지”가 되어 묻혀버립니다.

### 5. 마감일을 캘린더에서 한눈에 볼 수 없다
- 학교 사이트는 게시판 형식이라 "이번 주에 마감되는 공지"를 시각적으로 파악할 수 없습니다.
- 학생들은 본인이 지원하려던 공지의 마감을 **수기로 메모하거나 까먹습니다**.

### 6. "내가 관심 있는 분야"의 공지를 자동으로 모아주는 채널이 없다
- 학생마다 관심 분야(IT 해커톤, 디자인 공모전, 어학 프로그램 등)가 다른데, 학교 공지는 모두에게 **동일한 순서**로 보여집니다.
- 결국 학생들은 매번 같은 키워드로 본문을 스크롤해야 했습니다.

---

## 우리가 해결한 방법

위 문제들을 **자동 크롤링 → LLM 분석 → 개인화 → 대화형 검색**의 4단계 파이프라인으로 풀었습니다.

### ① 자동 크롤링 — “학생이 찾아가지 않아도 공지가 모인다”

| 문제 | 해결 |
|------|------|
| 매일 학교 사이트를 직접 들어가야 함 | Vercel Cron이 주기적으로 학생소식란을 크롤링하여 DB에 저장 |
| 공주대 게시판은 비표준 응답을 반환 (HTTP 라이브러리로는 파싱 불가) | **Puppeteer + @sparticuz/chromium** 헤드리스 브라우저로 실제 렌더링 후 HTML 추출 |
| 서버리스 환경에서 Chrome 바이너리 용량 한계 | 로컬에선 `puppeteer`, Vercel에선 `@sparticuz/chromium` 으로 분기 (`src/lib/crawler.ts`) |
| 게시판 페이지네이션·중복 처리 | `original_url` 기반 upsert + `crawl_logs` 테이블로 멱등성 보장 |

> 학생은 이제 KNUPick 한 곳만 들어오면 됩니다.

### ② LLM 기반 자동 분석 — “읽지 않아도 핵심을 안다”

게시글 한 건당 한 번의 Ollama 호출(**Gemma 3 8B** — `gemma4:e4b-it-q4_K_M`, reasoning 모드 비활성화)로 **요약·활동유형·마감일·행사일·키워드**를 동시에 추출합니다 (`src/lib/llm.ts`의 `analyzePostWithLLM`).

| 추출 항목 | 해결한 사용자 문제 |
|-----------|------------------|
| **200자 요약** | 본문을 끝까지 안 읽어도 대상/기간/신청방법이 한눈에 보임 |
| **활동유형 (8종 자동 분류)** | "공모전"·"장학금"·"기타" 등으로 자동 라벨링되어 필터링 가능 |
| **마감일(deadline)** | 본문에 흩어진 날짜 중 “신청 마감”만 정확히 추출 → D-day 표시·캘린더 표시 |
| **행사일(event_start_date / event_end_date)** | "신청 마감"과 "행사일"을 분리하여 캘린더에서 구분 표시 |
| **학과 매칭 키워드** | DEPARTMENT_KEYWORDS와 매칭하여 “내 학과 관련 공지”를 자동 표시 |

**프롬프트 엔지니어링 디테일**

- XML 태그(`<TASK>`, `<RULES>`, `<EXAMPLES>`) 기반 구조화 프롬프트로 **출력 일관성 확보**
- Few-shot 예시 7건 포함 — 특히 까다로운 케이스를 의도적으로 학습:
  - "12. 19. ~ 12. 31." 같은 **기간 공지는 마감일로 처리** (강의평가·이의신청)
  - "기간 내 신청하시기 바랍니다"만 있고 날짜 없으면 **마감일 null로 강제** (모델의 환각 방지)
  - "기숙사·학생생활관"은 ID 8(기타)로 강제 분류
  - "학습튜터·캠퍼스 순찰대" → ID 7(장학금/지원) (근로장학 성격이므로)
- JSON 응답 강제 + greedy 매칭 방지 정규식으로 마크다운 감싼 응답도 안정적으로 파싱

### ③ 이미지 공지도 분석 — “블랙박스를 깬다”

포스터 한 장만 올라온 공지를 OCR + LLM으로 텍스트 공지처럼 다룹니다 (`analyzeImagePostWithLLM`).

```
이미지 공지 → CLOVA OCR (텍스트 추출) → Gemma (구조화 분석) → DB 저장
```

이로써 이미지만 있는 공지도 **요약 / 활동유형 / 마감일 / 키워드**가 모두 채워져, 검색·필터·캘린더에 정상 노출됩니다.

### ④ 개인화 피드 — “모두에게 같은 순서로 보여주지 않는다”

| 사용자 시그널 | 활용 방법 |
|--------------|-----------|
| **프로필**(학과 / 캠퍼스 / 관심 활동유형) | 로그인 시 자동 필터 적용 — 회원가입 한 번이면 끝 |
| **북마크** (`bookmarks` 테이블) | 북마크한 글의 키워드를 누적 분석 → 관심 키워드 추출 |
| **조회 기록** (`post_views` 테이블) | 최근 7일간 본 글 키워드 빈도수 → 상위 10개를 관심 시그널로 사용 |
| **클릭 기록** (`post_clicks`) | 외부 링크 클릭률 분석으로 추천 정확도 개선 |
| **사용자 정의 키워드 / 제외 키워드** | 학생이 직접 추가/제외 가능 (`profiles.custom_keywords`, `excluded_keywords`) |

추천 점수 식 (`src/app/api/recommendations/route.ts`):
- 관심 키워드 매칭: **+2점**
- 관심 활동유형 매칭: **+3점**
- 제외 키워드 포함: **−10점** → 사실상 강한 필터링
- 이미 본/북마크한 글은 자동 제외

### ⑤ 마감 임박 알림 — “까먹지 않게”

- 프로필에서 **알림 활성화 + N일 전 알림**(기본 3일) 설정 가능
- 북마크한 공지의 마감일이 D-N일 이내로 들어오면 `DeadlineAlert` 컴포넌트로 노출
- 별도 푸시 인프라 없이 **로그인 시 즉시 표시** 방식으로 단순/안정적으로 구현

### ⑥ Agentic RAG 챗봇 — “자연어로 묻고 답을 얻는다”

> "이번 달에 마감인 IT 공모전 알려줘" 같은 자연어 질문을 컨텍스트 기반으로 답변.

#### 왜 Agentic RAG로 갔나

처음엔 **Vanilla RAG**(질문 임베딩 → pgvector 시맨틱 검색 → LLM 답변)로 시작했지만, 한국어 짧은 query와 게시물 메타데이터의 길이/정보량 비대칭으로 **cosine similarity 절대값이 좁은 구간(0.15~0.42)에 평탄 분포**해 분별력이 약했습니다 (자세한 비교는 `docs/adr/001-chatbot-search-architecture.md`).

임베딩 모델 3종(`text-embedding-3-small/large`, `bge-m3`)을 비교한 결과 모델 변경만으론 본질 한계 해결 X. 진짜 풀어야 할 문제는:
- "공모전" → 추상 카테고리는 **`activity_types` 태그 매칭**
- "이번달 마감" → **날짜 범위 필터**
- "통일 모의 국무회의" → **임베딩 시맨틱 검색**

각각 다른 검색 전략이 필요했습니다. 이미 LLM이 분석해 채워둔 구조화 메타데이터(`activity_types[]`, `keywords[]`, `deadline`, `campus`)를 활용하는 게 자연스러워 **single function call 패턴의 agentic RAG**로 전환했습니다.

#### 흐름

```
사용자 질문
   ↓ ① GPT-4o (function calling: search_posts)
   │   reasoning + activity_types[] + deadline_from/to + campus + semantic_query 추출
   ↓ ② src/lib/post-search.ts
   │   • 필터 명시: Supabase 빌더 (overlaps/in/gte/lte)
   │   • 시맨틱 명시: bge-m3 임베딩 → pgvector match_posts RPC
   │   • 둘 다: 빌더로 좁히고 (보조) 임베딩 정렬
   ↓ 'posts' SSE event 즉시 송출 (카드 먼저 표시)
   ↓ ③ GPT-4o 두 번째 호출 (stream: true)
   │   3단계 부합 판정으로 자연어 답변 생성
   └─ 'text' SSE delta → 'done'
```

#### 3단계 답변 형식

LLM이 검색 결과와 query의 의미적 부합도를 판단해 다음 셋 중 하나로 답변합니다:

- **단계 1 (정확 매칭)**: `짧은 인트로 + ASCII 불릿 리스트 + 카드 번호 [#N] 참조`
- **단계 2 (부분 매칭)**: `"'X'에 정확히 맞는 공지는 못 찾았지만, 비슷한 분야로 N건..."` + 불릿
- **단계 3 (완전 무관/0건)**: `"관련 공지를 찾지 못했어요"` + 비슷한 분야 제안

UI 카드와 답변이 항상 일관되도록 — 카드는 검색 결과, 답변은 그 결과의 의미적 평가.

#### 디테일

- **Feature flag**: `CHAT_AGENTIC_RAG=true` 시 agentic, 아니면 vanilla RAG로 fallback (롤백 안전)
- **임베딩**: 로컬 Ollama `bge-m3` 1024차원 (한국어 강함). `posts.embedding` 컬럼 + HNSW 코사인 인덱스
- **할루시네이션 방지**: 시스템 프롬프트에 "tool 결과만 근거로 답변, 추측 금지" 명시 + `[텍스트](url)` 같은 마크다운 링크 금지
- **SSE 스트리밍**: 답변 생성과 동시에 관련 공지 카드를 먼저 표시 → 체감 응답 속도 개선
- **Rate limit**: `rate_limits` 테이블 + `increment_rate_limit` RPC로 IP당 분당 20회 제한 (서버리스 인스턴스 간 공유)

### ⑦ 그 외 사용자 경험 개선

| 기능 | 해결한 문제 |
|------|-----------|
| **한글 초성 검색** (`es-hangul`) | "ㅈㅎㄱ"으로 "장학금" 검색 — 모바일 타이핑 부담 감소 |
| **마감 캘린더** (시작·종료일 구분 표시) | 한 달 마감/행사 일정을 시각적으로 파악 |
| **D-day 칩 + 마감 토글** | "마감된 일정 숨기기"로 깔끔한 피드 유지 |
| **다크 모드** (라이트/다크/시스템) | 야간 사용 피로 감소 |
| **관리자 대시보드** | 운영자가 잘못 분류된 공지를 수동 보정 가능 |

---

## 주요 기능 요약

- **맞춤 피드**: 학과·캠퍼스·관심 활동유형 자동 필터링
- **자동 크롤링**: 공주대학교 학생소식란 주기 수집 (Puppeteer)
- **LLM 자동 분석**: 한 번의 호출로 요약·활동유형·마감일·행사일·키워드 추출 (Ollama Gemma 3 8B)
- **이미지 공지 분석**: CLOVA OCR → Gemma 파이프라인으로 포스터 공지도 검색·필터 가능
- **8개 활동유형 자동 분류**: 🏆공모전 · 🌍대외활동 · 📢서포터즈 · 💼인턴/채용 · 🤝봉사 · 📚교육 · 💰장학금 · 📌기타
- **개인화 추천**: 북마크·조회 이력 기반 키워드 학습 + 사용자 정의 제외 키워드
- **Agentic RAG 챗봇**: GPT-4o function calling으로 query 의도 추출 → 빌더 검색 + bge-m3 임베딩 보조 + 스트리밍 답변
- **한글 초성 검색**: "ㅈㅎㄱ" → "장학금"
- **마감 캘린더**: 월별 마감일·행사 시작/종료일 시각화
- **마감 임박 알림**: 북마크 공지가 D-N일 이내일 때 자동 노출
- **다크 모드** + **관리자 대시보드** + **사용자 프로필**

---

## 기술 스택

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4
- **Backend**: Next.js API Routes (Node.js runtime)
- **Database**: Supabase (PostgreSQL + pgvector 확장)
- **Auth**: Supabase Auth (RLS 정책으로 행 단위 보호)
- **LLM (분석)**: Ollama + Gemma 3 8B (`gemma4:e4b-it-q4_K_M`) — 요약·분류·날짜 추출, reasoning 모드 비활성
- **임베딩 (RAG)**: Ollama + bge-m3 (1024d, 한국어 강함) — pgvector HNSW 코사인 인덱스
- **OCR**: NAVER CLOVA OCR — 이미지 공지 텍스트화
- **LLM (챗봇 답변)**: OpenAI GPT-4o + function calling (agentic RAG)
- **Crawling**: Puppeteer Core, @sparticuz/chromium (Vercel 서버리스), Cheerio
- **검색**: es-hangul (한글 초성)
- **환경변수 검증**: `@t3-oss/env-nextjs` + `zod` — 시작 시점 fail-fast, server/client 자동 분리
- **Deployment**: Vercel (Speed Insights 포함)

---

## 시스템 동작 흐름

```
[Vercel Cron / 수동 트리거]
     │ Bearer CRON_SECRET
     ▼
[/api/crawl]
     │  ① crawlAllPosts (Puppeteer + Cheerio) — 학생소식란 N페이지
     │  ② normalizeOriginalUrl로 dedupe (?layout=unknown 정규화)
     │  ③ 신규 게시물만 detail crawl + 2차 dedupe
     │  ④ analyzePostWithLLM (Gemma) — 요약/유형/날짜/키워드
     │     └─ 이미지 공지: CLOVA OCR → Gemma
     │  ⑤ generateEmbedding (bge-m3) — 1024d 임베딩
     │  ⑥ Supabase posts INSERT + 학과 매핑
     ▼
[프런트엔드]
   ├─ /                : 맞춤 피드 (프로필 + 개인화 추천 점수)
   ├─ /calendar        : 마감·행사 캘린더
   ├─ /bookmarks       : 북마크 + 마감 임박 알림
   ├─ Chatbot          : Agentic RAG
   │                     ├─ GPT-4o function calling: search_posts(args)
   │                     ├─ post-search.ts: 빌더 필터 + match_posts RPC
   │                     └─ GPT-4o 답변 (3단계 부합 판정 + SSE 스트리밍)
   └─ /admin           : 운영자 보정
```

---

## 프로젝트 구조

```
src/
├── app/
│   ├── api/
│   │   ├── posts/route.ts             # 게시물 조회 (필터/정렬/페이징)
│   │   ├── crawl/route.ts             # 크롤링 + LLM 분석 트리거
│   │   ├── crawl/reanalyze/route.ts   # 기존 게시물 LLM 재분석
│   │   ├── chat/route.ts              # Agentic RAG 챗봇 (function calling + SSE)
│   │   ├── embeddings/backfill/route.ts # bge-m3 임베딩 일괄 생성/재생성
│   │   ├── recommendations/route.ts   # 개인화 추천 점수 계산
│   │   ├── bookmarks/[postId]/route.ts # 북마크 추가/삭제/조회
│   │   ├── reminders/route.ts         # 마감 임박 알림
│   │   ├── views/route.ts             # 조회 기록 (관심 시그널)
│   │   ├── clicks/route.ts            # 클릭 기록 (CTR)
│   │   ├── departments/route.ts       # 학과 목록
│   │   ├── auth/delete/route.ts       # 계정 삭제 (Supabase admin)
│   │   ├── llm/test/route.ts          # LLM 연결 진단
│   │   └── admin/                     # 게시물/사용자/통계 관리
│   ├── login/  signup/  profile/      # 인증·프로필
│   ├── calendar/                      # 마감/행사 캘린더 페이지
│   ├── bookmarks/                     # 북마크 + 마감 알림 페이지
│   ├── admin/                         # 관리자 대시보드
│   └── page.tsx                       # 메인 피드
├── components/
│   ├── Header.tsx          FilterPanel.tsx    PostCard.tsx
│   ├── PostList.tsx        FeedSection.tsx    Calendar.tsx
│   ├── SearchBar.tsx       Chatbot.tsx        DeadlineAlert.tsx
│   └── EmptyState.tsx
├── contexts/
│   ├── AuthContext.tsx                # Supabase Auth 상태
│   └── ThemeContext.tsx               # 다크모드
├── lib/
│   ├── crawler.ts                     # Puppeteer 크롤러 + URL 정규화 헬퍼
│   ├── llm.ts                         # Ollama (Gemma) + CLOVA OCR
│   ├── openai.ts                      # OpenAI 클라이언트 (GPT-4o)
│   ├── embeddings.ts                  # bge-m3 임베딩 (Ollama, 1024d)
│   ├── post-search.ts                 # Agentic RAG 검색 (tool 정의 + 빌더 + 임베딩 fallback)
│   ├── rate-limit.ts                  # 분산 환경 rate limit RPC 클라이언트
│   ├── search.ts                      # 한글 초성 검색
│   ├── categorizer.ts                 # 키워드 기반 1차 분류 (LLM 폴백)
│   ├── constants.ts                   # 학과/활동유형/캠퍼스 상수
│   └── supabase.ts                    # 클라이언트/관리자 Supabase
├── env.ts                             # 환경변수 schema (t3-env + zod, fail-fast)
└── types/index.ts
```

---

## API

### GET /api/posts
| 파라미터 | 설명 |
|---------|------|
| page / pageSize | 페이지네이션 |
| departmentId | 학과 ID (1-based) |
| activityTypes | 활동유형 ID (콤마 구분) |
| campus | `common` / `kongju` / `cheonan` / `yesan` |
| sort | `latest` / `deadline` |
| hasDeadline | 마감일 있는 글만 (true/false) |
| startDate / endDate | 마감일 범위 (YYYY-MM-DD) |

### POST /api/crawl
크롤링 + LLM 분석 실행 (`Authorization: Bearer ${CRON_SECRET}` 필수)

```bash
curl -X POST http://localhost:3000/api/crawl \
  -H "Authorization: Bearer ${CRON_SECRET}"
```

### POST /api/chat
챗봇 SSE 스트리밍. `CHAT_AGENTIC_RAG=true` 시 GPT-4o function calling으로 query 의도 추출 → 빌더 검색(+ 보조 임베딩) → GPT-4o 답변. 미설정 시 vanilla RAG로 fallback (질문 임베딩 → `match_posts` → GPT-4o).

이벤트 형식 (SSE `data:` 라인):
- `{"type":"posts","posts":[...]}` — 검색 결과 카드 (먼저 송출)
- `{"type":"text","delta":"..."}` — LLM 답변 토큰
- `{"type":"done"}` — 완료
- `{"type":"error","message":"..."}` — 에러

### POST /api/embeddings/backfill
기존 게시물의 임베딩 일괄 생성/재생성 (`Authorization: Bearer ${CRON_SECRET}` 필수).

쿼리 파라미터:
- `?limit=N` — 한 번에 처리 최대 개수 (기본 500)
- `?force=true` — 모든 게시물 재생성 (default: NULL인 것만)

### GET /api/recommendations  (header: `x-user-id`)
프로필 + 북마크/조회 키워드 빈도 기반 점수 정렬 게시물 반환.

### GET /api/reminders  (header: `x-user-id`)
북마크 중 마감 D-N일 이내 게시물 반환.

### GET / POST / DELETE  /api/bookmarks  (header: `x-user-id`)
북마크 CRUD.

### POST /api/views, /api/clicks  (header: `x-user-id` 선택)
관심도 시그널 기록.

### GET /api/admin/stats  (header: `x-user-id` — 관리자)
운영 통계.

---

## 데이터베이스

### posts
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | int | PK |
| title | text | 제목 |
| content | text | 본문 (요약 후에도 보관) |
| summary | text | LLM 요약 (200자) |
| original_url | text | 단축 URL |
| posted_date | date | 게시일 |
| deadline | date | 신청 마감일 |
| event_start_date / event_end_date | date | 행사 시작/종료 |
| activity_types | int[] | 1~8 |
| keywords | text[] | 학과 매칭용 |
| campus | text | common/kongju/cheonan/yesan |
| embedding | vector(1024) | bge-m3 (Ollama, 1024d, HNSW 코사인 인덱스) |
| created_at / updated_at | timestamptz | |

### profiles
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid | auth.users FK |
| username / nickname | text | |
| campus / department_id | text / int | |
| preferred_activity_types | int[] | |
| custom_keywords | text[] | 사용자 정의 관심 키워드 |
| excluded_keywords | text[] | 제외 키워드 (−10점) |
| reminder_enabled | bool | 마감 알림 ON/OFF |
| reminder_days_before | int | D-N 일 전 (기본 3) |
| is_admin | bool | |

### 그 외
- `bookmarks` (user_id, post_id, created_at)
- `post_views` (관심도 시그널)
- `post_clicks` (CTR 분석)
- `post_department_relevance` (포스트-학과 매칭)
- `activity_types` / `departments` (마스터)
- `crawl_logs` (수집 이력)
- `rate_limits` (key/count/reset_at — API 분당 호출 한도, service_role 전용)

### Supabase RPC
- `match_posts(query_embedding jsonb, match_threshold float, match_count int, include_expired bool)`
  → pgvector 코사인 유사도 기반 상위 N건 반환 (챗봇 시맨틱 검색용, 1024d bge-m3)
- `handle_new_user()` — auth.users INSERT 트리거로 profiles 행 자동 생성 (race condition 방지)
- `increment_rate_limit(p_key, p_limit, p_window_ms)` — atomic increment + 한도 비교 (분산 환경에서 인스턴스 간 카운터 공유)

### Schema 셋업

빈 Supabase 프로젝트에 적용하려면 **`supabase/schema.sql`** 한 파일을 SQL Editor에서 실행하면 끝납니다. 멱등(재실행 안전)이며 다음을 모두 포함:

- `vector` 확장 활성화
- `rate_limits` 테이블 + 인덱스
- `posts.embedding` 컬럼 + HNSW 인덱스
- `profiles.username` unique 인덱스
- 위 3개 RPC 함수 + `auth.users` 트리거
- 10개 테이블 RLS 활성화 + 13개 정책 (본인 행만 SELECT/INSERT/UPDATE 등)
- 일부 테이블 anon/authenticated SELECT GRANT 회수 (이중 방어)

---

## 설치 및 실행

```bash
# 1. 의존성
npm install

# 2. Supabase 스키마 셋업 (빈 프로젝트에 1회)
#    Supabase Dashboard > SQL Editor 에서 supabase/schema.sql 내용을 실행
#    (테이블 ALTER, RPC, RLS, 트리거 모두 포함 — 멱등)

# 3. 환경변수 설정
cp .env.local.example .env.local
# 위 환경 변수 표 참조하여 채움

# 4. 실행
npm run dev          # 개발 서버
npm run build        # 프로덕션 빌드
npm start            # 프로덕션 서버
npm run lint         # ESLint
npm run dev:restart  # 포트 점유 노드 정리 후 재시작
```

## 환경 변수 (`.env.local`)

`src/env.ts`에서 zod schema로 시작 시점 검증합니다 (fail-fast). 누락/형식 오류는 즉시 에러.

| 변수 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | — | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | — | Supabase anon key (RLS로 보호) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | — | 서버 전용 service role key |
| `OPENAI_API_KEY` | ✅ | — | 챗봇 답변 생성 (GPT-4o) |
| `CRON_SECRET` | ✅ | — | `/api/crawl` Bearer 토큰 |
| `OLLAMA_HOST` | 선택 | `http://localhost:11434` | Ollama 서버 |
| `OLLAMA_MODEL` | 조건부 | — | LLM 분석 모델. `LLM_ENABLED=true`일 때 필수 (예: `gemma4:e4b-it-q4_K_M`) |
| `OLLAMA_EMBED_MODEL` | 선택 | `bge-m3` | 임베딩 모델 (1024d) |
| `LLM_ENABLED` | 선택 | `false` | `true` 시 Ollama 텍스트 분석 활성. 로컬 dev에서만 권장 (Vercel은 default false로 자동 비활성) |
| `CHAT_AGENTIC_RAG` | 선택 | `false` | `true` 시 챗봇이 GPT-4o function calling 기반 agentic RAG로 동작 |
| `CLOVA_OCR_URL` | 선택 | — | 이미지 공지 OCR — 미설정 시 이미지 공지 스킵 |
| `CLOVA_OCR_SECRET` | 선택 | — | CLOVA OCR API key |
| `SKIP_ENV_VALIDATION` | 선택 | `false` | CI/Docker 빌드 시점에 검증 우회용 |

> **Vercel 배포**: 위 ✅ 5개만 설정하면 자동으로 `LLM_ENABLED=false`(default) → Ollama 호출 차단 + 키워드 폴백으로 작동. 추가 변수 불필요.
>
> **로컬 dev**: `.env.local.example`을 참고해 `LLM_ENABLED=true` + `OLLAMA_MODEL=...` 명시 시 LLM 분석/임베딩 활성.

---

## 배포

Vercel에 배포되며, 크롤링 API는 서버리스 함수 한도를 늘려 운영합니다.

```json
{
  "functions": {
    "src/app/api/crawl/route.ts": { "maxDuration": 60, "memory": 1024 }
  }
}
```

Vercel Cron으로 주기적인 `/api/crawl` 호출을 트리거합니다.

---

## 활동유형 분류

| ID | 이름 | 아이콘 | 설명 |
|----|------|--------|------|
| 1 | 공모전 | 🏆 | 경진대회·콘테스트 |
| 2 | 대외활동 | 🌍 | 외부 프로그램·체험 |
| 3 | 서포터즈/기자단 | 📢 | 홍보대사·앰배서더·학보·기자단 |
| 4 | 인턴십/채용 | 💼 | 실제 채용·인턴 (취업박람회 제외) |
| 5 | 봉사활동 | 🤝 | 자원봉사 |
| 6 | 교육/특강 | 📚 | 세미나·워크숍·캠프·취업박람회 |
| 7 | 장학금/지원 | 💰 | 장학금·근로장학(튜터·순찰대 등) |
| 8 | 기타 | 📌 | 기숙사·행정 공지 |

## 캠퍼스 코드

| 코드 | 이름 | 단과대학 |
|------|------|---------|
| common | 공통 | 전체 |
| kongju | 공주(신관) | 사범대·인문사회과학대·자연과학대·간호보건대·예술대 |
| cheonan | 천안 | 공과대학 |
| yesan | 예산 | 산업과학대학 |

---

## 문서

| 문서 | 한국어 | English |
|------|--------|---------|
| API Reference | [한국어](doc/api/api-reference.ko.md) | [English](doc/api/api-reference.en.md) |
| System Architecture | [한국어](doc/architecture/system-architecture.ko.md) | [English](doc/architecture/system-architecture.en.md) |
| Feature Specification | [한국어](doc/features/feature-specification.ko.md) | [English](doc/features/feature-specification.en.md) |
