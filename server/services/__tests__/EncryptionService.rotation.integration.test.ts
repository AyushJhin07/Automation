import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_MASTER_KEY = 'c'.repeat(64);
process.env.KMS_PROVIDER = 'local';

const { setDatabaseClientForTests } = await import('../../database/schema.js');
const { EncryptionService } = await import('../EncryptionService.js');
const { resetKmsClientForTests } = await import('../kms/KmsClient.js');

let currentRows: Array<Record<string, any>> = [];

const mockDb = {
  async execute() {
    return { rows: currentRows };
  },
};

setDatabaseClientForTests(mockDb);
resetKmsClientForTests();
EncryptionService.resetForTests();
await EncryptionService.init();

const legacyDerived = randomBytes(32).toString('base64');
const legacySecret = { apiKey: 'legacy-before-rotation' };
const rotatedSecret = { apiKey: 'kms-after-rotation' };

currentRows = [
  {
    id: 'legacy-record',
    key_id: 'legacy-record-key',
    derived_key: legacyDerived,
    status: 'active',
    kms_key_arn: null,
    alias: 'legacy/test',
  },
];

await EncryptionService.refreshKeyMetadata();
const legacyResult = await EncryptionService.encryptCredentials(legacySecret);
assert.equal(legacyResult.dataKeyCiphertext ?? null, null, 'legacy encryptions should not include data key ciphertext');
assert.equal(legacyResult.keyId, 'legacy-record', 'legacy encryption should use legacy key record');

currentRows = [
  {
    id: 'legacy-record',
    key_id: 'legacy-record-key',
    derived_key: legacyDerived,
    status: 'rotating',
    kms_key_arn: null,
    alias: 'legacy/test',
  },
  {
    id: 'kms-record',
    key_id: 'local/test-kms-key',
    derived_key: null,
    status: 'active',
    kms_key_arn: 'local/test-kms-key',
    alias: 'kms/latest',
  },
];

await EncryptionService.refreshKeyMetadata();

const decryptedLegacy = await EncryptionService.decryptCredentials(
  legacyResult.encryptedData,
  legacyResult.iv,
  legacyResult.keyId,
  legacyResult.dataKeyCiphertext ?? null
);
assert.deepEqual(decryptedLegacy, legacySecret, 'legacy ciphertext should remain decryptable after rotation');

const rotatedResult = await EncryptionService.encryptCredentials(rotatedSecret);
assert.equal(rotatedResult.keyId, 'kms-record', 'new encryptions should target active KMS key');
assert.ok(rotatedResult.dataKeyCiphertext, 'new encryptions must include encrypted data key payload');

const decryptedRotated = await EncryptionService.decryptCredentials(
  rotatedResult.encryptedData,
  rotatedResult.iv,
  rotatedResult.keyId,
  rotatedResult.dataKeyCiphertext ?? null
);
assert.deepEqual(decryptedRotated, rotatedSecret, 'KMS-encrypted ciphertext should decrypt with generated data key');

EncryptionService.resetForTests();
resetKmsClientForTests();

console.log('EncryptionService rotation integration scenario verified.');
