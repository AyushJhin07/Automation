import { eq, and } from 'drizzle-orm';
import { connections, users, db } from '../database/schema';
import { EncryptionService } from './EncryptionService';
import { getErrorMessage } from '../types/common';

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
  credentials: Record<string, any>;
  metadata?: Record<string, any>;
  isActive: boolean;
  lastTested?: Date;
  testStatus?: string;
  testError?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class ConnectionService {
  private db: any;

  constructor() {
    this.db = db;
    if (!this.db && process.env.NODE_ENV !== 'development') {
      throw new Error('Database connection not available');
    }
  }

  private ensureDb() {
    if (!this.db) {
      if (process.env.NODE_ENV === 'development') {
        throw new ConnectionServiceError('Database not available in development mode. Set DATABASE_URL to enable database features.', 501);
      }
      throw new Error('Database not available. Set DATABASE_URL.');
    }
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
    const encrypted = EncryptionService.encryptCredentials(request.credentials);

    // Store in database
    this.ensureDb();
    const [connection] = await this.db.insert(connections).values({
      userId: request.userId,
      name: request.name,
      provider: request.provider,
      type: request.type,
      encryptedCredentials: encrypted.encryptedData,
      credentialsIv: encrypted.iv,
      metadata: request.metadata || {},
      isActive: true,
    }).returning({ id: connections.id });

    console.log(`✅ Connection created: ${connection.id}`);
    return connection.id;
  }

  /**
   * Get decrypted connection by ID
   */
  public async getConnection(connectionId: string, userId: string): Promise<DecryptedConnection | null> {
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

    // Decrypt credentials
    const credentials = EncryptionService.decryptCredentials(
      connection.encryptedCredentials,
      connection.credentialsIv
    );

    return {
      id: connection.id,
      userId: connection.userId,
      name: connection.name,
      provider: connection.provider,
      type: connection.type,
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
    const whereConditions = [
      eq(connections.userId, userId),
      eq(connections.isActive, true)
    ];

    if (provider) {
      whereConditions.push(eq(connections.provider, provider));
    }

    this.ensureDb();
    const userConnections = await this.db
      .select()
      .from(connections)
      .where(and(...whereConditions))
      .orderBy(connections.createdAt);

    // Decrypt all connections
    return userConnections.map(connection => {
      const credentials = EncryptionService.decryptCredentials(
        connection.encryptedCredentials,
        connection.credentialsIv
      );

      return {
        id: connection.id,
        userId: connection.userId,
        name: connection.name,
        provider: connection.provider,
        type: connection.type,
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
      // Re-encrypt credentials
      const encrypted = EncryptionService.encryptCredentials(updates.credentials);
      updateData.encryptedCredentials = encrypted.encryptedData;
      updateData.credentialsIv = encrypted.iv;
    }

    this.ensureDb();
    await this.db
      .update(connections)
      .set(updateData)
      .where(and(
        eq(connections.id, connectionId),
        eq(connections.userId, userId)
      ));
  }

  /**
   * Delete connection (soft delete)
   */
  public async deleteConnection(connectionId: string, userId: string): Promise<void> {
    this.ensureDb();
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