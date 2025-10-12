import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_MASTER_KEY = 'd'.repeat(64);

const { setDatabaseClientForTests } = await import('../../database/schema.js');
const { EncryptionService } = await import('../EncryptionService.js');

const mockDb = {
  async execute() {
    return {
      rows: [
        {
          id: 'legacy-record',
          key_id: 'legacy/test-key',
          derived_key: Buffer.alloc(32, 11).toString('base64'),
          status: 'active',
          kms_key_arn: null,
          alias: 'legacy/test',
        },
      ],
    };
  },
};

setDatabaseClientForTests(mockDb as any);
EncryptionService.resetForTests();
await EncryptionService.init();

function deriveKeystream(key: Buffer, iv: Buffer, length: number): Buffer {
  const info = Buffer.from('apps-script-secret-stream-v1', 'utf8');
  const blockSize = 32;
  const blocks = Math.ceil(length / blockSize);
  const output = Buffer.alloc(blocks * blockSize);
  for (let i = 0; i < blocks; i += 1) {
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(i, 0);
    const digest = createHmac('sha256', key).update(iv).update(counter).update(info).digest();
    digest.copy(output, i * blockSize);
  }
  return output.subarray(0, length);
}

function computeMac(
  key: Buffer,
  iv: Buffer,
  ciphertext: Buffer,
  issuedAt: number,
  expiresAt: number,
  purpose: string | null
): Buffer {
  const info = Buffer.from('apps-script-secret-metadata-v1', 'utf8');
  const hmac = createHmac('sha256', key);
  hmac.update(info);
  hmac.update(iv);
  hmac.update(ciphertext);
  hmac.update(Buffer.from(String(issuedAt), 'utf8'));
  hmac.update(Buffer.from(String(expiresAt), 'utf8'));
  if (purpose) {
    hmac.update(Buffer.from(purpose, 'utf8'));
  }
  return hmac.digest();
}

function simulateAppsScriptDecode(token: string) {
  assert.ok(token.startsWith('AS1.'), 'token should include prefix');
  const raw = token.slice(4);
  const payload = Buffer.from(raw, 'base64').toString('utf8');
  const parsed = JSON.parse(payload);

  assert.equal(parsed.version, 1, 'version marker should equal 1');
  const sharedKey = Buffer.from(parsed.sharedKey, 'base64');
  const iv = Buffer.from(parsed.iv, 'base64');
  const ciphertext = Buffer.from(parsed.ciphertext, 'base64');

  const mac = computeMac(sharedKey, iv, ciphertext, parsed.issuedAt, parsed.expiresAt, parsed.purpose ?? null);
  assert.equal(mac.toString('hex'), parsed.hmac, 'mac should match encoded value');

  const keystream = deriveKeystream(sharedKey, iv, ciphertext.length);
  const plaintext = Buffer.alloc(ciphertext.length);
  for (let i = 0; i < ciphertext.length; i += 1) {
    plaintext[i] = ciphertext[i] ^ keystream[i];
  }

  const sealed = JSON.parse(plaintext.toString('utf8')) as {
    issuedAt: number;
    expiresAt: number;
    purpose: string | null;
    payload: any;
  };

  assert.equal(sealed.issuedAt, parsed.issuedAt, 'sealed payload should echo issuedAt');
  assert.equal(sealed.expiresAt, parsed.expiresAt, 'sealed payload should echo expiresAt');
  assert.equal(sealed.purpose ?? null, parsed.purpose ?? null, 'sealed payload should echo purpose');

  return {
    sealed,
    metadata: parsed,
  };
}

const connectorSecrets = {
  connector: 'slack',
  secrets: {
    SLACK_BOT_TOKEN: 'xoxb-secret',
    SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/TEST',
  },
};

const issuance = await EncryptionService.createAppsScriptSecretToken(connectorSecrets, {
  ttlSeconds: 180,
  purpose: 'connector:slack',
  payloadHint: 'connector-secrets',
});

assert.ok(issuance.token.startsWith('AS1.'), 'issued token should include AS1 prefix');

const simulated = simulateAppsScriptDecode(issuance.token);
assert.deepEqual(simulated.sealed.payload, connectorSecrets, 'simulated decode should recover payload');
assert.equal(simulated.metadata.purpose, 'connector:slack', 'simulated metadata exposes purpose');

const roundTrip = await EncryptionService.readAppsScriptSecretToken<typeof connectorSecrets>(issuance.token, {
  requirePurpose: 'connector:slack',
});

assert.deepEqual(roundTrip.payload, connectorSecrets, 'server decode should recover payload');
assert.equal(roundTrip.metadata.purpose, 'connector:slack', 'server metadata should expose purpose');
assert.equal(roundTrip.metadata.keyId, 'legacy-record', 'server metadata should expose key id');

await assert.rejects(
  async () =>
    EncryptionService.readAppsScriptSecretToken(issuance.token, {
      requirePurpose: 'connector:hubspot',
    }),
  /purpose mismatch/i,
  'purpose mismatch should throw'
);

const tampered = issuance.token.replace('AS1.', 'AS1X.');
assert.throws(() => simulateAppsScriptDecode(tampered), /token should include prefix/, 'tampered prefix should be rejected');

const parsed = JSON.parse(Buffer.from(issuance.token.slice(4), 'base64').toString('utf8'));
parsed.hmac = '00'.repeat(32);
const tamperedMac = 'AS1.' + Buffer.from(JSON.stringify(parsed), 'utf8').toString('base64');
await assert.rejects(
  async () => EncryptionService.readAppsScriptSecretToken(tamperedMac),
  /integrity/i,
  'tampered hmac should be rejected by server decode'
);

EncryptionService.resetForTests();

console.log('Apps Script sealed secret integration scenario verified.');
