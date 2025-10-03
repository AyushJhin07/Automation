import { sql } from 'drizzle-orm';

type MigrationClient = { execute: (query: any) => Promise<unknown> };

export async function up(db: MigrationClient): Promise<void> {
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
    ADD CONSTRAINT "execution_logs_pkey" PRIMARY KEY ("execution_id")
  `);

  await db.execute(sql`
    ALTER TABLE "node_logs"
    ADD CONSTRAINT "node_logs_execution_id_fkey"
    FOREIGN KEY ("execution_id") REFERENCES "execution_logs"("execution_id") ON DELETE CASCADE
  `);
}
