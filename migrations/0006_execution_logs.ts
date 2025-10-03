import { sql } from 'drizzle-orm';

type MigrationClient = { execute: (query: any) => Promise<unknown> };

export async function up(db: MigrationClient): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "execution_logs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "execution_id" uuid NOT NULL REFERENCES "workflow_executions"("id") ON DELETE CASCADE,
      "workflow_id" uuid REFERENCES "workflows"("id") ON DELETE SET NULL,
      "workflow_name" text,
      "organization_id" uuid REFERENCES "organizations"("id") ON DELETE SET NULL,
      "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "status" text NOT NULL,
      "started_at" timestamp DEFAULT now() NOT NULL,
      "completed_at" timestamp,
      "duration_ms" integer,
      "trigger_type" text,
      "trigger_data" jsonb,
      "inputs" jsonb,
      "outputs" jsonb,
      "error" text,
      "metadata" jsonb,
      "timeline" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "correlation_id" text NOT NULL,
      "tags" text[],
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "execution_logs_execution_idx" ON "execution_logs" ("execution_id")`
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "execution_logs_workflow_idx" ON "execution_logs" ("organization_id", "workflow_id", "started_at")`
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "execution_logs_status_idx" ON "execution_logs" ("status", "started_at")`
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "execution_logs_correlation_idx" ON "execution_logs" ("correlation_id")`
  );

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "node_logs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "execution_log_id" uuid NOT NULL REFERENCES "execution_logs"("id") ON DELETE CASCADE,
      "execution_id" uuid NOT NULL REFERENCES "workflow_executions"("id") ON DELETE CASCADE,
      "node_id" text NOT NULL,
      "node_type" text,
      "node_label" text,
      "status" text NOT NULL,
      "started_at" timestamp DEFAULT now() NOT NULL,
      "completed_at" timestamp,
      "duration_ms" integer,
      "attempt" integer DEFAULT 1 NOT NULL,
      "max_attempts" integer,
      "input" jsonb,
      "output" jsonb,
      "error" text,
      "metadata" jsonb,
      "timeline" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "node_logs_execution_node_idx" ON "node_logs" ("execution_id", "node_id")`
  );
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "node_logs_status_idx" ON "node_logs" ("status")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "node_logs_started_at_idx" ON "node_logs" ("started_at")`);
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "node_logs_execution_attempt_idx" ON "node_logs" ("execution_id", "node_id", "attempt")`
  );
}

export async function down(db: MigrationClient): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "node_logs"`);
  await db.execute(sql`DROP TABLE IF EXISTS "execution_logs"`);
}
