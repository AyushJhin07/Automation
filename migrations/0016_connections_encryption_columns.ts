import { sql } from 'drizzle-orm';

type MigrationClient = { execute: (query: any) => Promise<unknown> };

export async function up(db: MigrationClient): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "connections"
    ADD COLUMN IF NOT EXISTS "data_key_ciphertext" text
  `);

  await db.execute(sql`
    ALTER TABLE "connections"
    ADD COLUMN IF NOT EXISTS "encryption_key_id" uuid REFERENCES "encryption_keys"("id") ON DELETE SET NULL
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "connections_encryption_key_idx" ON "connections" ("encryption_key_id")
  `);

  await db.execute(sql`
    WITH active_key AS (
      SELECT id
      FROM "encryption_keys"
      WHERE status = 'active'
      ORDER BY COALESCE(activated_at, created_at) DESC
      LIMIT 1
    )
    UPDATE "connections" c
    SET "encryption_key_id" = active_key.id
    FROM active_key
    WHERE active_key.id IS NOT NULL
      AND c."encryption_key_id" IS DISTINCT FROM active_key.id
  `);
}

export async function down(db: MigrationClient): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS "connections_encryption_key_idx"`);
  await db.execute(sql`ALTER TABLE "connections" DROP COLUMN IF EXISTS "encryption_key_id"`);
  await db.execute(sql`ALTER TABLE "connections" DROP COLUMN IF EXISTS "data_key_ciphertext"`);
}
