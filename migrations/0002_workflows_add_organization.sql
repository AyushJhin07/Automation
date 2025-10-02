ALTER TABLE "workflows" ADD COLUMN "organization_id" uuid;
ALTER TABLE "workflow_executions" ADD COLUMN "organization_id" uuid;

ALTER TABLE "workflows"
  ADD CONSTRAINT "workflows_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id")
  REFERENCES "organizations"("id")
  ON DELETE cascade;

ALTER TABLE "workflow_executions"
  ADD CONSTRAINT "workflow_executions_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id")
  REFERENCES "organizations"("id")
  ON DELETE cascade;

WITH membership AS (
  SELECT
    om.user_id,
    om.organization_id,
    row_number() OVER (
      PARTITION BY om.user_id
      ORDER BY om.is_default DESC,
        om.joined_at DESC NULLS LAST,
        om.created_at DESC NULLS LAST
    ) AS rn
  FROM organization_members om
  WHERE om.status = 'active'
)
UPDATE workflows w
SET organization_id = m.organization_id
FROM membership m
WHERE w.user_id = m.user_id
  AND m.rn = 1
  AND w.organization_id IS NULL;

UPDATE workflow_executions we
SET organization_id = w.organization_id
FROM workflows w
WHERE we.workflow_id = w.id
  AND we.organization_id IS NULL
  AND w.organization_id IS NOT NULL;

WITH membership AS (
  SELECT
    om.user_id,
    om.organization_id,
    row_number() OVER (
      PARTITION BY om.user_id
      ORDER BY om.is_default DESC,
        om.joined_at DESC NULLS LAST,
        om.created_at DESC NULLS LAST
    ) AS rn
  FROM organization_members om
  WHERE om.status = 'active'
)
UPDATE workflow_executions we
SET organization_id = m.organization_id
FROM membership m
WHERE we.user_id = m.user_id
  AND m.rn = 1
  AND we.organization_id IS NULL;

DROP INDEX IF EXISTS "workflows_user_idx";
DROP INDEX IF EXISTS "workflows_user_active_idx";
DROP INDEX IF EXISTS "workflows_user_category_idx";
DROP INDEX IF EXISTS "executions_workflow_idx";
DROP INDEX IF EXISTS "executions_user_idx";
DROP INDEX IF EXISTS "executions_workflow_time_idx";

CREATE INDEX "workflows_user_idx"
  ON "workflows" ("organization_id", "user_id");

CREATE INDEX "workflows_user_active_idx"
  ON "workflows" ("organization_id", "user_id", "is_active");

CREATE INDEX "workflows_user_category_idx"
  ON "workflows" ("organization_id", "user_id", "category");

CREATE INDEX "executions_workflow_idx"
  ON "workflow_executions" ("organization_id", "workflow_id");

CREATE INDEX "executions_user_idx"
  ON "workflow_executions" ("organization_id", "user_id");

CREATE INDEX "executions_workflow_time_idx"
  ON "workflow_executions" ("organization_id", "workflow_id", "started_at");

ALTER TABLE "workflows"
  ALTER COLUMN "organization_id" SET NOT NULL;

ALTER TABLE "workflow_executions"
  ALTER COLUMN "organization_id" SET NOT NULL;
