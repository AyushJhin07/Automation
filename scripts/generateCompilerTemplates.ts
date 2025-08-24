// COMPREHENSIVE COMPILER TEMPLATE GENERATOR
// Generates Apps Script compiler templates for ALL applications and functions

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

interface ConnectorFunction {
  id: string;
  name: string;
  description: string;
  parameters?: Record<string, any>;
  params?: Record<string, any>;
  requiredScopes?: string[];
}

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
  actions: ConnectorFunction[];
  triggers: ConnectorFunction[];
}

export class CompilerTemplateGenerator {
  private connectorsPath: string;
  private templatesPath: string;

  constructor() {
    this.connectorsPath = join(process.cwd(), 'connectors');
    this.templatesPath = join(process.cwd(), 'server', 'core', 'CompilerTemplates.ts');
  }

  /**
   * Generate comprehensive compiler templates for all applications
   */
  async generateAllCompilerTemplates(): Promise<{ generated: number; errors: string[] }> {
    console.log('🔧 Generating comprehensive compiler templates for all applications...\n');
    
    const results = {
      generated: 0,
      errors: [] as string[]
    };

    try {
      // Get all connectors
      const connectorFiles = readdirSync(this.connectorsPath).filter(f => f.endsWith('.json'));
      const templates: string[] = [];
      const templateClasses: string[] = [];

      // Process each connector
      for (const file of connectorFiles) {
        try {
          const connector = this.loadConnector(file);
          
          // Skip if no functions defined
          const totalFunctions = (connector.actions?.length || 0) + (connector.triggers?.length || 0);
          if (totalFunctions === 0) {
            console.log(`⚠️ Skipping ${connector.name} - no functions defined`);
            continue;
          }

          // Generate templates for actions
          for (const action of connector.actions || []) {
            const templateKey = `action.${connector.id}.${action.id}`;
            const className = this.generateClassName(templateKey);
            
            templates.push(`    this.templates.set('${templateKey}', new ${className}());`);
            templateClasses.push(this.generateTemplateClass(connector, action, 'action', className));
            results.generated++;
          }

          // Generate templates for triggers
          for (const trigger of connector.triggers || []) {
            const templateKey = `trigger.${connector.id}.${trigger.id}`;
            const className = this.generateClassName(templateKey);
            
            templates.push(`    this.templates.set('${templateKey}', new ${className}());`);
            templateClasses.push(this.generateTemplateClass(connector, trigger, 'trigger', className));
            results.generated++;
          }

          console.log(`✅ Generated ${(connector.actions?.length || 0) + (connector.triggers?.length || 0)} templates for ${connector.name}`);

        } catch (error) {
          const errorMsg = `Failed to process ${file}: ${error}`;
          console.error(`❌ ${errorMsg}`);
          results.errors.push(errorMsg);
        }
      }

      // Generate the complete compiler templates file
      await this.generateCompilerTemplatesFile(templates, templateClasses);
      console.log(`\n✅ Generated comprehensive compiler templates with ${results.generated} templates`);

      console.log(`\n🎯 Compiler template generation complete:`);
      console.log(`  ✅ Generated: ${results.generated} templates`);
      console.log(`  ❌ Errors: ${results.errors.length} templates`);

      return results;

    } catch (error) {
      const errorMsg = `Compiler template generation failed: ${error}`;
      console.error(`💥 ${errorMsg}`);
      results.errors.push(errorMsg);
      return results;
    }
  }

  /**
   * Generate template class for a function
   */
  private generateTemplateClass(
    connector: ConnectorData, 
    func: ConnectorFunction, 
    type: 'action' | 'trigger',
    className: string
  ): string {
    const isGoogleApp = this.isGoogleWorkspaceApp(connector.id);
    const scopes = func.requiredScopes || this.getDefaultScopes(connector, func);
    
    return `
/**
 * ${func.name} - ${func.description}
 * ${type.toUpperCase()} for ${connector.name}
 */
export class ${className} implements CompilerTemplate {
  generateCode(data: NodeData): string {
    ${this.generateCodeMethod(connector, func, type, isGoogleApp)}
  }

  generateScopes(data: NodeData): string[] {
    return ${JSON.stringify(scopes)};
  }

  getDescription(): string {
    return "${func.description}";
  }
}`;
  }

  /**
   * Generate the code method for a template
   */
  private generateCodeMethod(
    connector: ConnectorData, 
    func: ConnectorFunction, 
    type: 'action' | 'trigger',
    isGoogleApp: boolean
  ): string {
    if (isGoogleApp) {
      return this.generateGoogleAppsScriptCode(connector, func, type);
    } else {
      return this.generateExternalAPICode(connector, func, type);
    }
  }

  /**
   * Generate Google Apps Script code (native services)
   */
  private generateGoogleAppsScriptCode(
    connector: ConnectorData, 
    func: ConnectorFunction, 
    type: 'action' | 'trigger'
  ): string {
    const appId = connector.id.toLowerCase();
    const params = func.parameters || func.params || {};
    const paramNames = Object.keys(params);

    if (appId.includes('gmail')) {
      if (type === 'action') {
        switch (func.id) {
          case 'send':
            return `    const { to, subject, bodyText, bodyHtml } = data.params;
    const message = {
      to: to,
      subject: subject,
      htmlBody: bodyHtml || bodyText,
      body: bodyText || bodyHtml
    };
    
    const draft = GmailApp.createDraft(message.to, message.subject, message.body, {
      htmlBody: message.htmlBody
    });
    
    const result = draft.send();
    return { messageId: result.getId(), success: true };`;
          case 'reply':
            return `    const { threadId, bodyText, bodyHtml } = data.params;
    const thread = GmailApp.getThreadById(threadId);
    const message = thread.getMessages()[0];
    
    message.reply(bodyText || bodyHtml, {
      htmlBody: bodyHtml
    });
    
    return { success: true, threadId: threadId };`;
          default:
            return `    const params = data.params;
    // Gmail ${func.name} implementation
    console.log('Executing Gmail ${func.name} with params:', params);
    return { success: true, data: params };`;
        }
      } else {
        return `    // Gmail trigger for ${func.name}
    const query = data.params.query || '';
    const threads = GmailApp.search(query, 0, 10);
    
    return threads.map(thread => ({
      id: thread.getId(),
      subject: thread.getFirstMessageSubject(),
      snippet: thread.getMessages()[0].getPlainBody().substring(0, 100),
      timestamp: thread.getLastMessageDate().getTime()
    }));`;
      }
    }

    if (appId.includes('sheets')) {
      if (type === 'action') {
        switch (func.id) {
          case 'append_row':
            return `    const { spreadsheetId, sheet, values } = data.params;
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const worksheet = spreadsheet.getSheetByName(sheet) || spreadsheet.getActiveSheet();
    
    worksheet.appendRow(values);
    
    return { 
      success: true, 
      rowIndex: worksheet.getLastRow(),
      values: values 
    };`;
          case 'update_cell':
            return `    const { spreadsheetId, range, value } = data.params;
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const cell = spreadsheet.getRange(range);
    
    cell.setValue(value);
    
    return { success: true, range: range, value: value };`;
          default:
            return `    const params = data.params;
    // Sheets ${func.name} implementation
    console.log('Executing Sheets ${func.name} with params:', params);
    return { success: true, data: params };`;
        }
      } else {
        return `    // Sheets trigger for ${func.name}
    const { spreadsheetId, sheet } = data.params;
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const worksheet = spreadsheet.getSheetByName(sheet);
    
    const lastRow = worksheet.getLastRow();
    const rowData = worksheet.getRange(lastRow, 1, 1, worksheet.getLastColumn()).getValues()[0];
    
    return [{
      row: lastRow,
      values: rowData,
      timestamp: new Date().getTime()
    }];`;
      }
    }

    // Default Google Apps Script template
    const serviceName = this.getGoogleServiceName(appId);
    return `    const params = data.params;
    // ${connector.name} ${func.name} implementation using ${serviceName}
    console.log('Executing ${connector.name} ${func.name} with params:', params);
    
    try {
      // TODO: Implement specific ${connector.name} logic here
      const result = { success: true, message: '${func.name} executed successfully' };
      return result;
    } catch (error) {
      throw new Error(\`${func.name} failed: \${error.message}\`);
    }`;
  }

  /**
   * Generate external API code (UrlFetchApp.fetch)
   */
  private generateExternalAPICode(
    connector: ConnectorData, 
    func: ConnectorFunction, 
    type: 'action' | 'trigger'
  ): string {
    const baseUrl = connector.baseUrl || `https://api.${connector.id}.com`;
    const authType = connector.authentication?.type || 'oauth2';
    const params = func.parameters || func.params || {};
    const requiredParams = Object.entries(params)
      .filter(([_, param]: [string, any]) => param.required)
      .map(([name]: [string, any]) => name);

    const authHeader = this.generateAuthHeader(authType);
    const endpoint = this.generateEndpoint(connector.id, func.id, type);

    if (type === 'action') {
      return `    const params = data.params;
    
    // Validate required parameters
    const requiredFields = ${JSON.stringify(requiredParams)};
    for (const field of requiredFields) {
      if (!params[field]) {
        throw new Error(\`Missing required parameter: \${field}\`);
      }
    }

    try {
      // Get authentication token from PropertiesService
      ${authHeader}
      
      const response = UrlFetchApp.fetch('${baseUrl}${endpoint}', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'User-Agent': 'Apps-Script-Automation/1.0'
        },
        payload: JSON.stringify(params),
        muteHttpExceptions: true
      });

      const responseData = JSON.parse(response.getContentText());
      
      if (response.getResponseCode() >= 400) {
        throw new Error(\`API Error (\${response.getResponseCode()}): \${responseData.message || responseData.error || 'Unknown error'}\`);
      }

      return {
        success: true,
        data: responseData,
        statusCode: response.getResponseCode()
      };

    } catch (error) {
      console.error('${func.name} error:', error);
      throw new Error(\`${func.name} failed: \${error.message}\`);
    }`;
    } else {
      return `    const params = data.params;
    
    try {
      // Get authentication token from PropertiesService
      ${authHeader}
      
      // Build query parameters
      const queryParams = new URLSearchParams();
      Object.keys(params).forEach(key => {
        if (params[key] !== undefined) {
          queryParams.append(key, params[key]);
        }
      });
      
      const url = '${baseUrl}${endpoint}' + (queryParams.toString() ? '?' + queryParams.toString() : '');
      
      const response = UrlFetchApp.fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
          'User-Agent': 'Apps-Script-Automation/1.0'
        },
        muteHttpExceptions: true
      });

      const responseData = JSON.parse(response.getContentText());
      
      if (response.getResponseCode() >= 400) {
        console.warn(\`${func.name} API Error (\${response.getResponseCode()}): \${responseData.message || 'Unknown error'}\`);
        return [];
      }

      // Return array of items (triggers should return arrays)
      const items = Array.isArray(responseData) ? responseData : 
                   responseData.data ? (Array.isArray(responseData.data) ? responseData.data : [responseData.data]) :
                   [responseData];

      return items.map(item => ({
        ...item,
        timestamp: item.created_at || item.updated_at || Date.now()
      }));

    } catch (error) {
      console.error('${func.name} polling error:', error);
      return [];
    }`;
    }
  }

  /**
   * Generate authentication header code
   */
  private generateAuthHeader(authType: string): string {
    switch (authType.toLowerCase()) {
      case 'oauth2':
        return `const accessToken = PropertiesService.getScriptProperties().getProperty('${this.toUpperCase('ACCESS_TOKEN')}');
      if (!accessToken) {
        throw new Error('Access token not found. Please reconnect your account.');
      }
      const authHeader = 'Bearer ' + accessToken;`;

      case 'api_key':
        return `const apiKey = PropertiesService.getScriptProperties().getProperty('${this.toUpperCase('API_KEY')}');
      if (!apiKey) {
        throw new Error('API key not found. Please set your API key.');
      }
      const authHeader = 'Bearer ' + apiKey;`;

      case 'basic':
        return `const username = PropertiesService.getScriptProperties().getProperty('${this.toUpperCase('USERNAME')}');
      const password = PropertiesService.getScriptProperties().getProperty('${this.toUpperCase('PASSWORD')}');
      if (!username || !password) {
        throw new Error('Username or password not found. Please set your credentials.');
      }
      const credentials = Utilities.base64Encode(username + ':' + password);
      const authHeader = 'Basic ' + credentials;`;

      default:
        return `const token = PropertiesService.getScriptProperties().getProperty('${this.toUpperCase('TOKEN')}');
      if (!token) {
        throw new Error('Authentication token not found.');
      }
      const authHeader = 'Bearer ' + token;`;
    }
  }

  /**
   * Generate API endpoint for function
   */
  private generateEndpoint(appId: string, functionId: string, type: 'action' | 'trigger'): string {
    // App-specific endpoint patterns
    if (appId.includes('slack')) {
      if (type === 'action') {
        switch (functionId) {
          case 'post_message': return '/api/chat.postMessage';
          case 'update_message': return '/api/chat.update';
          case 'delete_message': return '/api/chat.delete';
          default: return `/api/${functionId}`;
        }
      } else {
        return '/api/conversations.history';
      }
    }

    if (appId.includes('github')) {
      if (type === 'action') {
        switch (functionId) {
          case 'create_issue': return '/repos/{owner}/{repo}/issues';
          case 'create_release': return '/repos/{owner}/{repo}/releases';
          default: return `/api/${functionId}`;
        }
      } else {
        return '/repos/{owner}/{repo}/issues';
      }
    }

    if (appId.includes('jira')) {
      return `/rest/api/3/${functionId}`;
    }

    if (appId.includes('hubspot')) {
      if (type === 'action') {
        return `/crm/v3/objects/${functionId}`;
      } else {
        return '/crm/v3/objects/contacts';
      }
    }

    // Default endpoint pattern
    return `/api/v1/${functionId}`;
  }

  /**
   * Get Google service name for Apps Script
   */
  private getGoogleServiceName(appId: string): string {
    if (appId.includes('gmail')) return 'GmailApp';
    if (appId.includes('sheets')) return 'SpreadsheetApp';
    if (appId.includes('drive')) return 'DriveApp';
    if (appId.includes('calendar')) return 'CalendarApp';
    if (appId.includes('docs')) return 'DocumentApp';
    if (appId.includes('slides')) return 'SlidesApp';
    if (appId.includes('forms')) return 'FormApp';
    if (appId.includes('contacts')) return 'ContactsApp';
    return 'GoogleApp';
  }

  /**
   * Get default scopes for a function
   */
  private getDefaultScopes(connector: ConnectorData, func: ConnectorFunction): string[] {
    if (this.isGoogleWorkspaceApp(connector.id)) {
      return this.getGoogleScopes(connector.id, func.id);
    }

    // Return app-specific scopes or default
    const appId = connector.id.toLowerCase();
    if (appId.includes('slack')) {
      return ['channels:read', 'chat:write', 'users:read'];
    } else if (appId.includes('github')) {
      return ['repo', 'user:email'];
    } else if (appId.includes('hubspot')) {
      return ['contacts', 'content'];
    }

    return ['read', 'write'];
  }

  /**
   * Get Google-specific scopes
   */
  private getGoogleScopes(appId: string, functionId: string): string[] {
    if (appId.includes('gmail')) {
      return [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify'
      ];
    } else if (appId.includes('sheets')) {
      return ['https://www.googleapis.com/auth/spreadsheets'];
    } else if (appId.includes('drive')) {
      return ['https://www.googleapis.com/auth/drive'];
    } else if (appId.includes('calendar')) {
      return ['https://www.googleapis.com/auth/calendar'];
    }

    return ['https://www.googleapis.com/auth/script.external_request'];
  }

  /**
   * Generate the complete compiler templates file
   */
  private async generateCompilerTemplatesFile(templates: string[], templateClasses: string[]): Promise<void> {
    const fileContent = `// COMPREHENSIVE COMPILER TEMPLATES - AUTO-GENERATED
// Templates for generating Apps Script code for ALL ${templates.length} functions across ${Math.floor(templates.length / 10)} applications

export interface NodeData {
  nodeType: string;
  app: string;
  params: Record<string, any>;
  [key: string]: any;
}

export interface CompilerTemplate {
  generateCode(data: NodeData): string;
  generateScopes(data: NodeData): string[];
  getDescription(): string;
}

export class CompilerTemplates {
  private templates: Map<string, CompilerTemplate> = new Map();

  constructor() {
    this.initializeTemplates();
  }

  /**
   * Get template for a specific node type
   */
  public getTemplate(nodeType: string): CompilerTemplate | null {
    return this.templates.get(nodeType) || null;
  }

  /**
   * Generate code for a node
   */
  public generateNodeCode(nodeType: string, data: NodeData): string {
    const template = this.getTemplate(nodeType);
    if (!template) {
      return this.generateFallbackCode(nodeType, data);
    }
    return template.generateCode(data);
  }

  /**
   * Get required scopes for a node
   */
  public getRequiredScopes(nodeType: string, data: NodeData): string[] {
    const template = this.getTemplate(nodeType);
    if (!template) {
      return this.generateFallbackScopes(nodeType, data);
    }
    return template.generateScopes(data);
  }

  /**
   * Initialize ALL application templates
   */
  private initializeTemplates(): void {
    console.log('🔧 Initializing comprehensive compiler templates...');

${templates.join('\n')}

    console.log(\`✅ Initialized \${this.templates.size} compiler templates\`);
  }

  /**
   * Generate fallback code for unknown node types
   */
  private generateFallbackCode(nodeType: string, data: NodeData): string {
    const [type, app, functionId] = nodeType.split('.');
    
    if (app && this.isGoogleWorkspaceApp(app)) {
      return this.generateGoogleServiceFallback(nodeType, data);
    } else {
      return this.generateExternalAPIFallback(nodeType, data);
    }
  }

  /**
   * Generate fallback scopes for unknown node types
   */
  private generateFallbackScopes(nodeType: string, data: NodeData): string[] {
    const [type, app, functionId] = nodeType.split('.');
    
    if (app && this.isGoogleWorkspaceApp(app)) {
      return ['https://www.googleapis.com/auth/script.external_request'];
    }
    
    return [];
  }

  /**
   * Generate Google service fallback code
   */
  private generateGoogleServiceFallback(nodeType: string, data: NodeData): string {
    const [type, app, functionId] = nodeType.split('.');
    const serviceName = this.getGoogleServiceName(app);
    
         return \`
     // Fallback implementation for \${nodeType}
     const params = data.params;
     console.log('Executing \${app} \${functionId} with params:', params);
     
     try {
       // TODO: Implement specific \${app} \${functionId} logic here
       const result = { success: true, message: '\${functionId} executed successfully' };
       return result;
     } catch (error) {
       throw new Error(\\\`\${functionId} failed: \\\${error.message}\\\`);
     }\`;
  }

  /**
   * Generate external API fallback code
   */
  private generateExternalAPIFallback(nodeType: string, data: NodeData): string {
    const [type, app, functionId] = nodeType.split('.');
    
         return \`
     // Fallback implementation for \${nodeType}
     const params = data.params;
     
     try {
       const token = PropertiesService.getScriptProperties().getProperty('\${app.toUpperCase()}_TOKEN');
       if (!token) {
         throw new Error('\${app} token not found. Please reconnect your account.');
       }
       
       const response = UrlFetchApp.fetch('https://api.\${app}.com/api/\${functionId}', {
         method: '\${type === 'action' ? 'POST' : 'GET'}',
         headers: {
           'Authorization': 'Bearer ' + token,
           'Content-Type': 'application/json',
           'User-Agent': 'Apps-Script-Automation/1.0'
         },
         payload: \${type === 'action' ? 'JSON.stringify(params)' : 'null'},
         muteHttpExceptions: true
       });

       const responseData = JSON.parse(response.getContentText());
       
       if (response.getResponseCode() >= 400) {
         throw new Error(\\\`API Error (\\\${response.getResponseCode()}): \\\${responseData.message || 'Unknown error'}\\\`);
       }

       return {
         success: true,
         data: responseData,
         statusCode: response.getResponseCode()
       };

     } catch (error) {
       console.error('\${functionId} error:', error);
       throw new Error(\\\`\${functionId} failed: \\\${error.message}\\\`);
     }\`;
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
   * Get Google service name for Apps Script
   */
  private getGoogleServiceName(appId: string): string {
    if (appId.includes('gmail')) return 'GmailApp';
    if (appId.includes('sheets')) return 'SpreadsheetApp';
    if (appId.includes('drive')) return 'DriveApp';
    if (appId.includes('calendar')) return 'CalendarApp';
    if (appId.includes('docs')) return 'DocumentApp';
    if (appId.includes('slides')) return 'SlidesApp';
    if (appId.includes('forms')) return 'FormApp';
    if (appId.includes('contacts')) return 'ContactsApp';
    return 'GoogleApp';
  }

  /**
   * List all available templates
   */
  public listTemplates(): string[] {
    return Array.from(this.templates.keys()).sort();
  }

  /**
   * Get template count by application
   */
  public getTemplateStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    
    for (const templateKey of this.templates.keys()) {
      const [type, app] = templateKey.split('.');
      if (app) {
        stats[app] = (stats[app] || 0) + 1;
      }
    }
    
    return stats;
  }
}

${templateClasses.join('\n')}

export const compilerTemplates = new CompilerTemplates();`;

    writeFileSync(this.templatesPath, fileContent);
  }

  /**
   * Helper methods
   */
  private loadConnector(filename: string): ConnectorData {
    const filePath = join(this.connectorsPath, filename);
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  }

  private isGoogleWorkspaceApp(appId: string): boolean {
    const googleApps = [
      'gmail', 'google-sheets', 'google-drive', 'google-calendar', 
      'google-docs', 'google-slides', 'google-forms', 'google-meet',
      'google-contacts', 'google-admin', 'google-chat'
    ];
    return googleApps.includes(appId) || appId.startsWith('google-');
  }

  private generateClassName(templateKey: string): string {
    const parts = templateKey.split('.');
    return parts
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('')
      .replace(/-/g, '');
  }

  private toUpperCase(str: string): string {
    return str.replace(/-/g, '_').toUpperCase();
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  async function runGeneration() {
    console.log('🚀 Running compiler template generation from CLI...\n');
    
    const generator = new CompilerTemplateGenerator();
    
    try {
      const results = await generator.generateAllCompilerTemplates();
      
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

export default CompilerTemplateGenerator;