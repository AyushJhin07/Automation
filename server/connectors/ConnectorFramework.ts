import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { eq, like, and } from 'drizzle-orm';
import { connectorDefinitions } from '../database/schema';

export interface ConnectorDefinition {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  iconUrl: string;
  websiteUrl: string;
  documentationUrl: string;
  
  // Technical configuration
  apiBaseUrl: string;
  authType: 'oauth2' | 'api_key' | 'basic' | 'bearer' | 'custom';
  authConfig: {
    oauth2?: {
      authUrl: string;
      tokenUrl: string;
      scopes: string[];
      clientIdRequired: boolean;
    };
    apiKey?: {
      headerName: string;
      paramName?: string;
      location: 'header' | 'query' | 'body';
    };
    basic?: {
      usernameField: string;
      passwordField: string;
    };
    bearer?: {
      tokenField: string;
    };
  };
  
  // Available triggers and actions
  triggers: ConnectorTrigger[];
  actions: ConnectorAction[];
  
  // Rate limiting and constraints
  rateLimits: {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
    burstLimit?: number;
  };
  
  // Metadata
  isActive: boolean;
  isVerified: boolean;
  popularity: number;
  complexity: 'simple' | 'moderate' | 'complex';
  supportLevel: 'community' | 'official' | 'premium';
}

export interface ConnectorTrigger {
  id: string;
  name: string;
  description: string;
  type: 'webhook' | 'polling' | 'realtime';
  
  // Configuration
  endpoint?: string;
  method?: string;
  pollingInterval?: number; // minutes
  
  // Parameters
  parameters: ConnectorParameter[];
  
  // Output schema
  outputSchema: {
    type: 'object';
    properties: Record<string, any>;
  };
  
  // Code generation templates
  codeTemplate: string;
  
  // Examples
  examples: Array<{
    name: string;
    description: string;
    config: Record<string, any>;
    expectedOutput: any;
  }>;
}

export interface ConnectorAction {
  id: string;
  name: string;
  description: string;
  
  // API details
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  
  // Parameters
  parameters: ConnectorParameter[];
  
  // Request/Response schemas
  requestSchema?: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  responseSchema?: {
    type: 'object';
    properties: Record<string, any>;
  };
  
  // Code generation template
  codeTemplate: string;
  
  // Examples
  examples: Array<{
    name: string;
    description: string;
    input: Record<string, any>;
    expectedOutput: any;
  }>;
}

export interface ConnectorParameter {
  name: string;
  displayName: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'select' | 'multiselect';
  required: boolean;
  defaultValue?: any;
  
  // Validation
  validation?: {
    pattern?: string;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    enum?: string[];
  };
  
  // UI hints
  placeholder?: string;
  helpText?: string;
  sensitive?: boolean; // For passwords, API keys
  
  // Dynamic options (for select/multiselect)
  optionsEndpoint?: string;
  dependsOn?: string[]; // Other parameters this depends on
}

export class ConnectorFramework {
  private db: any;
  private connectorCache = new Map<string, ConnectorDefinition>();
  private cacheExpiry = new Map<string, number>();

  constructor() {
    const sql = neon(process.env.DATABASE_URL!);
    this.db = drizzle(sql);
  }

  /**
   * Load all connector definitions
   */
  public async loadConnectors(): Promise<ConnectorDefinition[]> {
    console.log('📦 Loading connector definitions...');

    try {
      const connectors = await this.db
        .select()
        .from(connectorDefinitions)
        .where(eq(connectorDefinitions.isActive, true))
        .orderBy(connectorDefinitions.popularity);

      console.log(`✅ Loaded ${connectors.length} connectors`);
      return connectors.map(this.parseConnectorDefinition);

    } catch (error) {
      console.error('❌ Failed to load connectors:', error);
      
      // Return built-in connectors as fallback
      return this.getBuiltInConnectors();
    }
  }

  /**
   * Get connector by slug
   */
  public async getConnector(slug: string): Promise<ConnectorDefinition | null> {
    // Check cache first
    const cacheKey = `connector_${slug}`;
    const cached = this.connectorCache.get(cacheKey);
    const expiry = this.cacheExpiry.get(cacheKey);

    if (cached && expiry && Date.now() < expiry) {
      return cached;
    }

    try {
      const [connector] = await this.db
        .select()
        .from(connectorDefinitions)
        .where(and(
          eq(connectorDefinitions.slug, slug),
          eq(connectorDefinitions.isActive, true)
        ));

      if (!connector) {
        return null;
      }

      const parsed = this.parseConnectorDefinition(connector);
      
      // Cache for 1 hour
      this.connectorCache.set(cacheKey, parsed);
      this.cacheExpiry.set(cacheKey, Date.now() + 60 * 60 * 1000);

      return parsed;

    } catch (error) {
      console.error(`❌ Failed to get connector ${slug}:`, error);
      return null;
    }
  }

  /**
   * Search connectors
   */
  public async searchConnectors(query: string, category?: string, limit: number = 50): Promise<ConnectorDefinition[]> {
    try {
      const conditions = [eq(connectorDefinitions.isActive, true)];

      if (query) {
        conditions.push(like(connectorDefinitions.name, `%${query}%`));
      }

      if (category) {
        conditions.push(eq(connectorDefinitions.category, category));
      }

      const connectors = await this.db
        .select()
        .from(connectorDefinitions)
        .where(and(...conditions))
        .orderBy(connectorDefinitions.popularity)
        .limit(limit);

      return connectors.map(this.parseConnectorDefinition);

    } catch (error) {
      console.error('❌ Failed to search connectors:', error);
      return [];
    }
  }

  /**
   * Generate Google Apps Script code for a connector action
   */
  public generateActionCode(
    connector: ConnectorDefinition,
    action: ConnectorAction,
    parameters: Record<string, any>
  ): string {
    console.log(`🔧 Generating code for ${connector.name}.${action.name}`);

    // Start with the action's code template
    let code = action.codeTemplate;

    // Replace placeholders with actual values
    code = this.replacePlaceholders(code, {
      ...parameters,
      connector: connector,
      action: action,
      apiBaseUrl: connector.apiBaseUrl,
      endpoint: action.endpoint,
      method: action.method
    });

    // Add authentication code
    code = this.addAuthenticationCode(code, connector, parameters);

    // Add error handling
    code = this.addErrorHandling(code, connector, action);

    // Add rate limiting
    code = this.addRateLimiting(code, connector);

    return code;
  }

  /**
   * Generate Google Apps Script code for a connector trigger
   */
  public generateTriggerCode(
    connector: ConnectorDefinition,
    trigger: ConnectorTrigger,
    parameters: Record<string, any>
  ): string {
    console.log(`🔧 Generating trigger code for ${connector.name}.${trigger.name}`);

    let code = trigger.codeTemplate;

    // Replace placeholders
    code = this.replacePlaceholders(code, {
      ...parameters,
      connector: connector,
      trigger: trigger,
      apiBaseUrl: connector.apiBaseUrl,
      pollingInterval: trigger.pollingInterval || 5
    });

    // Add authentication
    code = this.addAuthenticationCode(code, connector, parameters);

    // Add deduplication for polling triggers
    if (trigger.type === 'polling') {
      code = this.addDeduplicationCode(code, connector, trigger);
    }

    return code;
  }

  /**
   * Validate connector parameters
   */
  public validateParameters(
    parameters: ConnectorParameter[],
    values: Record<string, any>
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const param of parameters) {
      const value = values[param.name];

      // Check required parameters
      if (param.required && (value === undefined || value === null || value === '')) {
        errors.push(`Parameter '${param.displayName}' is required`);
        continue;
      }

      if (value === undefined || value === null) continue;

      // Type validation
      if (!this.validateParameterType(param, value)) {
        errors.push(`Parameter '${param.displayName}' has invalid type`);
      }

      // Validation rules
      if (param.validation) {
        const validationErrors = this.validateParameterRules(param, value);
        errors.push(...validationErrors);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get available categories
   */
  public async getCategories(): Promise<Array<{ name: string; count: number }>> {
    try {
      // This would need a proper GROUP BY query in a real implementation
      const connectors = await this.loadConnectors();
      const categoryMap = new Map<string, number>();

      connectors.forEach(connector => {
        const count = categoryMap.get(connector.category) || 0;
        categoryMap.set(connector.category, count + 1);
      });

      return Array.from(categoryMap.entries()).map(([name, count]) => ({ name, count }));

    } catch (error) {
      console.error('❌ Failed to get categories:', error);
      return [];
    }
  }

  /**
   * Register a new connector
   */
  public async registerConnector(definition: Omit<ConnectorDefinition, 'id'>): Promise<string> {
    try {
      const [connector] = await this.db.insert(connectorDefinitions).values({
        name: definition.name,
        slug: definition.slug,
        category: definition.category,
        description: definition.description,
        iconUrl: definition.iconUrl,
        websiteUrl: definition.websiteUrl,
        documentationUrl: definition.documentationUrl,
        apiBaseUrl: definition.apiBaseUrl,
        authType: definition.authType,
        authConfig: definition.authConfig,
        triggers: definition.triggers,
        actions: definition.actions,
        rateLimits: definition.rateLimits,
        isActive: definition.isActive,
        isVerified: false, // New connectors need verification
        popularity: 0
      }).returning({ id: connectorDefinitions.id });

      console.log(`✅ Registered connector: ${definition.name} (${connector.id})`);
      return connector.id;

    } catch (error) {
      console.error('❌ Failed to register connector:', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private parseConnectorDefinition(raw: any): ConnectorDefinition {
    return {
      id: raw.id,
      name: raw.name,
      slug: raw.slug,
      category: raw.category,
      description: raw.description,
      iconUrl: raw.iconUrl,
      websiteUrl: raw.websiteUrl,
      documentationUrl: raw.documentationUrl,
      apiBaseUrl: raw.apiBaseUrl,
      authType: raw.authType,
      authConfig: raw.authConfig || {},
      triggers: raw.triggers || [],
      actions: raw.actions || [],
      rateLimits: raw.rateLimits || {
        requestsPerMinute: 60,
        requestsPerHour: 1000,
        requestsPerDay: 10000
      },
      isActive: raw.isActive,
      isVerified: raw.isVerified,
      popularity: raw.popularity || 0,
      complexity: raw.complexity || 'moderate',
      supportLevel: raw.supportLevel || 'community'
    };
  }

  private replacePlaceholders(template: string, values: Record<string, any>): string {
    let result = template;

    // Replace {{variable}} placeholders
    result = result.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const value = this.getNestedValue(values, key.trim());
      return value !== undefined ? String(value) : match;
    });

    // Replace ${variable} placeholders
    result = result.replace(/\$\{([^}]+)\}/g, (match, key) => {
      const value = this.getNestedValue(values, key.trim());
      return value !== undefined ? String(value) : match;
    });

    return result;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  private addAuthenticationCode(code: string, connector: ConnectorDefinition, parameters: Record<string, any>): string {
    const authPlaceholder = '// {{AUTH_CODE}}';
    
    if (!code.includes(authPlaceholder)) {
      return code;
    }

    let authCode = '';

    switch (connector.authType) {
      case 'api_key':
        const keyConfig = connector.authConfig.apiKey;
        if (keyConfig?.location === 'header') {
          authCode = `
  // Add API key authentication
  if (!options.headers) options.headers = {};
  const apiKey = PropertiesService.getScriptProperties().getProperty('${connector.slug.toUpperCase()}_API_KEY');
  if (apiKey) {
    options.headers['${keyConfig.headerName}'] = apiKey;
  }`;
        }
        break;

      case 'bearer':
        authCode = `
  // Add Bearer token authentication
  if (!options.headers) options.headers = {};
  const token = PropertiesService.getScriptProperties().getProperty('${connector.slug.toUpperCase()}_TOKEN');
  if (token) {
    options.headers['Authorization'] = 'Bearer ' + token;
  }`;
        break;

      case 'basic':
        authCode = `
  // Add Basic authentication
  if (!options.headers) options.headers = {};
  const username = PropertiesService.getScriptProperties().getProperty('${connector.slug.toUpperCase()}_USERNAME');
  const password = PropertiesService.getScriptProperties().getProperty('${connector.slug.toUpperCase()}_PASSWORD');
  if (username && password) {
    const credentials = Utilities.base64Encode(username + ':' + password);
    options.headers['Authorization'] = 'Basic ' + credentials;
  }`;
        break;

      case 'oauth2':
        authCode = `
  // Add OAuth2 authentication
  if (!options.headers) options.headers = {};
  const accessToken = PropertiesService.getScriptProperties().getProperty('${connector.slug.toUpperCase()}_ACCESS_TOKEN');
  if (accessToken) {
    options.headers['Authorization'] = 'Bearer ' + accessToken;
  }`;
        break;
    }

    return code.replace(authPlaceholder, authCode);
  }

  private addErrorHandling(code: string, connector: ConnectorDefinition, action: ConnectorAction): string {
    const errorPlaceholder = '// {{ERROR_HANDLING}}';
    
    if (!code.includes(errorPlaceholder)) {
      return code;
    }

    const errorHandlingCode = `
  // Handle API errors
  if (response.getResponseCode() >= 400) {
    const errorBody = response.getContentText();
    const errorMessage = \`${connector.name} API error (\${response.getResponseCode()}): \${errorBody}\`;
    Logger.log(errorMessage);
    throw new Error(errorMessage);
  }`;

    return code.replace(errorPlaceholder, errorHandlingCode);
  }

  private addRateLimiting(code: string, connector: ConnectorDefinition): string {
    const rateLimitPlaceholder = '// {{RATE_LIMITING}}';
    
    if (!code.includes(rateLimitPlaceholder)) {
      return code;
    }

    const rateLimitCode = `
  // Check rate limits
  const rateLimitKey = '${connector.slug}_rate_limit';
  const now = Date.now();
  const properties = PropertiesService.getScriptProperties();
  const rateLimitData = JSON.parse(properties.getProperty(rateLimitKey) || '{}');
  
  // Reset if window expired
  if (!rateLimitData.windowStart || now > rateLimitData.windowStart + 60000) {
    rateLimitData.windowStart = now;
    rateLimitData.requestCount = 0;
  }
  
  // Check limit
  if (rateLimitData.requestCount >= ${connector.rateLimits.requestsPerMinute}) {
    const waitTime = rateLimitData.windowStart + 60000 - now;
    throw new Error(\`Rate limit exceeded for ${connector.name}. Wait \${Math.ceil(waitTime/1000)} seconds.\`);
  }
  
  // Increment counter
  rateLimitData.requestCount++;
  properties.setProperty(rateLimitKey, JSON.stringify(rateLimitData));`;

    return code.replace(rateLimitPlaceholder, rateLimitCode);
  }

  private addDeduplicationCode(code: string, connector: ConnectorDefinition, trigger: ConnectorTrigger): string {
    const dedupePlaceholder = '// {{DEDUPLICATION}}';
    
    if (!code.includes(dedupePlaceholder)) {
      return code;
    }

    const dedupeCode = `
  // Deduplicate items
  const processedKey = '${connector.slug}_${trigger.id}_processed';
  const properties = PropertiesService.getScriptProperties();
  const processedIds = JSON.parse(properties.getProperty(processedKey) || '[]');
  
  const newItems = items.filter(item => {
    const itemId = item.id || item.uuid || JSON.stringify(item);
    return !processedIds.includes(itemId);
  });
  
  // Update processed list (keep last 1000 items)
  const newProcessedIds = newItems.map(item => item.id || item.uuid || JSON.stringify(item));
  const allProcessedIds = [...processedIds, ...newProcessedIds].slice(-1000);
  properties.setProperty(processedKey, JSON.stringify(allProcessedIds));
  
  return newItems;`;

    return code.replace(dedupePlaceholder, dedupeCode);
  }

  private validateParameterType(param: ConnectorParameter, value: any): boolean {
    switch (param.type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return true;
    }
  }

  private validateParameterRules(param: ConnectorParameter, value: any): string[] {
    const errors: string[] = [];
    const validation = param.validation!;

    if (validation.pattern && typeof value === 'string') {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(value)) {
        errors.push(`Parameter '${param.displayName}' does not match required pattern`);
      }
    }

    if (validation.minLength && typeof value === 'string') {
      if (value.length < validation.minLength) {
        errors.push(`Parameter '${param.displayName}' must be at least ${validation.minLength} characters`);
      }
    }

    if (validation.maxLength && typeof value === 'string') {
      if (value.length > validation.maxLength) {
        errors.push(`Parameter '${param.displayName}' must be no more than ${validation.maxLength} characters`);
      }
    }

    if (validation.min && typeof value === 'number') {
      if (value < validation.min) {
        errors.push(`Parameter '${param.displayName}' must be at least ${validation.min}`);
      }
    }

    if (validation.max && typeof value === 'number') {
      if (value > validation.max) {
        errors.push(`Parameter '${param.displayName}' must be no more than ${validation.max}`);
      }
    }

    if (validation.enum && !validation.enum.includes(value)) {
      errors.push(`Parameter '${param.displayName}' must be one of: ${validation.enum.join(', ')}`);
    }

    return errors;
  }

  /**
   * Built-in connectors as fallback
   */
  private getBuiltInConnectors(): ConnectorDefinition[] {
    return [
      {
        id: 'gmail-builtin',
        name: 'Gmail',
        slug: 'gmail',
        category: 'email',
        description: 'Send and receive emails via Gmail',
        iconUrl: 'https://developers.google.com/gmail/images/gmail-icon.png',
        websiteUrl: 'https://gmail.com',
        documentationUrl: 'https://developers.google.com/gmail/api',
        apiBaseUrl: 'https://gmail.googleapis.com/gmail/v1',
        authType: 'oauth2',
        authConfig: {
          oauth2: {
            authUrl: 'https://accounts.google.com/o/oauth2/auth',
            tokenUrl: 'https://oauth2.googleapis.com/token',
            scopes: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'],
            clientIdRequired: true
          }
        },
        triggers: [
          {
            id: 'new_email',
            name: 'New Email',
            description: 'Triggers when a new email is received',
            type: 'polling',
            pollingInterval: 5,
            parameters: [
              {
                name: 'query',
                displayName: 'Search Query',
                description: 'Gmail search query (e.g., "is:unread")',
                type: 'string',
                required: false,
                defaultValue: 'is:unread',
                placeholder: 'is:unread from:example@gmail.com'
              }
            ],
            outputSchema: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                subject: { type: 'string' },
                from: { type: 'string' },
                body: { type: 'string' }
              }
            },
            codeTemplate: `
function checkNewEmails() {
  // {{RATE_LIMITING}}
  
  const query = '{{query}}' || 'is:unread';
  const threads = GmailApp.search(query, 0, 10);
  const emails = [];
  
  threads.forEach(thread => {
    const messages = thread.getMessages();
    messages.forEach(message => {
      emails.push({
        id: message.getId(),
        subject: message.getSubject(),
        from: message.getFrom(),
        to: message.getTo(),
        date: message.getDate(),
        body: message.getPlainBody(),
        isUnread: message.isUnread()
      });
    });
  });
  
  // {{DEDUPLICATION}}
  
  return emails;
}`,
            examples: [
              {
                name: 'Unread emails',
                description: 'Get all unread emails',
                config: { query: 'is:unread' },
                expectedOutput: { id: 'msg123', subject: 'Test', from: 'test@example.com', body: 'Hello' }
              }
            ]
          }
        ],
        actions: [
          {
            id: 'send_email',
            name: 'Send Email',
            description: 'Send an email via Gmail',
            endpoint: '/messages/send',
            method: 'POST',
            parameters: [
              {
                name: 'to',
                displayName: 'To',
                description: 'Recipient email address',
                type: 'string',
                required: true,
                validation: {
                  pattern: '^[^@]+@[^@]+\\.[^@]+$'
                }
              },
              {
                name: 'subject',
                displayName: 'Subject',
                description: 'Email subject',
                type: 'string',
                required: true
              },
              {
                name: 'body',
                displayName: 'Body',
                description: 'Email body content',
                type: 'string',
                required: true
              }
            ],
            codeTemplate: `
function sendEmail() {
  // {{RATE_LIMITING}}
  // {{AUTH_CODE}}
  
  const emailOptions = {
    to: '{{to}}',
    subject: '{{subject}}',
    body: '{{body}}'
  };
  
  MailApp.sendEmail(emailOptions);
  
  return {
    success: true,
    to: emailOptions.to,
    subject: emailOptions.subject,
    sentAt: new Date()
  };
}`,
            examples: [
              {
                name: 'Simple email',
                description: 'Send a basic email',
                input: {
                  to: 'recipient@example.com',
                  subject: 'Test Subject',
                  body: 'Hello, this is a test email.'
                },
                expectedOutput: {
                  success: true,
                  to: 'recipient@example.com',
                  subject: 'Test Subject',
                  sentAt: '2024-01-01T12:00:00Z'
                }
              }
            ]
          }
        ],
        rateLimits: {
          requestsPerMinute: 250,
          requestsPerHour: 1000,
          requestsPerDay: 1000000000
        },
        isActive: true,
        isVerified: true,
        popularity: 1000,
        complexity: 'simple',
        supportLevel: 'official'
      }
      // More built-in connectors would be added here...
    ];
  }
}

export const connectorFramework = new ConnectorFramework();