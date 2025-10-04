import crypto from 'node:crypto';
import process from 'node:process';

import { sql } from 'drizzle-orm';

import { db, encryptionKeys } from '../server/database/schema';

function assertDatabaseConnection() {
  if (!db) {
    throw new Error('Database client is not configured. Set DATABASE_URL before running the seed script.');
  }
}

function deriveKey(masterKey: string): string {
  if (masterKey.length < 32) {
    throw new Error('ENCRYPTION_MASTER_KEY must be at least 32 characters long to derive a 256-bit key.');
  }
  const buffer = crypto.scryptSync(masterKey, 'salt', 32);
  return buffer.toString('base64');
}

async function seed(): Promise<void> {
  assertDatabaseConnection();

  const result = await db.execute(
    sql`SELECT id FROM ${encryptionKeys} WHERE status = 'active' LIMIT 1`
  );
  const rows = Array.isArray((result as { rows?: unknown[] }).rows)
    ? ((result as { rows: unknown[] }).rows as Array<Record<string, any>>)
    : [];

  if (rows.length > 0) {
    const existing = rows[0]?.id as string | undefined;
    console.log(`✅ Active encryption key already present (id=${existing ?? 'unknown'}).`);
    return;
  }

  const masterKey = process.env.ENCRYPTION_MASTER_KEY;
  if (!masterKey) {
    throw new Error(
      'ENCRYPTION_MASTER_KEY is required to seed the initial encryption key. Run scripts/bootstrap-secrets.ts first or export the variable manually.'
    );
  }

  const derivedKey = deriveKey(masterKey);
  const keyId = process.env.DEFAULT_ENCRYPTION_KEY_ID ?? 'local-dev/master';
  const alias = process.env.DEFAULT_ENCRYPTION_KEY_ALIAS ?? 'local-dev default key';
  const kmsKeyArn = process.env.DEFAULT_ENCRYPTION_KMS_KEY_ARN ?? null;

  const inserted = await db.execute(sql`
    INSERT INTO "encryption_keys" ("key_id", "alias", "kms_key_arn", "derived_key", "status", "activated_at")
    VALUES (${keyId}, ${alias}, ${kmsKeyArn}, ${derivedKey}, 'active', NOW())
    ON CONFLICT ("key_id") DO UPDATE
      SET "alias" = EXCLUDED."alias",
          "kms_key_arn" = EXCLUDED."kms_key_arn",
          "derived_key" = EXCLUDED."derived_key",
          "status" = 'active',
          "activated_at" = COALESCE("encryption_keys"."activated_at", NOW()),
          "updated_at" = NOW()
    RETURNING "id"
  `);

  const insertedRows = Array.isArray((inserted as { rows?: unknown[] }).rows)
    ? ((inserted as { rows: unknown[] }).rows as Array<Record<string, any>>)
    : [];

  const recordId = insertedRows[0]?.id as string | undefined;
  if (!recordId) {
    throw new Error('Failed to insert or fetch the encryption key id.');
  }

  console.log(`✅ Seeded active encryption key ${recordId} (key_id=${keyId}).`);
}

seed().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`❌ Failed to seed encryption key: ${message}`);
  process.exitCode = 1;
});
