import { sql } from 'drizzle-orm';

interface MigrationClient {
  execute(query: ReturnType<typeof sql>): Promise<unknown>;
}

export async function up(db: MigrationClient): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "connector_definitions"
      ADD COLUMN "semantic_version" text NOT NULL DEFAULT '1.0.0',
      ADD COLUMN "lifecycle_status" text NOT NULL DEFAULT 'stable',
      ADD COLUMN "is_beta" boolean NOT NULL DEFAULT false,
      ADD COLUMN "beta_start_date" timestamp,
      ADD COLUMN "deprecation_start_date" timestamp,
      ADD COLUMN "sunset_date" timestamp
  `);
}

export async function down(db: MigrationClient): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "connector_definitions"
      DROP COLUMN IF EXISTS "semantic_version",
      DROP COLUMN IF EXISTS "lifecycle_status",
      DROP COLUMN IF EXISTS "is_beta",
      DROP COLUMN IF EXISTS "beta_start_date",
      DROP COLUMN IF EXISTS "deprecation_start_date",
      DROP COLUMN IF EXISTS "sunset_date"
  `);
}
