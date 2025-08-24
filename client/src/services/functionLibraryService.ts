// FUNCTION LIBRARY SERVICE - MANAGES FUNCTION DEFINITIONS FOR UI
// Provides type-safe access to application functions with caching and validation

import { FunctionDefinition } from '../components/workflow/DynamicParameterForm';

interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface AppFunctionResponse {
  appName: string;
  functions: FunctionDefinition[];
  totalFunctions: number;
}

interface SupportedAppsResponse {
  applications: string[];
  count: number;
}

class FunctionLibraryService {
  private cache: Map<string, FunctionDefinition[]> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Get authentication headers
   */
  private getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  }

  /**
   * Check if cache is valid for an app
   */
  private isCacheValid(appName: string): boolean {
    const expiry = this.cacheExpiry.get(appName);
    return expiry ? Date.now() < expiry : false;
  }

  /**
   * Set cache for an app
   */
  private setCache(appName: string, functions: FunctionDefinition[]): void {
    this.cache.set(appName, functions);
    this.cacheExpiry.set(appName, Date.now() + this.CACHE_DURATION);
  }

  /**
   * Get supported applications
   */
  async getSupportedApplications(): Promise<string[]> {
    try {
      const response = await fetch('/api/registry/connectors', {
        headers: this.getAuthHeaders()
      });

      const result = await response.json();
      
      if (result.success && result.connectors) {
        return result.connectors.map((connector: any) => connector.definition.id);
      } else {
        throw new Error(result.error || 'Failed to fetch supported applications');
      }
    } catch (error) {
      console.error('Error fetching supported applications:', error);
      throw error;
    }
  }

  /**
   * Get functions for a specific application
   */
  async getAppFunctions(appName: string, forceRefresh = false): Promise<FunctionDefinition[]> {
    // Check cache first
    if (!forceRefresh && this.isCacheValid(appName)) {
      return this.cache.get(appName) || [];
    }

    try {
      const response = await fetch(`/api/registry/functions/${encodeURIComponent(appName)}`, {
        headers: this.getAuthHeaders()
      });

      const result = await response.json();
      
      if (result.success && result.functions) {
        // Convert connector functions to FunctionDefinition format
        const allFunctions: FunctionDefinition[] = [];
        
        // Add actions
        result.functions.actions?.forEach((action: any) => {
          allFunctions.push({
            id: action.id,
            name: action.name,
            description: action.description,
            type: 'action',
            parameters: action.parameters || action.params || {},
            requiredScopes: action.requiredScopes || [],
            rateLimits: action.rateLimits
          });
        });
        
        // Add triggers
        result.functions.triggers?.forEach((trigger: any) => {
          allFunctions.push({
            id: trigger.id,
            name: trigger.name,
            description: trigger.description,
            type: 'trigger',
            parameters: trigger.parameters || trigger.params || {},
            requiredScopes: trigger.requiredScopes || [],
            rateLimits: trigger.rateLimits
          });
        });

        this.setCache(appName, allFunctions);
        return allFunctions;
      } else {
        throw new Error(result.error || `Failed to fetch functions for ${appName}`);
      }
    } catch (error) {
      console.error(`Error fetching functions for ${appName}:`, error);
      
      // Return cached data if available, even if expired
      const cachedFunctions = this.cache.get(appName);
      if (cachedFunctions) {
        console.warn(`Using cached functions for ${appName} due to fetch error`);
        return cachedFunctions;
      }
      
      throw error;
    }
  }

  /**
   * Get functions for multiple applications
   */
  async getMultipleAppFunctions(appNames: string[]): Promise<Record<string, FunctionDefinition[]>> {
    const results: Record<string, FunctionDefinition[]> = {};
    
    // Process apps in parallel
    const promises = appNames.map(async (appName) => {
      try {
        const functions = await this.getAppFunctions(appName);
        results[appName] = functions;
      } catch (error) {
        console.error(`Failed to fetch functions for ${appName}:`, error);
        results[appName] = [];
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Search functions across all applications
   */
  async searchFunctions(query: string, appNames?: string[]): Promise<Array<FunctionDefinition & { appName: string }>> {
    try {
      const appsToSearch = appNames || await this.getSupportedApplications();
      const allFunctions = await this.getMultipleAppFunctions(appsToSearch);
      
      const searchResults: Array<FunctionDefinition & { appName: string }> = [];
      const lowerQuery = query.toLowerCase();

      Object.entries(allFunctions).forEach(([appName, functions]) => {
        functions.forEach(func => {
          const matchesName = func.name.toLowerCase().includes(lowerQuery);
          const matchesDescription = func.description.toLowerCase().includes(lowerQuery);
          const matchesId = func.id.toLowerCase().includes(lowerQuery);
          
          if (matchesName || matchesDescription || matchesId) {
            searchResults.push({ ...func, appName });
          }
        });
      });

      // Sort by relevance (name matches first, then description)
      return searchResults.sort((a, b) => {
        const aNameMatch = a.name.toLowerCase().includes(lowerQuery);
        const bNameMatch = b.name.toLowerCase().includes(lowerQuery);
        
        if (aNameMatch && !bNameMatch) return -1;
        if (!aNameMatch && bNameMatch) return 1;
        
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      console.error('Error searching functions:', error);
      throw error;
    }
  }

  /**
   * Get function by ID and app name
   */
  async getFunction(appName: string, functionId: string): Promise<FunctionDefinition | null> {
    try {
      const functions = await this.getAppFunctions(appName);
      return functions.find(func => func.id === functionId) || null;
    } catch (error) {
      console.error(`Error fetching function ${functionId} for ${appName}:`, error);
      return null;
    }
  }

  /**
   * Get functions by category
   */
  async getFunctionsByCategory(
    category: 'action' | 'trigger' | 'both',
    appNames?: string[]
  ): Promise<Array<FunctionDefinition & { appName: string }>> {
    try {
      const appsToSearch = appNames || await this.getSupportedApplications();
      const allFunctions = await this.getMultipleAppFunctions(appsToSearch);
      
      const results: Array<FunctionDefinition & { appName: string }> = [];

      Object.entries(allFunctions).forEach(([appName, functions]) => {
        functions.forEach(func => {
          if (func.category === category || func.category === 'both') {
            results.push({ ...func, appName });
          }
        });
      });

      return results.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error(`Error fetching ${category} functions:`, error);
      throw error;
    }
  }

  /**
   * Clear cache for specific app or all apps
   */
  clearCache(appName?: string): void {
    if (appName) {
      this.cache.delete(appName);
      this.cacheExpiry.delete(appName);
    } else {
      this.cache.clear();
      this.cacheExpiry.clear();
    }
  }

  /**
   * Preload functions for commonly used apps
   */
  async preloadCommonApps(): Promise<void> {
    const commonApps = [
      'gmail',
      'google-sheets',
      'shopify',
      'slack',
      'github',
      'stripe'
    ];

    try {
      await this.getMultipleAppFunctions(commonApps);
      console.log('Preloaded functions for common applications');
    } catch (error) {
      console.warn('Failed to preload some common app functions:', error);
    }
  }

  /**
   * Transform backend function format to FunctionDefinition format
   */
  private transformToFunctionDefinitions(backendFunctions: any[]): FunctionDefinition[] {
    return backendFunctions.map(func => ({
      id: func.id,
      name: func.name,
      description: func.description,
      category: func.category,
      parameters: this.transformParameters(func.parameters || {}),
      requiredScopes: func.requiredScopes,
      rateLimits: func.rateLimits ? {
        requests: func.rateLimits.requests || func.rateLimits.limit,
        period: func.rateLimits.period || func.rateLimits.window
      } : undefined,
      pricing: func.pricing
    }));
  }

  /**
   * Transform backend parameter format to ParameterDefinition format
   */
  private transformParameters(backendParams: Record<string, any>): Record<string, any> {
    const transformed: Record<string, any> = {};

    Object.entries(backendParams).forEach(([key, param]) => {
      transformed[key] = {
        type: param.type || 'string',
        required: param.required || false,
        description: param.description || '',
        options: param.options,
        default: param.default,
        validation: param.validation,
        sensitive: param.sensitive || false,
        placeholder: param.placeholder,
        helpText: param.helpText
      };
    });

    return transformed;
  }

  /**
   * Validate function definition
   */
  validateFunctionDefinition(func: FunctionDefinition): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!func.id) errors.push('Function ID is required');
    if (!func.name) errors.push('Function name is required');
    if (!func.description) errors.push('Function description is required');
    if (!['action', 'trigger', 'both'].includes(func.category)) {
      errors.push('Function category must be action, trigger, or both');
    }

    // Validate parameters
    Object.entries(func.parameters).forEach(([key, param]) => {
      if (!param.type) errors.push(`Parameter ${key} is missing type`);
      if (typeof param.required !== 'boolean') errors.push(`Parameter ${key} is missing required flag`);
      if (!param.description) errors.push(`Parameter ${key} is missing description`);
    });

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get function statistics
   */
  async getFunctionStats(): Promise<{
    totalFunctions: number;
    totalApps: number;
    functionsByCategory: Record<string, number>;
    functionsByApp: Record<string, number>;
  }> {
    try {
      const apps = await this.getSupportedApplications();
      const allFunctions = await this.getMultipleAppFunctions(apps);
      
      let totalFunctions = 0;
      const functionsByCategory: Record<string, number> = {
        action: 0,
        trigger: 0,
        both: 0
      };
      const functionsByApp: Record<string, number> = {};

      Object.entries(allFunctions).forEach(([appName, functions]) => {
        functionsByApp[appName] = functions.length;
        totalFunctions += functions.length;

        functions.forEach(func => {
          functionsByCategory[func.category] = (functionsByCategory[func.category] || 0) + 1;
        });
      });

      return {
        totalFunctions,
        totalApps: apps.length,
        functionsByCategory,
        functionsByApp
      };
    } catch (error) {
      console.error('Error getting function stats:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const functionLibraryService = new FunctionLibraryService();
export default functionLibraryService;