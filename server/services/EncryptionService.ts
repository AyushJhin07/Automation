import crypto, { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';
import { JWTPayload, getErrorMessage } from '../types/common';

interface EncryptedData {
  encryptedData: string;
  iv: string;
}

export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32; // bytes
  private static readonly IV_LENGTH = 12;  // 96-bit IV recommended for GCM
  private static readonly AAD = Buffer.from('api-credentials', 'utf8');
  private static encryptionKey: Buffer | null = null;

  static async init(): Promise<void> {
    const masterKey = process.env.ENCRYPTION_MASTER_KEY;
    if (!masterKey) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('⚠️ ENCRYPTION_MASTER_KEY not set - using development fallback (NOT SECURE)');
        // Use a development-only fallback key
        this.encryptionKey = Buffer.from('dev-fallback-key-not-secure-32b');
        console.log('🔐 Development encryption service initialized (NOT SECURE)');
        return;
      } else {
        throw new Error('ENCRYPTION_MASTER_KEY environment variable is required');
      }
    }
    
    if (masterKey.length < 32) {
      throw new Error('ENCRYPTION_MASTER_KEY must be at least 32 characters long');
    }

    // Derive a proper 256-bit key using scrypt
    this.encryptionKey = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(masterKey, 'salt', this.KEY_LENGTH, (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      });
    });

    console.log('✅ EncryptionService initialized with secure AES-256-GCM');
  }

  static encrypt(plaintext: string): EncryptedData {
    if (!this.encryptionKey) {
      throw new Error('Encryption service not initialized');
    }

    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, this.encryptionKey, iv);
    cipher.setAAD(this.AAD);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ]);
    const tag = cipher.getAuthTag(); // 16 bytes

    const payload = Buffer.concat([encrypted, tag]).toString('hex');
    return {
      encryptedData: payload,
      iv: iv.toString('hex')
    };
  }

  static decrypt(encryptedData: string, ivHex: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption service not initialized');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const buf = Buffer.from(encryptedData, 'hex');
    const tag = buf.slice(buf.length - 16);
    const ciphertext = buf.slice(0, buf.length - 16);

    const decipher = crypto.createDecipheriv(this.ALGORITHM, this.encryptionKey, iv);
    decipher.setAAD(this.AAD);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);
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
  public static decryptCredentials(encryptedData: string, iv: string): Record<string, any> {
    const decryptedJson = this.decrypt(encryptedData, iv);
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
    const secret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'development' ? 'dev-jwt-secret-not-secure' : undefined);
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    return jwt.sign(payload, secret, { expiresIn });
  }

  static verifyJWT(token: string): JWTPayload {
    const secret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'development' ? 'dev-jwt-secret-not-secure' : undefined);
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

  // Self-test for encryption roundtrip
  static async selfTest(): Promise<boolean> {
    try {
      const testData = 'test-api-key-12345';
      const encrypted = this.encrypt(testData);
      const decrypted = this.decrypt(encrypted.encryptedData, encrypted.iv);
      return decrypted === testData;
    } catch (error) {
      console.error('❌ Encryption self-test failed:', error);
      return false;
    }
  }
}

// Initialize encryption service on import
try {
  EncryptionService.init();
  console.log('🔐 Encryption service initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize encryption service:', getErrorMessage(error));
  console.error('Please set ENCRYPTION_MASTER_KEY and JWT_SECRET environment variables');
}