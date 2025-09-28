-- Ensure the users table has an email_verified flag for tracking verification state
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "email_verified" boolean DEFAULT false NOT NULL;

-- Backfill existing records with the default (false) to avoid NULL states
UPDATE "users"
SET "email_verified" = COALESCE("email_verified", false);

-- Support lookups by verification state in combination with active status
CREATE INDEX IF NOT EXISTS "users_email_verified_idx"
  ON "users" ("email_verified", "is_active");
