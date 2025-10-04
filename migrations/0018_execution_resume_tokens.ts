import { sql } from 'drizzle-orm';

type MigrationClient = { execute: (query: any) => Promise<unknown> };

export async function up(db: MigrationClient): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "execution_resume_tokens" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "execution_id" uuid NOT NULL REFERENCES "workflow_executions"("id") ON DELETE CASCADE,
      "workflow_id" uuid NOT NULL REFERENCES "workflows"("id") ON DELETE CASCADE,
      "organization_id" uuid NOT NULL,
      "node_id" text NOT NULL,
      "user_id" uuid,
      "token_hash" text NOT NULL UNIQUE,
      "resume_state" jsonb NOT NULL,
      "initial_data" jsonb,
      "trigger_type" text NOT NULL DEFAULT 'callback',
      "wait_until" timestamptz,
      "metadata" jsonb,
      "expires_at" timestamptz NOT NULL,
      "consumed_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "execution_resume_tokens_execution_idx"
    ON "execution_resume_tokens" ("execution_id")
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "execution_resume_tokens_node_idx"
    ON "execution_resume_tokens" ("node_id")
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "execution_resume_tokens_expires_idx"
    ON "execution_resume_tokens" ("expires_at")
  `);
}

export async function down(db: MigrationClient): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS "execution_resume_tokens_expires_idx"`);
  await db.execute(sql`DROP INDEX IF EXISTS "execution_resume_tokens_node_idx"`);
  await db.execute(sql`DROP INDEX IF EXISTS "execution_resume_tokens_execution_idx"`);
  await db.execute(sql`DROP TABLE IF EXISTS "execution_resume_tokens"`);
}
