import { sql } from 'drizzle-orm';

type MigrationClient = { execute: (query: any) => Promise<unknown> };

export async function up(db: MigrationClient): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "webhook_dedupe" (
      "trigger_id" text NOT NULL,
      "token" text NOT NULL,
      "created_at" timestamp NOT NULL DEFAULT now(),
      CONSTRAINT "webhook_dedupe_pk" PRIMARY KEY ("trigger_id", "token")
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "webhook_dedupe_trigger_idx" ON "webhook_dedupe" ("trigger_id")
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "webhook_dedupe_created_idx" ON "webhook_dedupe" ("created_at")
  `);
}

export async function down(db: MigrationClient): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS "webhook_dedupe_created_idx"`);
  await db.execute(sql`DROP INDEX IF EXISTS "webhook_dedupe_trigger_idx"`);
  await db.execute(sql`DROP TABLE IF EXISTS "webhook_dedupe"`);
}
