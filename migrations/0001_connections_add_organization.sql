ALTER TABLE "connections" ADD COLUMN "organization_id" uuid;
ALTER TABLE "connections"
  ADD CONSTRAINT "connections_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id")
  REFERENCES "organizations"("id")
  ON DELETE cascade;

WITH membership AS (
  SELECT
    om.user_id,
    om.organization_id,
    row_number() OVER (
      PARTITION BY om.user_id
      ORDER BY om.is_default DESC, om.joined_at DESC NULLS LAST, om.created_at DESC NULLS LAST
    ) AS rn
  FROM organization_members om
  WHERE om.status = 'active'
)
UPDATE connections c
SET organization_id = m.organization_id
FROM membership m
WHERE c.user_id = m.user_id
  AND m.rn = 1
  AND c.organization_id IS NULL;

DROP INDEX IF EXISTS "connections_user_provider_idx";
DROP INDEX IF EXISTS "connections_user_provider_name_idx";

CREATE INDEX "connections_user_provider_idx"
  ON "connections" ("organization_id", "user_id", "provider");

CREATE UNIQUE INDEX "connections_user_provider_name_idx"
  ON "connections" ("organization_id", "user_id", "provider", "name");

ALTER TABLE "connections"
  ALTER COLUMN "organization_id" SET NOT NULL;
