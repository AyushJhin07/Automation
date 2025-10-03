import { sql } from 'drizzle-orm';

export async function up(db: any): Promise<void> {
  await db.execute(sql`alter table "polling_triggers" add column if not exists "cursor" jsonb`);
  await db.execute(
    sql`alter table "polling_triggers" add column if not exists "backoff_count" integer not null default 0`,
  );
  await db.execute(sql`alter table "polling_triggers" add column if not exists "last_status" text`);
}

export async function down(db: any): Promise<void> {
  await db.execute(sql`alter table "polling_triggers" drop column if exists "cursor"`);
  await db.execute(sql`alter table "polling_triggers" drop column if exists "backoff_count"`);
  await db.execute(sql`alter table "polling_triggers" drop column if exists "last_status"`);
}
