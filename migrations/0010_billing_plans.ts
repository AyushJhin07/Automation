import { sql } from 'drizzle-orm';

interface MigrationClient {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
}

export async function up(db: MigrationClient): Promise<void> {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS "billing_plans" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "code" text NOT NULL UNIQUE,
    "name" text NOT NULL,
    "price_cents" integer NOT NULL,
    "currency" text NOT NULL DEFAULT 'usd',
    "features" jsonb NOT NULL DEFAULT '[]'::jsonb,
    "usage_quotas" jsonb NOT NULL,
    "organization_limits" jsonb,
    "metadata" jsonb,
    "billing_provider_product_id" text,
    "is_active" boolean NOT NULL DEFAULT true,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now()
  )`);
}

export async function down(db: MigrationClient): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "billing_plans"`);
}
