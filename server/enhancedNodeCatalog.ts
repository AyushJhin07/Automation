// ENHANCED NODE CATALOG - 500+ Apps Support
// Based on ChatGPT's architecture but extended for comprehensive app coverage

import { NodeCatalog, NodeType, AppDefinition, ConnectorDescriptor } from '../shared/nodeGraphSchema';
import { APP_DATABASE } from './complete500Apps';

export class EnhancedNodeCatalog {
  private static instance: EnhancedNodeCatalog;
  private catalog: NodeCatalog;
  private appDefinitions: Map<string, AppDefinition>;
  private connectorDescriptors: Map<string, ConnectorDescriptor>;

  private constructor() {
    this.catalog = this.buildComprehensiveCatalog();
    this.appDefinitions = this.buildAppDefinitions();
    this.connectorDescriptors = this.buildConnectorDescriptors();
  }

  public static getInstance(): EnhancedNodeCatalog {
    if (!EnhancedNodeCatalog.instance) {
      EnhancedNodeCatalog.instance = new EnhancedNodeCatalog();
    }
    return EnhancedNodeCatalog.instance;
  }

  public getNodeCatalog(): NodeCatalog {
    return this.catalog;
  }

  public searchApps(query: string): AppDefinition[] {
    const searchTerm = query.toLowerCase();
    return Array.from(this.appDefinitions.values()).filter(app =>
      app.name.toLowerCase().includes(searchTerm) ||
      app.category.toLowerCase().includes(searchTerm) ||
      app.description.toLowerCase().includes(searchTerm)
    ).sort((a, b) => b.popularity - a.popularity);
  }

  public getAppFunctions(appName: string): NodeType[] {
    const app = this.appDefinitions.get(appName);
    if (!app) return [];
    return [...app.triggers, ...app.actions, ...(app.transforms || [])];
  }

  private buildComprehensiveCatalog(): NodeCatalog {
    const triggers: Record<string, NodeType> = {};
    const transforms: Record<string, NodeType> = {};
    const actions: Record<string, NodeType> = {};

    // Built-in Google Workspace nodes (from ChatGPT spec)
    this.addGoogleWorkspaceNodes(triggers, transforms, actions);
    
    // Add nodes for all 500+ apps from our database
    this.addAllAppNodes(triggers, transforms, actions);

    return {
      triggers,
      transforms,
      actions,
      categories: this.buildCategories()
    };
  }

  private addGoogleWorkspaceNodes(
    triggers: Record<string, NodeType>, 
    transforms: Record<string, NodeType>, 
    actions: Record<string, NodeType>
  ): void {
    // Triggers
    triggers['trigger.time.cron'] = {
      id: 'trigger.time.cron',
      name: 'Time-based Trigger',
      description: 'Run automation on a schedule',
      category: 'trigger',
      app: 'Google Apps Script',
      paramsSchema: {
        type: 'object',
        required: ['interval'],
        properties: {
          everyMinutes: { type: 'number', minimum: 1, maximum: 60 },
          everyHours: { type: 'number', minimum: 1, maximum: 24 },
          cron: { type: 'string', description: 'Cron expression' }
        }
      },
      requiredScopes: ['https://www.googleapis.com/auth/script.scriptapp'],
      icon: 'Clock',
      color: '#4285F4',
      complexity: 'Simple'
    };

    triggers['trigger.webhook.inbound'] = {
      id: 'trigger.webhook.inbound',
      name: 'Webhook Trigger',
      description: 'Receive HTTP requests',
      category: 'trigger',
      app: 'Google Apps Script',
      paramsSchema: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string', description: 'Webhook endpoint path' },
          secret: { type: 'string', description: 'Optional verification secret' }
        }
      },
      requiredScopes: ['https://www.googleapis.com/auth/script.webapp.deploy'],
      icon: 'Webhook',
      color: '#4285F4',
      complexity: 'Medium'
    };

    triggers['trigger.gmail.new_email'] = {
      id: 'trigger.gmail.new_email',
      name: 'New Gmail Email',
      description: 'Trigger when new email arrives',
      category: 'trigger',
      app: 'Gmail',
      paramsSchema: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Gmail search query' },
          watchLabel: { type: 'string', description: 'Label to watch' },
          polling: { type: 'boolean', default: true }
        }
      },
      requiredScopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      icon: 'Mail',
      color: '#EA4335',
      complexity: 'Medium'
    };

    triggers['trigger.sheets.new_row'] = {
      id: 'trigger.sheets.new_row',
      name: 'New Google Sheets Row',
      description: 'Trigger when new row is added',
      category: 'trigger',
      app: 'Google Sheets',
      paramsSchema: {
        type: 'object',
        required: ['spreadsheetId', 'sheetName'],
        properties: {
          spreadsheetId: { type: 'string', description: 'Spreadsheet ID' },
          sheetName: { type: 'string', description: 'Sheet name' }
        }
      },
      requiredScopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      icon: 'Sheet',
      color: '#0F9D58',
      complexity: 'Medium'
    };

    // Transforms
    transforms['transform.filter.expr'] = {
      id: 'transform.filter.expr',
      name: 'Filter Data',
      description: 'Filter items based on condition',
      category: 'transform',
      app: 'Built-in',
      paramsSchema: {
        type: 'object',
        required: ['expression'],
        properties: {
          expression: { type: 'string', description: 'JavaScript filter expression' }
        }
      },
      requiredScopes: [],
      icon: 'Filter',
      color: '#9E9E9E',
      complexity: 'Medium'
    };

    transforms['transform.text.extract_regex'] = {
      id: 'transform.text.extract_regex',
      name: 'Extract Text',
      description: 'Extract text using regex pattern',
      category: 'transform',
      app: 'Built-in',
      paramsSchema: {
        type: 'object',
        required: ['source', 'pattern'],
        properties: {
          source: { type: 'string', description: 'Source field path' },
          pattern: { type: 'string', description: 'Regex pattern' },
          flags: { type: 'string', description: 'Regex flags' }
        }
      },
      requiredScopes: [],
      icon: 'Search',
      color: '#9E9E9E',
      complexity: 'Complex'
    };

    transforms['transform.template.interpolate'] = {
      id: 'transform.template.interpolate',
      name: 'Format Template',
      description: 'Create text from template',
      category: 'transform',
      app: 'Built-in',
      paramsSchema: {
        type: 'object',
        required: ['template'],
        properties: {
          template: { type: 'string', description: 'Template with {{field}} placeholders' },
          bindings: { type: 'object', description: 'Additional data bindings' }
        }
      },
      requiredScopes: [],
      icon: 'Type',
      color: '#9E9E9E',
      complexity: 'Simple'
    };

    transforms['transform.json.path'] = {
      id: 'transform.json.path',
      name: 'Extract JSON Field',
      description: 'Extract field from JSON data',
      category: 'transform',
      app: 'Built-in',
      paramsSchema: {
        type: 'object',
        required: ['source', 'path'],
        properties: {
          source: { type: 'string', description: 'Source field path' },
          path: { type: 'string', description: 'JSON path expression' }
        }
      },
      requiredScopes: [],
      icon: 'Code',
      color: '#9E9E9E',
      complexity: 'Medium'
    };

    // Actions
    actions['action.gmail.send'] = {
      id: 'action.gmail.send',
      name: 'Send Gmail Email',
      description: 'Send email via Gmail',
      category: 'action',
      app: 'Gmail',
      paramsSchema: {
        type: 'object',
        required: ['to', 'subject'],
        properties: {
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string', description: 'Email subject' },
          bodyText: { type: 'string', description: 'Plain text body' },
          bodyHtml: { type: 'string', description: 'HTML body' },
          cc: { type: 'string', description: 'CC recipients' },
          bcc: { type: 'string', description: 'BCC recipients' }
        }
      },
      requiredScopes: ['https://www.googleapis.com/auth/gmail.send'],
      icon: 'Mail',
      color: '#EA4335',
      complexity: 'Simple'
    };

    actions['action.sheets.append_row'] = {
      id: 'action.sheets.append_row',
      name: 'Add Google Sheets Row',
      description: 'Append row to Google Sheets',
      category: 'action',
      app: 'Google Sheets',
      paramsSchema: {
        type: 'object',
        required: ['spreadsheetId', 'sheetName', 'values'],
        properties: {
          spreadsheetId: { type: 'string', description: 'Spreadsheet ID' },
          sheetName: { type: 'string', description: 'Sheet name' },
          values: { type: 'array', description: 'Row values array' }
        }
      },
      requiredScopes: ['https://www.googleapis.com/auth/spreadsheets'],
      icon: 'Sheet',
      color: '#0F9D58',
      complexity: 'Simple'
    };

    actions['action.calendar.create_event'] = {
      id: 'action.calendar.create_event',
      name: 'Create Calendar Event',
      description: 'Create Google Calendar event',
      category: 'action',
      app: 'Google Calendar',
      paramsSchema: {
        type: 'object',
        required: ['title', 'start', 'end'],
        properties: {
          calendarId: { type: 'string', description: 'Calendar ID (default: primary)' },
          title: { type: 'string', description: 'Event title' },
          start: { type: 'string', description: 'Start time (ISO 8601)' },
          end: { type: 'string', description: 'End time (ISO 8601)' },
          attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee emails' },
          description: { type: 'string', description: 'Event description' }
        }
      },
      requiredScopes: ['https://www.googleapis.com/auth/calendar.events'],
      icon: 'Calendar',
      color: '#4285F4',
      complexity: 'Medium'
    };

    actions['action.http.request'] = {
      id: 'action.http.request',
      name: 'HTTP Request',
      description: 'Make HTTP API call',
      category: 'action',
      app: 'Built-in',
      paramsSchema: {
        type: 'object',
        required: ['method', 'url'],
        properties: {
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
          url: { type: 'string', description: 'Request URL' },
          headers: { type: 'object', description: 'HTTP headers' },
          body: { description: 'Request body (JSON or string)' },
          timeoutSec: { type: 'number', default: 30, description: 'Request timeout' }
        }
      },
      requiredScopes: ['https://www.googleapis.com/auth/script.external_request'],
      icon: 'Globe',
      color: '#9E9E9E',
      complexity: 'Medium'
    };
  }

  private addAllAppNodes(
    triggers: Record<string, NodeType>, 
    transforms: Record<string, NodeType>, 
    actions: Record<string, NodeType>
  ): void {
    // Generate nodes for all apps in our database
    APP_DATABASE.forEach(app => {
      // Add common actions for each app
      this.addAppActions(app, actions);
      
      // Add common triggers for apps that support them
      if (app.triggers && app.triggers.length > 0) {
        this.addAppTriggers(app, triggers);
      }
    });
  }

  private addAppActions(app: any, actions: Record<string, NodeType>): void {
    // Generate common actions for each app
    const commonActions = [
      'create', 'update', 'delete', 'list', 'get', 'search'
    ];

    commonActions.forEach(actionType => {
      const nodeId = `action.${app.id.toLowerCase().replace(/\s+/g, '_')}.${actionType}`;
      
      actions[nodeId] = {
        id: nodeId,
        name: `${actionType.charAt(0).toUpperCase()}${actionType.slice(1)} ${app.name}`,
        description: `${actionType.charAt(0).toUpperCase()}${actionType.slice(1)} data in ${app.name}`,
        category: 'action',
        app: app.name,
        paramsSchema: this.generateActionSchema(app, actionType),
        requiredScopes: ['https://www.googleapis.com/auth/script.external_request'],
        icon: this.getAppIcon(app.name),
        color: app.color || '#6366f1',
        complexity: this.getActionComplexity(actionType)
      };
    });
  }

  private addAppTriggers(app: any, triggers: Record<string, NodeType>): void {
    // Generate common triggers for apps that support them
    const commonTriggers = [
      'new_record', 'updated_record', 'deleted_record'
    ];

    commonTriggers.forEach(triggerType => {
      const nodeId = `trigger.${app.id.toLowerCase().replace(/\s+/g, '_')}.${triggerType}`;
      
      triggers[nodeId] = {
        id: nodeId,
        name: `${app.name} ${triggerType.replace(/_/g, ' ')}`,
        description: `Trigger when ${triggerType.replace(/_/g, ' ')} in ${app.name}`,
        category: 'trigger',
        app: app.name,
        paramsSchema: this.generateTriggerSchema(app, triggerType),
        requiredScopes: ['https://www.googleapis.com/auth/script.external_request'],
        icon: this.getAppIcon(app.name),
        color: app.color || '#6366f1',
        complexity: 'Medium'
      };
    });
  }

  private generateActionSchema(app: any, actionType: string): any {
    // Generate dynamic schema based on app and action type
    const baseSchema = {
      type: 'object',
      required: [] as string[],
      properties: {} as Record<string, any>
    };

    // Common properties for all actions
    if (actionType === 'create' || actionType === 'update') {
      baseSchema.properties.data = {
        type: 'object',
        description: `Data to ${actionType} in ${app.name}`
      };
      baseSchema.required.push('data');
    }

    if (actionType === 'get' || actionType === 'update' || actionType === 'delete') {
      baseSchema.properties.id = {
        type: 'string',
        description: `Record ID in ${app.name}`
      };
      baseSchema.required.push('id');
    }

    if (actionType === 'search' || actionType === 'list') {
      baseSchema.properties.query = {
        type: 'string',
        description: `Search query for ${app.name}`
      };
      baseSchema.properties.limit = {
        type: 'number',
        default: 100,
        description: 'Maximum number of results'
      };
    }

    return baseSchema;
  }

  private generateTriggerSchema(app: any, triggerType: string): any {
    return {
      type: 'object',
      required: ['polling'],
      properties: {
        polling: {
          type: 'boolean',
          default: true,
          description: `Enable polling for ${app.name} changes`
        },
        intervalMinutes: {
          type: 'number',
          default: 15,
          minimum: 1,
          description: 'Polling interval in minutes'
        },
        filter: {
          type: 'string',
          description: `Filter criteria for ${app.name} records`
        }
      }
    };
  }

  private getAppIcon(appName: string): string {
    const iconMap: Record<string, string> = {
      'Gmail': 'Mail',
      'Google Sheets': 'Sheet',
      'Google Calendar': 'Calendar',
      'Google Drive': 'FolderOpen',
      'Slack': 'MessageSquare',
      'Salesforce': 'Cloud',
      'HubSpot': 'Heart',
      'Stripe': 'CreditCard',
      'Shopify': 'ShoppingCart',
      'Asana': 'CheckSquare',
      'Trello': 'Trello',
      'Notion': 'FileText',
      'Airtable': 'Database'
    };
    
    return iconMap[appName] || 'Zap';
  }

  private getActionComplexity(actionType: string): 'Simple' | 'Medium' | 'Complex' {
    const complexityMap: Record<string, 'Simple' | 'Medium' | 'Complex'> = {
      'create': 'Simple',
      'update': 'Medium',
      'delete': 'Simple',
      'list': 'Simple',
      'get': 'Simple',
      'search': 'Medium'
    };
    
    return complexityMap[actionType] || 'Medium';
  }

  private buildAppDefinitions(): Map<string, AppDefinition> {
    const definitions = new Map<string, AppDefinition>();
    
    APP_DATABASE.forEach(app => {
      const appDef: AppDefinition = {
        id: app.id,
        name: app.name,
        category: app.category,
        description: app.description || `${app.name} integration`,
        icon: this.getAppIcon(app.name),
        color: app.color || '#6366f1',
        authType: app.authType as any,
        popularity: app.popularity || 50,
        triggers: [],
        actions: [],
        baseUrl: app.baseUrl,
        documentation: app.documentation
      };
      
      definitions.set(app.name, appDef);
    });
    
    return definitions;
  }

  private buildConnectorDescriptors(): Map<string, ConnectorDescriptor> {
    const descriptors = new Map<string, ConnectorDescriptor>();
    
    // Add descriptors for major apps
    const majorApps = ['Slack', 'Salesforce', 'HubSpot', 'Stripe', 'Shopify'];
    
    majorApps.forEach(appName => {
      const descriptor = this.createConnectorDescriptor(appName);
      descriptors.set(appName, descriptor);
    });
    
    return descriptors;
  }

  private createConnectorDescriptor(appName: string): ConnectorDescriptor {
    // Create basic connector descriptor template
    return {
      name: appName,
      auth: {
        type: 'oauth2',
        lib: 'AppsScriptOAuth2',
        configProperties: [`${appName.toUpperCase()}_CLIENT_ID`, `${appName.toUpperCase()}_CLIENT_SECRET`],
        scopes: ['read', 'write']
      },
      actions: {
        post_message: {
          type: `action.${appName.toLowerCase()}.post_message`,
          paramsSchema: {
            type: 'object',
            required: ['message'],
            properties: {
              message: { type: 'string' }
            }
          },
          request: {
            method: 'POST',
            url: `https://api.${appName.toLowerCase()}.com/messages`,
            headers: {
              'Authorization': 'Bearer {{secret:' + appName.toUpperCase() + '_ACCESS_TOKEN}}',
              'Content-Type': 'application/json'
            },
            body: {
              text: '{{params.message}}'
            }
          }
        }
      }
    };
  }

  private buildCategories(): Record<string, string[]> {
    return {
      'Google Workspace': ['Gmail', 'Google Sheets', 'Google Calendar', 'Google Drive'],
      'Communication': ['Slack', 'Microsoft Teams', 'Discord', 'Zoom'],
      'CRM': ['Salesforce', 'HubSpot', 'Pipedrive', 'Zendesk'],
      'E-commerce': ['Shopify', 'WooCommerce', 'Stripe', 'PayPal'],
      'Project Management': ['Asana', 'Trello', 'Monday.com', 'Jira'],
      'Marketing': ['Mailchimp', 'ConvertKit', 'ActiveCampaign'],
      'Data & Analytics': ['Airtable', 'Notion', 'Google Analytics'],
      'Built-in': ['Time Triggers', 'Webhooks', 'Transforms', 'HTTP Requests']
    };
  }
}