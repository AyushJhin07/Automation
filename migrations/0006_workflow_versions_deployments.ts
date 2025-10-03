import { sql } from 'drizzle-orm';

type MigrationClient = { execute: (query: any) => Promise<unknown> };

export async function up(db: MigrationClient): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "workflow_versions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "workflow_id" uuid NOT NULL REFERENCES "workflows"("id") ON DELETE CASCADE,
      "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
      "version_number" integer NOT NULL,
      "state" text NOT NULL DEFAULT 'draft',
      "graph" jsonb NOT NULL,
      "metadata" jsonb,
      "name" text,
      "description" text,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "published_at" timestamptz,
      "published_by" uuid REFERENCES "users"("id") ON DELETE SET NULL
    )
  `);

  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "workflow_versions_unique_version" ON "workflow_versions" ("workflow_id", "version_number")`
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "workflow_versions_workflow_state_idx" ON "workflow_versions" ("workflow_id", "state")`
  );

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "workflow_deployments" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "workflow_id" uuid NOT NULL REFERENCES "workflows"("id") ON DELETE CASCADE,
      "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
      "version_id" uuid NOT NULL REFERENCES "workflow_versions"("id") ON DELETE CASCADE,
      "environment" text NOT NULL,
      "is_active" boolean NOT NULL DEFAULT true,
      "deployed_at" timestamptz NOT NULL DEFAULT now(),
      "deployed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "metadata" jsonb,
      "rollback_of" uuid REFERENCES "workflow_deployments"("id") ON DELETE SET NULL
    )
  `);

  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "workflow_deployments_workflow_idx" ON "workflow_deployments" ("workflow_id")`
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "workflow_deployments_environment_idx" ON "workflow_deployments" ("workflow_id", "environment")`
  );
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "workflow_deployments_active_environment" ON "workflow_deployments" ("workflow_id", "environment") WHERE "is_active" = true`
  );
}

export async function down(db: MigrationClient): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS "workflow_deployments_active_environment"`);
  await db.execute(sql`DROP INDEX IF EXISTS "workflow_deployments_environment_idx"`);
  await db.execute(sql`DROP INDEX IF EXISTS "workflow_deployments_workflow_idx"`);
  await db.execute(sql`DROP TABLE IF EXISTS "workflow_deployments"`);

  await db.execute(sql`DROP INDEX IF EXISTS "workflow_versions_workflow_state_idx"`);
  await db.execute(sql`DROP INDEX IF EXISTS "workflow_versions_unique_version"`);
  await db.execute(sql`DROP TABLE IF EXISTS "workflow_versions"`);
}
