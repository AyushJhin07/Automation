import { sql } from 'drizzle-orm';

type MigrationClient = { execute: (query: any) => Promise<unknown> };

export async function up(db: MigrationClient): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "workflow_execution_steps"
    ADD COLUMN IF NOT EXISTS "logs" jsonb,
    ADD COLUMN IF NOT EXISTS "diagnostics" jsonb
  `);
}

export async function down(db: MigrationClient): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "workflow_execution_steps"
    DROP COLUMN IF EXISTS "logs",
    DROP COLUMN IF EXISTS "diagnostics"
  `);
}
