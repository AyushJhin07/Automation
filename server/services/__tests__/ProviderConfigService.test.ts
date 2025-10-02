import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'development';
process.env.ENCRYPTION_MASTER_KEY = process.env.ENCRYPTION_MASTER_KEY ?? 'b'.repeat(32);
process.env.ALLOW_PROVIDER_CONFIG_FILE_STORE = 'true';
process.env.ALLOW_FILE_CONNECTION_STORE = 'true';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'provider-config-service-'));
const storePath = path.join(tempDir, 'provider-configs.json');
process.env.PROVIDER_CONFIG_STORE_PATH = storePath;
process.env.CONNECTION_STORE_PATH = path.join(tempDir, 'connections.json');

const { EncryptionService } = await import('../EncryptionService.js');
await EncryptionService.init();

const { providerConfigService } = await import('../ProviderConfigService.js');
const { oauthManager } = await import('../../oauth/OAuthManager.js');

const record = await providerConfigService.upsertCredential({
  provider: 'gmail',
  clientId: 'client-id-1234567890',
  clientSecret: 'secret-value-1234567890',
  scopes: ['email', 'profile'],
});

assert.equal(record.provider, 'gmail');

const configs = await providerConfigService.listCredentials();
assert.ok(configs.some((config) => config.provider === 'gmail'), 'gmail config persisted');

const status = oauthManager.getProviderConfigurationStatus('gmail');
assert.equal(status.configured, true, 'gmail provider enabled after bootstrap');

const testResult = await providerConfigService.testCredential('gmail');
assert.equal(testResult.success, true);

await fs.rm(tempDir, { recursive: true, force: true });

delete process.env.ALLOW_PROVIDER_CONFIG_FILE_STORE;
delete process.env.ALLOW_FILE_CONNECTION_STORE;

delete process.env.PROVIDER_CONFIG_STORE_PATH;
delete process.env.CONNECTION_STORE_PATH;

console.log('ProviderConfigService encrypts and hydrates provider credentials.');
