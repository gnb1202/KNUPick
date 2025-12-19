# KNUPick

공주대학교 학생을 위한 공모전, 대외활동, 장학금 등 기회 매칭 서비스

🔗 **서비스 바로가기**: [https://knu-pick.vercel.app](https://knu-pick.vercel.app)

## 📚 Documentation

| 문서 | 한국어 | English |
|------|--------|---------|
| API Reference | [한국어](doc/api/api-reference.ko.md) | [English](doc/api/api-reference.en.md) |
| System Architecture | [한국어](doc/architecture/system-architecture.ko.md) | [English](doc/architecture/system-architecture.en.md) |
| Feature Specification | [한국어](doc/features/feature-specification.ko.md) | [English](doc/features/feature-specification.en.md) |

## 주요 기능

- **맞춤 피드**: 학과 및 관심 활동 유형 기반 게시물 필터링
- **자동 크롤링**: 공주대학교 학생소식란 자동 수집
- **AI 분석**: 로컬 LLM(Ollama)을 활용한 게시물 자동 요약 및 분류
- **스마트 분류**: 8개 활동 유형 자동 분류 (🏆공모전, 🌍대외활동, 📢서포터즈, 💼인턴/채용, 🤝봉사, 📚교육, 💰장학금, 📌기타)
- **D-day 표시**: 마감일까지 남은 일수 시각화
- **마감 캘린더**: 월별 마감일/행사일 캘린더 뷰 (행사 시작·종료일 구분 표시)
- **마감 필터**: 마감된 일정 표시/숨기기 토글
- **정렬 옵션**: 최신순/마감임박순 정렬
- **캠퍼스 필터**: 공주/천안/예산 캠퍼스별 필터링
- **다크 모드**: 라이트/다크/시스템 테마 지원
- **사용자 프로필**: 학과, 캠퍼스, 관심 활동 저장 (로그인 시 자동 필터 적용)
- **관리자 대시보드**: 게시물/사용자 관리, 통계 확인

## 기술 스택

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS 4
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **AI/LLM**: Ollama (EXAONE 3.5 7.8B) - 요약, 활동유형 분류, 마감일/행사일 추출
- **Crawling**: Puppeteer Core, @sparticuz/chromium (Vercel 서버리스), Cheerio
- **Deployment**: Vercel

## 프로젝트 구조

```
src/
├── app/
│   ├── api/
│   │   ├── posts/route.ts        # 게시물 조회 API
│   │   ├── crawl/route.ts        # 크롤링 API
│   │   ├── departments/route.ts  # 학과 목록 API
│   │   ├── llm/test/route.ts     # LLM 연결 테스트 API
│   │   └── admin/                # 관리자 API
│   │       ├── posts/route.ts    # 게시물 관리
│   │       ├── users/route.ts    # 사용자 관리
│   │       └── stats/route.ts    # 통계 조회
│   ├── login/                    # 로그인
│   ├── signup/                   # 회원가입
│   ├── profile/                  # 프로필 설정
│   ├── calendar/                 # 마감/행사 캘린더
│   ├── admin/                    # 관리자 대시보드
│   │   ├── page.tsx              # 대시보드 메인
│   │   ├── posts/page.tsx        # 게시물 관리
│   │   └── users/page.tsx        # 사용자 관리
│   └── page.tsx                  # 메인 피드
├── components/
│   ├── Header.tsx                # 헤더 + 테마 토글 + 관리자 링크
│   ├── FilterPanel.tsx           # 학과/캠퍼스/마감 필터
│   ├── PostCard.tsx              # 게시물 카드 (D-day, 이미지 공지 표시)
│   ├── PostList.tsx              # 게시물 목록
│   ├── Calendar.tsx              # 마감/행사 캘린더 (시작·종료일 구분)
│   └── EmptyState.tsx            # 빈 상태 + 추천 버튼
├── contexts/
│   ├── AuthContext.tsx           # 인증 상태 관리
│   └── ThemeContext.tsx          # 테마(다크모드) 관리
├── lib/
│   ├── crawler.ts                # 웹 크롤러 (Puppeteer)
│   ├── categorizer.ts            # 키워드 기반 활동유형 분류
│   ├── llm.ts                    # Ollama LLM 클라이언트 (통합 분석)
│   ├── constants.ts              # 학과, 활동유형, 캠퍼스 데이터
│   └── supabase.ts               # Supabase 클라이언트
└── types/
    └── index.ts                  # TypeScript 타입 정의
```

## API

### GET /api/posts
게시물 목록 조회

| 파라미터 | 설명 |
|---------|------|
| page | 페이지 번호 (기본값: 1) |
| pageSize | 페이지당 항목 수 (기본값: 20) |
| departmentId | 학과 ID (1-based index) |
| activityTypes | 활동 유형 ID (콤마 구분, 예: 1,2,3) |
| campus | 캠퍼스 코드 (common, kongju, cheonan, yesan) |
| sort | 정렬 방식 (latest: 최신순, deadline: 마감임박순) |
| hasDeadline | 마감일 있는 게시글만 (true/false) |
| startDate | 마감일 시작 범위 (YYYY-MM-DD) |
| endDate | 마감일 종료 범위 (YYYY-MM-DD) |

### GET/POST /api/crawl
크롤링 실행 (CRON_SECRET Bearer 인증 필요)

```bash
curl -X POST http://localhost:3000/api/crawl \
  -H "Authorization: Bearer ${CRON_SECRET}"
```

### GET /api/departments
학과 목록 조회

### GET /api/admin/stats
관리자 통계 조회 (x-user-id 헤더 필요)

## 데이터베이스

### posts 테이블
| 컬럼 | 타입 | 설명 |
|-----|------|------|
| id | integer | PK |
| title | text | 제목 |
| content | text | 내용 |
| summary | text | AI 요약 (200자 이내) |
| original_url | text | 원본 링크 (단축 URL) |
| posted_date | date | 게시일 |
| deadline | date | 모집/신청 마감일 |
| event_start_date | date | 행사/교육 시작일 |
| event_end_date | date | 행사/교육 종료일 |
| activity_types | integer[] | 활동 유형 ID 배열 |
| keywords | text[] | 키워드 (학과 매칭용) |
| campus | text | 캠퍼스 (common/kongju/cheonan/yesan) |
| created_at | timestamp | 생성일시 |
| updated_at | timestamp | 수정일시 |

### profiles 테이블
| 컬럼 | 타입 | 설명 |
|-----|------|------|
| id | uuid | PK (auth.users FK) |
| username | text | 사용자명 |
| nickname | text | 닉네임 |
| campus | text | 캠퍼스 |
| department_id | integer | 학과 ID |
| preferred_activity_types | integer[] | 관심 활동 유형 |
| is_admin | boolean | 관리자 여부 |
| created_at | timestamp | 생성일시 |
| updated_at | timestamp | 수정일시 |

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 빌드
npm run build

# 프로덕션 서버 실행
npm start

# Lint 검사
npm run lint
```

## 환경 변수

`.env.local` 파일 생성:

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Cron
CRON_SECRET=your_cron_secret

# LLM (optional)
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=exaone3.5:7.8b
LLM_ENABLED=true
```

## 배포

Vercel에 배포됩니다. `vercel.json`에서 서버리스 함수 설정:

```json
{
  "functions": {
    "src/app/api/crawl/route.ts": {
      "maxDuration": 60,
      "memory": 1024
    }
  }
}
```

### 활동유형 분류

| ID | 이름 | 아이콘 | 설명 |
|----|------|--------|------|
| 1 | 공모전 | 🏆 | 경진대회, 콘테스트 |
| 2 | 대외활동 | 🌍 | 대외활동, 프로그램 |
| 3 | 서포터즈/기자단 | 📢 | 홍보대사, 앰배서더 |
| 4 | 인턴십/채용 | 💼 | 인턴, 취업, 채용 |
| 5 | 봉사활동 | 🤝 | 자원봉사 |
| 6 | 교육/특강 | 📚 | 세미나, 워크숍, 캠프 |
| 7 | 장학금/지원 | 💰 | 장학금, 지원금 |
| 8 | 기타 | 📌 | 기숙사, 행정 공지 등 |

### 캠퍼스 코드

| 코드 | 이름 | 단과대학 |
|-----|------|---------|
| common | 공통 | 전체 |
| kongju | 공주(신관) | 사범대, 인문사회과학대, 자연과학대, 간호보건대, 예술대 |
| cheonan | 천안 | 공과대학 |
| yesan | 예산 | 산업과학대학 |
