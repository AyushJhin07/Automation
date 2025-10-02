import assert from 'node:assert/strict';
import { rmSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

process.env.NODE_ENV = 'development';

const originalCwd = process.cwd();
const tempDir = path.join(originalCwd, '.data', 'secret-audit-log-test');
if (!existsSync(tempDir)) {
  mkdirSync(tempDir, { recursive: true });
}
process.chdir(tempDir);

const { recordSecretEvent, readSecretEvents } = await import('../SecretsAuditLog.js');

recordSecretEvent({ type: 'write', provider: 'gmail', source: 'provider-config', metadata: { action: 'upsert' } });
recordSecretEvent({ type: 'read', provider: 'gmail', source: 'provider-config', metadata: { action: 'test' } });

const events = readSecretEvents(10);
assert.ok(events.length >= 2, 'events are persisted to audit log');
assert.equal(events.at(-1)?.type, 'read');

process.chdir(originalCwd);
rmSync(tempDir, { recursive: true, force: true });

console.log('SecretsAuditLog records and retrieves secret events.');
