import { sql } from 'drizzle-orm';

type MigrationClient = { execute: (query: any) => Promise<unknown> };

export async function up(db: MigrationClient): Promise<void> {
  await db.execute(sql`ALTER TABLE "polling_triggers" ADD COLUMN IF NOT EXISTS "cursor" json`);
  await db.execute(
    sql`ALTER TABLE "polling_triggers" ADD COLUMN IF NOT EXISTS "backoff_count" integer NOT NULL DEFAULT 0`
  );
  await db.execute(sql`ALTER TABLE "polling_triggers" ADD COLUMN IF NOT EXISTS "last_status" text`);
}

export async function down(db: MigrationClient): Promise<void> {
  await db.execute(sql`ALTER TABLE "polling_triggers" DROP COLUMN IF EXISTS "cursor"`);
  await db.execute(sql`ALTER TABLE "polling_triggers" DROP COLUMN IF EXISTS "backoff_count"`);
  await db.execute(sql`ALTER TABLE "polling_triggers" DROP COLUMN IF EXISTS "last_status"`);
}
