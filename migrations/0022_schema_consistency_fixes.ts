import { sql } from 'drizzle-orm';

type MigrationClient = { execute: (query: any) => Promise<unknown> };

export async function up(db: MigrationClient): Promise<void> {
  // Ensure connections table has envelope encryption columns and index
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
    ALTER TABLE "connections"
    ADD COLUMN IF NOT EXISTS "encryption_key_id" uuid REFERENCES "encryption_keys"("id") ON DELETE SET NULL
  `);
  await db.execute(sql`DROP INDEX IF EXISTS "connections_encryption_key_idx"`);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "connections_encryption_key_idx"
    ON "connections" ("encryption_key_id")
    INCLUDE ("data_key_ciphertext", "data_key_iv", "payload_ciphertext", "payload_iv")
  `);

  // Normalize execution_logs primary key and dependent node_logs foreign key
  await db.execute(sql`LOCK TABLE "execution_logs" IN ACCESS EXCLUSIVE MODE`);
  await db.execute(sql`LOCK TABLE "node_logs" IN ACCESS EXCLUSIVE MODE`);

  await db.execute(sql`
    ALTER TABLE "node_logs"
    DROP CONSTRAINT IF EXISTS "node_logs_execution_id_execution_logs_execution_id_fk"
  `);
  await db.execute(sql`
    ALTER TABLE "node_logs"
    DROP CONSTRAINT IF EXISTS "node_logs_execution_id_fkey"
  `);

  await db.execute(sql`
    ALTER TABLE "execution_logs"
    DROP CONSTRAINT IF EXISTS "execution_logs_execution_id_pk" CASCADE
  `);
  await db.execute(sql`
    ALTER TABLE "execution_logs"
    DROP CONSTRAINT IF EXISTS "execution_logs_pkey" CASCADE
  `);

  await db.execute(sql`
    ALTER TABLE "execution_logs"
    ADD CONSTRAINT "execution_logs_execution_id_pk" PRIMARY KEY ("execution_id")
  `);
  await db.execute(sql`
    ALTER TABLE "node_logs"
    ADD CONSTRAINT "node_logs_execution_id_execution_logs_execution_id_fk"
    FOREIGN KEY ("execution_id") REFERENCES "execution_logs"("execution_id") ON DELETE CASCADE
  `);
}

export async function down(db: MigrationClient): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS "connections_encryption_key_idx"`);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "connections_encryption_key_idx"
    ON "connections" ("encryption_key_id")
  `);
  await db.execute(sql`
    ALTER TABLE "connections" DROP COLUMN IF EXISTS "payload_iv"
  `);
  await db.execute(sql`
    ALTER TABLE "connections" DROP COLUMN IF EXISTS "payload_ciphertext"
  `);
  await db.execute(sql`
    ALTER TABLE "connections" DROP COLUMN IF EXISTS "data_key_iv"
  `);
  await db.execute(sql`
    ALTER TABLE "connections" DROP COLUMN IF EXISTS "data_key_ciphertext"
  `);
  await db.execute(sql`
    ALTER TABLE "connections" DROP COLUMN IF EXISTS "encryption_key_id"
  `);

  await db.execute(sql`LOCK TABLE "execution_logs" IN ACCESS EXCLUSIVE MODE`);
  await db.execute(sql`LOCK TABLE "node_logs" IN ACCESS EXCLUSIVE MODE`);
  await db.execute(sql`
    ALTER TABLE "node_logs"
    DROP CONSTRAINT IF EXISTS "node_logs_execution_id_execution_logs_execution_id_fk"
  `);
  await db.execute(sql`
    ALTER TABLE "execution_logs"
    DROP CONSTRAINT IF EXISTS "execution_logs_execution_id_pk" CASCADE
  `);
  await db.execute(sql`
    ALTER TABLE "execution_logs"
    ADD CONSTRAINT "execution_logs_pkey" PRIMARY KEY ("execution_id")
  `);
  await db.execute(sql`
    ALTER TABLE "node_logs"
    ADD CONSTRAINT "node_logs_execution_id_fkey"
    FOREIGN KEY ("execution_id") REFERENCES "execution_logs"("execution_id") ON DELETE CASCADE
  `);
}
