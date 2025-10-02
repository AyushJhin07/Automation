import { promises as fs } from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import { db, providerConfigs } from '../database/schema.js';
import { EncryptionService } from './EncryptionService.js';
import { oauthManager } from '../oauth/OAuthManager.js';
import { getErrorMessage } from '../types/common.js';
import { recordSecretEvent } from '../security/SecretsAuditLog.js';

export interface ProviderCredentialInput {
  provider: string;
  clientId: string;
  clientSecret: string;
  scopes?: string[];
  metadata?: Record<string, any>;
}

export interface ProviderCredentialRecord {
  provider: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  metadata: Record<string, any>;
  lastTested?: Date;
  testStatus?: string;
  testError?: string;
  rotationVersion: number;
  updatedAt: Date;
}

type StoredProviderRecord = {
  provider: string;
  encryptedConfig: string;
  iv: string;
  rotationVersion: number;
  metadata: Record<string, any>;
  lastTested?: string;
  testStatus?: string;
  testError?: string;
  updatedAt: string;
};

function normalizeProvider(provider: string): string {
  return provider.trim().toLowerCase();
}

export class ProviderConfigService {
  private readonly useFileStore: boolean;
  private readonly allowFileStore: boolean;
  private readonly filePath: string;

  constructor() {
    this.allowFileStore = process.env.ALLOW_PROVIDER_CONFIG_FILE_STORE === 'true';
    this.filePath = path.resolve(
      process.env.PROVIDER_CONFIG_STORE_PATH || path.join(process.cwd(), '.data', 'provider-configs.json')
    );

    if (!db) {
      if (!this.allowFileStore) {
        throw new Error(
          'Database connection not available. Set DATABASE_URL or enable ALLOW_PROVIDER_CONFIG_FILE_STORE for development.'
        );
      }
      this.useFileStore = true;
    } else {
      this.useFileStore = false;
    }
  }

  private async ensureFileDir(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
  }

  private encryptConfig(config: Omit<ProviderCredentialRecord, 'provider' | 'updatedAt' | 'rotationVersion'>) {
    return EncryptionService.encryptCredentials({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      scopes: config.scopes,
      metadata: config.metadata,
    });
  }

  private decryptConfig(record: StoredProviderRecord): ProviderCredentialRecord {
    const decrypted = EncryptionService.decryptCredentials(record.encryptedConfig, record.iv) as {
      clientId: string;
      clientSecret: string;
      scopes?: string[];
      metadata?: Record<string, any>;
    };

    return {
      provider: record.provider,
      clientId: decrypted.clientId,
      clientSecret: decrypted.clientSecret,
      scopes: decrypted.scopes ?? [],
      metadata: decrypted.metadata ?? {},
      lastTested: record.lastTested ? new Date(record.lastTested) : undefined,
      testStatus: record.testStatus,
      testError: record.testError,
      rotationVersion: record.rotationVersion,
      updatedAt: new Date(record.updatedAt),
    };
  }

  private async readFileStore(): Promise<StoredProviderRecord[]> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as StoredProviderRecord[];
      }
      return [];
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async writeFileStore(records: StoredProviderRecord[]): Promise<void> {
    await this.ensureFileDir();
    await fs.writeFile(this.filePath, JSON.stringify(records, null, 2), 'utf8');
  }

  public async listCredentials(): Promise<ProviderCredentialRecord[]> {
    if (this.useFileStore) {
      const records = await this.readFileStore();
      return records.map((record) => this.decryptConfig(record));
    }

    const rows = await db!.select().from(providerConfigs);
    return rows.map((row) =>
      this.decryptConfig({
        provider: row.provider,
        encryptedConfig: row.encryptedConfig,
        iv: row.iv,
        rotationVersion: row.rotationVersion,
        metadata: row.metadata,
        lastTested: row.lastTested?.toISOString(),
        testStatus: row.testStatus ?? undefined,
        testError: row.testError ?? undefined,
        updatedAt: row.updatedAt.toISOString(),
      })
    );
  }

  public async bootstrap(): Promise<void> {
    try {
      const credentials = await this.listCredentials();
      if (credentials.length === 0) {
        console.warn('⚠️ No provider credentials found in store. OAuth providers may remain disabled.');
        return;
      }

      oauthManager.hydrateProviderCredentials(
        credentials.map((cred) => ({
          provider: cred.provider,
          clientId: cred.clientId,
          clientSecret: cred.clientSecret,
          scopes: cred.scopes,
        }))
      );
    } catch (error) {
      console.error('❌ Failed to bootstrap provider credentials:', getErrorMessage(error));
      throw error;
    }
  }

  public async upsertCredential(input: ProviderCredentialInput): Promise<ProviderCredentialRecord> {
    const provider = normalizeProvider(input.provider);
    const payload = {
      provider,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      scopes: input.scopes ?? [],
      metadata: input.metadata ?? {},
      lastTested: undefined as Date | undefined,
      testStatus: undefined as string | undefined,
      testError: undefined as string | undefined,
      rotationVersion: 1,
      updatedAt: new Date(),
    };

    const encrypted = this.encryptConfig(payload);
    const storedRecord: StoredProviderRecord = {
      provider,
      encryptedConfig: encrypted.encryptedData,
      iv: encrypted.iv,
      rotationVersion: payload.rotationVersion,
      metadata: payload.metadata,
      updatedAt: payload.updatedAt.toISOString(),
    };

    if (this.useFileStore) {
      const existing = await this.readFileStore();
      const idx = existing.findIndex((item) => item.provider === provider);
      if (idx >= 0) {
        existing[idx] = { ...existing[idx], ...storedRecord };
      } else {
        existing.push(storedRecord);
      }
      await this.writeFileStore(existing);
    } else {
      await db!
        .insert(providerConfigs)
        .values({
          provider,
          encryptedConfig: storedRecord.encryptedConfig,
          iv: storedRecord.iv,
          rotationVersion: storedRecord.rotationVersion,
          metadata: storedRecord.metadata,
          updatedAt: new Date(storedRecord.updatedAt),
        })
        .onConflictDoUpdate({
          target: providerConfigs.provider,
          set: {
            encryptedConfig: storedRecord.encryptedConfig,
            iv: storedRecord.iv,
            rotationVersion: storedRecord.rotationVersion,
            metadata: storedRecord.metadata,
            updatedAt: new Date(storedRecord.updatedAt),
          },
        });
    }

    oauthManager.applyProviderCredential(provider, {
      clientId: payload.clientId,
      clientSecret: payload.clientSecret,
      scopes: payload.scopes,
    });

    recordSecretEvent({
      type: 'write',
      provider,
      source: 'provider-config',
      metadata: { action: 'upsert' },
    });

    return {
      ...payload,
    };
  }

  public async deleteCredential(providerId: string): Promise<void> {
    const provider = normalizeProvider(providerId);

    if (this.useFileStore) {
      const existing = await this.readFileStore();
      const filtered = existing.filter((item) => item.provider !== provider);
      await this.writeFileStore(filtered);
    } else {
      await db!.delete(providerConfigs).where(eq(providerConfigs.provider, provider));
    }

    recordSecretEvent({
      type: 'delete',
      provider,
      source: 'provider-config',
      metadata: { action: 'delete' },
    });

    oauthManager.disableProvider(provider, 'Removed via admin API');
  }

  public async testCredential(providerId: string): Promise<{ success: boolean; message: string }> {
    const provider = normalizeProvider(providerId);
    const status = oauthManager.getProviderConfigurationStatus(provider);
    if (!status.configured) {
      return {
        success: false,
        message: status.reason ?? 'Provider remains disabled after configuration update',
      };
    }

    recordSecretEvent({
      type: 'read',
      provider,
      source: 'provider-config',
      metadata: { action: 'test' },
    });

    return {
      success: true,
      message: 'Provider credentials loaded and provider is enabled.',
    };
  }
}

export const providerConfigService = new ProviderConfigService();
