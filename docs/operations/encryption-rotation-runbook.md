# Encryption Key Rotation Runbook

## Overview

The platform now supports multiple customer-managed encryption keys via the new
`encryption_keys` catalog and the `connections.encryption_key_id` foreign key.
Every ciphertext also stores envelope metadata: the
`connections.data_key_ciphertext` payload containing the KMS-wrapped data key,
an optional `connections.data_key_iv` (reserved for KMS providers that return a
nonce), and mirrored copies of the ciphertext/IV in
`connections.payload_ciphertext` / `connections.payload_iv`. The
`EncryptionService` dual-writes key identifiers on each new credential
encryption and can decrypt legacy rows that still rely on a locally derived
key. The `encryption_rotation_jobs` table and the accompanying
`encryption.rotate` queue orchestrate background re-encryption tasks so that
stored secrets migrate to the latest active key without downtime.

This runbook documents the two operational playbooks required to manage the new
crypto pipeline:

1. Rotating data encryption keys and triggering background re-encryption.
2. Distributing refreshed KMS credentials to application services.

## Prerequisites

- Access to the production Postgres instance (Drizzle or direct psql).
- AWS KMS permissions to generate new data keys and retrieve key material.
- The `encryption.rotate` worker (`npm run start:rotation`) running alongside
  the existing execution and scheduler workers.
- Environment variables for the app/worker pods managed via Secrets Manager or
  the deployment orchestrator.

## Baseline Setup Checklist

Run these steps before attempting a rotation so every service agrees on the
current schema and primary key metadata:

1. Apply the latest migrations: `DATABASE_URL=... npx drizzle-kit migrate`.
   This now includes the payload columns (`connections.payload_ciphertext`,
   `connections.payload_iv`) and optional `connections.data_key_iv` metadata in
   addition to the `connections.data_key_ciphertext` payload column and the
   `connections.encryption_key_id` foreign key/index required for dual writes.
   The migration backfills existing rows with mirrored payload data so dual
   writes succeed immediately.
2. Ensure at least one active key record exists in `encryption_keys`. With
   `ENCRYPTION_MASTER_KEY` exported (see `scripts/bootstrap-secrets.ts`), execute
   `npm run seed:encryption-key`. The script derives a 256-bit key from the
   master secret, upserts an `active` row, and logs the resulting record ID.
   Re-run it any time you need to re-assert the primary key in lower
   environments.
3. If you rely on customer-managed KMS, populate
   `DEFAULT_ENCRYPTION_KEY_ID`, `DEFAULT_ENCRYPTION_KEY_ALIAS`, and
   `DEFAULT_ENCRYPTION_KMS_KEY_ARN` before running the seeding script so the
   metadata accurately reflects the upstream key resource.

## 1. Rotate Data Encryption Keys

### 1.1 Prepare New Key Material

1. Provision or enable the next customer-managed key version in your KMS
   provider (AWS KMS alias, GCP Cloud KMS CryptoKey, etc.). Ensure the
   application principals have permissions to `GenerateDataKey`/`Decrypt` on the
   new key.
2. Note the canonical resource identifier (ARN for AWS, resource name for GCP).
   This value is stored in `encryption_keys.kms_key_arn` and used at runtime to
   derive per-secret data keys.

### 1.2 Register the Key in `encryption_keys`

Insert the metadata so the API can begin dual-writing with the new key. Mark any
existing active key as `rotating` to indicate in-flight migration.

```sql
UPDATE encryption_keys
SET status = 'rotating', rotated_at = NOW(), updated_at = NOW()
WHERE status = 'active';

INSERT INTO encryption_keys (key_id, kms_key_arn, alias, status)
VALUES (
  '2025-03-kms',
  'arn:aws:kms:us-east-1:123456789012:key/alias/app/master',
  'prod/app/2025-03',
  'active'
);
```

The legacy `derived_key` column remains nullable for backwards compatibility.
New keys should omit it so that plaintext data keys are never stored in the
database. During rotation the service will request fresh data keys from KMS,
persist the wrapped key in `connections.data_key_ciphertext`, and update the
referenced `encryption_key_id`.

### 1.3 Refresh In-Memory Key Cache

Deployments automatically refresh on boot, but long-running processes can reload
with:

```ts
await EncryptionService.refreshKeyMetadata();
```

This is safe to execute from a REPL or admin route.

### 1.4 Launch a Re-Encryption Job

Use the `ConnectionService` helper or call the rotation service directly:

```ts
const job = await connectionService.startCredentialReencryption();
console.log('Rotation job started:', job.jobId);
```

Behind the scenes this enqueues an `encryption.rotate` job processed by the
`npm run start:rotation` worker. Ensure the worker is online before proceeding.

### 1.5 Monitor Progress

Use the service helpers or inspect the `encryption_rotation_jobs` table:

```ts
const details = await connectionService.getCredentialReencryptionJob(jobId);
console.table(details);
```

A job reaches `completed` when every `connections.encryption_key_id` matches the
new primary key. A `completed_with_errors` status indicates that some rows could
not be re-encrypted—inspect `lastError` and the corresponding connection
`last_error` column for remediation.

### 1.6 Finalize

1. When the job completes, mark the previous key as `retired` to prevent new
   writes:
   ```sql
   UPDATE encryption_keys
   SET status = 'retired', updated_at = NOW()
   WHERE status = 'rotating';
   ```
2. Optionally remove or archive the legacy key material once backups have been
   verified.
3. Review `connection_scoped_tokens` for aged entries with
   `npm run dev:rotation` or the `pruneExpiredScopedTokens` helper if you need to
   trim stale scoped tokens during the same maintenance window.

## 2. Distribute New KMS Credentials

When the upstream KMS master credentials (for envelope encryption) rotate, the
application needs updated IAM access or secret values.

### 2.1 Update Secret Storage

1. Publish the new IAM access keys or AssumeRole policies to the platform secret
   store (AWS Secrets Manager, HashiCorp Vault, etc.).
2. Update deployment manifests (Terraform, Helm, Render dashboard) to point to
   the refreshed secret version.
3. For local development, update `.env` with the fresh
   `ENCRYPTION_MASTER_KEY`/`LOCAL_KMS_SECRET` fallback if required. This secret
   backs the local KMS shim used in unit tests and developer sandboxes.

### 2.2 Roll Pods / Processes

1. Trigger a rolling deployment so every API/worker pod restarts with the new
   credentials.
2. Verify the environment via logs—`EncryptionService` emits
   `🔐 Encryption service initialized successfully` when it can read the keys.

### 2.3 Post-Distribution Validation

1. Run the built-in self-test:
   ```ts
   const healthy = await EncryptionService.selfTest();
   console.log('Encryption self-test:', healthy ? '✅ passed' : '❌ failed');
   ```
2. Confirm that `connectionService.startCredentialReencryption()` succeeds with
   a dry-run in a non-production environment before scheduling the production
   migration.
3. Update the operational calendar with the new key alias and rotation date.

## Troubleshooting

- **Worker offline**: jobs remain `pending`. Start the worker with
  `npm run start:rotation` and requeue the job if necessary.
- **Key cache stale**: call `EncryptionService.refreshKeyMetadata()` and retry.
- **Decryption failures**: inspect the connection row’s `encryption_key_id`. If
  the referenced key was deleted, restore it to the `encryption_keys` table and
  rerun the job.
- **Scoped token cleanup**: use
  `await connectionService.pruneExpiredScopedTokens()` to remove expired or used
  scoped tokens that may accumulate during rotation windows.

Keep this runbook close to your release documentation so the on-call engineer
has a single source of truth during future rotations.
