ALTER TABLE public.chat_observations
  ADD COLUMN feedback_rating text CHECK (feedback_rating IN ('up', 'down')),
  ADD COLUMN feedback_reasons text[] NOT NULL DEFAULT '{}' CHECK (
    cardinality(feedback_reasons) <= 3 AND feedback_reasons <@ ARRAY['intent','retrieval','fact','grounding','reference','expression','other']::text[]),
  ADD COLUMN feedback_comment text CHECK (length(feedback_comment) <= 500),
  ADD COLUMN feedback_updated_at timestamptz,
  ADD CONSTRAINT chat_observation_feedback_cleared CHECK (feedback_rating IS NOT NULL OR
    (cardinality(feedback_reasons) = 0 AND feedback_comment IS NULL));
-- Existing execution RPC updates explicit columns, so it cannot overwrite feedback.
