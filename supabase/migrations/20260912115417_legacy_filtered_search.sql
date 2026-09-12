-- Additive RPC: apply explicit metadata conditions before vector ranking/LIMIT.
-- Keep legacy_match_posts_at and the existing posts schema unchanged.
BEGIN;
CREATE OR REPLACE FUNCTION legacy_match_posts_filtered_at(
  query_embedding jsonb, match_threshold float, match_count int,
  include_expired boolean, as_of date, filter_activity_types int[],
  filter_campus text, filter_deadline_from date, filter_deadline_to date
)
RETURNS TABLE(post jsonb, similarity float)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, extensions, pg_temp AS $$
  -- This small legacy corpus is ranked exactly within the filtered set. An
  -- outer PostgREST filter after a vector top-k would silently lose matches.
  WITH candidates AS MATERIALIZED (
    SELECT p.* FROM public.posts p
    WHERE p.embedding IS NOT NULL
      AND (include_expired OR p.deadline IS NULL OR p.deadline >= as_of)
      AND (coalesce(cardinality(filter_activity_types), 0) = 0 OR p.activity_types && filter_activity_types)
      AND (filter_campus IS NULL OR p.campus IN ('common', filter_campus))
      AND (filter_deadline_from IS NULL OR p.deadline >= filter_deadline_from)
      AND (filter_deadline_to IS NULL OR p.deadline <= filter_deadline_to)
  )
  SELECT to_jsonb(p) - 'embedding',
    (1 - (p.embedding <=> query_embedding::text::vector(1024)))::float AS similarity
  FROM candidates p
  WHERE (1 - (p.embedding <=> query_embedding::text::vector(1024))) > match_threshold
  ORDER BY p.embedding <=> query_embedding::text::vector(1024), p.id
  LIMIT least(greatest(coalesce(match_count, 5), 1), 20);
$$;
REVOKE ALL ON FUNCTION legacy_match_posts_filtered_at(jsonb,float,int,boolean,date,int[],text,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION legacy_match_posts_filtered_at(jsonb,float,int,boolean,date,int[],text,date,date) TO service_role;
COMMIT;
