// COMPREHENSIVE API CLIENT GENERATOR
// Generates API client implementations for ALL external applications

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

interface ConnectorData {
  id: string;
  name: string;
  description: string;
  category: string;
  authentication: {
    type: string;
    config: any;
  };
  baseUrl?: string;
  actions: Array<{
    id: string;
    name: string;
    description: string;
    parameters?: Record<string, any>;
  }>;
  triggers: Array<{
    id: string;
    name: string;
    description: string;
    parameters?: Record<string, any>;
  }>;
}

export class APIClientGenerator {
  private connectorsPath: string;
  private clientsPath: string;

  constructor() {
    this.connectorsPath = join(process.cwd(), 'connectors');
    this.clientsPath = join(process.cwd(), 'server', 'integrations');
  }

  /**
   * Generate API clients for all external applications
   */
  async generateAllAPIClients(): Promise<{ generated: number; errors: string[] }> {
    console.log('🔧 Generating API clients for all external applications...\n');
    
    const results = {
      generated: 0,
      errors: [] as string[]
    };

    try {
      const connectorFiles = readdirSync(this.connectorsPath).filter(f => f.endsWith('.json'));
      
      for (const file of connectorFiles) {
        try {
          const connector = this.loadConnector(file);
          
          // Skip Google Workspace apps (they use native Apps Script services)
          if (this.isGoogleWorkspaceApp(connector.id)) {
            console.log(`⚠️ Skipping ${connector.name} - Google Workspace app (uses native services)`);
            continue;
          }

          // Skip if no functions defined
          const totalFunctions = (connector.actions?.length || 0) + (connector.triggers?.length || 0);
          if (totalFunctions === 0) {
            console.log(`⚠️ Skipping ${connector.name} - no functions defined`);
            continue;
          }

          // Check if API client already exists
          const clientFile = `${this.toPascalCase(connector.id)}APIClient.ts`;
          const clientPath = join(this.clientsPath, clientFile);
          
          if (existsSync(clientPath)) {
            console.log(`✅ ${connector.name} API client already exists`);
            continue;
          }

          // Generate API client
          await this.generateAPIClient(connector);
          console.log(`✅ Generated ${connector.name} API client`);
          results.generated++;

        } catch (error) {
          const errorMsg = `Failed to generate API client for ${file}: ${error}`;
          console.error(`❌ ${errorMsg}`);
          results.errors.push(errorMsg);
        }
      }

      console.log(`\n🎯 API client generation complete:`);
      console.log(`  ✅ Generated: ${results.generated} clients`);
      console.log(`  ❌ Errors: ${results.errors.length} clients`);

      return results;

    } catch (error) {
      const errorMsg = `API client generation failed: ${error}`;
      console.error(`💥 ${errorMsg}`);
      results.errors.push(errorMsg);
      return results;
    }
  }

  /**
   * Generate API client for a specific connector
   */
  private async generateAPIClient(connector: ConnectorData): Promise<void> {
    const className = `${this.toPascalCase(connector.id)}APIClient`;
    const fileName = `${className}.ts`;
    const filePath = join(this.clientsPath, fileName);

    const clientCode = this.generateClientCode(connector, className);
    writeFileSync(filePath, clientCode);
  }

  /**
   * Generate the API client code
   */
  private generateClientCode(connector: ConnectorData, className: string): string {
    const baseUrl = connector.baseUrl || `https://api.${connector.id}.com`;
    const authType = connector.authentication?.type || 'oauth2';

    return `// ${connector.name.toUpperCase()} API CLIENT
// Auto-generated API client for ${connector.name} integration

import { BaseAPIClient } from './BaseAPIClient';

export interface ${className}Config {
  ${this.generateConfigInterface(connector, authType)}
}

export class ${className} extends BaseAPIClient {
  protected baseUrl: string;
  private config: ${className}Config;

  constructor(config: ${className}Config) {
    super();
    this.config = config;
    this.baseUrl = '${baseUrl}';
  }

  /**
   * Get authentication headers
   */
  protected getAuthHeaders(): Record<string, string> {
    ${this.generateAuthHeaders(authType)}
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      ${this.generateTestConnection(connector)}
      return true;
    } catch (error) {
      console.error(\`❌ \${this.constructor.name} connection test failed:\`, error);
      return false;
    }
  }

${this.generateActionMethods(connector)}

${this.generateTriggerMethods(connector)}
}`;
  }

  /**
   * Generate config interface based on auth type
   */
  private generateConfigInterface(connector: ConnectorData, authType: string): string {
    switch (authType.toLowerCase()) {
      case 'oauth2':
        return `accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;`;
      
      case 'api_key':
        return `apiKey: string;`;
      
      case 'basic':
        return `username: string;
  password: string;`;
      
      default:
        return `apiKey: string;
  accessToken?: string;`;
    }
  }

  /**
   * Generate authentication headers
   */
  private generateAuthHeaders(authType: string): string {
    switch (authType.toLowerCase()) {
      case 'oauth2':
        return `return {
      'Authorization': \`Bearer \${this.config.accessToken}\`,
      'Content-Type': 'application/json',
      'User-Agent': 'Apps-Script-Automation/1.0'
    };`;
      
      case 'api_key':
        return `return {
      'Authorization': \`Bearer \${this.config.apiKey}\`,
      'Content-Type': 'application/json',
      'User-Agent': 'Apps-Script-Automation/1.0'
    };`;
      
      case 'basic':
        return `const credentials = Buffer.from(\`\${this.config.username}:\${this.config.password}\`).toString('base64');
    return {
      'Authorization': \`Basic \${credentials}\`,
      'Content-Type': 'application/json',
      'User-Agent': 'Apps-Script-Automation/1.0'
    };`;
      
      default:
        return `return {
      'Authorization': \`Bearer \${this.config.apiKey || this.config.accessToken}\`,
      'Content-Type': 'application/json',
      'User-Agent': 'Apps-Script-Automation/1.0'
    };`;
    }
  }

  /**
   * Generate test connection method
   */
  private generateTestConnection(connector: ConnectorData): string {
    // Common test endpoints for different app types
    if (connector.category.toLowerCase().includes('crm')) {
      return `const response = await this.makeRequest('GET', '/users/me');
      return response.status === 200;`;
    } else if (connector.category.toLowerCase().includes('communication')) {
      return `const response = await this.makeRequest('GET', '/auth/test');
      return response.status === 200;`;
    } else if (connector.category.toLowerCase().includes('project')) {
      return `const response = await this.makeRequest('GET', '/user');
      return response.status === 200;`;
    } else {
      return `const response = await this.makeRequest('GET', '/');
      return response.status === 200;`;
    }
  }

  /**
   * Generate action methods
   */
  private generateActionMethods(connector: ConnectorData): string {
    if (!connector.actions || connector.actions.length === 0) {
      return '  // No actions defined';
    }

    return connector.actions.map(action => {
      const methodName = this.toCamelCase(action.id);
      const parameters = this.generateMethodParameters(action.parameters);
      
      return `
  /**
   * ${action.description}
   */
  async ${methodName}(${parameters}): Promise<any> {
    try {
      const response = await this.makeRequest('POST', '/api/${action.id}', params);
      return this.handleResponse(response);
    } catch (error) {
      throw new Error(\`${action.name} failed: \${error}\`);
    }
  }`;
    }).join('\n');
  }

  /**
   * Generate trigger methods (polling-based)
   */
  private generateTriggerMethods(connector: ConnectorData): string {
    if (!connector.triggers || connector.triggers.length === 0) {
      return '  // No triggers defined';
    }

    return connector.triggers.map(trigger => {
      const methodName = this.toCamelCase(trigger.id);
      const parameters = this.generateMethodParameters(trigger.parameters);
      
      return `
  /**
   * Poll for ${trigger.description}
   */
  async poll${this.toPascalCase(trigger.id)}(${parameters}): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/api/${trigger.id}', params);
      const data = this.handleResponse(response);
      return Array.isArray(data) ? data : [data];
    } catch (error) {
      console.error(\`Polling ${trigger.name} failed:\`, error);
      return [];
    }
  }`;
    }).join('\n');
  }

  /**
   * Generate method parameters
   */
  private generateMethodParameters(parameters?: Record<string, any>): string {
    if (!parameters || Object.keys(parameters).length === 0) {
      return 'params: Record<string, any> = {}';
    }

    const paramList = Object.keys(parameters).map(key => {
      const param = parameters[key];
      const isRequired = param.required || false;
      const type = this.mapParameterType(param.type);
      return `${key}${isRequired ? '' : '?'}: ${type}`;
    });

    return `{ ${paramList.join(', ')} }: { ${paramList.join(', ')} }`;
  }

  /**
   * Map parameter types to TypeScript types
   */
  private mapParameterType(type: string): string {
    switch (type?.toLowerCase()) {
      case 'string': return 'string';
      case 'number': case 'integer': return 'number';
      case 'boolean': return 'boolean';
      case 'array': return 'any[]';
      case 'object': return 'Record<string, any>';
      default: return 'any';
    }
  }

  /**
   * Load connector data
   */
  private loadConnector(filename: string): ConnectorData {
    const filePath = join(this.connectorsPath, filename);
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Check if app is Google Workspace
   */
  private isGoogleWorkspaceApp(appId: string): boolean {
    const googleApps = [
      'gmail', 'google-sheets', 'google-drive', 'google-calendar', 
      'google-docs', 'google-slides', 'google-forms', 'google-meet',
      'google-contacts', 'google-admin', 'google-chat'
    ];
    return googleApps.includes(appId) || appId.startsWith('google-');
  }

  /**
   * Convert to PascalCase
   */
  private toPascalCase(str: string): string {
    return str
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  /**
   * Convert to camelCase
   */
  private toCamelCase(str: string): string {
    const pascal = this.toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  async function runGeneration() {
    console.log('🚀 Running API client generation from CLI...\n');
    
    const generator = new APIClientGenerator();
    
    try {
      const results = await generator.generateAllAPIClients();
      
      if (results.errors.length > 0) {
        console.log('\n❌ Errors:');
        results.errors.forEach(error => console.log(`  • ${error}`));
      }
      
    } catch (error) {
      console.error('💥 Generation failed:', error);
      process.exit(1);
    }
  }

  runGeneration();
}

export default APIClientGenerator;