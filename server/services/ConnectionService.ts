import { eq, and, sql } from 'drizzle-orm';
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
import type { DynamicOptionHandlerContext, DynamicOptionResult } from '../integrations/BaseAPIClient';
import { normalizeDynamicOptionPath } from '../../common/connectorDynamicOptions.js';

type OAuthTokenRefresher = {
  refreshToken(userId: string, organizationId: string, providerId: string): Promise<OAuthTokens>;
};

class ConnectionServiceError extends Error {
  constructor(message: string, public statusCode: number = 500) {
    super(message);
    this.name = 'ConnectionServiceError';
  }
}

export interface CreateConnectionRequest {
  userId: string;
  organizationId: string;
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
  organizationId: string;
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

type TokenRefreshUpdate = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number | null;
  [key: string]: any;
};

type DynamicOptionCacheEntry = {
  cacheKey: string;
  expiresAt: number;
  result: DynamicOptionResult;
};

export type FetchDynamicOptionsParams = {
  connectionId: string;
  userId: string;
  organizationId: string;
  appId: string;
  handlerId: string;
  operationType: 'action' | 'trigger';
  operationId: string;
  parameterPath: string;
  context?: DynamicOptionHandlerContext;
  cacheTtlMs?: number;
  forceRefresh?: boolean;
  additionalConfig?: Record<string, any>;
};

export type DynamicOptionFetchResult = DynamicOptionResult & {
  cached: boolean;
  cacheKey: string;
  cacheExpiresAt?: number;
};

export interface AutoRefreshContext {
  connection: DecryptedConnection;
  credentials: Record<string, any> & {
    onTokenRefreshed?: (tokens: TokenRefreshUpdate) => void | Promise<void>;
  };
}

interface FileConnectionRecord {
  id: string;
  userId: string;
  organizationId: string;
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
  private oauthManagerOverride?: OAuthTokenRefresher;
  private cachedOAuthManager?: OAuthTokenRefresher;
  private readonly refreshThresholdMs: number;
  private readonly dynamicOptionCache: Map<string, Map<string, DynamicOptionCacheEntry>> = new Map();

  constructor() {
    this.db = db;
    this.allowFileStore = process.env.ALLOW_FILE_CONNECTION_STORE === 'true';
    this.fileStorePath = path.resolve(
      process.env.CONNECTION_STORE_PATH || path.join(process.cwd(), '.data', 'connections.json')
    );

    const threshold = Number(process.env.OAUTH_REFRESH_THRESHOLD_MS);
    const defaultThreshold = 5 * 60 * 1000; // 5 minutes
    this.refreshThresholdMs = Number.isFinite(threshold) && threshold >= 0 ? threshold : defaultThreshold;

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

  private static stableStringify(value: any): string {
    return JSON.stringify(value, (_key, val) => {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        return Object.keys(val)
          .sort()
          .reduce((acc, key) => {
            acc[key] = val[key];
            return acc;
          }, {} as Record<string, any>);
      }
      return val;
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
      organizationId: record.organizationId,
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

  private stripCredentialCallbacks(credentials: Record<string, any> | undefined): Record<string, any> {
    if (!credentials || typeof credentials !== 'object') {
      return {};
    }

    const { onTokenRefreshed, ...rest } = credentials as Record<string, any>;
    return { ...rest };
  }

  private buildDynamicOptionCacheKey(params: FetchDynamicOptionsParams): string {
    const normalizedPath = normalizeDynamicOptionPath(params.parameterPath ?? '').toLowerCase();
    const payload = {
      appId: params.appId,
      handlerId: String(params.handlerId ?? '').toLowerCase(),
      operationType: params.operationType,
      operationId: String(params.operationId ?? '').toLowerCase(),
      parameterPath: normalizedPath,
      context: params.context ?? {},
    };
    return ConnectionService.stableStringify(payload);
  }

  private readDynamicOptionCache(connectionId: string, cacheKey: string): DynamicOptionCacheEntry | undefined {
    const cache = this.dynamicOptionCache.get(connectionId);
    if (!cache) {
      return undefined;
    }

    const entry = cache.get(cacheKey);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      cache.delete(cacheKey);
      if (cache.size === 0) {
        this.dynamicOptionCache.delete(connectionId);
      }
      return undefined;
    }

    return entry;
  }

  private writeDynamicOptionCache(
    connectionId: string,
    cacheKey: string,
    result: DynamicOptionResult,
    ttlMs: number
  ): number | undefined {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      return undefined;
    }

    const expiresAt = Date.now() + ttlMs;
    const bucket = this.dynamicOptionCache.get(connectionId) ?? new Map<string, DynamicOptionCacheEntry>();
    bucket.set(cacheKey, {
      cacheKey,
      expiresAt,
      result,
    });
    this.dynamicOptionCache.set(connectionId, bucket);
    return expiresAt;
  }

  private invalidateDynamicOptionCache(
    connectionId: string,
    predicate?: (key: string, entry: DynamicOptionCacheEntry) => boolean
  ): void {
    const cache = this.dynamicOptionCache.get(connectionId);
    if (!cache) {
      return;
    }

    if (typeof predicate !== 'function') {
      this.dynamicOptionCache.delete(connectionId);
      return;
    }

    for (const [key, entry] of Array.from(cache.entries())) {
      if (predicate(key, entry)) {
        cache.delete(key);
      }
    }

    if (cache.size === 0) {
      this.dynamicOptionCache.delete(connectionId);
    }
  }

  /**
   * Only used in tests to replace the OAuth manager implementation
   */
  public __setOAuthManagerForTests(manager?: OAuthTokenRefresher): void {
    this.oauthManagerOverride = manager;
  }

  private async resolveOAuthManager(): Promise<OAuthTokenRefresher> {
    if (this.oauthManagerOverride) {
      return this.oauthManagerOverride;
    }

    if (this.cachedOAuthManager) {
      return this.cachedOAuthManager;
    }

    try {
      const module = await import('../oauth/OAuthManager.js');
      this.cachedOAuthManager = module.oauthManager;
      return this.cachedOAuthManager;
    } catch (error) {
      const message = getErrorMessage(error);
      throw new ConnectionServiceError(`OAuth manager unavailable: ${message}`, 503);
    }
  }

  private parseExpiryTimestamp(value: unknown): number | null {
    if (!value) return null;

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const timestamp = Date.parse(value);
      return Number.isNaN(timestamp) ? null : timestamp;
    }

    return null;
  }

  private needsTokenRefresh(
    connection: DecryptedConnection,
    thresholdOverrideMs?: number
  ): boolean {
    const refreshToken = connection.credentials?.refreshToken;
    if (!refreshToken) {
      return false;
    }

    const expiryTimestamp =
      this.parseExpiryTimestamp(connection.metadata?.expiresAt) ??
      this.parseExpiryTimestamp(connection.credentials?.expiresAt);

    if (!expiryTimestamp) {
      return false;
    }

    const threshold =
      typeof thresholdOverrideMs === 'number' && Number.isFinite(thresholdOverrideMs) && thresholdOverrideMs >= 0
        ? thresholdOverrideMs
        : this.refreshThresholdMs;

    return expiryTimestamp - Date.now() <= threshold;
  }

  private buildRefreshedMetadata(
    previous: Record<string, any> | undefined,
    tokens: OAuthTokens
  ): Record<string, any> {
    const expiresAtIso = tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : previous?.expiresAt;

    return {
      ...(previous || {}),
      refreshToken: Boolean(tokens.refreshToken ?? previous?.refreshToken),
      expiresAt: expiresAtIso,
      refreshedAt: new Date().toISOString(),
    };
  }

  private async refreshConnectionTokens(
    connection: DecryptedConnection,
    userId: string,
    organizationId: string
  ): Promise<DecryptedConnection> {
    const oauthManager = await this.resolveOAuthManager();

    try {
      const tokens = await oauthManager.refreshToken(userId, organizationId, connection.provider);
      const latest = (await this.getConnection(connection.id, userId, organizationId)) ?? connection;
      return this.persistRefreshedTokens(latest, tokens);
    } catch (error) {
      const message = getErrorMessage(error);
      throw new ConnectionServiceError(`Failed to refresh OAuth tokens: ${message}`, 401);
    }
  }

  private async persistRefreshedTokens(
    connection: DecryptedConnection,
    tokens: TokenRefreshUpdate
  ): Promise<DecryptedConnection> {
    const baseCredentials = this.stripCredentialCallbacks(connection.credentials);
    const mergedCredentials = { ...baseCredentials, ...tokens };
    const metadata = this.buildRefreshedMetadata(connection.metadata, tokens);
    const encrypted = this.encryptCredentials(mergedCredentials);
    const updatedAt = new Date();

    if (this.useFileStore) {
      const records = await this.readFileStore();
      const index = records.findIndex(
        (record) =>
          record.id === connection.id &&
          record.userId === connection.userId &&
          record.organizationId === connection.organizationId
      );

      if (index === -1) {
        console.warn(`⚠️ ConnectionService: Unable to persist refreshed tokens for missing connection ${connection.id}`);
      } else {
        records[index] = {
          ...records[index],
          encryptedCredentials: encrypted.encryptedData,
          iv: encrypted.iv,
          metadata,
          updatedAt: updatedAt.toISOString(),
        };
        await this.writeFileStore(records);
      }
    } else {
      this.ensureDb();
      await this.db
        .update(connections)
        .set({
          encryptedCredentials: encrypted.encryptedData,
          iv: encrypted.iv,
          metadata,
          updatedAt,
        })
        .where(and(
          eq(connections.id, connection.id),
          eq(connections.organizationId, connection.organizationId),
          eq(connections.userId, connection.userId)
        ));
    }

    this.invalidateDynamicOptionCache(connection.id);

    return {
      ...connection,
      credentials: mergedCredentials,
      metadata,
      updatedAt,
    };
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
        organizationId: request.organizationId,
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
      return record.id;
    }

    this.ensureDb();
    const [connection] = await this.db.insert(connections).values({
      userId: request.userId,
      organizationId: request.organizationId,
      name: request.name,
      provider: normalizedProvider,
      type: request.type,
      encryptedCredentials: encrypted.encryptedData,
      iv: encrypted.iv,
      metadata: request.metadata || {},
      isActive: true,
    }).returning({ id: connections.id });

    console.log(`✅ Connection created: ${connection.id}`);
    return connection.id;
  }

  /**
   * Get decrypted connection by ID
   */
  public async getConnection(
    connectionId: string,
    userId: string,
    organizationId: string
  ): Promise<DecryptedConnection | null> {
    if (this.useFileStore) {
      const records = await this.readFileStore();
      const record = records.find(
        (conn) =>
          conn.id === connectionId &&
          conn.userId === userId &&
          conn.organizationId === organizationId &&
          conn.isActive
      );
      return record ? this.toDecryptedConnection(record) : null;
    }

    this.ensureDb();
    const [connection] = await this.db
      .select()
      .from(connections)
      .where(and(
        eq(connections.id, connectionId),
        eq(connections.userId, userId),
        eq(connections.organizationId, organizationId),
        eq(connections.isActive, true)
      ));

    if (!connection) {
      return null;
    }

    const credentials = EncryptionService.decryptCredentials(
      connection.encryptedCredentials,
      connection.iv
    );

    return {
      id: connection.id,
      userId: connection.userId,
      organizationId: connection.organizationId,
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

  public async getConnectionWithFreshTokens(
    connectionId: string,
    userId: string,
    organizationId: string
  ): Promise<DecryptedConnection | null> {
    const connection = await this.getConnection(connectionId, userId, organizationId);
    if (!connection) {
      return null;
    }

    if (!this.needsTokenRefresh(connection)) {
      return connection;
    }

    return this.refreshConnectionTokens(connection, userId, organizationId);
  }

  /**
   * Get user's connections by provider
   */
  public async getUserConnections(
    userId: string,
    organizationId: string,
    provider?: string
  ): Promise<DecryptedConnection[]> {
    const normalizedProvider = provider?.toLowerCase();

    if (this.useFileStore) {
      const records = await this.readFileStore();
      return records
        .filter((conn) =>
          conn.userId === userId &&
          conn.organizationId === organizationId &&
          conn.isActive &&
          (!normalizedProvider || conn.provider === normalizedProvider)
        )
        .map((record) => this.toDecryptedConnection(record));
    }

    const whereConditions = [
      eq(connections.userId, userId),
      eq(connections.organizationId, organizationId),
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

      return {
        id: connection.id,
        userId: connection.userId,
        organizationId: connection.organizationId,
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

  public async getConnectionByProvider(
    userId: string,
    organizationId: string,
    provider: string
  ): Promise<DecryptedConnection | null> {
    const normalizedProvider = provider.toLowerCase();

    if (this.useFileStore) {
      const records = await this.readFileStore();
      const record = records.find(
        (conn) =>
          conn.userId === userId &&
          conn.organizationId === organizationId &&
          conn.provider === normalizedProvider &&
          conn.isActive
      );
      return record ? this.toDecryptedConnection(record) : null;
    }

    const [connection] = await this.db
      .select()
      .from(connections)
      .where(and(
        eq(connections.userId, userId),
        eq(connections.organizationId, organizationId),
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

    return {
      id: connection.id,
      userId: connection.userId,
      organizationId: connection.organizationId,
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

  public async getConnectionByProviderWithFreshTokens(
    userId: string,
    organizationId: string,
    provider: string
  ): Promise<DecryptedConnection | null> {
    const connection = await this.getConnectionByProvider(userId, organizationId, provider);
    if (!connection) {
      return null;
    }

    if (!this.needsTokenRefresh(connection)) {
      return connection;
    }

    return this.refreshConnectionTokens(connection, userId, organizationId);
  }

  public async withAutoRefresh<T>(
    params: {
      connectionId?: string;
      provider?: string;
      userId: string;
      organizationId: string;
      thresholdMs?: number;
    },
    factory: (context: AutoRefreshContext) => Promise<T> | T
  ): Promise<T> {
    const { connectionId, provider, userId, organizationId, thresholdMs } = params;

    if (!connectionId && !provider) {
      throw new ConnectionServiceError('connectionId or provider is required for auto-refresh', 400);
    }

    let connection: DecryptedConnection | null = null;

    if (connectionId) {
      connection = await this.getConnection(connectionId, userId, organizationId);
    } else if (provider) {
      connection = await this.getConnectionByProvider(userId, organizationId, provider);
    }

    if (!connection) {
      throw new ConnectionServiceError('Connection not found', 404);
    }

    if (this.needsTokenRefresh(connection, thresholdMs)) {
      connection = await this.refreshConnectionTokens(connection, userId, organizationId);
    }

    const credentialsBase = this.stripCredentialCallbacks(connection.credentials);
    const credentials: AutoRefreshContext['credentials'] = { ...credentialsBase };

    let currentConnection: DecryptedConnection = {
      ...connection,
      credentials,
    };

    const onTokenRefreshed = async (tokens: TokenRefreshUpdate) => {
      const updated = await this.persistRefreshedTokens(currentConnection, tokens);
      const sanitized = this.stripCredentialCallbacks(updated.credentials);
      Object.assign(credentials, sanitized);
      credentials.onTokenRefreshed = onTokenRefreshed;
      currentConnection = { ...updated, credentials };
    };

    credentials.onTokenRefreshed = onTokenRefreshed;

    return factory({
      connection: currentConnection,
      credentials,
    });
  }

  public async prepareConnectionForClient(
    params: {
      connectionId?: string;
      provider?: string;
      userId: string;
      organizationId: string;
      thresholdMs?: number;
    }
  ): Promise<AutoRefreshContext | null> {
    try {
      return await this.withAutoRefresh(params, async (context) => context);
    } catch (error) {
      if (error instanceof ConnectionServiceError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  public async fetchDynamicOptions(params: FetchDynamicOptionsParams): Promise<DynamicOptionFetchResult> {
    const {
      connectionId,
      userId,
      organizationId,
      appId,
      handlerId,
      operationType,
      operationId,
      parameterPath,
      context,
      cacheTtlMs,
      forceRefresh,
      additionalConfig,
    } = params;

    if (!connectionId) {
      throw new ConnectionServiceError('connectionId is required for dynamic options', 400);
    }

    const effectiveTtl = Number.isFinite(cacheTtlMs) && cacheTtlMs !== undefined && cacheTtlMs >= 0
      ? Number(cacheTtlMs)
      : 5 * 60 * 1000;

    const normalizedPath = normalizeDynamicOptionPath(parameterPath ?? '');
    const cacheKey = this.buildDynamicOptionCacheKey({
      ...params,
      parameterPath: normalizedPath,
      context,
    });

    if (!forceRefresh) {
      const cachedEntry = this.readDynamicOptionCache(connectionId, cacheKey);
      if (cachedEntry) {
        return {
          ...cachedEntry.result,
          cached: true,
          cacheKey,
          cacheExpiresAt: cachedEntry.expiresAt,
        };
      }
    }

    try {
      const result = await this.withAutoRefresh(
        { connectionId, userId, organizationId },
        async ({ connection, credentials }) => {
          const mergedContext: DynamicOptionHandlerContext = {
            ...(context ?? {}),
            operationId,
            operationType,
            parameterPath: normalizedPath,
            appId,
          };

          const dynamicResult = await integrationManager.getDynamicOptions({
            appName: appId,
            handlerId,
            credentials,
            connectionId: connection.id,
            additionalConfig: additionalConfig ?? connection.metadata?.additionalConfig,
            context: mergedContext,
          });

          let cacheExpiresAt: number | undefined;
          if (dynamicResult.success && effectiveTtl > 0) {
            cacheExpiresAt = this.writeDynamicOptionCache(connection.id, cacheKey, dynamicResult, effectiveTtl);
          }

          return {
            ...dynamicResult,
            cached: false,
            cacheKey,
            cacheExpiresAt,
          } satisfies DynamicOptionFetchResult;
        }
      );

      return result;
    } catch (error) {
      if (error instanceof ConnectionServiceError) {
        throw error;
      }

      const message = getErrorMessage(error);
      return {
        success: false,
        options: [],
        error: message,
        cached: false,
        cacheKey,
      };
    }
  }

  public async refreshConnectionsExpiringSoon(
    options: { lookaheadMs?: number; limit?: number } = {}
  ): Promise<{ scanned: number; refreshed: number; skipped: number; errors: number }> {
    const lookaheadMs = Math.max(
      0,
      typeof options.lookaheadMs === 'number' && Number.isFinite(options.lookaheadMs)
        ? options.lookaheadMs
        : this.refreshThresholdMs
    );
    const limit = Math.max(
      1,
      typeof options.limit === 'number' && Number.isFinite(options.limit)
        ? options.limit
        : 50
    );
    const thresholdIso = new Date(Date.now() + lookaheadMs).toISOString();

    const candidates: Array<{ id: string; userId: string; organizationId: string }> = [];

    if (this.useFileStore) {
      const records = await this.readFileStore();
      const eligible = records
        .filter((record) =>
          record.isActive &&
          Boolean(record.metadata?.refreshToken) &&
          typeof record.metadata?.expiresAt === 'string'
        )
        .filter((record) => {
          const expiresAt = Date.parse(String(record.metadata?.expiresAt));
          return Number.isFinite(expiresAt) && expiresAt - Date.now() <= lookaheadMs;
        })
        .sort((a, b) => {
          const aTs = Date.parse(String(a.metadata?.expiresAt));
          const bTs = Date.parse(String(b.metadata?.expiresAt));
          return aTs - bTs;
        })
        .slice(0, limit);

      for (const record of eligible) {
        candidates.push({ id: record.id, userId: record.userId, organizationId: record.organizationId });
      }
    } else {
      this.ensureDb();
      const result = await this.db.execute(sql`
        select
          id,
          user_id as "userId",
          organization_id as "organizationId"
        from connections
        where is_active = true
          and metadata->>'expiresAt' is not null
          and coalesce(metadata->>'refreshToken', 'false') != 'false'
          and metadata->>'expiresAt' <= ${thresholdIso}
        order by metadata->>'expiresAt'
        limit ${limit}
      `);

      const rows = result.rows as Array<{ id: string; userId: string; organizationId: string }>;
      candidates.push(...rows);
    }

    let scanned = 0;
    let refreshed = 0;
    let skipped = 0;
    let errors = 0;

    for (const candidate of candidates) {
      const connection = await this.getConnection(candidate.id, candidate.userId, candidate.organizationId);
      if (!connection) {
        skipped++;
        continue;
      }

      scanned++;

      if (!this.needsTokenRefresh(connection, lookaheadMs)) {
        skipped++;
        continue;
      }

      try {
        await this.refreshConnectionTokens(connection, candidate.userId, candidate.organizationId);
        refreshed++;
      } catch (error) {
        errors++;
        console.error(
          `❌ Failed to proactively refresh connection ${connection.provider}:${connection.id}`,
          getErrorMessage(error)
        );
      }
    }

    return { scanned, refreshed, skipped, errors };
  }

  public async markUsed(
    connectionId: string,
    userId: string,
    organizationId: string,
    ok: boolean,
    errorMsg?: string
  ): Promise<void> {
    if (this.useFileStore) {
      const records = await this.readFileStore();
      const idx = records.findIndex(
        r => r.id === connectionId && r.userId === userId && r.organizationId === organizationId
      );
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
  public async exportConnections(userId: string, organizationId: string): Promise<any[]> {
    const conns = await this.getUserConnections(userId, organizationId);
    return conns.map(c => ConnectionService.maskCredentials(c));
  }

  /**
   * Import connections from masked/plain JSON (dev/local only). Re-encrypts credentials.
   */
  public async importConnections(
    userId: string,
    organizationId: string,
    list: Array<{ provider: string; name?: string; credentials: any; metadata?: any }>
  ): Promise<{ imported: number }> {
    let imported = 0;
    for (const item of list || []) {
      if (!item?.provider || !item?.credentials) continue;
      await this.storeConnection(
        userId,
        organizationId,
        item.provider,
        item.credentials as any,
        undefined,
        { name: item.name, metadata: item.metadata, type: 'saas' }
      );
      imported++;
    }
    return { imported };
  }

  public async storeConnection(
    userId: string,
    organizationId: string,
    provider: string,
    tokens: OAuthTokens,
    userInfo?: OAuthUserInfo,
    options: {
      name?: string;
      metadata?: Record<string, any>;
      type?: 'llm' | 'saas' | 'database';
      connectionId?: string;
    } = {}
  ): Promise<string> {
    const normalizedProvider = provider.toLowerCase();
    const rawName = options.name || userInfo?.email || normalizedProvider;
    const trimmedName = typeof rawName === 'string' ? rawName.trim() : undefined;
    const connectionName = trimmedName && trimmedName.length > 0 ? trimmedName : normalizedProvider;
    const requestedConnectionId = options.connectionId?.trim();
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
      const existingIndex = records.findIndex((conn) => {
        if (requestedConnectionId) {
          return (
            conn.id === requestedConnectionId &&
            conn.organizationId === organizationId &&
            conn.userId === userId
          );
        }

        return (
          conn.userId === userId &&
          conn.organizationId === organizationId &&
          conn.provider === normalizedProvider &&
          conn.name === connectionName
        );
      });

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
        console.log(`🔄 Updated connection (${normalizedProvider}:${connectionName}) for ${userId}`);
        this.invalidateDynamicOptionCache(updated.id);
        return updated.id;
      }

      const record: FileConnectionRecord = {
        id: requestedConnectionId ?? randomUUID(),
        userId,
        organizationId,
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
      console.log(`✅ Stored connection (${normalizedProvider}:${connectionName}) for ${userId}`);
      return record.id;
    }

    this.ensureDb();

    let existingConnectionId: string | undefined;

    if (requestedConnectionId) {
      const [existingById] = await this.db
        .select({ id: connections.id })
        .from(connections)
        .where(and(
          eq(connections.id, requestedConnectionId),
          eq(connections.organizationId, organizationId),
          eq(connections.userId, userId)
        ))
        .limit(1);

      existingConnectionId = existingById?.id;
    } else {
      const [existingByKey] = await this.db
        .select({ id: connections.id })
        .from(connections)
        .where(and(
          eq(connections.userId, userId),
          eq(connections.organizationId, organizationId),
          eq(connections.provider, normalizedProvider),
          eq(connections.name, connectionName)
        ))
        .limit(1);

      existingConnectionId = existingByKey?.id;
    }

    if (existingConnectionId) {
      await this.db
        .update(connections)
        .set({
          name: connectionName,
          encryptedCredentials: encrypted.encryptedData,
          iv: encrypted.iv,
          metadata,
          updatedAt: new Date(),
          isActive: true,
          type: options.type || 'saas'
        })
        .where(and(
          eq(connections.id, existingConnectionId),
          eq(connections.organizationId, organizationId),
          eq(connections.userId, userId)
        ));
      console.log(`🔄 Updated connection (${normalizedProvider}:${connectionName}) for ${userId}`);
      this.invalidateDynamicOptionCache(existingConnectionId);
      return existingConnectionId;
    }

    const baseValues: typeof connections.$inferInsert = {
      userId,
      organizationId,
      name: connectionName,
      provider: normalizedProvider,
      type: options.type || 'saas',
      encryptedCredentials: encrypted.encryptedData,
      iv: encrypted.iv,
      metadata,
      isActive: true,
    };

    const insertValues: typeof connections.$inferInsert = requestedConnectionId
      ? { ...baseValues, id: requestedConnectionId }
      : baseValues;

    const [created] = await this.db
      .insert(connections)
      .values(insertValues)
      .onConflictDoUpdate({
        target: [
          connections.organizationId,
          connections.userId,
          connections.provider,
          connections.name,
        ],
        set: {
          name: connectionName,
          encryptedCredentials: encrypted.encryptedData,
          iv: encrypted.iv,
          metadata,
          updatedAt: new Date(),
          isActive: true,
          type: options.type || 'saas',
        },
      })
      .returning({ id: connections.id });

    console.log(`✅ Stored connection (${normalizedProvider}:${connectionName}) for ${userId}`);
    return created.id;
  }

  /**
   * Test a connection to verify it works
   */
  public async testConnection(
    connectionId: string,
    userId: string,
    organizationId: string
  ): Promise<ConnectionTestResult> {
    const connection = await this.getConnection(connectionId, userId, organizationId);
    
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
      await this.updateTestStatus(
        connectionId,
        connection.organizationId,
        result.success,
        result.message
      );

      return result;

    } catch (error) {
      const result: ConnectionTestResult = {
        success: false,
        message: 'Connection test failed',
        error: getErrorMessage(error),
        provider: connection.provider,
        responseTime: Date.now() - startTime
      };

      await this.updateTestStatus(
        connectionId,
        connection.organizationId,
        false,
        getErrorMessage(error)
      );
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
  private async updateTestStatus(
    connectionId: string,
    organizationId: string,
    success: boolean,
    message: string
  ): Promise<void> {
    if (this.useFileStore) {
      const records = await this.readFileStore();
      const index = records.findIndex(
        (conn) => conn.id === connectionId && conn.organizationId === organizationId
      );
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
      .where(and(
        eq(connections.id, connectionId),
        eq(connections.organizationId, organizationId)
      ));
  }

  /**
   * Update connection
   */
  public async updateConnection(
    connectionId: string,
    userId: string,
    organizationId: string,
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
      const index = records.findIndex(
        (conn) =>
          conn.id === connectionId &&
          conn.userId === userId &&
          conn.organizationId === organizationId
      );
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
      }
      this.invalidateDynamicOptionCache(connectionId);
      return;
    }

    this.ensureDb();
    await this.db
      .update(connections)
      .set(updateData)
      .where(and(
        eq(connections.id, connectionId),
        eq(connections.userId, userId),
        eq(connections.organizationId, organizationId)
      ));
    this.invalidateDynamicOptionCache(connectionId);
  }

  /**
   * Delete connection (soft delete)
   */
  public async deleteConnection(
    connectionId: string,
    userId: string,
    organizationId: string
  ): Promise<void> {
    if (this.useFileStore) {
      const records = await this.readFileStore();
      const index = records.findIndex(
        (conn) =>
          conn.id === connectionId &&
          conn.userId === userId &&
          conn.organizationId === organizationId
      );
      if (index >= 0) {
        records[index] = {
          ...records[index],
          isActive: false,
          updatedAt: new Date().toISOString(),
        };
        await this.writeFileStore(records);
      }
      this.invalidateDynamicOptionCache(connectionId);
      return;
    }

    this.ensureDb();
    await this.db
      .update(connections)
      .set({
        isActive: false,
        updatedAt: new Date()
      })
      .where(and(
        eq(connections.id, connectionId),
        eq(connections.userId, userId),
        eq(connections.organizationId, organizationId)
      ));
    this.invalidateDynamicOptionCache(connectionId);
  }

  /**
   * Get connection for LLM usage (internal method)
   */
  public async getLLMConnection(
    userId: string,
    organizationId: string,
    provider: string
  ): Promise<DecryptedConnection | null> {
    const userConnections = await this.getUserConnections(userId, organizationId, provider);
    
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
