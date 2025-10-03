import { sql } from 'drizzle-orm';

type MigrationClient = { execute: (query: any) => Promise<unknown> };

export async function up(db: MigrationClient): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "encryption_keys" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "key_id" text NOT NULL,
      "kms_key_arn" text,
      "alias" text,
      "derived_key" text NOT NULL,
      "status" text NOT NULL DEFAULT 'active',
      "metadata" jsonb,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "activated_at" timestamptz,
      "rotated_at" timestamptz,
      "expires_at" timestamptz,
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "encryption_keys_key_id_idx" ON "encryption_keys" ("key_id")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "encryption_keys_status_idx" ON "encryption_keys" ("status")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "encryption_keys_alias_idx" ON "encryption_keys" ("alias")`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "encryption_rotation_jobs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "target_key_id" uuid REFERENCES "encryption_keys"("id") ON DELETE SET NULL,
      "status" text NOT NULL DEFAULT 'pending',
      "total_connections" integer NOT NULL DEFAULT 0,
      "processed" integer NOT NULL DEFAULT 0,
      "failed" integer NOT NULL DEFAULT 0,
      "started_at" timestamptz,
      "completed_at" timestamptz,
      "last_error" text,
      "metadata" jsonb,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS "encryption_rotation_jobs_status_idx" ON "encryption_rotation_jobs" ("status")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "encryption_rotation_jobs_target_key_idx" ON "encryption_rotation_jobs" ("target_key_id")`);

  await db.execute(sql`
    ALTER TABLE "connections"
    ADD COLUMN IF NOT EXISTS "encryption_key_id" uuid REFERENCES "encryption_keys"("id") ON DELETE SET NULL
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS "connections_encryption_key_idx" ON "connections" ("encryption_key_id")`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "connection_scoped_tokens" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "connection_id" uuid NOT NULL REFERENCES "connections"("id") ON DELETE CASCADE,
      "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
      "token_hash" text NOT NULL,
      "scope" jsonb,
      "step_id" text NOT NULL,
      "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "expires_at" timestamptz NOT NULL,
      "used_at" timestamptz,
      "metadata" jsonb,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "connection_scoped_tokens_hash_idx" ON "connection_scoped_tokens" ("token_hash")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "connection_scoped_tokens_expires_idx" ON "connection_scoped_tokens" ("expires_at")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "connection_scoped_tokens_connection_idx" ON "connection_scoped_tokens" ("connection_id")`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS "connection_scoped_tokens_active_idx" ON "connection_scoped_tokens" ("used_at")`);
}

export async function down(db: MigrationClient): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS "connection_scoped_tokens_active_idx"`);
  await db.execute(sql`DROP INDEX IF EXISTS "connection_scoped_tokens_connection_idx"`);
  await db.execute(sql`DROP INDEX IF EXISTS "connection_scoped_tokens_expires_idx"`);
  await db.execute(sql`DROP INDEX IF EXISTS "connection_scoped_tokens_hash_idx"`);
  await db.execute(sql`DROP TABLE IF EXISTS "connection_scoped_tokens"`);

  await db.execute(sql`DROP INDEX IF EXISTS "connections_encryption_key_idx"`);
  await db.execute(sql`ALTER TABLE "connections" DROP COLUMN IF EXISTS "encryption_key_id"`);

  await db.execute(sql`DROP INDEX IF EXISTS "encryption_rotation_jobs_target_key_idx"`);
  await db.execute(sql`DROP INDEX IF EXISTS "encryption_rotation_jobs_status_idx"`);
  await db.execute(sql`DROP TABLE IF EXISTS "encryption_rotation_jobs"`);

  await db.execute(sql`DROP INDEX IF EXISTS "encryption_keys_alias_idx"`);
  await db.execute(sql`DROP INDEX IF EXISTS "encryption_keys_status_idx"`);
  await db.execute(sql`DROP INDEX IF EXISTS "encryption_keys_key_id_idx"`);
  await db.execute(sql`DROP TABLE IF EXISTS "encryption_keys"`);
}
