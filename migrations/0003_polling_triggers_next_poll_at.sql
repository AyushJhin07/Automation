ALTER TABLE polling_triggers
  ADD COLUMN IF NOT EXISTS next_poll_at timestamp NOT NULL DEFAULT NOW();

UPDATE polling_triggers
SET next_poll_at = COALESCE(next_poll, NOW());

CREATE INDEX IF NOT EXISTS polling_triggers_next_poll_at_idx
  ON polling_triggers(next_poll_at);

ALTER TABLE polling_triggers
  ALTER COLUMN next_poll_at DROP DEFAULT;
