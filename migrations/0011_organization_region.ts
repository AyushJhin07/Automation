import { sql } from 'drizzle-orm';

type MigrationClient = { execute: (query: any) => Promise<unknown> };

const DEFAULT_REGION = process.env.DEFAULT_ORGANIZATION_REGION ?? 'us';

export async function up(db: MigrationClient): Promise<void> {
  await db.execute(
    sql`ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "region" text NOT NULL DEFAULT 'us'`
  );

  await db.execute(
    sql`UPDATE "organizations" SET "region" = COALESCE(NULLIF(lower(("compliance"->>'dataResidency')), ''), ${DEFAULT_REGION})`
  );

  await db.execute(
    sql`UPDATE "organizations" SET "compliance" = jsonb_set(COALESCE("compliance"::jsonb, '{}'::jsonb), '{dataResidency}', to_jsonb(lower("region")))`
  );
}

export async function down(db: MigrationClient): Promise<void> {
  await db.execute(sql`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "region"`);
}
