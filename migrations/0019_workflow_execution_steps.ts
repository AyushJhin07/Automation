import { sql } from 'drizzle-orm';

type MigrationClient = { execute: (query: any) => Promise<unknown> };

export async function up(db: MigrationClient): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "workflow_execution_steps" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "execution_id" uuid NOT NULL REFERENCES "workflow_executions"("id") ON DELETE CASCADE,
      "workflow_id" uuid NOT NULL REFERENCES "workflows"("id") ON DELETE CASCADE,
      "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
      "node_id" text NOT NULL,
      "status" text NOT NULL DEFAULT 'pending',
      "attempts" integer NOT NULL DEFAULT 0,
      "max_attempts" integer,
      "queued_at" timestamptz NOT NULL DEFAULT now(),
      "started_at" timestamptz,
      "completed_at" timestamptz,
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      "input" jsonb,
      "output" jsonb,
      "error" jsonb,
      "deterministic_keys" jsonb,
      "resume_state" jsonb,
      "wait_until" timestamptz,
      "metadata" jsonb
    )
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "workflow_execution_steps_execution_node_idx"
    ON "workflow_execution_steps" ("execution_id", "node_id")
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "workflow_execution_steps_execution_status_idx"
    ON "workflow_execution_steps" ("execution_id", "status")
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "workflow_execution_steps_org_status_idx"
    ON "workflow_execution_steps" ("organization_id", "status")
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "workflow_execution_step_dependencies" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "execution_id" uuid NOT NULL REFERENCES "workflow_executions"("id") ON DELETE CASCADE,
      "step_id" uuid NOT NULL REFERENCES "workflow_execution_steps"("id") ON DELETE CASCADE,
      "depends_on_step_id" uuid NOT NULL REFERENCES "workflow_execution_steps"("id") ON DELETE CASCADE,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "workflow_execution_step_dependencies_unique"
    ON "workflow_execution_step_dependencies" ("step_id", "depends_on_step_id")
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "workflow_execution_step_dependencies_execution_idx"
    ON "workflow_execution_step_dependencies" ("execution_id")
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "workflow_execution_step_dependencies_step_idx"
    ON "workflow_execution_step_dependencies" ("step_id")
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "workflow_execution_step_dependencies_depends_idx"
    ON "workflow_execution_step_dependencies" ("depends_on_step_id")
  `);
}

export async function down(db: MigrationClient): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "workflow_execution_step_dependencies_depends_idx"
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS "workflow_execution_step_dependencies_step_idx"
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS "workflow_execution_step_dependencies_execution_idx"
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS "workflow_execution_step_dependencies_unique"
  `);
  await db.execute(sql`
    DROP TABLE IF EXISTS "workflow_execution_step_dependencies"
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS "workflow_execution_steps_org_status_idx"
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS "workflow_execution_steps_execution_status_idx"
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS "workflow_execution_steps_execution_node_idx"
  `);
  await db.execute(sql`
    DROP TABLE IF EXISTS "workflow_execution_steps"
  `);
}
