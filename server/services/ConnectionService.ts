import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { connections, db } from '../database/schema';
import { EncryptionService } from './EncryptionService';
import { getErrorMessage } from '../types/common';
import type { OAuthTokens, OAuthUserInfo } from '../oauth/OAuthManager';
import { integrationManager } from '../integrations/IntegrationManager';
import { env } from '../env';
import { genericExecutor } from '../integrations/GenericExecutor';
import { recordSecretEvent } from '../security/SecretsAuditLog.js';

class ConnectionServiceError extends Error {
  constructor(message: string, public statusCode: number = 500) {
    super(message);
    this.name = 'ConnectionServiceError';
  }
}

export interface CreateConnectionRequest {
  userId: string;
  name: string;
  provider: string;
  type: 'llm' | 'saas' | 'database';
  credentials: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  responseTime?: number;
  error?: string;
  provider: string;
}

export interface DecryptedConnection {
  id: string;
  userId: string;
  name: string;
  provider: string;
  type: string;
  iv: string;
  credentials: Record<string, any>;
  metadata?: Record<string, any>;
  isActive: boolean;
  lastTested?: Date;
  testStatus?: string;
  testError?: string;
  lastUsed?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface FileConnectionRecord {
  id: string;
  userId: string;
  name: string;
  provider: string;
  type: string;
  encryptedCredentials: string;
  iv: string;
  metadata?: Record<string, any>;
  isActive: boolean;
  lastTested?: string;
  testStatus?: string;
  testError?: string;
  lastUsed?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export class ConnectionService {
  private db: any;
  private readonly useFileStore: boolean;
  private readonly allowFileStore: boolean;
  private readonly fileStorePath: string;

  constructor() {
    this.db = db;
    this.allowFileStore = process.env.ALLOW_FILE_CONNECTION_STORE === 'true';
    this.fileStorePath = path.resolve(
      process.env.CONNECTION_STORE_PATH || path.join(process.cwd(), '.data', 'connections.json')
    );

    if (!this.db) {
      if (this.allowFileStore) {
        const mode = process.env.NODE_ENV ?? 'development';
        console.warn(
          `⚠️ ConnectionService: DATABASE_URL not set. Using encrypted file store at ${this.fileStorePath} (mode=${mode}).`
        );
      } else {
        throw new Error(
          'Database connection not available. Set DATABASE_URL or enable ALLOW_FILE_CONNECTION_STORE for tests.'
        );
      }
    }

    this.useFileStore = !this.db && this.allowFileStore;
  }

  private auditSecretAccess(
    userId: string,
    provider: string,
    type: 'read' | 'write' | 'delete',
    metadata?: Record<string, any>
  ): void {
    recordSecretEvent({
      type,
      provider,
      source: 'connection',
      userId,
      metadata,
    });
  }

  private ensureDb() {
    if (!this.db && !this.useFileStore) {
      throw new Error('Database not available. Set DATABASE_URL.');
    }
  }

  private async ensureFileStoreDir(): Promise<void> {
    const dir = path.dirname(this.fileStorePath);
    await fs.mkdir(dir, { recursive: true });
  }

  private async readFileStore(): Promise<FileConnectionRecord[]> {
    try {
      const raw = await fs.readFile(this.fileStorePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as FileConnectionRecord[];
      }
      return [];
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        return [];
      }
      console.error('❌ Failed to read connection file store:', error);
      throw error;
    }
  }

  private async writeFileStore(records: FileConnectionRecord[]): Promise<void> {
    await this.ensureFileStoreDir();
    await fs.writeFile(this.fileStorePath, JSON.stringify(records, null, 2), 'utf8');
  }

  private toDecryptedConnection(record: FileConnectionRecord): DecryptedConnection {
    const credentials = EncryptionService.decryptCredentials(record.encryptedCredentials, record.iv);
    return {
      id: record.id,
      userId: record.userId,
      name: record.name,
      provider: record.provider,
      type: record.type,
      iv: record.iv,
      credentials,
      metadata: record.metadata,
      isActive: record.isActive,
      lastTested: record.lastTested ? new Date(record.lastTested) : undefined,
      testStatus: record.testStatus,
      testError: record.testError,
      // usage extras for file store only
      lastUsed: record.lastUsed ? new Date(record.lastUsed) as any : undefined,
      lastError: record.lastError,
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
    };
  }

  private encryptCredentials(credentials: Record<string, any>): { encryptedData: string; iv: string } {
    return EncryptionService.encryptCredentials(credentials);
  }

  /**
   * Create a new encrypted connection
   */
  public async createConnection(request: CreateConnectionRequest): Promise<string> {
    console.log(`🔐 Creating connection: ${request.name} (${request.provider})`);

    // Validate API key format
    if (request.type === 'llm' && request.credentials.apiKey) {
      const isValidFormat = EncryptionService.validateApiKeyFormat(
        request.credentials.apiKey, 
        request.provider
      );
      
      if (!isValidFormat) {
        throw new Error(`Invalid API key format for ${request.provider}`);
      }
    }

    // Encrypt credentials
    const encrypted = this.encryptCredentials(request.credentials);

    const normalizedProvider = request.provider.toLowerCase();

    if (this.useFileStore) {
      const records = await this.readFileStore();
      const nowIso = new Date().toISOString();
      const record: FileConnectionRecord = {
        id: randomUUID(),
        userId: request.userId,
        name: request.name,
        provider: normalizedProvider,
        type: request.type,
        encryptedCredentials: encrypted.encryptedData,
        iv: encrypted.iv,
        metadata: request.metadata || {},
        isActive: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      records.push(record);
      await this.writeFileStore(records);
      console.log(`✅ Connection created (file store): ${record.id}`);
      this.auditSecretAccess(request.userId, normalizedProvider, 'write', {
        connectionId: record.id,
        name: request.name,
      });
      return record.id;
    }

    this.ensureDb();
    const [connection] = await this.db.insert(connections).values({
      userId: request.userId,
      name: request.name,
      provider: normalizedProvider,
      type: request.type,
      encryptedCredentials: encrypted.encryptedData,
      iv: encrypted.iv,
      metadata: request.metadata || {},
      isActive: true,
    }).returning({ id: connections.id });

    console.log(`✅ Connection created: ${connection.id}`);
    this.auditSecretAccess(request.userId, normalizedProvider, 'write', {
      connectionId: connection.id,
      name: request.name,
    });
    return connection.id;
  }

  /**
   * Get decrypted connection by ID
   */
  public async getConnection(connectionId: string, userId: string): Promise<DecryptedConnection | null> {
    if (this.useFileStore) {
      const records = await this.readFileStore();
      const record = records.find((conn) => conn.id === connectionId && conn.userId === userId && conn.isActive);
      if (!record) {
        return null;
      }
      const decrypted = this.toDecryptedConnection(record);
      this.auditSecretAccess(userId, decrypted.provider, 'read', { connectionId });
      return decrypted;
    }

    this.ensureDb();
    const [connection] = await this.db
      .select()
      .from(connections)
      .where(and(
        eq(connections.id, connectionId),
        eq(connections.userId, userId),
        eq(connections.isActive, true)
      ));

    if (!connection) {
      return null;
    }

    const credentials = EncryptionService.decryptCredentials(
      connection.encryptedCredentials,
      connection.iv
    );

    this.auditSecretAccess(userId, connection.provider, 'read', { connectionId });

    return {
      id: connection.id,
      userId: connection.userId,
      name: connection.name,
      provider: connection.provider,
      type: connection.type,
      iv: connection.iv,
      credentials,
      metadata: connection.metadata,
      isActive: connection.isActive,
      lastTested: connection.lastTested,
      testStatus: connection.testStatus,
      testError: connection.testError,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }

  /**
   * Get user's connections by provider
   */
  public async getUserConnections(userId: string, provider?: string): Promise<DecryptedConnection[]> {
    const normalizedProvider = provider?.toLowerCase();

    if (this.useFileStore) {
      const records = await this.readFileStore();
      return records
        .filter((conn) => conn.userId === userId && conn.isActive && (!normalizedProvider || conn.provider === normalizedProvider))
        .map((record) => {
          const decrypted = this.toDecryptedConnection(record);
          this.auditSecretAccess(userId, decrypted.provider, 'read', { connectionId: decrypted.id });
          return decrypted;
        });
    }

    const whereConditions = [
      eq(connections.userId, userId),
      eq(connections.isActive, true)
    ];

    if (normalizedProvider) {
      whereConditions.push(eq(connections.provider, normalizedProvider));
    }

    this.ensureDb();
    const userConnections = await this.db
      .select()
      .from(connections)
      .where(and(...whereConditions))
      .orderBy(connections.createdAt);

    return userConnections.map(connection => {
      const credentials = EncryptionService.decryptCredentials(
        connection.encryptedCredentials,
        connection.iv
      );

      this.auditSecretAccess(userId, connection.provider, 'read', { connectionId: connection.id });

      return {
        id: connection.id,
        userId: connection.userId,
        name: connection.name,
        provider: connection.provider,
        type: connection.type,
        iv: connection.iv,
        credentials,
        metadata: connection.metadata,
        isActive: connection.isActive,
        lastTested: connection.lastTested,
        testStatus: connection.testStatus,
        testError: connection.testError,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
      };
    });
  }

  public async getConnectionByProvider(userId: string, provider: string): Promise<DecryptedConnection | null> {
    const normalizedProvider = provider.toLowerCase();

    if (this.useFileStore) {
      const records = await this.readFileStore();
      const record = records.find(
        (conn) => conn.userId === userId && conn.provider === normalizedProvider && conn.isActive
      );
      if (!record) {
        return null;
      }
      const decrypted = this.toDecryptedConnection(record);
      this.auditSecretAccess(userId, decrypted.provider, 'read', { connectionId: decrypted.id });
      return decrypted;
    }

    const [connection] = await this.db
      .select()
      .from(connections)
      .where(and(
        eq(connections.userId, userId),
        eq(connections.provider, normalizedProvider),
        eq(connections.isActive, true)
      ))
      .limit(1);

    if (!connection) {
      return null;
    }

    const credentials = EncryptionService.decryptCredentials(
      connection.encryptedCredentials,
      connection.iv
    );

    this.auditSecretAccess(userId, connection.provider, 'read', { connectionId: connection.id });

    return {
      id: connection.id,
      userId: connection.userId,
      name: connection.name,
      provider: connection.provider,
      type: connection.type,
      iv: connection.iv,
      credentials,
      metadata: connection.metadata,
      isActive: connection.isActive,
      lastTested: connection.lastTested,
      testStatus: connection.testStatus,
      testError: connection.testError,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }

  public async markUsed(connectionId: string, userId: string, ok: boolean, errorMsg?: string): Promise<void> {
    if (this.useFileStore) {
      const records = await this.readFileStore();
      const idx = records.findIndex(r => r.id === connectionId && r.userId === userId);
      if (idx >= 0) {
        records[idx].lastUsed = new Date().toISOString();
        if (!ok && errorMsg) records[idx].lastError = errorMsg;
        await this.writeFileStore(records);
      }
      return;
    }
    // DB-backed: no-op here to avoid schema changes
  }

  /**
   * Export user's active connections (masked credentials)
   */
  public async exportConnections(userId: string): Promise<any[]> {
    const conns = await this.getUserConnections(userId);
    return conns.map(c => ConnectionService.maskCredentials(c));
  }

  /**
   * Import connections from masked/plain JSON (dev/local only). Re-encrypts credentials.
   */
  public async importConnections(userId: string, list: Array<{ provider: string; name?: string; credentials: any; metadata?: any }>): Promise<{ imported: number }> {
    let imported = 0;
    for (const item of list || []) {
      if (!item?.provider || !item?.credentials) continue;
      await this.storeConnection(userId, item.provider, item.credentials as any, undefined, { name: item.name, metadata: item.metadata, type: 'saas' });
      imported++;
    }
    return { imported };
  }

  public async storeConnection(
    userId: string,
    provider: string,
    tokens: OAuthTokens,
    userInfo?: OAuthUserInfo,
    options: { name?: string; metadata?: Record<string, any>; type?: 'llm' | 'saas' | 'database' } = {}
  ): Promise<string> {
    const normalizedProvider = provider.toLowerCase();
    const connectionName = options.name || userInfo?.email || normalizedProvider;
    const credentialsPayload: Record<string, any> = {
      ...tokens,
      userInfo,
    };
    const encrypted = this.encryptCredentials(credentialsPayload);
    const nowIso = new Date().toISOString();
    const metadata = {
      ...(options.metadata || {}),
      refreshToken: Boolean(tokens.refreshToken),
      expiresAt: tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : undefined,
      userInfo,
    };

    if (this.useFileStore) {
      const records = await this.readFileStore();
      const existingIndex = records.findIndex(
        (conn) => conn.userId === userId && conn.provider === normalizedProvider
      );

      if (existingIndex >= 0) {
        const existing = records[existingIndex];
        const updated: FileConnectionRecord = {
          ...existing,
          name: connectionName,
          encryptedCredentials: encrypted.encryptedData,
          iv: encrypted.iv,
          metadata,
          updatedAt: nowIso,
          isActive: true,
        };
        records[existingIndex] = updated;
        await this.writeFileStore(records);
        console.log(`🔄 Updated connection (${normalizedProvider}) for ${userId}`);
        this.auditSecretAccess(userId, normalizedProvider, 'write', {
          connectionId: updated.id,
          method: 'storeConnection',
        });
        return updated.id;
      }

      const record: FileConnectionRecord = {
        id: randomUUID(),
        userId,
        name: connectionName,
        provider: normalizedProvider,
        type: options.type || 'saas',
        encryptedCredentials: encrypted.encryptedData,
        iv: encrypted.iv,
        metadata,
        isActive: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      records.push(record);
      await this.writeFileStore(records);
      console.log(`✅ Stored connection (${normalizedProvider}) for ${userId}`);
      this.auditSecretAccess(userId, normalizedProvider, 'write', {
        connectionId: record.id,
        method: 'storeConnection',
      });
      return record.id;
    }

    const [existing] = await this.db
      .select()
      .from(connections)
      .where(and(
        eq(connections.userId, userId),
        eq(connections.provider, normalizedProvider)
      ))
      .limit(1);

    if (existing) {
      await this.db
        .update(connections)
        .set({
          name: connectionName,
          encryptedCredentials: encrypted.encryptedData,
          iv: encrypted.iv,
          metadata,
          updatedAt: new Date(),
          isActive: true,
        })
        .where(eq(connections.id, existing.id));
      console.log(`🔄 Updated connection (${normalizedProvider}) for ${userId}`);
      this.auditSecretAccess(userId, normalizedProvider, 'write', {
        connectionId: existing.id,
        method: 'storeConnection',
      });
      return existing.id;
    }

    const [created] = await this.db
      .insert(connections)
      .values({
        userId,
        name: connectionName,
        provider: normalizedProvider,
        type: options.type || 'saas',
        encryptedCredentials: encrypted.encryptedData,
        iv: encrypted.iv,
        metadata,
        isActive: true,
      })
      .returning({ id: connections.id });

    console.log(`✅ Stored connection (${normalizedProvider}) for ${userId}`);
    this.auditSecretAccess(userId, normalizedProvider, 'write', {
      connectionId: created.id,
      method: 'storeConnection',
    });
    return created.id;
  }

  /**
   * Test a connection to verify it works
   */
  public async testConnection(connectionId: string, userId: string): Promise<ConnectionTestResult> {
    const connection = await this.getConnection(connectionId, userId);
    
    if (!connection) {
      throw new Error('Connection not found');
    }

    console.log(`🧪 Testing connection: ${connection.name} (${connection.provider})`);
    const startTime = Date.now();

    try {
      let result: ConnectionTestResult;

      switch (connection.provider.toLowerCase()) {
        case 'openai':
          result = await this.testOpenAI(connection.credentials);
          break;
        case 'gemini':
          result = await this.testGemini(connection.credentials);
          break;
        case 'claude':
          result = await this.testClaude(connection.credentials);
          break;
        case 'slack':
          result = await this.testSlack(connection.credentials);
          break;
        case 'hubspot':
        case 'stripe':
        case 'trello':
        case 'typeform':
        case 'zendesk':
        case 'dropbox':
        case 'google-drive':
        case 'google-calendar':
        case 'google-docs':
        case 'google-slides':
        case 'google-forms':
        case 'mailchimp':
        case 'mailgun':
        case 'sendgrid':
        case 'pipedrive':
        case 'twilio':
        case 'jira':
        case 'asana':
        case 'github':
        case 'box':
        case 'onedrive':
        case 'sharepoint':
        case 'smartsheet':
        case 'microsoft-teams':
        case 'outlook':
        case 'google-chat':
        case 'zoom':
        case 'calendly':
        case 'intercom':
        case 'monday':
        case 'servicenow':
        case 'freshdesk':
        case 'gitlab':
        case 'bitbucket':
        case 'confluence':
        case 'jira-service-management': {
          // Use IntegrationManager where possible; otherwise generic executor if enabled
          const appName = connection.provider;
          const test = await integrationManager.testConnection(appName, connection.credentials as any);
          if (!test.success && env.GENERIC_EXECUTOR_ENABLED) {
            const generic = await genericExecutor.testConnection(appName, connection.credentials as any);
            result = {
              success: generic.success,
              message: generic.success ? 'Connection test passed' : generic.error || 'Connection test failed',
              provider: appName
            };
            break;
          }
          result = {
            success: test.success,
            message: test.success ? 'Connection test passed' : (test.error || 'Connection test failed'),
            provider: appName
          };
          break;
        }
        default:
          result = {
            success: false,
            message: `Testing not implemented for ${connection.provider}`,
            provider: connection.provider
          };
      }

      result.responseTime = Date.now() - startTime;

      // Update test status in database
      await this.updateTestStatus(connectionId, result.success, result.message);

      return result;

    } catch (error) {
      const result: ConnectionTestResult = {
        success: false,
        message: 'Connection test failed',
        error: getErrorMessage(error),
        provider: connection.provider,
        responseTime: Date.now() - startTime
      };

      await this.updateTestStatus(connectionId, false, getErrorMessage(error));
      return result;
    }
  }

  /**
   * Test OpenAI API connection
   */
  private async testOpenAI(credentials: Record<string, any>): Promise<ConnectionTestResult> {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${credentials.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    return {
      success: true,
      message: 'OpenAI connection successful',
      provider: 'openai'
    };
  }

  /**
   * Test Google Gemini API connection
   */
  private async testGemini(credentials: Record<string, any>): Promise<ConnectionTestResult> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${credentials.apiKey}`
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    return {
      success: true,
      message: 'Gemini connection successful',
      provider: 'gemini'
    };
  }

  /**
   * Test Anthropic Claude API connection
   */
  private async testClaude(credentials: Record<string, any>): Promise<ConnectionTestResult> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': credentials.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hello' }]
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
    }

    return {
      success: true,
      message: 'Claude connection successful',
      provider: 'claude'
    };
  }

  /**
   * Test Slack API connection
   */
  private async testSlack(credentials: Record<string, any>): Promise<ConnectionTestResult> {
    const response = await fetch('https://slack.com/api/auth.test', {
      headers: {
        'Authorization': `Bearer ${credentials.token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    return {
      success: true,
      message: `Slack connection successful (${data.user})`,
      provider: 'slack'
    };
  }

  /**
   * Update connection test status
   */
  private async updateTestStatus(connectionId: string, success: boolean, message: string): Promise<void> {
    if (this.useFileStore) {
      const records = await this.readFileStore();
      const index = records.findIndex((conn) => conn.id === connectionId);
      if (index >= 0) {
        records[index] = {
          ...records[index],
          lastTested: new Date().toISOString(),
          testStatus: success ? 'success' : 'failed',
          testError: success ? undefined : message,
          updatedAt: new Date().toISOString(),
        };
        await this.writeFileStore(records);
      }
      return;
    }

    this.ensureDb();
    await this.db
      .update(connections)
      .set({
        lastTested: new Date(),
        testStatus: success ? 'success' : 'failed',
        testError: success ? null : message,
        updatedAt: new Date()
      })
      .where(eq(connections.id, connectionId));
  }

  /**
   * Update connection
   */
  public async updateConnection(
    connectionId: string, 
    userId: string, 
    updates: Partial<CreateConnectionRequest>
  ): Promise<void> {
    const updateData: any = {
      updatedAt: new Date()
    };

    if (updates.name) updateData.name = updates.name;
    if (updates.metadata) updateData.metadata = updates.metadata;

    if (updates.credentials) {
      const encrypted = this.encryptCredentials(updates.credentials);
      updateData.encryptedCredentials = encrypted.encryptedData;
      updateData.iv = encrypted.iv;
    }

    if (this.useFileStore) {
      const records = await this.readFileStore();
      const index = records.findIndex((conn) => conn.id === connectionId && conn.userId === userId);
      if (index >= 0) {
        const existing = records[index];
        records[index] = {
          ...existing,
          name: updateData.name ?? existing.name,
          metadata: updateData.metadata ?? existing.metadata,
          encryptedCredentials: updateData.encryptedCredentials ?? existing.encryptedCredentials,
          iv: updateData.iv ?? existing.iv,
          updatedAt: new Date().toISOString(),
        };
        await this.writeFileStore(records);
        this.auditSecretAccess(userId, existing.provider, 'write', {
          connectionId,
          action: 'update',
        });
      }
      return;
    }

    this.ensureDb();
    const [existing] = await this.db
      .select({ provider: connections.provider })
      .from(connections)
      .where(and(eq(connections.id, connectionId), eq(connections.userId, userId)))
      .limit(1);

    await this.db
      .update(connections)
      .set(updateData)
      .where(and(
        eq(connections.id, connectionId),
        eq(connections.userId, userId)
      ));
    this.auditSecretAccess(userId, existing?.provider ?? 'unknown', 'write', {
      connectionId,
      action: 'update',
    });
  }

  /**
   * Delete connection (soft delete)
   */
  public async deleteConnection(connectionId: string, userId: string): Promise<void> {
    if (this.useFileStore) {
      const records = await this.readFileStore();
      const index = records.findIndex((conn) => conn.id === connectionId && conn.userId === userId);
      if (index >= 0) {
        records[index] = {
          ...records[index],
          isActive: false,
          updatedAt: new Date().toISOString(),
        };
        await this.writeFileStore(records);
        this.auditSecretAccess(userId, records[index].provider, 'delete', {
          connectionId,
          action: 'soft-delete',
        });
      }
      return;
    }

    this.ensureDb();
    const [existing] = await this.db
      .select({ provider: connections.provider })
      .from(connections)
      .where(and(eq(connections.id, connectionId), eq(connections.userId, userId)))
      .limit(1);

    await this.db
      .update(connections)
      .set({
        isActive: false,
        updatedAt: new Date()
      })
      .where(and(
        eq(connections.id, connectionId),
        eq(connections.userId, userId)
      ));
    this.auditSecretAccess(userId, existing?.provider ?? 'unknown', 'delete', {
      connectionId,
      action: 'soft-delete',
    });
  }

  /**
   * Get connection for LLM usage (internal method)
   */
  public async getLLMConnection(userId: string, provider: string): Promise<DecryptedConnection | null> {
    const userConnections = await this.getUserConnections(userId, provider);
    
    // Return the first active LLM connection for the provider
    return userConnections.find(conn => conn.type === 'llm') || null;
  }

  /**
   * Mask credentials for safe logging
   */
  public static maskCredentials(connection: DecryptedConnection): any {
    const masked = { ...connection };
    
    if (masked.credentials) {
      masked.credentials = Object.keys(masked.credentials).reduce((acc, key) => {
        acc[key] = EncryptionService.maskSensitiveData(masked.credentials[key]);
        return acc;
      }, {} as Record<string, any>);
    }

    return masked;
  }
}

export const connectionService = new ConnectionService();
