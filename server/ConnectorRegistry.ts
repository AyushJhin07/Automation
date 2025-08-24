// CONNECTOR REGISTRY - UNIFIED CONNECTOR MANAGEMENT SYSTEM
// Syncs connector definitions with API client implementations

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { GmailAPIClient } from './integrations/GmailAPIClient';
import { ShopifyAPIClient } from './integrations/ShopifyAPIClient';
import { BaseAPIClient } from './integrations/BaseAPIClient';

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

interface ConnectorDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  color?: string;
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

interface ConnectorRegistryEntry {
  definition: ConnectorDefinition;
  apiClient?: APIClientConstructor;
  hasImplementation: boolean;
  functionCount: number;
  categories: string[];
}

export class ConnectorRegistry {
  private static instance: ConnectorRegistry;
  private registry: Map<string, ConnectorRegistryEntry> = new Map();
  private connectorsPath: string;
  private apiClients: Map<string, APIClientConstructor> = new Map();

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
   * Initialize available API clients
   */
  private initializeAPIClients(): void {
    // Register implemented API clients
    this.apiClients.set('gmail', GmailAPIClient);
    this.apiClients.set('shopify', ShopifyAPIClient);
    
    // TODO: Add more API clients as they are implemented
    // this.apiClients.set('slack', SlackAPIClient);
    // this.apiClients.set('jira', JiraAPIClient);
    // this.apiClients.set('hubspot', HubSpotAPIClient);
  }

  /**
   * Load all connector definitions from JSON files
   */
  private loadAllConnectors(): void {
    this.registry.clear();
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
        const entry: ConnectorRegistryEntry = {
          definition: def,
          apiClient: this.apiClients.get(appId),
          hasImplementation: this.apiClients.has(appId),
          functionCount: (def.actions?.length || 0) + (def.triggers?.length || 0),
          categories: [def.category]
        };
        this.registry.set(appId, entry);
        loaded++;
      } catch (err) {
        console.warn(`[ConnectorRegistry] Failed to load ${file}:`, err);
      }
    }
    console.log(`[ConnectorRegistry] Loaded ${loaded}/${files.length} connector JSON files from ${this.connectorsPath}`);
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
  public getAllConnectors(): ConnectorRegistryEntry[] {
    return Array.from(this.registry.values());
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

  /**
   * Get API client for an app
   */
  public getAPIClient(appId: string): APIClientConstructor | undefined {
    return this.registry.get(appId)?.apiClient;
  }

  /**
   * Check if app has API implementation
   */
  public hasImplementation(appId: string): boolean {
    return this.registry.get(appId)?.hasImplementation || false;
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
    
    return Array.from(this.registry.values()).filter(entry => {
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
    return Array.from(this.registry.values()).filter(entry =>
      entry.definition.category.toLowerCase() === category.toLowerCase()
    );
  }

  /**
   * Get all categories
   */
  public getAllCategories(): string[] {
    const categories = new Set<string>();
    this.registry.forEach(entry => {
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
      byImplementation: { implemented: 0, placeholder: 0 }
    };

    this.registry.forEach(entry => {
      if (entry.hasImplementation) {
        stats.implementedConnectors++;
        stats.byImplementation.implemented++;
      } else {
        stats.byImplementation.placeholder++;
      }
      
      stats.totalFunctions += entry.functionCount;
      
      const category = entry.definition.category;
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
    });

    return stats;
  }

  /**
   * Get node catalog in the format expected by the UI
   */
  public getNodeCatalog(): {
    categories: Record<string, {
      name: string;
      description: string;
      icon: string;
      nodes: Array<{
        type: string;
        name: string;
        description: string;
        category: string;
        appName: string;
        hasImplementation: boolean;
      }>;
    }>;
  } {
    const catalog: any = {
      categories: {}
    };

    // Group by category
    const categorizedConnectors = new Map<string, ConnectorRegistryEntry[]>();
    
    this.registry.forEach(entry => {
      const category = entry.definition.category;
      if (!categorizedConnectors.has(category)) {
        categorizedConnectors.set(category, []);
      }
      categorizedConnectors.get(category)!.push(entry);
    });

    // Build catalog structure
    categorizedConnectors.forEach((connectors, categoryName) => {
      const nodes: any[] = [];
      
      connectors.forEach(entry => {
        const def = entry.definition;
        
        // Add action nodes
        def.actions?.forEach(action => {
          nodes.push({
            type: `action.${def.id}.${action.id}`,
            name: action.name,
            description: action.description,
            category: categoryName,
            appName: def.name,
            hasImplementation: entry.hasImplementation
          });
        });
        
        // Add trigger nodes
        def.triggers?.forEach(trigger => {
          nodes.push({
            type: `trigger.${def.id}.${trigger.id}`,
            name: trigger.name,
            description: trigger.description,
            category: categoryName,
            appName: def.name,
            hasImplementation: entry.hasImplementation
          });
        });
      });

      catalog.categories[categoryName] = {
        name: categoryName,
        description: `${categoryName} applications and services`,
        icon: categoryName.toLowerCase().replace(/\s+/g, '-'),
        nodes: nodes.sort((a, b) => {
          // Prioritize implemented nodes
          if (a.hasImplementation && !b.hasImplementation) return -1;
          if (!a.hasImplementation && b.hasImplementation) return 1;
          return a.name.localeCompare(b.name);
        })
      };
    });

    return catalog;
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
}

// Export singleton instance
export const connectorRegistry = ConnectorRegistry.getInstance();