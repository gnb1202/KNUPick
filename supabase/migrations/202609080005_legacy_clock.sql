-- Same vector-only baseline, with an explicit clock for reproducible evaluation.
BEGIN;
CREATE OR REPLACE FUNCTION legacy_match_posts_at(query_embedding jsonb, match_threshold float, match_count int, include_expired boolean, as_of date)
RETURNS TABLE(post jsonb,similarity float) LANGUAGE sql STABLE SET search_path=public,extensions,pg_temp AS $$
  SELECT to_jsonb(p)-'embedding',(1-(p.embedding <=> query_embedding::text::vector(1024)))::float
  FROM posts p WHERE embedding IS NOT NULL AND (1-(embedding <=> query_embedding::text::vector(1024)))>match_threshold
    AND (include_expired OR deadline IS NULL OR deadline>=as_of)
  ORDER BY embedding <=> query_embedding::text::vector(1024) LIMIT match_count;
$$;
REVOKE ALL ON FUNCTION legacy_match_posts_at(jsonb,float,int,boolean,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION legacy_match_posts_at(jsonb,float,int,boolean,date) TO service_role;
COMMIT;
