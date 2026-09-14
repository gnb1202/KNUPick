-- Private pilot captures. No existing notice, profile, or recommendation data changes.
CREATE TABLE public.chat_observations (
  request_id uuid PRIMARY KEY,
  tester_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  previous_request_id uuid,
  consent_version text NOT NULL CHECK (consent_version = 'chat-observation-v1'),
  started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('in_progress','completed','error','cancelled','timed_out','unknown')),
  revision integer NOT NULL CHECK (revision > 0),
  ended_at timestamptz,
  duration_ms integer CHECK (duration_ms >= 0),
  first_text_ms integer CHECK (first_text_ms >= 0),
  error_code text CHECK (length(error_code) <= 100),
  payload jsonb NOT NULL CHECK (
    jsonb_typeof(payload) = 'object' AND payload ? 'schemaVersion'
    AND payload->>'schemaVersion' = 'chat-observation-v1'
    AND octet_length(payload::text) <= 262144
  ),
  CHECK (expires_at = started_at + interval '30 days'),
  CHECK ((status = 'in_progress' AND ended_at IS NULL AND duration_ms IS NULL)
    OR (status <> 'in_progress' AND ended_at IS NOT NULL AND duration_ms IS NOT NULL))
);
CREATE INDEX chat_observations_started_idx ON public.chat_observations(started_at DESC);
CREATE INDEX chat_observations_expires_idx ON public.chat_observations(expires_at);
CREATE INDEX chat_observations_session_idx ON public.chat_observations(tester_user_id, session_id, started_at);
ALTER TABLE public.chat_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_observations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_observations TO service_role;

-- The server generates request identity. Revision guards also reject a delayed
-- database write after the HTTP client has timed out; ordering in JS is insufficient.
CREATE FUNCTION public.save_chat_observation(p_record jsonb) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  INSERT INTO public.chat_observations AS stored
    (request_id, tester_user_id, session_id, previous_request_id, consent_version,
     started_at, expires_at, status, revision, ended_at, duration_ms, first_text_ms, error_code, payload)
  VALUES
    ((p_record->>'request_id')::uuid, (p_record->>'tester_user_id')::uuid,
     (p_record->>'session_id')::uuid, (p_record->>'previous_request_id')::uuid,
     p_record->>'consent_version', (p_record->>'started_at')::timestamptz,
     (p_record->>'started_at')::timestamptz + interval '30 days', p_record->>'status',
     (p_record->>'revision')::integer, (p_record->>'ended_at')::timestamptz,
     (p_record->>'duration_ms')::integer, (p_record->>'first_text_ms')::integer,
     p_record->>'error_code', p_record->'payload')
  ON CONFLICT (request_id) DO UPDATE SET
    status = excluded.status, revision = excluded.revision, ended_at = excluded.ended_at,
    duration_ms = excluded.duration_ms, first_text_ms = excluded.first_text_ms,
    error_code = excluded.error_code, payload = excluded.payload
  WHERE stored.tester_user_id = excluded.tester_user_id AND stored.session_id = excluded.session_id
    AND stored.started_at = excluded.started_at AND stored.status = 'in_progress'
    AND stored.revision < excluded.revision;
$$;
REVOKE ALL ON FUNCTION public.save_chat_observation(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_chat_observation(jsonb) TO service_role;
