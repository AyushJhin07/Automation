import { sql } from 'drizzle-orm';

type MigrationClient = { execute: (query: any) => Promise<unknown> };

export async function up(db: MigrationClient): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "connections"
    ADD COLUMN IF NOT EXISTS "data_key_ciphertext" text
  `);

  await db.execute(sql`
    ALTER TABLE "connections"
    ADD COLUMN IF NOT EXISTS "data_key_iv" text
  `);

  await db.execute(sql`
    ALTER TABLE "connections"
    ADD COLUMN IF NOT EXISTS "payload_ciphertext" text
  `);

  await db.execute(sql`
    ALTER TABLE "connections"
    ADD COLUMN IF NOT EXISTS "payload_iv" text
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'connections'
          AND column_name = 'data_key_ciphertext'
          AND is_nullable = 'NO'
      ) THEN
        ALTER TABLE "connections" ALTER COLUMN "data_key_ciphertext" DROP NOT NULL;
      END IF;
    END $$;
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'connections'
          AND column_name = 'data_key_iv'
          AND is_nullable = 'NO'
      ) THEN
        ALTER TABLE "connections" ALTER COLUMN "data_key_iv" DROP NOT NULL;
      END IF;
    END $$;
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'connections'
          AND column_name = 'payload_ciphertext'
          AND is_nullable = 'NO'
      ) THEN
        ALTER TABLE "connections" ALTER COLUMN "payload_ciphertext" DROP NOT NULL;
      END IF;
    END $$;
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'connections'
          AND column_name = 'payload_iv'
          AND is_nullable = 'NO'
      ) THEN
        ALTER TABLE "connections" ALTER COLUMN "payload_iv" DROP NOT NULL;
      END IF;
    END $$;
  `);

  await db.execute(sql`DROP INDEX IF EXISTS "connections_encryption_key_idx"`);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "connections_encryption_key_idx"
    ON "connections" ("encryption_key_id")
    INCLUDE ("data_key_ciphertext", "data_key_iv", "payload_ciphertext", "payload_iv")
  `);
}

export async function down(db: MigrationClient): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS "connections_encryption_key_idx"`);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "connections_encryption_key_idx"
    ON "connections" ("encryption_key_id")
  `);
}
