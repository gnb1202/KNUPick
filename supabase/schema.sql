-- ============================================================
-- KNUPick — 통합 데이터베이스 schema
--
-- 사용법: Supabase Dashboard > SQL Editor 에서 한 번 실행하면
-- 챗봇/RAG/auth trigger/rate limit이 모두 적용된다.
--
-- 전제: posts, profiles, bookmarks, crawl_logs, post_clicks,
-- post_views, post_department_relevance 등의 핵심 테이블은
-- 이미 존재한다고 가정한다 (Supabase initial setup 또는 별도 관리).
--
-- 멱등(idempotent): 재실행해도 안전하다.
-- ============================================================

-- ============================================================
-- 1. 확장
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;


-- ============================================================
-- 2. 신규 테이블
-- ============================================================

-- rate_limits: API 호출 한도 카운터 (분산 환경 공유)
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key      text        PRIMARY KEY,
  count    integer     NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS rate_limits_reset_at_idx
  ON public.rate_limits (reset_at);


-- ============================================================
-- 3. 기존 테이블 보강
-- ============================================================

-- posts: 임베딩 (1024차원)
-- 현재는 OpenAI text-embedding-3-small(dimensions=1024). 과거 bge-m3도 1024라
-- 컬럼/인덱스는 그대로 재사용한다. 단 두 모델은 벡터 공간이 달라 섞이면 안 된다.
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS embedding vector(1024);

CREATE INDEX IF NOT EXISTS posts_embedding_idx
  ON public.posts USING hnsw (embedding vector_cosine_ops);

-- 벡터 출처. 재임베딩 스크립트가 이 값으로 대상/재개 지점을 판단한다.
-- 'bge-m3' = 레거시(로컬 Ollama), 'text-embedding-3-small' = 현행.
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS embedding_model text;

-- NOTE: OpenAI 전환 시 bge-m3 벡터를 posts_embedding_bge 테이블에 백업했으나,
-- 해당 벡터를 가진 게시물(2026-07 이전)을 전부 삭제하면서 백업 대상이 사라져
-- 테이블을 제거했다. 공급자 전환이 다시 필요하면 scripts/dump-posts.ts로
-- 스냅샷을 뜬 뒤 scripts/reembed-posts.ts를 쓴다.

-- profiles: username 유니크 보장
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key
  ON public.profiles (username);


-- ============================================================
-- 4. RPC 함수
-- ============================================================

-- 4.1 match_posts: pgvector 시맨틱 검색
DROP FUNCTION IF EXISTS public.match_posts(jsonb, float, int, boolean);

CREATE OR REPLACE FUNCTION public.match_posts(
  query_embedding   jsonb,
  match_threshold   float,
  match_count       int,
  include_expired   boolean
)
RETURNS TABLE (
  id                integer,
  title             text,
  summary           text,
  content           text,
  original_url      text,
  posted_date       date,
  deadline          date,
  event_start_date  date,
  event_end_date    date,
  activity_types    int[],
  keywords          text[],
  campus            text,
  similarity        float
)
LANGUAGE plpgsql
AS $$
DECLARE
  emb vector(1024) := query_embedding::text::vector(1024);
BEGIN
  RETURN QUERY
  SELECT
    posts.id,
    posts.title::text,
    posts.summary,
    posts.content,
    posts.original_url::text,
    posts.posted_date,
    posts.deadline,
    posts.event_start_date,
    posts.event_end_date,
    posts.activity_types,
    posts.keywords,
    posts.campus,
    (1 - (posts.embedding <=> emb))::float AS similarity
  FROM posts
  WHERE
    posts.embedding IS NOT NULL
    AND (1 - (posts.embedding <=> emb)) > match_threshold
    AND (
      include_expired
      OR posts.deadline IS NULL
      OR posts.deadline >= CURRENT_DATE
    )
  ORDER BY posts.embedding <=> emb
  LIMIT match_count;
END;
$$;

ALTER FUNCTION public.match_posts(jsonb, float, int, boolean)
  SET search_path = public, pg_temp;


-- 4.2 handle_new_user: auth.users INSERT 시 profiles 자동 생성
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'username',
      SPLIT_PART(NEW.email, '@', 1)
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;


-- 4.3 increment_rate_limit: atomic increment + 한도 비교
DROP FUNCTION IF EXISTS public.increment_rate_limit(text, integer, integer);

CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  p_key       text,
  p_limit     integer,
  p_window_ms integer
)
RETURNS TABLE (allowed boolean, count integer, reset_at timestamptz)
LANGUAGE plpgsql
AS $$
DECLARE
  v_now       timestamptz := now();
  v_new_reset timestamptz := v_now + make_interval(secs => p_window_ms / 1000.0);
  v_count     integer;
  v_reset_at  timestamptz;
BEGIN
  -- 1% 확률로 만료 row 정리 (cron 없이 자연 cleanup)
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limits
    WHERE reset_at < v_now - interval '1 hour';
  END IF;

  INSERT INTO public.rate_limits AS rl (key, count, reset_at)
  VALUES (p_key, 1, v_new_reset)
  ON CONFLICT (key) DO UPDATE SET
    count    = CASE WHEN rl.reset_at < v_now THEN 1           ELSE rl.count + 1 END,
    reset_at = CASE WHEN rl.reset_at < v_now THEN v_new_reset ELSE rl.reset_at END
  RETURNING rl.count, rl.reset_at INTO v_count, v_reset_at;

  RETURN QUERY SELECT
    (v_count <= p_limit) AS allowed,
    v_count              AS count,
    v_reset_at           AS reset_at;
END;
$$;

ALTER FUNCTION public.increment_rate_limit(text, integer, integer)
  SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.increment_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_rate_limit(text, integer, integer) FROM anon, authenticated;


-- ============================================================
-- 5. 트리거
-- ============================================================

-- auth.users INSERT 시 profiles 행 자동 생성
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- 6. 권한
-- ============================================================
-- 클라이언트(anon/authenticated)가 직접 접근하지 않고 서비스 롤
-- API 라우트만 사용하는 테이블의 SELECT 권한을 회수.
-- pgrst의 GraphQL 자동 노출까지 차단된다.

-- rate_limits: 서비스 롤 전용
REVOKE ALL    ON TABLE public.rate_limits             FROM PUBLIC;
REVOKE ALL    ON TABLE public.rate_limits             FROM anon, authenticated;

-- 사용자 인터랙션 기록 / 학과 매핑 / 크롤 로그
REVOKE SELECT ON TABLE public.bookmarks               FROM anon, authenticated;
REVOKE SELECT ON TABLE public.crawl_logs              FROM anon, authenticated;
REVOKE SELECT ON TABLE public.post_clicks             FROM anon, authenticated;
REVOKE SELECT ON TABLE public.post_views              FROM anon, authenticated;
REVOKE SELECT ON TABLE public.post_department_relevance FROM anon, authenticated;


-- ============================================================
-- 7. Row Level Security
-- ============================================================
-- 모든 핵심 테이블에 RLS 활성화. 정책은 멱등(DROP IF EXISTS + CREATE).
-- service_role은 RLS bypass되므로 서버 라우트는 영향 없다.

ALTER TABLE public.activity_types            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crawl_logs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_clicks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_department_relevance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_views                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits               ENABLE ROW LEVEL SECURITY;

-- 7.1 activity_types — 누구나 읽기
DROP POLICY IF EXISTS "Anyone can read activity_types" ON public.activity_types;
CREATE POLICY "Anyone can read activity_types"
  ON public.activity_types FOR SELECT
  USING (true);

-- 7.2 bookmarks — 본인만 SELECT/INSERT/DELETE
DROP POLICY IF EXISTS "Users can view own bookmarks"   ON public.bookmarks;
DROP POLICY IF EXISTS "Users can insert own bookmarks" ON public.bookmarks;
DROP POLICY IF EXISTS "Users can delete own bookmarks" ON public.bookmarks;

CREATE POLICY "Users can view own bookmarks"
  ON public.bookmarks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bookmarks"
  ON public.bookmarks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bookmarks"
  ON public.bookmarks FOR DELETE
  USING (auth.uid() = user_id);

-- 7.3 crawl_logs — 관리자만 SELECT
DROP POLICY IF EXISTS "Admins can read crawl_logs" ON public.crawl_logs;
CREATE POLICY "Admins can read crawl_logs"
  ON public.crawl_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

-- 7.4 departments — 누구나 읽기 (이전 production에 중복 정책이 있었으므로 둘 다 DROP)
DROP POLICY IF EXISTS "Anyone can read departments"           ON public.departments;
DROP POLICY IF EXISTS "Allow public read access on departments" ON public.departments;
CREATE POLICY "Anyone can read departments"
  ON public.departments FOR SELECT
  USING (true);

-- 7.5 post_clicks — anonymous 또는 본인 INSERT
DROP POLICY IF EXISTS "Users can record click" ON public.post_clicks;
CREATE POLICY "Users can record click"
  ON public.post_clicks FOR INSERT
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- 7.6 post_department_relevance — 누구나 읽기
DROP POLICY IF EXISTS "Anyone can read post_department_relevance" ON public.post_department_relevance;
CREATE POLICY "Anyone can read post_department_relevance"
  ON public.post_department_relevance FOR SELECT
  USING (true);

-- 7.7 post_views — 본인만 INSERT
DROP POLICY IF EXISTS "Authenticated users can record own view" ON public.post_views;
CREATE POLICY "Authenticated users can record own view"
  ON public.post_views FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 7.8 posts — 누구나 읽기
DROP POLICY IF EXISTS "Allow public read access on posts" ON public.posts;
CREATE POLICY "Allow public read access on posts"
  ON public.posts FOR SELECT
  USING (true);

-- 7.9 profiles — 본인만 SELECT/INSERT/UPDATE
DROP POLICY IF EXISTS "Users can view own profile"   ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- 7.10 rate_limits — 정책 없음 (RLS 활성만으로 anon/authenticated 전부 차단,
--      service_role만 우회 가능). GRANT/REVOKE(섹션 6)와 함께 이중 방어.


-- ============================================================
-- 8. PostgREST 스키마 캐시 갱신
-- ============================================================
NOTIFY pgrst, 'reload schema';
