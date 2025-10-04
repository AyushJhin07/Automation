import crypto, { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';
import { sql } from 'drizzle-orm';

import { db, encryptionKeys, type EncryptionKeyStatus } from '../database/schema';
import { getKmsClient } from './kms/KmsClient';
import { JWTPayload, getErrorMessage } from '../types/common';

interface EncryptedData {
  encryptedData: string;
  iv: string;
  keyId?: string | null;
  dataKeyCiphertext?: string | null;
}

interface CachedEncryptionKey {
  recordId: string;
  keyId: string;
  status: EncryptionKeyStatus;
  legacyDerivedKey?: Buffer;
  kmsKeyArn?: string | null;
  alias?: string | null;
}

export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32; // bytes
  private static readonly IV_LENGTH = 12; // 96-bit IV recommended for GCM
  private static readonly AAD = Buffer.from('api-credentials', 'utf8');
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  private static legacyKey: Buffer | null = null;
  private static keyCache: Map<string, CachedEncryptionKey> = new Map();
  private static primaryKeyRecordId: string | null = null;
  private static lastCacheRefresh = 0;
  private static readonly DATA_KEY_CACHE_TTL_MS = 60 * 1000;
  private static dataKeyCache: Map<string, { key: Buffer; expiresAt: number }> = new Map();
  private static kmsClientErrorLogged = false;
  private static initPromise: Promise<void> | null = null;

  static async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    return this.initPromise;
  }

  private static async initialize(): Promise<void> {
    let legacyKeyError: Error | null = null;

    try {
      await this.initializeLegacyKey();
    } catch (error) {
      legacyKeyError = error instanceof Error ? error : new Error(String(error));
      console.warn(`⚠️ Failed to initialize legacy encryption key: ${legacyKeyError.message}`);
    }

    try {
      await this.refreshKeyCache(true);
    } catch (error) {
      console.error('❌ Failed to load encryption key metadata from database:', getErrorMessage(error));
    }

    if (!this.primaryKeyRecordId && !this.legacyKey) {
      if (legacyKeyError) {
        throw legacyKeyError;
      }
      throw new Error(
        'No encryption keys available. Configure ENCRYPTION_MASTER_KEY or register an active key in encryption_keys.'
      );
    }

    console.log('✅ EncryptionService initialized with multi-key support and AES-256-GCM');
  }

  private static async initializeLegacyKey(): Promise<void> {
    const masterKey = process.env.ENCRYPTION_MASTER_KEY;

    if (!masterKey || masterKey.trim().length === 0) {
      this.legacyKey = null;
      console.warn('⚠️ ENCRYPTION_MASTER_KEY is not set; relying on database-backed keys only.');
      return;
    }

    if (masterKey.length < 32) {
      throw new Error('ENCRYPTION_MASTER_KEY must be at least 32 characters long');
    }

    this.legacyKey = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(masterKey, 'salt', this.KEY_LENGTH, (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey as Buffer);
      });
    });
  }

  private static async refreshKeyCache(force: boolean): Promise<void> {
    if (!db) {
      return;
    }

    const now = Date.now();
    if (!force && now - this.lastCacheRefresh < this.CACHE_TTL_MS) {
      return;
    }

    const result = await db.execute(
      sql`SELECT id, key_id, derived_key, status, kms_key_arn, alias FROM ${encryptionKeys} WHERE status IN ('active', 'rotating') ORDER BY COALESCE(activated_at, created_at) DESC`
    );

    const rows = Array.isArray((result as { rows?: unknown[] }).rows)
      ? ((result as { rows: unknown[] }).rows as Array<Record<string, any>>)
      : [];

    const nextCache = new Map<string, CachedEncryptionKey>();
    let nextPrimary: string | null = null;

    for (const row of rows) {
      const recordId = row.id as string | undefined;
      const keyIdentifier = row.key_id as string | undefined;
      if (!recordId || !keyIdentifier) {
        continue;
      }

      let legacyDerivedKey: Buffer | undefined;
      const derivedKey = row.derived_key as string | undefined | null;
      if (derivedKey) {
        try {
          const buffer = Buffer.from(derivedKey, 'base64');
          if (buffer.length === this.KEY_LENGTH) {
            legacyDerivedKey = buffer;
          } else {
            console.warn(
              `⚠️ Ignoring stored derived key for ${recordId}: expected ${this.KEY_LENGTH} bytes but received ${buffer.length}.`
            );
          }
        } catch (error) {
          console.error(`❌ Failed to decode encryption key ${recordId}:`, getErrorMessage(error));
        }
      }

      const entry: CachedEncryptionKey = {
        recordId,
        keyId: keyIdentifier,
        status: row.status as EncryptionKeyStatus,
        legacyDerivedKey,
        kmsKeyArn: row.kms_key_arn as string | null | undefined,
        alias: row.alias as string | null | undefined,
      };

      nextCache.set(recordId, entry);
      if (!nextPrimary && entry.status === 'active') {
        nextPrimary = recordId;
      }
    }

    if (!nextPrimary && rows.length > 0) {
      const first = rows[0];
      if (first?.id) {
        nextPrimary = first.id as string;
      }
    }

    this.keyCache = nextCache;
    this.primaryKeyRecordId = nextPrimary;
    this.lastCacheRefresh = now;
  }

  private static maybeRefreshKeyCache(): void {
    if (!db) {
      return;
    }
    if (Date.now() - this.lastCacheRefresh > this.CACHE_TTL_MS) {
      void this.refreshKeyCache(false).catch((error) => {
        console.error('❌ Failed to refresh encryption key cache:', getErrorMessage(error));
      });
    }
  }

  private static getActiveKeyEntry(): CachedEncryptionKey | null {
    if (this.primaryKeyRecordId) {
      const cached = this.keyCache.get(this.primaryKeyRecordId);
      if (cached) {
        return cached;
      }
    }
    const fallback = this.keyCache.values().next();
    return fallback.done ? null : fallback.value;
  }

  private static cacheDataKey(recordId: string | null, ciphertext: string, plaintext: Buffer): void {
    const cacheKey = `${recordId ?? 'legacy'}:${ciphertext}`;
    this.dataKeyCache.set(cacheKey, { key: plaintext, expiresAt: Date.now() + this.DATA_KEY_CACHE_TTL_MS });
  }

  private static tryGetCachedDataKey(recordId: string | null, ciphertext: string): Buffer | null {
    const cacheKey = `${recordId ?? 'legacy'}:${ciphertext}`;
    const cached = this.dataKeyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.key;
    }
    if (cached) {
      this.dataKeyCache.delete(cacheKey);
    }
    return null;
  }

  private static async getKeyMaterialForEncryption(): Promise<{
    key: Buffer;
    recordId: string | null;
    dataKeyCiphertext?: string | null;
  }> {
    this.maybeRefreshKeyCache();

    const active = this.getActiveKeyEntry();
    if (active) {
      const kmsResource = active.kmsKeyArn ?? active.keyId;
      if (kmsResource) {
        try {
          const kms = getKmsClient();
          const { plaintextKey, encryptedKey } = await kms.generateDataKey(kmsResource);
          this.cacheDataKey(active.recordId, encryptedKey, plaintextKey);
          return { key: plaintextKey, recordId: active.recordId, dataKeyCiphertext: encryptedKey };
        } catch (error) {
          if (!this.kmsClientErrorLogged) {
            this.kmsClientErrorLogged = true;
            console.error('❌ Failed to generate data key via KMS:', getErrorMessage(error));
          }
        }
      }

      if (active.legacyDerivedKey) {
        return { key: active.legacyDerivedKey, recordId: active.recordId, dataKeyCiphertext: null };
      }
    }

    if (this.legacyKey) {
      return { key: this.legacyKey, recordId: null, dataKeyCiphertext: null };
    }

    throw new Error('No encryption key available for encryption operations');
  }

  private static async resolveKeyForDecryption(
    keyRecordId?: string | null,
    encryptedDataKey?: string | null
  ): Promise<Buffer> {
    this.maybeRefreshKeyCache();

    if (encryptedDataKey) {
      const cached = this.tryGetCachedDataKey(keyRecordId ?? null, encryptedDataKey);
      if (cached) {
        return cached;
      }

      const keyEntry = keyRecordId ? this.keyCache.get(keyRecordId) : null;
      const kmsResource = keyEntry?.kmsKeyArn ?? keyEntry?.keyId;
      if (!kmsResource && !keyEntry?.legacyDerivedKey) {
        throw new Error(`KMS metadata missing for encrypted data key ${keyRecordId ?? 'unknown'}`);
      }

      if (kmsResource) {
        try {
          const kms = getKmsClient();
          const plaintext = await kms.decryptDataKey(encryptedDataKey, kmsResource);
          this.cacheDataKey(keyRecordId ?? null, encryptedDataKey, plaintext);
          return plaintext;
        } catch (error) {
          console.error('❌ Failed to decrypt data key via KMS:', getErrorMessage(error));
        }
      }

      if (keyEntry?.legacyDerivedKey) {
        console.warn(
          `⚠️ Falling back to legacy derived key for record ${keyRecordId} during decryption; encrypted data key unavailable.`
        );
        return keyEntry.legacyDerivedKey;
      }
    }

    if (keyRecordId) {
      const cached = this.keyCache.get(keyRecordId);
      if (cached?.legacyDerivedKey) {
        return cached.legacyDerivedKey;
      }

      void this.refreshKeyCache(true).catch((error) => {
        console.error('❌ Failed to refresh key cache during decryption:', getErrorMessage(error));
      });
      const refreshed = this.keyCache.get(keyRecordId);
      if (refreshed?.legacyDerivedKey) {
        return refreshed.legacyDerivedKey;
      }

      if (this.legacyKey) {
        console.warn(
          `⚠️ Encryption key ${keyRecordId} not found; attempting legacy key fallback for backwards compatibility.`
        );
        return this.legacyKey;
      }

      throw new Error(`Encryption key ${keyRecordId} not available for decryption`);
    }

    if (this.legacyKey) {
      return this.legacyKey;
    }

    const active = this.getActiveKeyEntry();
    if (active?.legacyDerivedKey) {
      return active.legacyDerivedKey;
    }

    throw new Error('No encryption keys loaded for decryption');
  }

  public static async refreshKeyMetadata(): Promise<void> {
    await this.refreshKeyCache(true);
  }

  public static getActiveEncryptionKeyId(): string | null {
    return this.primaryKeyRecordId;
  }

  public static hasLegacyKey(): boolean {
    return this.legacyKey !== null;
  }

  static async encrypt(plaintext: string): Promise<EncryptedData> {
    const { key, recordId, dataKeyCiphertext } = await this.getKeyMaterialForEncryption();

    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
    cipher.setAAD(this.AAD);

    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag(); // 16 bytes

    const payload = Buffer.concat([encrypted, tag]).toString('hex');
    return {
      encryptedData: payload,
      iv: iv.toString('hex'),
      keyId: recordId,
      dataKeyCiphertext: dataKeyCiphertext ?? null,
    };
  }

  static async decrypt(
    encryptedData: string,
    ivHex: string,
    keyRecordId?: string | null,
    encryptedDataKey?: string | null
  ): Promise<string> {
    const key = await this.resolveKeyForDecryption(keyRecordId, encryptedDataKey);

    const iv = Buffer.from(ivHex, 'hex');
    const buf = Buffer.from(encryptedData, 'hex');
    const tag = buf.slice(buf.length - 16);
    const ciphertext = buf.slice(0, buf.length - 16);

    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
    decipher.setAAD(this.AAD);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  }

  /**
   * Encrypt API credentials object
   */
  public static async encryptCredentials(credentials: Record<string, any>): Promise<EncryptedData> {
    const jsonString = JSON.stringify(credentials);
    return this.encrypt(jsonString);
  }

  /**
   * Decrypt API credentials object
   */
  public static async decryptCredentials(
    encryptedData: string,
    iv: string,
    keyRecordId?: string | null,
    encryptedDataKey?: string | null
  ): Promise<Record<string, any>> {
    const decryptedJson = await this.decrypt(encryptedData, iv, keyRecordId, encryptedDataKey);
    return JSON.parse(decryptedJson);
  }

  /**
   * Generate a secure random API key (for internal use)
   */
  public static generateApiKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  static hashPassword(password: string): string {
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 64);
    return salt.toString('hex') + ':' + hash.toString('hex');
  }

  static verifyPassword(password: string, stored: string): boolean {
    const [saltHex, hashHex] = stored.split(':');
    if (!saltHex || !hashHex) {
      return false;
    }
    const salt = Buffer.from(saltHex, 'hex');
    const hash = Buffer.from(hashHex, 'hex');
    const test = scryptSync(password, salt, 64);
    return timingSafeEqual(test, hash);
  }

  static generateJWT(payload: JWTPayload, expiresIn: string = '1h'): string {
    const secret =
      process.env.JWT_SECRET ||
      (process.env.NODE_ENV === 'development' ? 'dev-jwt-secret-not-secure' : undefined);
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    return jwt.sign(payload, secret, { expiresIn });
  }

  static verifyJWT(token: string): JWTPayload {
    const secret =
      process.env.JWT_SECRET ||
      (process.env.NODE_ENV === 'development' ? 'dev-jwt-secret-not-secure' : undefined);
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    return jwt.verify(token, secret) as JWTPayload;
  }

  /**
   * Generate a secure refresh token
   */
  public static generateRefreshToken(): string {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Mask sensitive data for logging
   */
  public static maskSensitiveData(data: string): string {
    if (!data || data.length < 8) {
      return '***';
    }

    const start = data.substring(0, 4);
    const end = data.substring(data.length - 4);
    return `${start}${'*'.repeat(Math.max(0, data.length - 8))}${end}`;
  }

  /**
   * Validate API key format (basic validation)
   */
  public static validateApiKeyFormat(apiKey: string, provider: string): boolean {
    const patterns: Record<string, RegExp> = {
      openai: /^sk-[a-zA-Z0-9]{48,}$/,
      gemini: /^[a-zA-Z0-9_-]{39}$/,
      claude: /^sk-ant-[a-zA-Z0-9_-]{95,}$/,
    };

    const pattern = patterns[provider.toLowerCase()];
    return pattern ? pattern.test(apiKey) : apiKey.length > 10;
  }

  /**
   * Generate cryptographically secure random string
   */
  public static generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    const random = crypto.randomBytes(length);

    for (let i = 0; i < length; i++) {
      result += chars[random[i] % chars.length];
    }

    return result;
  }

  /**
   * Generate a secure identifier suitable for OAuth state/nonce values
   */
  public static generateSecureId(length: number = 48): string {
    return this.generateRandomString(length);
  }

  public static resetForTests(): void {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('EncryptionService.resetForTests is only available in test environment');
    }
    this.keyCache.clear();
    this.dataKeyCache.clear();
    this.primaryKeyRecordId = null;
    this.lastCacheRefresh = 0;
    this.initPromise = null;
    this.kmsClientErrorLogged = false;
  }

  // Self-test for encryption roundtrip
  static async selfTest(): Promise<boolean> {
    try {
      const testData = 'test-api-key-12345';
      const encrypted = await this.encrypt(testData);
      const decrypted = await this.decrypt(
        encrypted.encryptedData,
        encrypted.iv,
        encrypted.keyId,
        encrypted.dataKeyCiphertext ?? null
      );
      return decrypted === testData;
    } catch (error) {
      console.error('❌ Encryption self-test failed:', error);
      return false;
    }
  }
}

// Initialize encryption service on import
void (async () => {
  try {
    await EncryptionService.init();
    console.log('🔐 Encryption service initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize encryption service:', getErrorMessage(error));
    console.error('Please configure ENCRYPTION_MASTER_KEY or provision entries in encryption_keys table.');
  }
})();
