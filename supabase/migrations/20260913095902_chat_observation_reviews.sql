-- Manual review is independent of the generated execution and user feedback.
ALTER TABLE public.chat_observations
  ADD COLUMN review_verdict text NOT NULL DEFAULT 'unreviewed'
    CHECK (review_verdict IN ('unreviewed', 'pass', 'issue', 'uncertain')),
  ADD COLUMN review_reasons text[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(review_reasons) <= 3 AND review_reasons <@ ARRAY['intent','retrieval','fact','grounding','reference','expression','other']::text[]),
  ADD COLUMN review_comment text CHECK (char_length(review_comment) <= 500),
  ADD COLUMN reviewed_by uuid,
  ADD COLUMN reviewed_at timestamptz,
  ADD CONSTRAINT chat_observation_review_owner CHECK (reviewed_by IS NULL OR reviewed_by = tester_user_id),
  ADD CONSTRAINT chat_observation_review_state CHECK (
    (review_verdict = 'unreviewed' AND reviewed_by IS NULL AND reviewed_at IS NULL AND cardinality(review_reasons) = 0 AND review_comment IS NULL)
    OR (review_verdict <> 'unreviewed' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  );
