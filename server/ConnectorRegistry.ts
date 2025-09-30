// CONNECTOR REGISTRY - UNIFIED CONNECTOR MANAGEMENT SYSTEM
// Syncs connector definitions with API client implementations

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { BaseAPIClient } from './integrations/BaseAPIClient';
import { GenericAPIClient } from './integrations/GenericAPIClient';
import { IMPLEMENTED_CONNECTOR_CLIENTS } from './integrations/implementedClients';
import { getCompilerOpMap } from './workflow/compiler/op-map.js';

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

interface ConnectorDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  color?: string;
  availability?: ConnectorAvailability;
  authentication: {
    type: string;
    config: any;
  };
  baseUrl?: string;
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

export interface ConnectorRegistryEntry {
  definition: ConnectorDefinition;
  apiClient?: APIClientConstructor;
  hasImplementation: boolean;
  functionCount: number;
  categories: string[];
  availability: ConnectorAvailability;
}

interface ConnectorFilterOptions {
  includeExperimental?: boolean;
  includeDisabled?: boolean;
}

export class ConnectorRegistry {
  private static instance: ConnectorRegistry;
  private registry: Map<string, ConnectorRegistryEntry> = new Map();
  private connectorsPath: string;
  private apiClients: Map<string, APIClientConstructor> = new Map();
  private failedConnectorFiles: string[] = [];

  private constructor() {
    // Get current file directory in ES module
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    
    // Prefer the real /connectors with JSON files
    const candidates = [
      // project root
      resolve(process.cwd(), "connectors"),
      // when running from /server
      resolve(__dirname, "..", "connectors"),
      // bundled dist layouts
      resolve(__dirname, "..", "..", "connectors"),
    ];

    // Pick the first folder that both exists AND contains at least one .json
    let selected: string | null = null;
    for (const p of candidates) {
      if (existsSync(p)) {
        try {
          const files = readdirSync(p);
          if (files.some(f => f.endsWith(".json"))) {
            selected = p;
            break;
          }
        } catch {}
      }
    }

    if (!selected) {
      console.warn("[ConnectorRegistry] Could not locate a connectors folder with .json files. Checked:", candidates);
      // fall back to project root, even if empty
      selected = resolve(process.cwd(), "connectors");
    }

    this.connectorsPath = selected;
    console.log("[ConnectorRegistry] Using connectorsPath:", this.connectorsPath);

    this.initializeAPIClients();
    this.loadAllConnectors();
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
    totalByApp: Record<string, number>;
  } {
    const opMap = getCompilerOpMap(); // e.g. { 'gmail.search_emails': fn, 'sheets.append_row': fn, ... }
    const byApp: Record<string, number> = {};
    const totalByApp: Record<string, number> = {};
    let realOps = 0;
    let totalOps = 0;

    for (const c of connectors) {
      let appReal = 0;
      const allOps = [...(c.actions || []), ...(c.triggers || [])];
      totalByApp[c.id] = allOps.length;
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
      byApp,
      totalByApp
    };
  }

  /**
   * Initialize available API clients
   */
  private initializeAPIClients(): void {
    Object.entries(IMPLEMENTED_CONNECTOR_CLIENTS).forEach(([appId, client]) => {
      this.registerAPIClient(appId, client);
    });

    // Use GenericAPIClient as a marker for Stable/implemented when a bespoke client isn't needed
    this.registerAPIClient('trello', GenericAPIClient);
    this.registerAPIClient('typeform', GenericAPIClient);
    this.registerAPIClient('zendesk', GenericAPIClient);
    this.registerAPIClient('google-drive', GenericAPIClient);
    this.registerAPIClient('google-calendar', GenericAPIClient);
  }

  /**
   * Load all connector definitions from JSON files
   */
  private loadAllConnectors(): void {
    this.registry.clear();
    this.failedConnectorFiles = [];
    let files: string[] = [];
    try {
      files = readdirSync(this.connectorsPath).filter(f => f.endsWith(".json"));
    } catch (e) {
      console.warn("[ConnectorRegistry] Failed to read connectorsPath:", this.connectorsPath, e);
      return;
    }

    let loaded = 0;
    for (const file of files) {
      try {
        const def = this.loadConnectorDefinition(file); // already joins connectorsPath
        const appId = def.id;
        let hasRegisteredClient = this.apiClients.has(appId);

        if (!hasRegisteredClient && this.shouldAutoRegisterGeneric(def)) {
          this.apiClients.set(appId, GenericAPIClient);
          hasRegisteredClient = true;
        }
        const availability = this.resolveAvailability(appId, def, hasRegisteredClient);
        const hasImplementation = hasRegisteredClient && availability !== 'disabled';
        const normalizedDefinition: ConnectorDefinition = { ...def, availability };
        const entry: ConnectorRegistryEntry = {
          definition: normalizedDefinition,
          apiClient: hasImplementation ? this.apiClients.get(appId) : undefined,
          hasImplementation,
          functionCount: (def.actions?.length || 0) + (def.triggers?.length || 0),
          categories: [def.category],
          availability
        };
        this.registry.set(appId, entry);
        loaded++;
      } catch (err) {
        this.failedConnectorFiles.push(file);
        console.warn(`[ConnectorRegistry] Failed to load ${file}:`, err);
      }
    }
    console.log(`[ConnectorRegistry] Loaded ${loaded}/${files.length} connector JSON files from ${this.connectorsPath}`);
    
    // ChatGPT Fix: Accurate implementation counting after loading
    try {
      const stats = this.getCompilerImplementationStats({ includeExperimental: true, includeDisabled: true });
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
  private loadConnectorDefinition(filename: string): ConnectorDefinition {
    const filePath = join(this.connectorsPath, filename);
    const fileContent = readFileSync(filePath, 'utf-8');
    return JSON.parse(fileContent);
  }

  /**
   * Get all registered connectors
   */
  public getAllConnectors(options: ConnectorFilterOptions = {}): ConnectorRegistryEntry[] {
    return this.filterEntries(options);
  }

  public getCompilerImplementationStats(options: ConnectorFilterOptions = {}): {
    totalApps: number;
    appsWithRealOps: number;
    totalOps: number;
    realOps: number;
    implementedOpsByApp: Record<string, number>;
    totalOpsByApp: Record<string, number>;
  } {
    const connectors = this.getAllConnectors(options).map(entry => entry.definition);
    const stats = this.computeImplementedOps(connectors);
    return {
      totalApps: stats.totalApps,
      appsWithRealOps: stats.appsWithRealOps,
      totalOps: stats.totalOps,
      realOps: stats.realOps,
      implementedOpsByApp: stats.byApp,
      totalOpsByApp: stats.totalByApp,
    };
  }

  /**
   * List connector definitions for API responses
   */
  public async listConnectors(options: ConnectorFilterOptions = {}): Promise<Array<ConnectorDefinition & {
    hasImplementation: boolean;
    availability: ConnectorAvailability;
  }>> {
    return this.getAllConnectors(options).map(entry => ({
      ...entry.definition,
      availability: entry.availability,
      hasImplementation: entry.hasImplementation
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

  public getFailedConnectorFiles(): string[] {
    return [...this.failedConnectorFiles];
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
  public refresh(): void {
    this.registry.clear();
    this.loadAllConnectors();
  }

  /**
   * Register a new API client implementation
   */
  public registerAPIClient(appId: string, clientClass: APIClientConstructor): void {
    this.apiClients.set(appId, clientClass);
    
    // Update registry entry if it exists
    const entry = this.registry.get(appId);
    if (entry) {
      entry.apiClient = clientClass;
      entry.hasImplementation = true;
    }
  }

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
  public reload(): void {
    this.registry.clear();
    this.loadAllConnectors();
  }

  /**
   * Get registry statistics for debugging
   */
  public getStats() {
    return {
      connectorsPath: this.connectorsPath,
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
      connectors[appId] = {
        name: def.name,
        category: def.category,
        actions: def.actions || [],
        triggers: def.triggers || [],
        hasImplementation: entry.hasImplementation === true,
        availability: entry.availability
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

  private resolveAvailability(appId: string, def: ConnectorDefinition, hasRegisteredClient: boolean): ConnectorAvailability {
    const declared = def.availability;
    if (declared === 'disabled') {
      return 'disabled';
    }
    if (declared === 'stable') {
      return hasRegisteredClient ? 'stable' : 'experimental';
    }
    if (declared === 'experimental') {
      return hasRegisteredClient ? 'stable' : 'experimental';
    }
    if (hasRegisteredClient) {
      return 'stable';
    }
    return 'experimental';
  }

  private shouldAutoRegisterGeneric(def: ConnectorDefinition): boolean {
    if (def.availability === 'disabled') {
      return false;
    }
    const actionCount = def.actions?.length ?? 0;
    const triggerCount = def.triggers?.length ?? 0;
    if (actionCount + triggerCount === 0) {
      return false;
    }
    return typeof def.baseUrl === 'string' && def.baseUrl.length > 0;
  }

  private filterEntries(options: ConnectorFilterOptions = {}): ConnectorRegistryEntry[] {
    const { includeExperimental = false, includeDisabled = false } = options;
    return Array.from(this.registry.values()).filter(entry => {
      if (entry.availability === 'disabled') {
        return includeDisabled;
      }
      if (entry.availability === 'experimental') {
        return includeExperimental;
      }
      return true;
    });
  }
}

// Export singleton instance
export const connectorRegistry = ConnectorRegistry.getInstance();
