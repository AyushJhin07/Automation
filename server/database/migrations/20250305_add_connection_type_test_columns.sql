ALTER TABLE connections
ADD COLUMN IF NOT EXISTS type text;

UPDATE connections
SET type = 'saas'
WHERE type IS NULL;

ALTER TABLE connections
ALTER COLUMN type SET DEFAULT 'saas';

ALTER TABLE connections
ALTER COLUMN type SET NOT NULL;

ALTER TABLE connections
ADD COLUMN IF NOT EXISTS test_status text;

ALTER TABLE connections
ADD COLUMN IF NOT EXISTS test_error text;
