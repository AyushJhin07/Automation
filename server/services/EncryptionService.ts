import crypto, { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';
import { sql } from 'drizzle-orm';

import { db, encryptionKeys, type EncryptionKeyStatus } from '../database/schema';
import { JWTPayload, getErrorMessage } from '../types/common';

interface EncryptedData {
  encryptedData: string;
  iv: string;
  keyId?: string | null;
}

interface CachedEncryptionKey {
  recordId: string;
  keyId: string;
  status: EncryptionKeyStatus;
  buffer: Buffer;
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
      const derivedKey = row.derived_key as string | undefined;
      if (!recordId || !derivedKey) {
        continue;
      }

      try {
        const buffer = Buffer.from(derivedKey, 'base64');
        if (buffer.length !== this.KEY_LENGTH) {
          console.warn(
            `⚠️ Ignoring encryption key ${recordId}: expected ${this.KEY_LENGTH} bytes but received ${buffer.length}.`
          );
          continue;
        }

        const entry: CachedEncryptionKey = {
          recordId,
          keyId: row.key_id as string,
          status: row.status as EncryptionKeyStatus,
          buffer,
          kmsKeyArn: row.kms_key_arn as string | null | undefined,
          alias: row.alias as string | null | undefined,
        };

        nextCache.set(recordId, entry);
        if (!nextPrimary && entry.status === 'active') {
          nextPrimary = recordId;
        }
      } catch (error) {
        console.error(`❌ Failed to decode encryption key ${recordId}:`, getErrorMessage(error));
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

  private static getKeyForEncryption(): { key: Buffer; recordId: string | null } {
    this.maybeRefreshKeyCache();

    if (this.primaryKeyRecordId) {
      const cached = this.keyCache.get(this.primaryKeyRecordId);
      if (cached) {
        return { key: cached.buffer, recordId: cached.recordId };
      }
      void this.refreshKeyCache(true).catch((error) => {
        console.error('❌ Unable to refresh encryption keys while selecting key for encryption:', getErrorMessage(error));
      });
      const refreshed = this.keyCache.get(this.primaryKeyRecordId);
      if (refreshed) {
        return { key: refreshed.buffer, recordId: refreshed.recordId };
      }
    }

    const firstCached = this.keyCache.values().next();
    if (!firstCached.done) {
      const entry = firstCached.value;
      return { key: entry.buffer, recordId: entry.recordId };
    }

    if (this.legacyKey) {
      return { key: this.legacyKey, recordId: null };
    }

    throw new Error('No encryption key available for encryption operations');
  }

  private static resolveKeyForDecryption(keyRecordId?: string | null): Buffer {
    this.maybeRefreshKeyCache();

    if (keyRecordId) {
      const cached = this.keyCache.get(keyRecordId);
      if (cached) {
        return cached.buffer;
      }

      void this.refreshKeyCache(true).catch((error) => {
        console.error('❌ Failed to refresh key cache during decryption:', getErrorMessage(error));
      });
      const refreshed = this.keyCache.get(keyRecordId);
      if (refreshed) {
        return refreshed.buffer;
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

    if (this.primaryKeyRecordId) {
      const active = this.keyCache.get(this.primaryKeyRecordId);
      if (active) {
        return active.buffer;
      }
    }

    const anyKey = this.keyCache.values().next();
    if (!anyKey.done) {
      return anyKey.value.buffer;
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

  static encrypt(plaintext: string): EncryptedData {
    const { key, recordId } = this.getKeyForEncryption();

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
    };
  }

  static decrypt(encryptedData: string, ivHex: string, keyRecordId?: string | null): string {
    const key = this.resolveKeyForDecryption(keyRecordId);

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
  public static encryptCredentials(credentials: Record<string, any>): EncryptedData {
    const jsonString = JSON.stringify(credentials);
    return this.encrypt(jsonString);
  }

  /**
   * Decrypt API credentials object
   */
  public static decryptCredentials(
    encryptedData: string,
    iv: string,
    keyRecordId?: string | null
  ): Record<string, any> {
    const decryptedJson = this.decrypt(encryptedData, iv, keyRecordId);
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

  // Self-test for encryption roundtrip
  static async selfTest(): Promise<boolean> {
    try {
      const testData = 'test-api-key-12345';
      const encrypted = this.encrypt(testData);
      const decrypted = this.decrypt(encrypted.encryptedData, encrypted.iv, encrypted.keyId);
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
