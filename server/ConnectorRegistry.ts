// CONNECTOR REGISTRY - UNIFIED CONNECTOR MANAGEMENT SYSTEM
// Syncs connector definitions with API client implementations

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { BaseAPIClient } from './integrations/BaseAPIClient';
import { getCompilerOpMap } from './workflow/compiler/op-map.js';
import type { ConnectorDynamicOptionConfig } from '../common/connectorDynamicOptions.js';
import { extractDynamicOptionsFromConnector, normalizeDynamicOptionPath } from '../common/connectorDynamicOptions.js';
import type { OrganizationPlan } from './database/schema';
import { connectorEntitlementService } from './services/ConnectorEntitlementService';

type ConnectorPricingTier = 'free' | 'starter' | 'professional' | 'enterprise' | 'enterprise_plus';

interface ConnectorStatusFlags {
  beta: boolean;
  privatePreview: boolean;
  deprecated: boolean;
  hidden: boolean;
  featured: boolean;
}

interface ConnectorManifestMetadata {
  id: string;
  description?: string;
  displayName?: string;
  pricingTier: ConnectorPricingTier;
  status: ConnectorStatusFlags;
  labels: string[];
  availabilityOverride?: ConnectorAvailability;
  concurrency?: ConnectorConcurrencyMetadata;
}

interface ConnectorConcurrencyMetadata {
  global?: number;
  perOrganization?: number;
}

interface ConnectorManifestEntry {
  id: string;
  normalizedId: string;
  definitionPath: string;
  manifestPath?: string;
  dynamicOptions?: ConnectorDynamicOptionConfig[];
}

interface LoadedAPIClientInfo {
  exportName: string;
  absolutePath: string;
  matchedViaFallback: boolean;
}

interface ConnectorFunction {
  id: string;
  name: string;
  description: string;
  endpoint?: string;
  method?: string;
  params?: Record<string, any>;
  parameters?: Record<string, any>;
  requiredScopes?: string[];
  rateLimits?: {
    requestsPerSecond?: number;
    requestsPerMinute?: number;
    dailyLimit?: number;
  };
}

type ConnectorAvailability = 'stable' | 'experimental' | 'disabled';
type ConnectorLifecycleStatus = 'alpha' | 'beta' | 'stable' | 'deprecated' | 'sunset';

interface ConnectorReleaseMetadata {
  semver: string;
  status: ConnectorLifecycleStatus;
  isBeta: boolean;
  betaStartedAt?: string | null;
  deprecationWindow?: {
    startDate?: string | null;
    sunsetDate?: string | null;
  };
}

interface ConnectorLifecycleFlags {
  alpha: boolean;
  beta: boolean;
  stable: boolean;
}

interface ConnectorDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  color?: string;
  availability?: ConnectorAvailability;
  version?: string;
  release?: ConnectorReleaseMetadata;
  authentication: {
    type: string;
    config: any;
  };
  baseUrl?: string;
  network?: {
    requiredOutbound?: {
      domains?: string[];
      ipRanges?: string[];
    };
  };
  rateLimits?: {
    requestsPerSecond?: number;
    requestsPerMinute?: number;
    dailyLimit?: number;
  };
  actions: ConnectorFunction[];
  triggers: ConnectorFunction[];
}

interface APIClientConstructor {
  new (config?: any): BaseAPIClient;
}

interface ConnectorRegistryEntry {
  definition: ConnectorDefinition;
  apiClient?: APIClientConstructor;
  hasImplementation: boolean;
  functionCount: number;
  categories: string[];
  availability: ConnectorAvailability;
  dynamicOptions: ConnectorDynamicOptionConfig[];
  manifest?: ConnectorManifestMetadata;
  pricingTier: ConnectorPricingTier;
  status: ConnectorStatusFlags;
  concurrency?: ConnectorConcurrencyMetadata;
}

interface ConnectorFilterOptions {
  includeExperimental?: boolean;
  includeDisabled?: boolean;
  includeHidden?: boolean;
  entitlementOverrides?: Map<string, boolean>;
  organizationPlan?: OrganizationPlan;
}

interface ConnectorListOptions extends ConnectorFilterOptions {
  organizationId?: string;
}

export class ConnectorRegistry {
  private static instance: ConnectorRegistry;
  private registry: Map<string, ConnectorRegistryEntry> = new Map();
  private connectorManifestPath: string;
  private manifestEntries: ConnectorManifestEntry[] = [];
  private connectorsPath: string;
  private integrationsPath: string | null = null;
  private apiClients: Map<string, APIClientConstructor> = new Map();
  private manifestMetadataCache: Map<string, ConnectorManifestMetadata> = new Map();
  private initPromise: Promise<void> | null = null;

  private readonly pricingTierRank: Record<ConnectorPricingTier, number> = {
    free: 0,
    starter: 1,
    professional: 2,
    enterprise: 3,
    enterprise_plus: 4,
  };

  private readonly planRank: Record<OrganizationPlan, number> = {
    starter: 1,
    professional: 2,
    enterprise: 3,
    enterprise_plus: 4,
  };

  private constructor() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    this.connectorManifestPath = this.resolveConnectorManifestPath(__dirname);
    this.manifestEntries = this.loadConnectorManifest();
    this.connectorsPath = this.deriveConnectorsPath();
    this.integrationsPath = this.resolveIntegrationsPath(__dirname);

    console.log('[ConnectorRegistry] Using connector manifest:', this.connectorManifestPath);
    console.log('[ConnectorRegistry] Using connectorsPath:', this.connectorsPath);
  }

  public async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    return this.initPromise;
  }

  private async initialize(): Promise<void> {
    await this.initializeAPIClients();
    this.loadAllConnectors();
    this.enforceStartupParity();
  }

  public static getInstance(): ConnectorRegistry {
    if (!ConnectorRegistry.instance) {
      ConnectorRegistry.instance = new ConnectorRegistry();
    }
    return ConnectorRegistry.instance;
  }

  /**
   * ChatGPT Fix: Compute implemented ops from compiler map
   */
  private computeImplementedOps(connectors: ConnectorDefinition[]): {
    totalApps: number;
    appsWithRealOps: number;
    totalOps: number;
    realOps: number;
    byApp: Record<string, number>;
  } {
    const opMap = getCompilerOpMap(); // e.g. { 'gmail.search_emails': fn, 'sheets.append_row': fn, ... }
    const byApp: Record<string, number> = {};
    let realOps = 0;
    let totalOps = 0;

    for (const c of connectors) {
      let appReal = 0;
      const allOps = [...(c.actions || []), ...(c.triggers || [])];
      for (const op of allOps) {
        totalOps++;
        // Try multiple key formats to match compiler
        const keys = [
          `${c.id}.${op.id}`,
          `action.${c.id}:${op.id}`,
          `trigger.${c.id}:${op.id}`,
          `action.${c.id}.${op.id}`,
          `trigger.${c.id}.${op.id}`
        ];
        
        if (keys.some(key => opMap[key])) {
          appReal++;
          realOps++;
        }
      }
      byApp[c.id] = appReal;
    }

    const appsWithRealOps = Object.values(byApp).filter(n => n > 0).length;
    return {
      totalApps: connectors.length,
      appsWithRealOps,
      totalOps,
      realOps,
      byApp
    };
  }

  private resolveConnectorManifestPath(currentDir: string): string {
    const candidates = [
      resolve(process.cwd(), 'server', 'connector-manifest.json'),
      resolve(currentDir, 'connector-manifest.json'),
      resolve(currentDir, '..', 'connector-manifest.json'),
      resolve(currentDir, '..', '..', 'connector-manifest.json'),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    throw new Error(`[ConnectorRegistry] Unable to locate connector manifest. Checked: ${candidates.join(', ')}`);
  }

  private loadConnectorManifest(): ConnectorManifestEntry[] {
    try {
      const raw = JSON.parse(readFileSync(this.connectorManifestPath, 'utf-8'));
      if (!raw || typeof raw !== 'object' || !Array.isArray(raw.connectors)) {
        throw new Error('manifest is missing a "connectors" array');
      }

      return raw.connectors.map((entry: ConnectorManifestEntry) => {
        if (!entry || typeof entry !== 'object') {
          throw new Error('manifest entry must be an object');
        }
        if (typeof entry.id !== 'string' || entry.id.trim() === '') {
          throw new Error('manifest entry is missing an id');
        }
        if (typeof entry.definitionPath !== 'string' || entry.definitionPath.trim() === '') {
          throw new Error(`manifest entry for ${entry.id} is missing a definitionPath`);
        }

        return {
          id: entry.id,
          normalizedId: entry.normalizedId ?? entry.id,
          definitionPath: entry.definitionPath,
          manifestPath: typeof (entry as any).manifestPath === 'string' ? (entry as any).manifestPath : undefined,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[ConnectorRegistry] Failed to load connector manifest ${this.connectorManifestPath}: ${message}`);
    }
  }

  private deriveConnectorsPath(): string {
    if (!this.manifestEntries.length) {
      return resolve(process.cwd(), 'connectors');
    }

    const first = this.manifestEntries[0];
    return dirname(resolve(process.cwd(), first.definitionPath));
  }

  private resolveIntegrationsPath(currentDir: string): string | null {
    const candidates = [
      resolve(currentDir, 'integrations'),
      resolve(currentDir, '..', 'integrations'),
      resolve(process.cwd(), 'server', 'integrations'),
      resolve(process.cwd(), 'dist', 'integrations'),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    console.warn('[ConnectorRegistry] Could not resolve integrations directory. Checked:', candidates);
    return null;
  }

  private toCanonicalId(value: string): string {
    return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
  }

  private async importModule(modulePath: string): Promise<Record<string, unknown>> {
    const url = pathToFileURL(modulePath).href;
    return (await import(url)) as Record<string, unknown>;
  }

  private async loadAPIClientConstructors(): Promise<Map<string, APIClientConstructor>> {
    const constructors = new Map<string, APIClientConstructor>();

    if (!this.integrationsPath) {
      return constructors;
    }

    const connectorsByCanonical = new Map<string, ConnectorManifestEntry>();
    for (const entry of this.manifestEntries) {
      connectorsByCanonical.set(this.toCanonicalId(entry.normalizedId), entry);
    }

    let files: string[] = [];
    try {
      files = readdirSync(this.integrationsPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[ConnectorRegistry] Failed to read integrations directory ${this.integrationsPath}: ${message}`);
    }

    const candidateConstructors = new Map<string, LoadedAPIClientInfo>();
    const unmatchedClients: string[] = [];

    for (const file of files) {
      if (!/APIClient\.(ts|js)$/i.test(file) || file.endsWith('.d.ts')) {
        continue;
      }

      const baseName = file.replace(/\.[^.]+$/, '');
      const withoutSuffix = baseName.replace(/APIClient$/i, '');
      const canonicalName = this.toCanonicalId(withoutSuffix);

      if (canonicalName === 'base' || canonicalName === 'generic') {
        continue;
      }

      let matched = connectorsByCanonical.get(canonicalName);
      let matchedViaFallback = false;
      if (!matched) {
        const fallback = connectorsByCanonical.get(`${canonicalName}enhanced`);
        if (fallback) {
          matched = fallback;
          matchedViaFallback = true;
        }
      }

      if (!matched) {
        unmatchedClients.push(baseName);
        continue;
      }

      const info: LoadedAPIClientInfo = {
        exportName: baseName,
        absolutePath: join(this.integrationsPath, file),
        matchedViaFallback,
      };

      const targetId = matched.normalizedId ?? matched.id;
      const existing = candidateConstructors.get(targetId);
      if (existing) {
        if (existing.matchedViaFallback && !matchedViaFallback) {
          candidateConstructors.set(targetId, info);
        }
        continue;
      }

      candidateConstructors.set(targetId, info);
    }

    if (unmatchedClients.length > 0) {
      throw new Error(`[ConnectorRegistry] API client(s) without connector definition: ${unmatchedClients.join(', ')}`);
    }

    for (const [id, info] of candidateConstructors) {
      const moduleExports = await this.importModule(info.absolutePath);
      const exported = moduleExports[info.exportName];
      if (typeof exported !== 'function') {
        throw new Error(`[ConnectorRegistry] Expected ${info.exportName} to export a constructor from ${info.absolutePath}`);
      }
      constructors.set(id, exported as APIClientConstructor);
    }

    console.log(`[ConnectorRegistry] Registered ${constructors.size} API client constructors from ${this.integrationsPath}`);
    return constructors;
  }

  /**
   * Initialize available API clients
   */
  private async initializeAPIClients(): Promise<void> {
    this.apiClients.clear();

    if (!this.manifestEntries.length) {
      console.warn('[ConnectorRegistry] No connector manifest entries found. API clients not initialized.');
      return;
    }

    const constructors = await this.loadAPIClientConstructors();
    constructors.forEach((ctor, appId) => {
      this.apiClients.set(appId, ctor);
    });
  }

  /**
   * Load all connector definitions from JSON files
   */
  private loadAllConnectors(): void {
    this.registry.clear();
    this.manifestMetadataCache.clear();
    let loaded = 0;
    const entries = this.manifestEntries;

    for (const manifestEntry of entries) {
      try {
        const def = this.loadConnectorDefinition(manifestEntry);
        const appId = manifestEntry.normalizedId;
        const dynamicOptions = extractDynamicOptionsFromConnector(def);
        const hasRegisteredClient = this.apiClients.has(appId);
        const manifestMetadata = this.loadConnectorMetadata(
          manifestEntry,
          def.description || def.name || manifestEntry.id,
          typeof def.availability === 'string' ? def.availability as ConnectorAvailability : 'experimental'
        );
        const availability = this.resolveAvailability(
          appId,
          def,
          hasRegisteredClient,
          manifestMetadata.availabilityOverride
        );
        const hasImplementation = availability === 'stable' && hasRegisteredClient;
        const status = this.applyAvailabilityToStatus(manifestMetadata.status, availability);
        const normalizedDefinition: ConnectorDefinition = {
          ...def,
          id: appId,
          availability,
          description: manifestMetadata.description ?? def.description,
          release: this.normalizeReleaseMetadata(def),
          version: def.version ?? def.release?.semver,
        };
        const entry: ConnectorRegistryEntry = {
          definition: normalizedDefinition,
          apiClient: hasImplementation ? this.apiClients.get(appId) : undefined,
          hasImplementation,
          functionCount: (def.actions?.length || 0) + (def.triggers?.length || 0),
          categories: [def.category],
          availability,
          dynamicOptions,
          manifest: manifestMetadata,
          pricingTier: manifestMetadata.pricingTier,
          status,
          concurrency: manifestMetadata.concurrency,
        };
        this.registry.set(appId, entry);
        loaded++;
      } catch (err) {
        console.warn(`[ConnectorRegistry] Failed to load ${manifestEntry.definitionPath}:`, err);
      }
    }
    console.log(`[ConnectorRegistry] Loaded ${loaded}/${entries.length} connector JSON files from manifest`);
    
    // ChatGPT Fix: Accurate implementation counting after loading
    try {
      const allConnectors = this.getAllConnectors({ includeExperimental: true, includeDisabled: true })
        .map(entry => entry.definition);
      const stats = this.computeImplementedOps(allConnectors);
      const msg = `Connector health: ${stats.appsWithRealOps}/${stats.totalApps} apps have real compiler-backed ops (${stats.realOps}/${stats.totalOps} ops).`;
      console.log(msg); // INFO, not P0 CRITICAL

      // Only warn if zero implemented
      if (stats.realOps === 0) {
        console.warn('⚠️ No REAL_OPS wired to the compiler. Check compiler/op-map.');
      }
    } catch (error) {
      console.warn('⚠️ Could not compute REAL_OPS stats:', error.message);
    }
  }

  /**
   * Load a single connector definition from JSON file
   */
  private loadConnectorDefinition(entry: ConnectorManifestEntry): ConnectorDefinition {
    const filePath = resolve(process.cwd(), entry.definitionPath);
    const fileContent = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(fileContent) as ConnectorDefinition;

    if (!parsed || typeof parsed !== 'object') {
      throw new Error(`Connector definition at ${filePath} is not a valid object`);
    }

    if (typeof parsed.id !== 'string') {
      parsed.id = entry.normalizedId;
    }

    if (parsed.id !== entry.id && parsed.id !== entry.normalizedId) {
      console.warn(`[ConnectorRegistry] Definition id mismatch for ${filePath}. Manifest id: ${entry.id}, file id: ${parsed.id}`);
    }

    parsed.id = entry.normalizedId;
    return parsed;
  }

  private normalizeReleaseMetadata(def: ConnectorDefinition): ConnectorReleaseMetadata {
    const semver = def.release?.semver ?? def.version ?? '1.0.0';
    const status = def.release?.status ?? (def.release?.isBeta ? 'beta' : 'stable');
    const isBeta = def.release?.isBeta ?? status === 'beta';
    const deprecationWindow = def.release?.deprecationWindow ?? { startDate: null, sunsetDate: null };

    return {
      semver,
      status,
      isBeta,
      betaStartedAt: def.release?.betaStartedAt ?? null,
      deprecationWindow,
    };
  }

  private loadConnectorMetadata(
    entry: ConnectorManifestEntry,
    fallbackDescription: string,
    fallbackAvailability: ConnectorAvailability,
  ): ConnectorManifestMetadata {
    const cacheKey = entry.normalizedId;
    if (this.manifestMetadataCache.has(cacheKey)) {
      return this.manifestMetadataCache.get(cacheKey)!;
    }

    const defaultStatus: ConnectorStatusFlags = {
      beta: fallbackAvailability === 'experimental',
      privatePreview: false,
      deprecated: fallbackAvailability === 'disabled',
      hidden: fallbackAvailability === 'disabled',
      featured: false,
    };

    const defaults: ConnectorManifestMetadata = {
      id: entry.id,
      description: fallbackDescription,
      pricingTier: 'starter',
      status: defaultStatus,
      labels: [],
      concurrency: undefined,
    };

    if (!entry.manifestPath) {
      this.manifestMetadataCache.set(cacheKey, defaults);
      return defaults;
    }

    const manifestFile = resolve(process.cwd(), entry.manifestPath);

    try {
      const raw = JSON.parse(readFileSync(manifestFile, 'utf-8')) as Record<string, unknown>;
      const metadata: ConnectorManifestMetadata = {
        id: typeof raw.id === 'string' ? raw.id : entry.id,
        description: typeof raw.description === 'string' ? raw.description : fallbackDescription,
        displayName: typeof raw.displayName === 'string' ? raw.displayName : undefined,
        pricingTier: this.normalizePricingTier((raw as any).pricingTier),
        status: this.normalizeStatusFlags((raw as any).status, defaultStatus),
        labels: Array.isArray((raw as any).labels)
          ? (raw as any).labels.filter((label: unknown) => typeof label === 'string')
          : [],
        availabilityOverride: this.normalizeAvailabilityOverride((raw as any).availabilityOverride),
      };
      const concurrency = this.normalizeConcurrencyMetadata((raw as any).concurrency);
      if (concurrency) {
        metadata.concurrency = concurrency;
      }
      this.manifestMetadataCache.set(cacheKey, metadata);
      return metadata;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[ConnectorRegistry] Failed to read manifest for ${entry.id} (${entry.manifestPath}): ${message}`);
      this.manifestMetadataCache.set(cacheKey, defaults);
      return defaults;
    }
  }

  private normalizePricingTier(value: unknown): ConnectorPricingTier {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const tiers: ConnectorPricingTier[] = ['free', 'starter', 'professional', 'enterprise', 'enterprise_plus'];
      if (tiers.includes(normalized as ConnectorPricingTier)) {
        return normalized as ConnectorPricingTier;
      }
      if (normalized === 'enterpriseplus') {
        return 'enterprise_plus';
      }
    }
    return 'starter';
  }

  private normalizeStatusFlags(value: unknown, defaults: ConnectorStatusFlags): ConnectorStatusFlags {
    const result: ConnectorStatusFlags = { ...defaults };
    if (!value || typeof value !== 'object') {
      return result;
    }

    const flags = value as Record<string, unknown>;
    const setFlag = (key: keyof ConnectorStatusFlags) => {
      if (typeof flags[key] === 'boolean') {
        result[key] = flags[key] as boolean;
      }
    };

    setFlag('beta');
    setFlag('privatePreview');
    setFlag('deprecated');
    setFlag('hidden');
    setFlag('featured');

    return result;
  }

  private normalizeConcurrencyMetadata(value: unknown): ConnectorConcurrencyMetadata | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const raw = value as Record<string, unknown>;
    const metadata: ConnectorConcurrencyMetadata = {};

    if (typeof raw.global === 'number' && Number.isFinite(raw.global) && raw.global >= 0) {
      metadata.global = Math.floor(raw.global);
    }

    if (
      typeof raw.perOrganization === 'number' &&
      Number.isFinite(raw.perOrganization) &&
      raw.perOrganization >= 0
    ) {
      metadata.perOrganization = Math.floor(raw.perOrganization);
    }

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  private normalizeAvailabilityOverride(value: unknown): ConnectorAvailability | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'stable' || normalized === 'experimental' || normalized === 'disabled') {
      return normalized;
    }
    return undefined;
  }

  private applyAvailabilityToStatus(status: ConnectorStatusFlags, availability: ConnectorAvailability): ConnectorStatusFlags {
    const merged: ConnectorStatusFlags = { ...status };
    if (availability === 'disabled') {
      merged.deprecated = true;
      merged.hidden = true;
    } else if (availability === 'experimental') {
      merged.beta = true;
    }
    return merged;
  }

  private planMeetsTier(plan: OrganizationPlan, tier: ConnectorPricingTier): boolean {
    const planRank = this.planRank[plan];
    if (typeof planRank !== 'number') {
      return true;
    }
    const tierRank = this.pricingTierRank[tier];
    return planRank >= tierRank;
  }

  private enforceStartupParity(): void {
    const missingStable: string[] = [];

    for (const entry of this.registry.values()) {
      if (entry.availability === 'stable' && !entry.hasImplementation) {
        missingStable.push(entry.definition.id);
      }
    }

    if (missingStable.length > 0) {
      throw new Error(`[ConnectorRegistry] Stable connectors missing API clients: ${missingStable.join(', ')}`);
    }
  }

  /**
   * Get all registered connectors
   */
  public getAllConnectors(options: ConnectorFilterOptions = {}): ConnectorRegistryEntry[] {
    return this.filterEntries(options);
  }

  /**
   * List connector definitions for API responses
   */
  public async listConnectors(options: ConnectorListOptions = {}): Promise<Array<ConnectorDefinition & {
    hasImplementation: boolean;
    availability: ConnectorAvailability;
    pricingTier: ConnectorPricingTier;
    status: ConnectorStatusFlags;
    manifest?: ConnectorManifestMetadata;
    labels: string[];
    displayName?: string;
  }>> {
    const { organizationId, entitlementOverrides, ...rest } = options;
    let overridesMap = entitlementOverrides;

    if (!overridesMap && organizationId) {
      try {
        overridesMap = await connectorEntitlementService.getOrganizationOverrides(organizationId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[ConnectorRegistry] Failed to load entitlements for organization ${organizationId}: ${message}`);
      }
    }

    const connectors = this.getAllConnectors({
      ...rest,
      entitlementOverrides: overridesMap,
    });

    return connectors.map(entry => ({
      ...entry.definition,
      description: entry.manifest?.description ?? entry.definition.description,
      availability: entry.availability,
      hasImplementation: entry.hasImplementation,
      pricingTier: entry.pricingTier,
      status: entry.status,
      manifest: entry.manifest,
      labels: entry.manifest?.labels ?? [],
      displayName: entry.manifest?.displayName,
    }));
  }

  /**
   * Get connector by ID
   */
  public getConnector(appId: string): ConnectorRegistryEntry | undefined {
    return this.registry.get(appId);
  }

  /**
   * Get connector definition by ID
   */
  public getConnectorDefinition(appId: string): ConnectorDefinition | undefined {
    return this.registry.get(appId)?.definition;
  }

  public canAccessPricingTier(plan: OrganizationPlan | undefined, tier: ConnectorPricingTier): boolean {
    if (!plan) {
      return true;
    }
    return this.planMeetsTier(plan, tier);
  }

  /**
   * Get API client for an app
   */
  public getAPIClient(appId: string): APIClientConstructor | undefined {
    const entry = this.registry.get(appId);
    if (!entry || entry.availability !== 'stable') {
      return undefined;
    }
    return entry.apiClient;
  }

  /**
   * Check if app has API implementation
   */
  public hasImplementation(appId: string): boolean {
    const entry = this.registry.get(appId);
    return entry?.availability === 'stable' && entry?.hasImplementation === true;
  }

  /**
   * Get all functions for an app
   */
  public getAppFunctions(appId: string): { actions: ConnectorFunction[]; triggers: ConnectorFunction[] } {
    const connector = this.registry.get(appId);
    if (!connector) {
      return { actions: [], triggers: [] };
    }

    return {
      actions: connector.definition.actions || [],
      triggers: connector.definition.triggers || []
    };
  }

  public getDynamicOptions(appId: string): ConnectorDynamicOptionConfig[] {
    return this.registry.get(appId)?.dynamicOptions ?? [];
  }

  public getDynamicOptionConfig(
    appId: string,
    operationType: 'action' | 'trigger',
    operationId: string,
    parameterPath: string
  ): ConnectorDynamicOptionConfig | undefined {
    const entry = this.registry.get(appId);
    if (!entry) {
      return undefined;
    }

    const normalizedType: 'action' | 'trigger' = operationType === 'trigger' ? 'trigger' : 'action';
    const normalizedOperationId = String(operationId ?? '').trim().toLowerCase();
    const normalizedPath = normalizeDynamicOptionPath(parameterPath ?? '').toLowerCase();

    return entry.dynamicOptions.find(option => {
      if (!option) return false;
      const optionOperation = String(option.operationId ?? '').trim().toLowerCase();
      const optionPath = normalizeDynamicOptionPath(option.parameterPath ?? '').toLowerCase();
      return option.operationType === normalizedType && optionOperation === normalizedOperationId && optionPath === normalizedPath;
    });
  }

  /**
   * Search connectors by query
   */
  public searchConnectors(query: string): ConnectorRegistryEntry[] {
    const searchTerm = query.toLowerCase();
    
    return this.filterEntries().filter(entry => {
      const def = entry.definition;
      return (
        def.name.toLowerCase().includes(searchTerm) ||
        def.description.toLowerCase().includes(searchTerm) ||
        def.category.toLowerCase().includes(searchTerm) ||
        def.id.toLowerCase().includes(searchTerm)
      );
    }).sort((a, b) => {
      // Prioritize connectors with implementations
      if (a.hasImplementation && !b.hasImplementation) return -1;
      if (!a.hasImplementation && b.hasImplementation) return 1;
      
      // Then by function count
      return b.functionCount - a.functionCount;
    });
  }

  /**
   * Get connectors by category
   */
  public getConnectorsByCategory(category: string): ConnectorRegistryEntry[] {
    return this.filterEntries().filter(entry =>
      entry.definition.category.toLowerCase() === category.toLowerCase()
    );
  }

  /**
   * Get all categories
   */
  public getAllCategories(): string[] {
    const categories = new Set<string>();
    this.filterEntries().forEach(entry => {
      categories.add(entry.definition.category);
    });
    return Array.from(categories).sort();
  }

  /**
   * Get registry statistics
   */
  public getRegistryStats(): {
    totalConnectors: number;
    implementedConnectors: number;
    totalFunctions: number;
    byCategory: Record<string, number>;
    byImplementation: Record<string, number>;
  } {
    const stats = {
      totalConnectors: this.registry.size,
      implementedConnectors: 0,
      totalFunctions: 0,
      byCategory: {} as Record<string, number>,
      byImplementation: { implemented: 0, experimental: 0, disabled: 0 }
    };

    this.filterEntries({ includeExperimental: true, includeDisabled: true }).forEach(entry => {
      if (entry.hasImplementation && entry.availability === 'stable') {
        stats.implementedConnectors++;
        stats.byImplementation.implemented++;
      } else if (entry.availability === 'disabled') {
        stats.byImplementation.disabled++;
      } else {
        stats.byImplementation.experimental++;
      }

      stats.totalFunctions += entry.functionCount;

      const category = entry.definition.category;
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
    });

    return stats;
  }



  /**
   * Refresh registry (reload from files)
   */
  public async refresh(): Promise<void> {
    this.manifestEntries = this.loadConnectorManifest();
    this.connectorsPath = this.deriveConnectorsPath();
    await this.initializeAPIClients();
    this.registry.clear();
    this.loadAllConnectors();
    this.enforceStartupParity();
  }

  /**
   * Register a new API client implementation
   */
  /**
   * Get function definition by type
   */
  public getFunctionByType(nodeType: string): ConnectorFunction | undefined {
    // Parse node type: action.appId.functionId or trigger.appId.functionId
    const parts = nodeType.split('.');
    if (parts.length !== 3) return undefined;
    
    const [type, appId, functionId] = parts;
    const connector = this.getConnector(appId);
    if (!connector) return undefined;
    
    const functions = type === 'action' ? connector.definition.actions : connector.definition.triggers;
    return functions?.find(fn => fn.id === functionId);
  }

  /**
   * Validate node type exists
   */
  public isValidNodeType(nodeType: string): boolean {
    return this.getFunctionByType(nodeType) !== undefined;
  }

  /**
   * Reload connectors from disk (dev utility)
   */
  public async reload(): Promise<void> {
    await this.refresh();
  }

  /**
   * Get registry statistics for debugging
   */
  public getStats() {
    return {
      connectorsPath: this.connectorsPath,
      manifestPath: this.connectorManifestPath,
      apiClientCount: this.apiClients.size,
      count: this.registry.size,
      apps: Array.from(this.registry.keys()).sort()
    };
  }

  /**
   * Get node catalog with both connectors and categories for UI
   */
  public getNodeCatalog(): {
    connectors: Record<string, {
      name: string;
      category: string;
      actions: ConnectorFunction[];
      triggers: ConnectorFunction[];
      hasImplementation: boolean;
      availability: ConnectorAvailability;
      version?: string;
      release?: ConnectorReleaseMetadata;
      lifecycle: ConnectorLifecycleFlags;
    }>;
    categories: Record<string, {
      name: string;
      description: string;
      icon: string;
      nodes: Array<{
        type: 'action' | 'trigger';
        name: string;
        description: string;
        category: string;
        appName: string;
        hasImplementation: boolean;
        nodeType: string; // e.g., action.slack.chat_postMessage
        parameters?: any;
      }>;
    }>;
  } {
    const connectors: Record<string, any> = {};
    const categories: Record<string, any> = {};

    for (const [appId, entry] of this.registry.entries()) {
      if (entry.availability === 'disabled') {
        continue;
      }
      const def = entry.definition;
      const lifecycle: ConnectorLifecycleFlags = this.resolveLifecycle(entry);

      connectors[appId] = {
        name: def.name,
        category: def.category,
        actions: def.actions || [],
        triggers: def.triggers || [],
        hasImplementation: entry.hasImplementation === true,
        availability: entry.availability,
        version: def.version ?? def.release?.semver,
        release: def.release,
        lifecycle,
      };

      const pushNode = (type: 'action' | 'trigger', fn: ConnectorFunction) => {
        const category = def.category || 'Other';
        if (!categories[category]) {
          categories[category] = {
            name: category,
            description: `${category} apps`,
            icon: '',
            nodes: []
          };
        }
        categories[category].nodes.push({
          type,
          name: fn.name,
          description: fn.description || '',
          category,
          appName: def.name,
          hasImplementation: entry.hasImplementation === true,
          nodeType: `${type}.${appId}.${fn.id}`,
          parameters: (fn as any).parameters || {}
        });
      };

      (def.triggers || []).forEach(t => pushNode('trigger', t));
      (def.actions  || []).forEach(a => pushNode('action', a));
    }

    // Optional: sort nodes so implemented ones show first
    for (const cat of Object.values(categories)) {
      cat.nodes.sort((a, b) => {
        if (a.hasImplementation && !b.hasImplementation) return -1;
        if (!a.hasImplementation && b.hasImplementation) return 1;
        return a.name.localeCompare(b.name);
      });
    }

    return { connectors, categories };
  }

  private resolveLifecycle(entry: ConnectorRegistryEntry): ConnectorLifecycleFlags {
    const release = entry.definition.release;
    const status = release?.status;

    const alpha = status === 'alpha';
    const beta = status === 'beta' || release?.isBeta === true;

    const stableFromRelease = status === 'stable';
    const stableFromAvailability = !status && entry.availability === 'stable' && !beta && !alpha;

    return {
      alpha,
      beta,
      stable: Boolean(stableFromRelease || stableFromAvailability),
    };
  }

  private resolveAvailability(
    appId: string,
    def: ConnectorDefinition,
    hasRegisteredClient: boolean,
    override?: ConnectorAvailability,
  ): ConnectorAvailability {
    const declared = override ?? def.availability;
    if (declared === 'disabled') {
      return 'disabled';
    }
    if (declared === 'stable') {
      return hasRegisteredClient ? 'stable' : 'experimental';
    }
    if (declared === 'experimental') {
      return 'experimental';
    }
    if (hasRegisteredClient) {
      return 'stable';
    }
    return 'experimental';
  }

  private filterEntries(options: ConnectorFilterOptions = {}): ConnectorRegistryEntry[] {
    const {
      includeExperimental = false,
      includeDisabled = false,
      includeHidden = false,
      entitlementOverrides,
      organizationPlan,
    } = options;

    const overrides = entitlementOverrides ? new Map(entitlementOverrides) : undefined;

    return Array.from(this.registry.values()).filter(entry => {
      const connectorId = entry.definition.id;
      const override = overrides?.get(connectorId);

      if (override === false) {
        return false;
      }

      if (!includeHidden && entry.status.hidden && override !== true) {
        return false;
      }

      if (!includeDisabled && entry.availability === 'disabled' && override !== true) {
        return false;
      }

      if (!includeExperimental && entry.availability === 'experimental' && override !== true) {
        return false;
      }

      if (organizationPlan && override !== true && !this.planMeetsTier(organizationPlan, entry.pricingTier)) {
        return false;
      }

      return true;
    });
  }
}

// Export singleton instance
export const connectorRegistry = ConnectorRegistry.getInstance();
