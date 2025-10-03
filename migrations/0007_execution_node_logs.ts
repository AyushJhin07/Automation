import { sql } from 'drizzle-orm';

type MigrationClient = { execute: (query: any) => Promise<unknown> };

export async function up(db: MigrationClient): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "execution_logs" (
      "execution_id" text PRIMARY KEY,
      "workflow_id" text NOT NULL,
      "workflow_name" text,
      "user_id" text,
      "status" text NOT NULL,
      "start_time" timestamptz NOT NULL DEFAULT now(),
      "end_time" timestamptz,
      "duration_ms" integer,
      "trigger_type" text,
      "trigger_data" jsonb,
      "final_output" jsonb,
      "error" text,
      "total_nodes" integer NOT NULL DEFAULT 0,
      "completed_nodes" integer NOT NULL DEFAULT 0,
      "failed_nodes" integer NOT NULL DEFAULT 0,
      "correlation_id" text,
      "tags" text[],
      "metadata" jsonb,
      "timeline" jsonb,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "node_logs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "execution_id" text NOT NULL REFERENCES "execution_logs"("execution_id") ON DELETE CASCADE,
      "node_id" text NOT NULL,
      "node_type" text,
      "node_label" text,
      "status" text NOT NULL,
      "attempt" integer NOT NULL DEFAULT 1,
      "max_attempts" integer NOT NULL DEFAULT 1,
      "start_time" timestamptz NOT NULL DEFAULT now(),
      "end_time" timestamptz,
      "duration_ms" integer,
      "input" jsonb,
      "output" jsonb,
      "error" text,
      "correlation_id" text,
      "retry_history" jsonb,
      "metadata" jsonb,
      "timeline" jsonb,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS "execution_logs_workflow_idx" ON "execution_logs" ("workflow_id")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "execution_logs_status_idx" ON "execution_logs" ("status")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "execution_logs_start_time_idx" ON "execution_logs" ("start_time")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "execution_logs_correlation_idx" ON "execution_logs" ("correlation_id")`);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS "node_logs_execution_idx" ON "node_logs" ("execution_id")`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "node_logs_execution_node_unique" ON "node_logs" ("execution_id", "node_id")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "node_logs_status_idx" ON "node_logs" ("status")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "node_logs_start_time_idx" ON "node_logs" ("start_time")`);
}

export async function down(db: MigrationClient): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS "node_logs_start_time_idx"`);
  await db.execute(sql`DROP INDEX IF EXISTS "node_logs_status_idx"`);
  await db.execute(sql`DROP INDEX IF EXISTS "node_logs_execution_node_unique"`);
  await db.execute(sql`DROP INDEX IF EXISTS "node_logs_execution_idx"`);
  await db.execute(sql`DROP TABLE IF EXISTS "node_logs"`);

  await db.execute(sql`DROP INDEX IF EXISTS "execution_logs_correlation_idx"`);
  await db.execute(sql`DROP INDEX IF EXISTS "execution_logs_start_time_idx"`);
  await db.execute(sql`DROP INDEX IF EXISTS "execution_logs_status_idx"`);
  await db.execute(sql`DROP INDEX IF EXISTS "execution_logs_workflow_idx"`);
  await db.execute(sql`DROP TABLE IF EXISTS "execution_logs"`);
}
