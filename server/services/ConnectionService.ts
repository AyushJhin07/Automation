import { eq, and, sql } from 'drizzle-orm';
import { randomUUID, createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import {
  connections,
  connectionScopedTokens,
  db,
  organizations,
  type OrganizationSecuritySettings,
} from '../database/schema';
import { encryptionRotationService } from './EncryptionRotationService';
import type { EncryptionRotationJobSummary } from './EncryptionRotationService';
import { EncryptionService } from './EncryptionService';
import { getErrorMessage } from '../types/common';
import type { OAuthTokens, OAuthUserInfo } from '../oauth/OAuthManager';
import { integrationManager } from '../integrations/IntegrationManager';
import { env } from '../env';
import { ensureConnectionEncryptionColumns } from '../database/startupGuards';
import { genericExecutor } from '../integrations/GenericExecutor';
import type { DynamicOptionHandlerContext, DynamicOptionResult } from '../integrations/BaseAPIClient';
import { normalizeDynamicOptionPath } from '../../common/connectorDynamicOptions.js';
import type { SandboxResourceLimits } from '../runtime/SandboxShared.js';

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
  encryptionKeyId?: string | null;
  dataKeyCiphertext?: string | null;
  dataKeyIv?: string | null;
  payloadCiphertext?: string | null;
  payloadIv?: string | null;
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

export interface OrganizationNetworkList {
  domains: string[];
  ipRanges: string[];
}

export type OrganizationNetworkAllowlist = OrganizationNetworkList;
export type OrganizationNetworkDenylist = OrganizationNetworkList;

export interface OrganizationNetworkPolicy {
  allowlist: OrganizationNetworkAllowlist;
  denylist: OrganizationNetworkDenylist;
}

export interface SandboxTenancyConfiguration {
  organizationId?: string;
  dependencyAllowlist: string[];
  secretScopes: string[];
  networkPolicy: OrganizationNetworkPolicy;
  resourceLimits?: SandboxResourceLimits;
  policyVersion?: string | null;
}

interface NetworkAccessAuditEntry {
  id: string;
  organizationId: string;
  connectionId?: string;
  userId?: string;
  attemptedHost: string;
  attemptedUrl: string;
  reason: string;
  policy?: {
    allowlist?: OrganizationNetworkAllowlist | null;
    denylist?: OrganizationNetworkDenylist | null;
    required?: OrganizationNetworkAllowlist | null;
    source?: string;
  } | null;
  timestamp: Date;
}

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
  networkAllowlist?: OrganizationNetworkAllowlist;
  networkPolicy?: OrganizationNetworkPolicy;
}

export interface ScopedTokenIssueRequest {
  connectionId: string;
  organizationId: string;
  stepId: string;
  ttlSeconds?: number;
  scope?: Record<string, any> | string[] | null;
  metadata?: Record<string, any> | null;
  createdBy?: string;
}

export interface ScopedTokenIssueResult {
  token: string;
  expiresAt: Date;
  connectionId: string;
  organizationId: string;
  stepId: string;
  encryptionKeyId?: string | null;
}

export interface ScopedTokenRedeemResult {
  connection: DecryptedConnection;
  credentials: Record<string, any>;
  scope?: Record<string, any> | string[] | null;
  metadata?: Record<string, any> | null;
  expiresAt: Date;
  usedAt: Date;
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
  encryptionKeyId?: string | null;
  dataKeyCiphertext?: string | null;
  dataKeyIv?: string | null;
  payloadCiphertext?: string | null;
  payloadIv?: string | null;
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
  private readonly organizationSecurityCache = new Map<string, { settings: OrganizationSecuritySettings; expiresAt: number }>();
  private readonly networkAccessAuditLog: NetworkAccessAuditEntry[] = [];
  private readonly networkAuditLogLimit = 500;
  private readonly platformNetworkPolicy: OrganizationNetworkPolicy;
  private platformPolicyOverride: OrganizationNetworkPolicy | null = null;
  private readonly allowDevPlaintextTokenBypass: boolean;
  private devPlaintextBypassWarningLogged = false;

  constructor() {
    this.db = db;
    this.allowFileStore = process.env.ALLOW_FILE_CONNECTION_STORE === 'true';
    this.fileStorePath = path.resolve(
      process.env.CONNECTION_STORE_PATH || path.join(process.cwd(), '.data', 'connections.json')
    );

    const threshold = Number(process.env.OAUTH_REFRESH_THRESHOLD_MS);
    const defaultThreshold = 5 * 60 * 1000; // 5 minutes
    this.refreshThresholdMs = Number.isFinite(threshold) && threshold >= 0 ? threshold : defaultThreshold;

    this.platformNetworkPolicy = this.computePlatformNetworkPolicy();
    this.allowDevPlaintextTokenBypass =
      env.NODE_ENV === 'development' && env.ALLOW_PLAINTEXT_TOKENS_IN_DEV === true;

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

  private computePlatformNetworkPolicy(): OrganizationNetworkPolicy {
    const allowlist = this.buildNetworkListFromEnv({
      domains: process.env.PLATFORM_NETWORK_ALLOWLIST_DOMAINS,
      ipRanges: process.env.PLATFORM_NETWORK_ALLOWLIST_IP_RANGES,
    });

    const denylist = this.buildNetworkListFromEnv({
      domains: process.env.PLATFORM_NETWORK_DENYLIST_DOMAINS,
      ipRanges: process.env.PLATFORM_NETWORK_DENYLIST_IP_RANGES,
    });

    return {
      allowlist,
      denylist,
    };
  }

  private buildNetworkListFromEnv(env: { domains?: string; ipRanges?: string }): OrganizationNetworkList {
    return {
      domains: this.parseNetworkEnvValues(env.domains),
      ipRanges: this.parseNetworkEnvValues(env.ipRanges),
    };
  }

  private parseNetworkEnvValues(raw: string | undefined): string[] {
    if (!raw) {
      return [];
    }

    let values: unknown = raw;
    try {
      const parsed = JSON.parse(raw);
      values = parsed;
    } catch {
      const parts = raw
        .split(/[,\n]/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      values = parts;
    }

    return this.sanitizeAllowlist(values);
  }

  private cloneNetworkList(list: OrganizationNetworkList): OrganizationNetworkList {
    return {
      domains: [...list.domains],
      ipRanges: [...list.ipRanges],
    };
  }

  private cloneNetworkPolicy(policy: OrganizationNetworkPolicy): OrganizationNetworkPolicy {
    return {
      allowlist: this.cloneNetworkList(policy.allowlist),
      denylist: this.cloneNetworkList(policy.denylist),
    };
  }

  private mergeNetworkLists(
    ...lists: Array<OrganizationNetworkList | null | undefined>
  ): OrganizationNetworkList {
    const domains = new Set<string>();
    const ipRanges = new Set<string>();

    for (const list of lists) {
      if (!list) {
        continue;
      }
      for (const domain of this.sanitizeAllowlist(list.domains)) {
        domains.add(domain);
      }
      for (const range of this.sanitizeAllowlist(list.ipRanges)) {
        ipRanges.add(range);
      }
    }

    return {
      domains: Array.from(domains),
      ipRanges: Array.from(ipRanges),
    };
  }

  public setPlatformNetworkPolicyForTesting(policy: OrganizationNetworkPolicy | null): void {
    this.platformPolicyOverride = policy ? this.cloneNetworkPolicy(policy) : null;
  }

  public getPlatformNetworkPolicy(): OrganizationNetworkPolicy {
    const source = this.platformPolicyOverride ?? this.platformNetworkPolicy;
    return this.cloneNetworkPolicy(source);
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

  private shouldUseDevPlaintextBypass(): boolean {
    return this.allowDevPlaintextTokenBypass;
  }

  private logDevPlaintextBypassWarning(): void {
    if (this.devPlaintextBypassWarningLogged) {
      return;
    }

    console.warn(
      '🚨 ALLOW_PLAINTEXT_TOKENS_IN_DEV enabled: storing OAuth tokens without envelope encryption. Disable this flag once migrations are applied.'
    );
    this.devPlaintextBypassWarningLogged = true;
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

  private async toDecryptedConnection(record: FileConnectionRecord): Promise<DecryptedConnection> {
    const credentials = await EncryptionService.decryptCredentials(
      record.payloadCiphertext ?? record.encryptedCredentials,
      record.payloadIv ?? record.iv,
      record.encryptionKeyId,
      record.dataKeyCiphertext,
      {
        dataKeyIv: record.dataKeyIv,
        payloadCiphertext: record.payloadCiphertext,
        payloadIv: record.payloadIv,
      }
    );
    return {
      id: record.id,
      userId: record.userId,
      organizationId: record.organizationId,
      name: record.name,
      provider: record.provider,
      type: record.type,
      iv: record.iv,
      encryptionKeyId: record.encryptionKeyId ?? null,
      dataKeyCiphertext: record.dataKeyCiphertext ?? null,
      dataKeyIv: record.dataKeyIv ?? null,
      payloadCiphertext: record.payloadCiphertext ?? null,
      payloadIv: record.payloadIv ?? null,
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

  private async loadDecryptedConnectionById(
    connectionId: string,
    organizationId: string
  ): Promise<DecryptedConnection | null> {
    if (this.useFileStore) {
      const records = await this.readFileStore();
      const record = records.find(
        (conn) => conn.id === connectionId && conn.organizationId === organizationId && conn.isActive
      );
      return record ? await this.toDecryptedConnection(record) : null;
    }

    this.ensureDb();
    const [row] = await this.db
      .select()
      .from(connections)
      .where(and(
        eq(connections.id, connectionId),
        eq(connections.organizationId, organizationId),
        eq(connections.isActive, true)
      ))
      .limit(1);

    if (!row) {
      return null;
    }

    const credentials = await EncryptionService.decryptCredentials(
      row.payloadCiphertext ?? row.encryptedCredentials,
      row.payloadIv ?? row.iv,
      row.encryptionKeyId,
      row.dataKeyCiphertext,
      {
        dataKeyIv: row.dataKeyIv,
        payloadCiphertext: row.payloadCiphertext,
        payloadIv: row.payloadIv,
      }
    );

    return {
      id: row.id,
      userId: row.userId,
      organizationId: row.organizationId,
      name: row.name,
      provider: row.provider,
      type: row.type,
      iv: row.iv,
      encryptionKeyId: row.encryptionKeyId ?? null,
      dataKeyCiphertext: row.dataKeyCiphertext ?? null,
      dataKeyIv: row.dataKeyIv ?? null,
      payloadCiphertext: row.payloadCiphertext ?? null,
      payloadIv: row.payloadIv ?? null,
      credentials,
      metadata: row.metadata,
      isActive: row.isActive,
      lastTested: row.lastTested,
      testStatus: row.testStatus,
      testError: row.testError,
      lastUsed: row.lastUsed,
      lastError: row.lastError,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private encryptCredentials(
    credentials: Record<string, any>
  ): ReturnType<typeof EncryptionService.encryptCredentials> {
    return EncryptionService.encryptCredentials(credentials);
  }

  private stripCredentialCallbacks(credentials: Record<string, any> | undefined): Record<string, any> {
    if (!credentials || typeof credentials !== 'object') {
      return {};
    }

    const { onTokenRefreshed, ...rest } = credentials as Record<string, any>;
    return { ...rest };
  }

  private sanitizeAllowlist(values: unknown): string[] {
    if (!Array.isArray(values)) {
      return [];
    }
    const normalized: string[] = [];
    for (const value of values) {
      const str = typeof value === 'string' ? value.trim() : value != null ? String(value).trim() : '';
      if (str.length > 0) {
        normalized.push(str.toLowerCase());
      }
    }
    return Array.from(new Set(normalized));
  }

  private sanitizeSecretScopes(values: unknown): string[] {
    if (!Array.isArray(values)) {
      return [];
    }
    const normalized = new Set<string>();
    for (const value of values) {
      if (typeof value !== 'string') {
        continue;
      }
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        normalized.add(trimmed);
      }
    }
    return Array.from(normalized);
  }

  private normalizeSandboxResourceLimits(input: unknown): SandboxResourceLimits | null {
    if (!input || typeof input !== 'object') {
      return null;
    }

    const source = input as Record<string, unknown>;
    const limits: SandboxResourceLimits = {};
    let hasValue = false;

    if (typeof source.maxCpuMs === 'number' || typeof source.maxCpuMs === 'string') {
      const value = Number(source.maxCpuMs);
      if (Number.isFinite(value) && value >= 0) {
        limits.maxCpuMs = value;
        hasValue = true;
      }
    }

    if (typeof source.maxMemoryBytes === 'number' || typeof source.maxMemoryBytes === 'string') {
      const value = Number(source.maxMemoryBytes);
      if (Number.isFinite(value) && value >= 0) {
        limits.maxMemoryBytes = value;
        hasValue = true;
      }
    }

    if (typeof source.cpuQuotaMs === 'number' || typeof source.cpuQuotaMs === 'string') {
      const value = Number(source.cpuQuotaMs);
      if (Number.isFinite(value) && value >= 0) {
        limits.cpuQuotaMs = value;
        hasValue = true;
      }
    }

    if (typeof source.cgroupRoot === 'string' && source.cgroupRoot.trim().length > 0) {
      limits.cgroupRoot = source.cgroupRoot.trim();
      hasValue = true;
    }

    return hasValue ? limits : null;
  }

  private supportsScopedTokens(metadata: Record<string, any> | undefined | null): boolean {
    if (!metadata || typeof metadata !== 'object') {
      return false;
    }

    if (typeof metadata.supportsScopedTokens === 'boolean') {
      return metadata.supportsScopedTokens;
    }

    const scopedConfig = metadata.scopedTokens ?? metadata.scopedTokenConfig;
    if (scopedConfig && typeof scopedConfig === 'object') {
      const flag = (scopedConfig as Record<string, any>).enabled;
      if (typeof flag === 'boolean') {
        return flag;
      }
    }

    if (typeof metadata.authenticationMode === 'string') {
      const mode = metadata.authenticationMode.toLowerCase();
      if (mode === 'sts' || mode === 'scoped_token' || mode === 'assume_role') {
        return true;
      }
    }

    if (Array.isArray(metadata.capabilities)) {
      return metadata.capabilities.some((cap: any) =>
        typeof cap === 'string' && cap.toLowerCase().includes('scoped-token')
      );
    }

    return false;
  }

  private hashScopedToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async getOrganizationSecuritySettings(
    organizationId: string
  ): Promise<OrganizationSecuritySettings | null> {
    if (!this.db) {
      return null;
    }

    const cached = this.organizationSecurityCache.get(organizationId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.settings;
    }

    const [record] = await this.db
      .select({ security: organizations.security })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!record) {
      return null;
    }

    const rawSettings = (record.security as OrganizationSecuritySettings | null) ?? null;

    if (!rawSettings) {
      return null;
    }

    const normalized: OrganizationSecuritySettings = {
      ...rawSettings,
      ipWhitelist: Array.isArray(rawSettings.ipWhitelist) ? rawSettings.ipWhitelist : [],
      allowedDomains: this.sanitizeAllowlist(rawSettings.allowedDomains),
      allowedIpRanges: this.sanitizeAllowlist(rawSettings.allowedIpRanges),
    };

    this.organizationSecurityCache.set(organizationId, {
      settings: normalized,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return normalized;
  }

  private async resolveNetworkAllowlist(
    organizationId: string
  ): Promise<OrganizationNetworkAllowlist | null> {
    const settings = await this.getOrganizationSecuritySettings(organizationId);
    if (!settings) {
      return null;
    }

    const domains = this.sanitizeAllowlist(settings.allowedDomains);
    const ipRanges = this.sanitizeAllowlist(settings.allowedIpRanges);

    return { domains, ipRanges };
  }

  public async getOrganizationNetworkPolicy(
    organizationId: string | undefined
  ): Promise<OrganizationNetworkPolicy> {
    const platform = this.getPlatformNetworkPolicy();

    if (!organizationId) {
      return platform;
    }

    const allowlist = await this.resolveNetworkAllowlist(organizationId);
    if (!allowlist) {
      return platform;
    }

    return {
      allowlist: this.mergeNetworkLists(platform.allowlist, allowlist),
      denylist: this.cloneNetworkList(platform.denylist),
    };
  }

  public async getOrganizationNetworkAllowlist(
    organizationId: string | undefined
  ): Promise<OrganizationNetworkAllowlist | null> {
    const policy = await this.getOrganizationNetworkPolicy(organizationId);
    return this.cloneNetworkList(policy.allowlist);
  }

  public async getSandboxTenancyConfiguration(
    organizationId: string | undefined
  ): Promise<SandboxTenancyConfiguration> {
    const networkPolicy = await this.getOrganizationNetworkPolicy(organizationId);
    const settings = organizationId
      ? await this.getOrganizationSecuritySettings(organizationId)
      : null;

    const sandboxConfig = settings && typeof (settings as any).sandbox === 'object'
      ? ((settings as any).sandbox as Record<string, unknown>)
      : null;

    const dependencyAllowlist = this.sanitizeAllowlist(
      sandboxConfig?.dependencyAllowlist ?? sandboxConfig?.dependencies
    );
    const secretScopes = this.sanitizeSecretScopes(sandboxConfig?.secretScopes);
    const resourceLimits = this.normalizeSandboxResourceLimits(sandboxConfig?.resourceLimits);
    const policyVersion = typeof sandboxConfig?.policyVersion === 'string'
      ? sandboxConfig?.policyVersion
      : null;

    return {
      organizationId: organizationId ?? undefined,
      dependencyAllowlist,
      secretScopes,
      networkPolicy,
      resourceLimits: resourceLimits ?? undefined,
      policyVersion,
    };
  }

  public invalidateOrganizationSecurityCache(organizationId: string): void {
    this.organizationSecurityCache.delete(organizationId);
  }

  public recordDeniedNetworkAccess(entry: {
    organizationId?: string;
    connectionId?: string;
    userId?: string;
    attemptedHost: string;
    attemptedUrl: string;
    reason: string;
    policy?: {
      allowlist?: OrganizationNetworkAllowlist | null;
      denylist?: OrganizationNetworkDenylist | null;
      required?: OrganizationNetworkAllowlist | null;
      source?: string;
    } | null;
  }): void {
    if (!entry.organizationId) {
      return;
    }

    const record: NetworkAccessAuditEntry = {
      id: randomUUID(),
      organizationId: entry.organizationId,
      connectionId: entry.connectionId,
      userId: entry.userId,
      attemptedHost: entry.attemptedHost,
      attemptedUrl: entry.attemptedUrl,
      reason: entry.reason,
      policy: entry.policy ?? null,
      timestamp: new Date(),
    };

    this.networkAccessAuditLog.unshift(record);
    if (this.networkAccessAuditLog.length > this.networkAuditLogLimit) {
      this.networkAccessAuditLog.length = this.networkAuditLogLimit;
    }
  }

  public getDeniedNetworkAccess(
    organizationId: string,
    limit: number = 50
  ): NetworkAccessAuditEntry[] {
    if (limit <= 0) {
      return [];
    }

    return this.networkAccessAuditLog
      .filter((entry) => entry.organizationId === organizationId)
      .slice(0, limit);
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
    const encrypted = await this.encryptCredentials(mergedCredentials);
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
          encryptionKeyId: encrypted.keyId ?? records[index].encryptionKeyId ?? null,
          dataKeyCiphertext: encrypted.dataKeyCiphertext ?? records[index].dataKeyCiphertext ?? null,
          dataKeyIv: encrypted.dataKeyIv ?? records[index].dataKeyIv ?? null,
          payloadCiphertext:
            encrypted.payloadCiphertext ?? records[index].payloadCiphertext ?? encrypted.encryptedData,
          payloadIv: encrypted.payloadIv ?? records[index].payloadIv ?? encrypted.iv,
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
          encryptionKeyId: encrypted.keyId ?? connection.encryptionKeyId ?? null,
          dataKeyCiphertext: encrypted.dataKeyCiphertext ?? connection.dataKeyCiphertext ?? null,
          dataKeyIv: encrypted.dataKeyIv ?? connection.dataKeyIv ?? null,
          payloadCiphertext:
            encrypted.payloadCiphertext ?? connection.payloadCiphertext ?? encrypted.encryptedData,
          payloadIv: encrypted.payloadIv ?? connection.payloadIv ?? encrypted.iv,
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
      encryptionKeyId: encrypted.keyId ?? connection.encryptionKeyId ?? null,
      dataKeyCiphertext: encrypted.dataKeyCiphertext ?? connection.dataKeyCiphertext ?? null,
      dataKeyIv: encrypted.dataKeyIv ?? connection.dataKeyIv ?? null,
      payloadCiphertext: encrypted.payloadCiphertext ?? connection.payloadCiphertext ?? encrypted.encryptedData,
      payloadIv: encrypted.payloadIv ?? connection.payloadIv ?? encrypted.iv,
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
    const encrypted = await this.encryptCredentials(request.credentials);

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
        encryptionKeyId: encrypted.keyId ?? null,
        dataKeyCiphertext: encrypted.dataKeyCiphertext ?? null,
        dataKeyIv: encrypted.dataKeyIv ?? null,
        payloadCiphertext: encrypted.payloadCiphertext ?? encrypted.encryptedData,
        payloadIv: encrypted.payloadIv ?? encrypted.iv,
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
      encryptionKeyId: encrypted.keyId ?? null,
      dataKeyCiphertext: encrypted.dataKeyCiphertext ?? null,
      dataKeyIv: encrypted.dataKeyIv ?? null,
      payloadCiphertext: encrypted.payloadCiphertext ?? encrypted.encryptedData,
      payloadIv: encrypted.payloadIv ?? encrypted.iv,
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
      return record ? await this.toDecryptedConnection(record) : null;
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

    const credentials = await EncryptionService.decryptCredentials(
      connection.payloadCiphertext ?? connection.encryptedCredentials,
      connection.payloadIv ?? connection.iv,
      connection.encryptionKeyId,
      connection.dataKeyCiphertext,
      {
        dataKeyIv: connection.dataKeyIv,
        payloadCiphertext: connection.payloadCiphertext,
        payloadIv: connection.payloadIv,
      }
    );

    return {
      id: connection.id,
      userId: connection.userId,
      organizationId: connection.organizationId,
      name: connection.name,
      provider: connection.provider,
      type: connection.type,
      iv: connection.iv,
      encryptionKeyId: connection.encryptionKeyId ?? null,
      dataKeyCiphertext: connection.dataKeyCiphertext ?? null,
      dataKeyIv: connection.dataKeyIv ?? null,
      payloadCiphertext: connection.payloadCiphertext ?? null,
      payloadIv: connection.payloadIv ?? null,
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
      const filtered = records.filter((conn) =>
        conn.userId === userId &&
        conn.organizationId === organizationId &&
        conn.isActive &&
        (!normalizedProvider || conn.provider === normalizedProvider)
      );
      return Promise.all(filtered.map((record) => this.toDecryptedConnection(record)));
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

    return Promise.all(
      userConnections.map(async (connection) => {
        const credentials = await EncryptionService.decryptCredentials(
          connection.payloadCiphertext ?? connection.encryptedCredentials,
          connection.payloadIv ?? connection.iv,
          connection.encryptionKeyId,
          connection.dataKeyCiphertext,
          {
            dataKeyIv: connection.dataKeyIv,
            payloadCiphertext: connection.payloadCiphertext,
            payloadIv: connection.payloadIv,
          }
        );

        return {
          id: connection.id,
          userId: connection.userId,
          organizationId: connection.organizationId,
          name: connection.name,
          provider: connection.provider,
          type: connection.type,
          iv: connection.iv,
          encryptionKeyId: connection.encryptionKeyId ?? null,
          dataKeyCiphertext: connection.dataKeyCiphertext ?? null,
          dataKeyIv: connection.dataKeyIv ?? null,
          payloadCiphertext: connection.payloadCiphertext ?? null,
          payloadIv: connection.payloadIv ?? null,
          credentials,
          metadata: connection.metadata,
          isActive: connection.isActive,
          lastTested: connection.lastTested,
          testStatus: connection.testStatus,
          testError: connection.testError,
          createdAt: connection.createdAt,
          updatedAt: connection.updatedAt,
        };
      })
    );
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
      return record ? await this.toDecryptedConnection(record) : null;
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

    const credentials = await EncryptionService.decryptCredentials(
      connection.payloadCiphertext ?? connection.encryptedCredentials,
      connection.payloadIv ?? connection.iv,
      connection.encryptionKeyId,
      connection.dataKeyCiphertext,
      {
        dataKeyIv: connection.dataKeyIv,
        payloadCiphertext: connection.payloadCiphertext,
        payloadIv: connection.payloadIv,
      }
    );

    return {
      id: connection.id,
      userId: connection.userId,
      organizationId: connection.organizationId,
      name: connection.name,
      provider: connection.provider,
      type: connection.type,
      iv: connection.iv,
      encryptionKeyId: connection.encryptionKeyId ?? null,
      dataKeyCiphertext: connection.dataKeyCiphertext ?? null,
      dataKeyIv: connection.dataKeyIv ?? null,
      payloadCiphertext: connection.payloadCiphertext ?? null,
      payloadIv: connection.payloadIv ?? null,
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

    const networkPolicy = await this.getOrganizationNetworkPolicy(organizationId);

    return factory({
      connection: currentConnection,
      credentials,
      networkAllowlist: networkPolicy.allowlist,
      networkPolicy,
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
    const bypassEnvelopeEncryption = this.shouldUseDevPlaintextBypass();
    if (bypassEnvelopeEncryption) {
      this.logDevPlaintextBypassWarning();
    }
    const encrypted = await this.encryptCredentials(credentialsPayload);
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
          encryptionKeyId: encrypted.keyId ?? existing.encryptionKeyId ?? null,
          dataKeyCiphertext: encrypted.dataKeyCiphertext ?? existing.dataKeyCiphertext ?? null,
          dataKeyIv: encrypted.dataKeyIv ?? existing.dataKeyIv ?? null,
          payloadCiphertext:
            encrypted.payloadCiphertext ?? existing.payloadCiphertext ?? encrypted.encryptedData,
          payloadIv: encrypted.payloadIv ?? existing.payloadIv ?? encrypted.iv,
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
        encryptionKeyId: encrypted.keyId ?? null,
        dataKeyCiphertext: encrypted.dataKeyCiphertext ?? null,
        dataKeyIv: encrypted.dataKeyIv ?? null,
        payloadCiphertext: encrypted.payloadCiphertext ?? encrypted.encryptedData,
        payloadIv: encrypted.payloadIv ?? encrypted.iv,
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

    await ensureConnectionEncryptionColumns();

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
      const updateValues: Partial<typeof connections.$inferInsert> = {
        name: connectionName,
        encryptedCredentials: encrypted.encryptedData,
        iv: encrypted.iv,
        payloadCiphertext: encrypted.payloadCiphertext ?? encrypted.encryptedData,
        payloadIv: encrypted.payloadIv ?? encrypted.iv,
        dataKeyIv: encrypted.dataKeyIv ?? null,
        metadata,
        updatedAt: new Date(),
        isActive: true,
        type: options.type || 'saas'
      };

      if (!bypassEnvelopeEncryption) {
        updateValues.encryptionKeyId = encrypted.keyId ?? null;
        updateValues.dataKeyCiphertext = encrypted.dataKeyCiphertext ?? null;
        updateValues.dataKeyIv = encrypted.dataKeyIv ?? null;
      }

      await this.db
        .update(connections)
        .set(updateValues)
        .where(and(
          eq(connections.id, existingConnectionId),
          eq(connections.organizationId, organizationId),
          eq(connections.userId, userId)
        ));
      console.log(`🔄 Updated connection (${normalizedProvider}:${connectionName}) for ${userId}`);
      this.invalidateDynamicOptionCache(existingConnectionId);
      return existingConnectionId;
    }

    const baseValues: Partial<typeof connections.$inferInsert> = {
      userId,
      organizationId,
      name: connectionName,
      provider: normalizedProvider,
      type: options.type || 'saas',
      encryptedCredentials: encrypted.encryptedData,
      iv: encrypted.iv,
      payloadCiphertext: encrypted.payloadCiphertext ?? encrypted.encryptedData,
      payloadIv: encrypted.payloadIv ?? encrypted.iv,
      dataKeyIv: encrypted.dataKeyIv ?? null,
      metadata,
      isActive: true,
    };

    if (!bypassEnvelopeEncryption) {
      baseValues.encryptionKeyId = encrypted.keyId ?? null;
      baseValues.dataKeyCiphertext = encrypted.dataKeyCiphertext ?? null;
      baseValues.dataKeyIv = encrypted.dataKeyIv ?? null;
    }

    const insertValues: typeof connections.$inferInsert = (requestedConnectionId
      ? { ...baseValues, id: requestedConnectionId }
      : baseValues) as typeof connections.$inferInsert;

    const conflictUpdate: Partial<typeof connections.$inferInsert> = {
      name: connectionName,
      encryptedCredentials: encrypted.encryptedData,
      iv: encrypted.iv,
      payloadCiphertext: encrypted.payloadCiphertext ?? encrypted.encryptedData,
      payloadIv: encrypted.payloadIv ?? encrypted.iv,
      dataKeyIv: encrypted.dataKeyIv ?? null,
      metadata,
      updatedAt: new Date(),
      isActive: true,
      type: options.type || 'saas',
    };

    if (!bypassEnvelopeEncryption) {
      conflictUpdate.encryptionKeyId = encrypted.keyId ?? null;
      conflictUpdate.dataKeyCiphertext = encrypted.dataKeyCiphertext ?? null;
      conflictUpdate.dataKeyIv = encrypted.dataKeyIv ?? null;
    }

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
        set: conflictUpdate,
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
      const encrypted = await this.encryptCredentials(updates.credentials);
      updateData.encryptedCredentials = encrypted.encryptedData;
      updateData.iv = encrypted.iv;
      updateData.encryptionKeyId = encrypted.keyId ?? null;
      updateData.dataKeyCiphertext = encrypted.dataKeyCiphertext ?? null;
      updateData.dataKeyIv = encrypted.dataKeyIv ?? null;
      updateData.payloadCiphertext = encrypted.payloadCiphertext ?? encrypted.encryptedData;
      updateData.payloadIv = encrypted.payloadIv ?? encrypted.iv;
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
          encryptionKeyId: updateData.encryptionKeyId ?? existing.encryptionKeyId ?? null,
          dataKeyCiphertext: updateData.dataKeyCiphertext ?? existing.dataKeyCiphertext ?? null,
          dataKeyIv: updateData.dataKeyIv ?? existing.dataKeyIv ?? null,
          payloadCiphertext:
            updateData.payloadCiphertext ?? existing.payloadCiphertext ?? existing.encryptedCredentials,
          payloadIv: updateData.payloadIv ?? existing.payloadIv ?? existing.iv,
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

  public async pruneExpiredScopedTokens(limit: number = 200): Promise<number> {
    if (this.useFileStore || !this.db) {
      return 0;
    }

    const boundedLimit = Math.max(1, Math.min(limit, 1000));
    const result = await this.db.execute(
      sql`
        WITH expired AS (
          SELECT id
          FROM ${connectionScopedTokens}
          WHERE ${connectionScopedTokens.usedAt} IS NOT NULL
             OR ${connectionScopedTokens.expiresAt} < NOW()
          LIMIT ${boundedLimit}
        )
        DELETE FROM ${connectionScopedTokens}
        USING expired
        WHERE ${connectionScopedTokens}.id = expired.id
        RETURNING ${connectionScopedTokens}.id
      `
    );

    const rows = (result as { rows?: Array<Record<string, any>> }).rows ?? [];
    return rows.length;
  }

  public async issueScopedToken(params: ScopedTokenIssueRequest): Promise<ScopedTokenIssueResult> {
    if (this.useFileStore || !this.db) {
      throw new ConnectionServiceError('Scoped token issuance requires database storage', 503);
    }

    const connection = await this.loadDecryptedConnectionById(
      params.connectionId,
      params.organizationId
    );

    if (!connection) {
      throw new ConnectionServiceError('Connection not found', 404);
    }

    if (!this.supportsScopedTokens(connection.metadata)) {
      throw new ConnectionServiceError('Connection does not support scoped tokens', 400);
    }

    await this.pruneExpiredScopedTokens(100);

    const ttlSeconds = Math.max(30, params.ttlSeconds ?? 300);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const token = EncryptionService.generateRandomString(64);
    const tokenHash = this.hashScopedToken(token);

    await this.db.insert(connectionScopedTokens).values({
      id: randomUUID(),
      connectionId: connection.id,
      organizationId: params.organizationId,
      tokenHash,
      scope: params.scope ?? null,
      stepId: params.stepId,
      createdBy: params.createdBy ?? null,
      expiresAt,
      usedAt: null,
      metadata: params.metadata ?? null,
    });

    return {
      token,
      expiresAt,
      connectionId: connection.id,
      organizationId: params.organizationId,
      stepId: params.stepId,
      encryptionKeyId: connection.encryptionKeyId ?? null,
    };
  }

  public async redeemScopedToken(
    token: string,
    params: { organizationId: string; stepId: string }
  ): Promise<ScopedTokenRedeemResult> {
    if (this.useFileStore || !this.db) {
      throw new ConnectionServiceError('Scoped token redemption requires database storage', 503);
    }

    const tokenHash = this.hashScopedToken(token);
    const [record] = await this.db
      .select()
      .from(connectionScopedTokens)
      .where(and(
        eq(connectionScopedTokens.tokenHash, tokenHash),
        eq(connectionScopedTokens.organizationId, params.organizationId),
        eq(connectionScopedTokens.stepId, params.stepId)
      ))
      .limit(1);

    if (!record) {
      throw new ConnectionServiceError('Scoped token not found', 404);
    }

    const now = new Date();

    if (record.usedAt) {
      throw new ConnectionServiceError('Scoped token already used', 410);
    }

    if (record.expiresAt && record.expiresAt < now) {
      await this.db
        .update(connectionScopedTokens)
        .set({ usedAt: now, updatedAt: now })
        .where(eq(connectionScopedTokens.id, record.id));
      throw new ConnectionServiceError('Scoped token expired', 410);
    }

    const connection = await this.loadDecryptedConnectionById(
      record.connectionId,
      params.organizationId
    );

    if (!connection) {
      await this.db
        .update(connectionScopedTokens)
        .set({ usedAt: now, updatedAt: now })
        .where(eq(connectionScopedTokens.id, record.id));
      throw new ConnectionServiceError('Connection not found for scoped token', 404);
    }

    await this.db
      .update(connectionScopedTokens)
      .set({ usedAt: now, updatedAt: now })
      .where(eq(connectionScopedTokens.id, record.id));

    return {
      connection,
      credentials: connection.credentials,
      scope: record.scope as Record<string, any> | string[] | null,
      metadata: record.metadata as Record<string, any> | null,
      expiresAt: record.expiresAt,
      usedAt: now,
    };
  }

  public async startCredentialReencryption(options: {
    targetKeyId?: string | null;
    metadata?: Record<string, any>;
  } = {}): Promise<{ jobId: string }> {
    if (this.useFileStore || !this.db) {
      throw new ConnectionServiceError('Credential rotation requires database storage', 503);
    }

    return encryptionRotationService.startRotation(options);
  }

  public async getCredentialReencryptionJob(jobId: string): Promise<EncryptionRotationJobSummary | null> {
    if (this.useFileStore || !this.db) {
      return null;
    }
    return encryptionRotationService.getJob(jobId);
  }

  public async listCredentialReencryptionJobs(limit: number = 20): Promise<EncryptionRotationJobSummary[]> {
    if (this.useFileStore || !this.db) {
      return [];
    }
    return encryptionRotationService.listJobs(limit);
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
