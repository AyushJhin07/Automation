import { Client } from 'pg';
import dotenv from 'dotenv';
import { resolve } from 'node:path';

// Load env like the server does (best-effort)
dotenv.config();
try { dotenv.config({ path: resolve(process.cwd(), '.env.development') }); } catch {}
try { dotenv.config({ path: resolve(process.cwd(), '.env.local') }); } catch {}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Aborting.');
    process.exit(1);
  }

  const client = new Client({ connectionString: url });

  const sql = `
BEGIN;

LOCK TABLE "execution_logs" IN ACCESS EXCLUSIVE MODE;
LOCK TABLE "node_logs"      IN ACCESS EXCLUSIVE MODE;

-- Drop any FK variants from node_logs → execution_logs
ALTER TABLE "node_logs"
  DROP CONSTRAINT IF EXISTS "node_logs_execution_id_execution_logs_execution_id_fk" CASCADE;

ALTER TABLE "node_logs"
  DROP CONSTRAINT IF EXISTS "node_logs_execution_id_fkey" CASCADE;

-- Drop any PK variants on execution_logs
ALTER TABLE "execution_logs"
  DROP CONSTRAINT IF EXISTS "execution_logs_execution_id_pk" CASCADE;

ALTER TABLE "execution_logs"
  DROP CONSTRAINT IF EXISTS "execution_logs_pkey" CASCADE;

-- Re-create canonical PK
ALTER TABLE "execution_logs"
  ADD CONSTRAINT "execution_logs_pkey" PRIMARY KEY ("execution_id");

-- Re-create canonical FK from node_logs → execution_logs
ALTER TABLE "node_logs"
  ADD CONSTRAINT "node_logs_execution_id_fkey"
  FOREIGN KEY ("execution_id") REFERENCES "execution_logs"("execution_id") ON DELETE CASCADE;

COMMIT;`;

  try {
    await client.connect();
    console.log('🔧 Applying PK/FK fix for execution_logs/node_logs...');
    await client.query(sql);
    console.log('✅ PK/FK fix applied successfully.');
  } catch (error: any) {
    console.error('❌ Failed to apply PK/FK fix:', error?.message || error);
    process.exitCode = 1;
  } finally {
    try { await client.end(); } catch {}
  }
}

main();
