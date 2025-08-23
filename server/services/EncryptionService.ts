import crypto from 'crypto';

export interface EncryptedData {
  encryptedData: string;
  iv: string;
}

export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32; // 256 bits
  private static readonly IV_LENGTH = 16; // 128 bits
  private static readonly TAG_LENGTH = 16; // 128 bits

  private static encryptionKey: Buffer | null = null;

  /**
   * Initialize the encryption service with a master key
   */
  public static initialize(): void {
    const masterKey = process.env.ENCRYPTION_MASTER_KEY;
    
    if (!masterKey) {
      throw new Error('ENCRYPTION_MASTER_KEY environment variable is required');
    }

    // Derive a consistent key from the master key
    this.encryptionKey = crypto.scryptSync(masterKey, 'salt', this.KEY_LENGTH);
  }

  /**
   * Encrypt sensitive data (API keys, credentials)
   */
  public static encrypt(plaintext: string): EncryptedData {
    if (!this.encryptionKey) {
      throw new Error('Encryption service not initialized');
    }

    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipher(this.ALGORITHM, this.encryptionKey);
    cipher.setAAD(Buffer.from('api-credentials', 'utf8'));

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();
    const encryptedWithTag = encrypted + authTag.toString('hex');

    return {
      encryptedData: encryptedWithTag,
      iv: iv.toString('hex')
    };
  }

  /**
   * Decrypt sensitive data
   */
  public static decrypt(encryptedData: string, ivHex: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption service not initialized');
    }

    try {
      const iv = Buffer.from(ivHex, 'hex');
      
      // Extract auth tag (last 16 bytes)
      const authTagHex = encryptedData.slice(-32);
      const encrypted = encryptedData.slice(0, -32);
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = crypto.createDecipher(this.ALGORITHM, this.encryptionKey);
      decipher.setAAD(Buffer.from('api-credentials', 'utf8'));
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error('Failed to decrypt data: Invalid key or corrupted data');
    }
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

  /**
   * Hash a password securely
   */
  public static async hashPassword(password: string): Promise<string> {
    const bcrypt = await import('bcryptjs');
    return bcrypt.hash(password, 12);
  }

  /**
   * Verify a password against its hash
   */
  public static async verifyPassword(password: string, hash: string): Promise<boolean> {
    const bcrypt = await import('bcryptjs');
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate a JWT token
   */
  public static generateJWT(payload: Record<string, any>, expiresIn: string = '24h'): string {
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET;
    
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required');
    }

    return jwt.sign(payload, secret, { expiresIn });
  }

  /**
   * Verify and decode a JWT token
   */
  public static verifyJWT(token: string): Record<string, any> {
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET;
    
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required');
    }

    return jwt.verify(token, secret);
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
}

// Initialize encryption service on import
try {
  EncryptionService.initialize();
  console.log('🔐 Encryption service initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize encryption service:', error.message);
  console.error('Please set ENCRYPTION_MASTER_KEY and JWT_SECRET environment variables');
}