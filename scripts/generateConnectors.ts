// CONNECTOR GENERATOR SCRIPT - CREATE JSON FILES FOR BUSINESS APPLICATIONS
// Generates comprehensive connector definitions following ChatGPT's gap analysis

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

interface ConnectorTemplate {
  name: string;
  category: string;
  description: string;
  authType: 'oauth2' | 'api_key' | 'basic';
  scopes: string[];
  actions: ActionTemplate[];
  triggers: TriggerTemplate[];
  rateLimits: {
    requestsPerSecond: number;
    requestsPerMinute: number;
    dailyLimit: number;
  };
  pricing: {
    tier: 'free' | 'premium' | 'enterprise';
    costPerExecution: number;
  };
}

interface ActionTemplate {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, any>;
  requiredScopes: string[];
}

interface TriggerTemplate {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, any>;
  requiredScopes: string[];
}

class ConnectorGenerator {
  private connectorsPath: string;

  constructor() {
    this.connectorsPath = join(process.cwd(), 'connectors');
    
    // Ensure connectors directory exists
    if (!existsSync(this.connectorsPath)) {
      mkdirSync(this.connectorsPath, { recursive: true });
    }
  }

  /**
   * Generate all business-critical connector files
   */
  generateAllConnectors(): void {
    console.log('🏭 Generating business-critical connector files...\n');

    const connectors = this.getBusinessCriticalConnectors();
    
    connectors.forEach(connector => {
      this.generateConnectorFile(connector);
    });

    console.log(`\n✅ Generated ${connectors.length} connector files successfully!`);
  }

  /**
   * Get business-critical connector templates
   */
  private getBusinessCriticalConnectors(): ConnectorTemplate[] {
    return [
      // CRM & Sales
      {
        name: 'Salesforce',
        category: 'crm',
        description: 'Salesforce CRM platform with comprehensive sales and customer management',
        authType: 'oauth2',
        scopes: ['api', 'refresh_token', 'full'],
        actions: [
          {
            id: 'create_lead',
            name: 'Create Lead',
            description: 'Create a new lead in Salesforce',
            parameters: {
              firstName: { type: 'string', required: true, description: 'Lead first name' },
              lastName: { type: 'string', required: true, description: 'Lead last name' },
              email: { type: 'string', required: true, description: 'Lead email' },
              company: { type: 'string', required: true, description: 'Lead company' },
              phone: { type: 'string', required: false, description: 'Lead phone' },
              status: { type: 'string', required: false, description: 'Lead status', options: ['New', 'Working', 'Qualified', 'Unqualified'] }
            },
            requiredScopes: ['api']
          },
          {
            id: 'create_opportunity',
            name: 'Create Opportunity',
            description: 'Create a new sales opportunity',
            parameters: {
              name: { type: 'string', required: true, description: 'Opportunity name' },
              accountId: { type: 'string', required: true, description: 'Account ID' },
              amount: { type: 'number', required: false, description: 'Opportunity amount' },
              closeDate: { type: 'string', required: true, description: 'Expected close date' },
              stageName: { type: 'string', required: true, description: 'Sales stage' }
            },
            requiredScopes: ['api']
          },
          {
            id: 'update_contact',
            name: 'Update Contact',
            description: 'Update contact information',
            parameters: {
              contactId: { type: 'string', required: true, description: 'Contact ID' },
              firstName: { type: 'string', required: false, description: 'First name' },
              lastName: { type: 'string', required: false, description: 'Last name' },
              email: { type: 'string', required: false, description: 'Email address' },
              phone: { type: 'string', required: false, description: 'Phone number' }
            },
            requiredScopes: ['api']
          },
          {
            id: 'create_task',
            name: 'Create Task',
            description: 'Create a new task',
            parameters: {
              subject: { type: 'string', required: true, description: 'Task subject' },
              description: { type: 'string', required: false, description: 'Task description' },
              whoId: { type: 'string', required: false, description: 'Related contact/lead ID' },
              whatId: { type: 'string', required: false, description: 'Related account/opportunity ID' },
              activityDate: { type: 'string', required: false, description: 'Due date' },
              priority: { type: 'string', required: false, description: 'Task priority', options: ['High', 'Normal', 'Low'] }
            },
            requiredScopes: ['api']
          }
        ],
        triggers: [
          {
            id: 'lead_created',
            name: 'Lead Created',
            description: 'Trigger when new lead is created',
            parameters: {
              source: { type: 'string', required: false, description: 'Filter by lead source' }
            },
            requiredScopes: ['api']
          },
          {
            id: 'opportunity_closed',
            name: 'Opportunity Closed',
            description: 'Trigger when opportunity is closed',
            parameters: {
              stage: { type: 'string', required: false, description: 'Filter by stage', options: ['Closed Won', 'Closed Lost'] }
            },
            requiredScopes: ['api']
          }
        ],
        rateLimits: { requestsPerSecond: 5, requestsPerMinute: 100, dailyLimit: 100000 },
        pricing: { tier: 'premium', costPerExecution: 0.002 }
      },

      // Marketing & Email
      {
        name: 'Mailchimp',
        category: 'marketing',
        description: 'Mailchimp email marketing platform with audience and campaign management',
        authType: 'oauth2',
        scopes: ['read', 'write'],
        actions: [
          {
            id: 'add_subscriber',
            name: 'Add Subscriber',
            description: 'Add subscriber to mailing list',
            parameters: {
              listId: { type: 'string', required: true, description: 'Mailing list ID' },
              email: { type: 'string', required: true, description: 'Subscriber email' },
              firstName: { type: 'string', required: false, description: 'First name' },
              lastName: { type: 'string', required: false, description: 'Last name' },
              status: { type: 'string', required: false, description: 'Subscription status', options: ['subscribed', 'unsubscribed', 'cleaned', 'pending'], default: 'subscribed' },
              tags: { type: 'array', required: false, description: 'Subscriber tags' }
            },
            requiredScopes: ['write']
          },
          {
            id: 'create_campaign',
            name: 'Create Campaign',
            description: 'Create email campaign',
            parameters: {
              type: { type: 'string', required: true, description: 'Campaign type', options: ['regular', 'plaintext', 'absplit', 'rss', 'variate'] },
              listId: { type: 'string', required: true, description: 'Audience list ID' },
              subject: { type: 'string', required: true, description: 'Email subject' },
              fromName: { type: 'string', required: true, description: 'From name' },
              fromEmail: { type: 'string', required: true, description: 'From email' },
              content: { type: 'string', required: true, description: 'Email content' }
            },
            requiredScopes: ['write']
          },
          {
            id: 'send_campaign',
            name: 'Send Campaign',
            description: 'Send email campaign',
            parameters: {
              campaignId: { type: 'string', required: true, description: 'Campaign ID' }
            },
            requiredScopes: ['write']
          },
          {
            id: 'update_subscriber',
            name: 'Update Subscriber',
            description: 'Update subscriber information',
            parameters: {
              listId: { type: 'string', required: true, description: 'List ID' },
              email: { type: 'string', required: true, description: 'Subscriber email' },
              firstName: { type: 'string', required: false, description: 'First name' },
              lastName: { type: 'string', required: false, description: 'Last name' },
              status: { type: 'string', required: false, description: 'Subscription status' }
            },
            requiredScopes: ['write']
          }
        ],
        triggers: [
          {
            id: 'subscriber_added',
            name: 'Subscriber Added',
            description: 'Trigger when new subscriber is added',
            parameters: {
              listId: { type: 'string', required: false, description: 'Filter by list ID' }
            },
            requiredScopes: ['read']
          },
          {
            id: 'campaign_sent',
            name: 'Campaign Sent',
            description: 'Trigger when campaign is sent',
            parameters: {
              campaignType: { type: 'string', required: false, description: 'Filter by campaign type' }
            },
            requiredScopes: ['read']
          }
        ],
        rateLimits: { requestsPerSecond: 3, requestsPerMinute: 60, dailyLimit: 50000 },
        pricing: { tier: 'premium', costPerExecution: 0.001 }
      },

      // Payment Processing
      {
        name: 'Stripe',
        category: 'payments',
        description: 'Stripe payment processing platform with comprehensive financial operations',
        authType: 'api_key',
        scopes: ['read_write'],
        actions: [
          {
            id: 'create_customer',
            name: 'Create Customer',
            description: 'Create a new customer',
            parameters: {
              email: { type: 'string', required: true, description: 'Customer email' },
              name: { type: 'string', required: false, description: 'Customer name' },
              phone: { type: 'string', required: false, description: 'Customer phone' },
              description: { type: 'string', required: false, description: 'Customer description' },
              metadata: { type: 'object', required: false, description: 'Custom metadata' }
            },
            requiredScopes: ['read_write']
          },
          {
            id: 'create_payment_intent',
            name: 'Create Payment Intent',
            description: 'Create a payment intent',
            parameters: {
              amount: { type: 'number', required: true, description: 'Payment amount in cents' },
              currency: { type: 'string', required: true, description: 'Currency code', default: 'usd' },
              customerId: { type: 'string', required: false, description: 'Customer ID' },
              description: { type: 'string', required: false, description: 'Payment description' },
              metadata: { type: 'object', required: false, description: 'Custom metadata' }
            },
            requiredScopes: ['read_write']
          },
          {
            id: 'create_subscription',
            name: 'Create Subscription',
            description: 'Create a subscription',
            parameters: {
              customerId: { type: 'string', required: true, description: 'Customer ID' },
              priceId: { type: 'string', required: true, description: 'Price ID' },
              trialPeriodDays: { type: 'number', required: false, description: 'Trial period in days' },
              metadata: { type: 'object', required: false, description: 'Custom metadata' }
            },
            requiredScopes: ['read_write']
          },
          {
            id: 'create_refund',
            name: 'Create Refund',
            description: 'Create a refund',
            parameters: {
              paymentIntentId: { type: 'string', required: true, description: 'Payment intent ID' },
              amount: { type: 'number', required: false, description: 'Refund amount in cents' },
              reason: { type: 'string', required: false, description: 'Refund reason', options: ['duplicate', 'fraudulent', 'requested_by_customer'] }
            },
            requiredScopes: ['read_write']
          }
        ],
        triggers: [
          {
            id: 'payment_succeeded',
            name: 'Payment Succeeded',
            description: 'Trigger when payment is successful',
            parameters: {
              minAmount: { type: 'number', required: false, description: 'Minimum amount filter' }
            },
            requiredScopes: ['read_write']
          },
          {
            id: 'subscription_created',
            name: 'Subscription Created',
            description: 'Trigger when new subscription is created',
            parameters: {},
            requiredScopes: ['read_write']
          }
        ],
        rateLimits: { requestsPerSecond: 25, requestsPerMinute: 100, dailyLimit: 1000000 },
        pricing: { tier: 'premium', costPerExecution: 0.001 }
      },

      // Communication
      {
        name: 'Twilio',
        category: 'communication',
        description: 'Twilio communication platform for SMS, voice, and messaging',
        authType: 'api_key',
        scopes: ['messaging', 'voice'],
        actions: [
          {
            id: 'send_sms',
            name: 'Send SMS',
            description: 'Send SMS message',
            parameters: {
              to: { type: 'string', required: true, description: 'Recipient phone number' },
              from: { type: 'string', required: true, description: 'Sender phone number' },
              body: { type: 'string', required: true, description: 'Message body' },
              mediaUrl: { type: 'string', required: false, description: 'Media URL for MMS' }
            },
            requiredScopes: ['messaging']
          },
          {
            id: 'make_call',
            name: 'Make Call',
            description: 'Initiate phone call',
            parameters: {
              to: { type: 'string', required: true, description: 'Recipient phone number' },
              from: { type: 'string', required: true, description: 'Caller phone number' },
              url: { type: 'string', required: true, description: 'TwiML URL for call instructions' }
            },
            requiredScopes: ['voice']
          },
          {
            id: 'send_whatsapp',
            name: 'Send WhatsApp Message',
            description: 'Send WhatsApp message',
            parameters: {
              to: { type: 'string', required: true, description: 'Recipient WhatsApp number' },
              from: { type: 'string', required: true, description: 'Sender WhatsApp number' },
              body: { type: 'string', required: true, description: 'Message body' }
            },
            requiredScopes: ['messaging']
          }
        ],
        triggers: [
          {
            id: 'message_received',
            name: 'Message Received',
            description: 'Trigger when SMS is received',
            parameters: {
              from: { type: 'string', required: false, description: 'Filter by sender number' }
            },
            requiredScopes: ['messaging']
          },
          {
            id: 'call_completed',
            name: 'Call Completed',
            description: 'Trigger when call ends',
            parameters: {
              minDuration: { type: 'number', required: false, description: 'Minimum call duration' }
            },
            requiredScopes: ['voice']
          }
        ],
        rateLimits: { requestsPerSecond: 1, requestsPerMinute: 60, dailyLimit: 10000 },
        pricing: { tier: 'premium', costPerExecution: 0.005 }
      },

      // Cloud Storage
      {
        name: 'Dropbox',
        category: 'storage',
        description: 'Dropbox cloud storage platform with file management capabilities',
        authType: 'oauth2',
        scopes: ['files.content.write', 'files.content.read', 'files.metadata.read'],
        actions: [
          {
            id: 'upload_file',
            name: 'Upload File',
            description: 'Upload file to Dropbox',
            parameters: {
              path: { type: 'string', required: true, description: 'File path in Dropbox' },
              content: { type: 'string', required: true, description: 'File content (base64 encoded)' },
              mode: { type: 'string', required: false, description: 'Upload mode', options: ['add', 'overwrite', 'update'], default: 'add' }
            },
            requiredScopes: ['files.content.write']
          },
          {
            id: 'download_file',
            name: 'Download File',
            description: 'Download file from Dropbox',
            parameters: {
              path: { type: 'string', required: true, description: 'File path in Dropbox' }
            },
            requiredScopes: ['files.content.read']
          },
          {
            id: 'create_folder',
            name: 'Create Folder',
            description: 'Create new folder',
            parameters: {
              path: { type: 'string', required: true, description: 'Folder path' },
              autorename: { type: 'boolean', required: false, description: 'Auto-rename if exists', default: false }
            },
            requiredScopes: ['files.content.write']
          },
          {
            id: 'list_files',
            name: 'List Files',
            description: 'List files in folder',
            parameters: {
              path: { type: 'string', required: false, description: 'Folder path', default: '' },
              recursive: { type: 'boolean', required: false, description: 'Include subfolders', default: false },
              limit: { type: 'number', required: false, description: 'Maximum files to return', default: 2000 }
            },
            requiredScopes: ['files.metadata.read']
          },
          {
            id: 'share_file',
            name: 'Share File',
            description: 'Create shareable link for file',
            parameters: {
              path: { type: 'string', required: true, description: 'File path' },
              settings: { type: 'object', required: false, description: 'Sharing settings' }
            },
            requiredScopes: ['sharing.write']
          }
        ],
        triggers: [
          {
            id: 'file_uploaded',
            name: 'File Uploaded',
            description: 'Trigger when file is uploaded',
            parameters: {
              path: { type: 'string', required: false, description: 'Monitor specific path' }
            },
            requiredScopes: ['files.metadata.read']
          },
          {
            id: 'file_modified',
            name: 'File Modified',
            description: 'Trigger when file is modified',
            parameters: {
              path: { type: 'string', required: false, description: 'Monitor specific path' }
            },
            requiredScopes: ['files.metadata.read']
          }
        ],
        rateLimits: { requestsPerSecond: 5, requestsPerMinute: 120, dailyLimit: 100000 },
        pricing: { tier: 'premium', costPerExecution: 0.001 }
      },

      // Database & Productivity
      {
        name: 'Airtable',
        category: 'database',
        description: 'Airtable database platform with spreadsheet-like interface',
        authType: 'api_key',
        scopes: ['data:read', 'data:write'],
        actions: [
          {
            id: 'create_record',
            name: 'Create Record',
            description: 'Create new record in table',
            parameters: {
              baseId: { type: 'string', required: true, description: 'Base ID' },
              tableId: { type: 'string', required: true, description: 'Table ID' },
              fields: { type: 'object', required: true, description: 'Record fields' }
            },
            requiredScopes: ['data:write']
          },
          {
            id: 'update_record',
            name: 'Update Record',
            description: 'Update existing record',
            parameters: {
              baseId: { type: 'string', required: true, description: 'Base ID' },
              tableId: { type: 'string', required: true, description: 'Table ID' },
              recordId: { type: 'string', required: true, description: 'Record ID' },
              fields: { type: 'object', required: true, description: 'Updated fields' }
            },
            requiredScopes: ['data:write']
          },
          {
            id: 'delete_record',
            name: 'Delete Record',
            description: 'Delete record from table',
            parameters: {
              baseId: { type: 'string', required: true, description: 'Base ID' },
              tableId: { type: 'string', required: true, description: 'Table ID' },
              recordId: { type: 'string', required: true, description: 'Record ID' }
            },
            requiredScopes: ['data:write']
          },
          {
            id: 'list_records',
            name: 'List Records',
            description: 'List records from table',
            parameters: {
              baseId: { type: 'string', required: true, description: 'Base ID' },
              tableId: { type: 'string', required: true, description: 'Table ID' },
              maxRecords: { type: 'number', required: false, description: 'Maximum records', default: 100 },
              view: { type: 'string', required: false, description: 'View name' },
              filterByFormula: { type: 'string', required: false, description: 'Filter formula' }
            },
            requiredScopes: ['data:read']
          }
        ],
        triggers: [
          {
            id: 'record_created',
            name: 'Record Created',
            description: 'Trigger when new record is created',
            parameters: {
              baseId: { type: 'string', required: true, description: 'Base ID' },
              tableId: { type: 'string', required: true, description: 'Table ID' }
            },
            requiredScopes: ['data:read']
          },
          {
            id: 'record_updated',
            name: 'Record Updated',
            description: 'Trigger when record is updated',
            parameters: {
              baseId: { type: 'string', required: true, description: 'Base ID' },
              tableId: { type: 'string', required: true, description: 'Table ID' }
            },
            requiredScopes: ['data:read']
          }
        ],
        rateLimits: { requestsPerSecond: 5, requestsPerMinute: 100, dailyLimit: 50000 },
        pricing: { tier: 'premium', costPerExecution: 0.001 }
      },

      // Development & Version Control
      {
        name: 'GitHub',
        category: 'development',
        description: 'GitHub version control and collaboration platform',
        authType: 'oauth2',
        scopes: ['repo', 'issues', 'pull_requests'],
        actions: [
          {
            id: 'create_issue',
            name: 'Create Issue',
            description: 'Create new GitHub issue',
            parameters: {
              owner: { type: 'string', required: true, description: 'Repository owner' },
              repo: { type: 'string', required: true, description: 'Repository name' },
              title: { type: 'string', required: true, description: 'Issue title' },
              body: { type: 'string', required: false, description: 'Issue description' },
              labels: { type: 'array', required: false, description: 'Issue labels' },
              assignees: { type: 'array', required: false, description: 'Issue assignees' }
            },
            requiredScopes: ['issues']
          },
          {
            id: 'create_pull_request',
            name: 'Create Pull Request',
            description: 'Create new pull request',
            parameters: {
              owner: { type: 'string', required: true, description: 'Repository owner' },
              repo: { type: 'string', required: true, description: 'Repository name' },
              title: { type: 'string', required: true, description: 'PR title' },
              head: { type: 'string', required: true, description: 'Head branch' },
              base: { type: 'string', required: true, description: 'Base branch' },
              body: { type: 'string', required: false, description: 'PR description' }
            },
            requiredScopes: ['pull_requests']
          },
          {
            id: 'add_comment',
            name: 'Add Comment',
            description: 'Add comment to issue or PR',
            parameters: {
              owner: { type: 'string', required: true, description: 'Repository owner' },
              repo: { type: 'string', required: true, description: 'Repository name' },
              issueNumber: { type: 'number', required: true, description: 'Issue/PR number' },
              body: { type: 'string', required: true, description: 'Comment body' }
            },
            requiredScopes: ['issues']
          }
        ],
        triggers: [
          {
            id: 'issue_opened',
            name: 'Issue Opened',
            description: 'Trigger when issue is opened',
            parameters: {
              owner: { type: 'string', required: true, description: 'Repository owner' },
              repo: { type: 'string', required: true, description: 'Repository name' }
            },
            requiredScopes: ['issues']
          },
          {
            id: 'pull_request_opened',
            name: 'Pull Request Opened',
            description: 'Trigger when PR is opened',
            parameters: {
              owner: { type: 'string', required: true, description: 'Repository owner' },
              repo: { type: 'string', required: true, description: 'Repository name' }
            },
            requiredScopes: ['pull_requests']
          }
        ],
        rateLimits: { requestsPerSecond: 5, requestsPerMinute: 5000, dailyLimit: 5000 },
        pricing: { tier: 'free', costPerExecution: 0 }
      },

      // Project Management
      {
        name: 'Notion',
        category: 'productivity',
        description: 'Notion workspace platform for notes, databases, and collaboration',
        authType: 'oauth2',
        scopes: ['read', 'write'],
        actions: [
          {
            id: 'create_page',
            name: 'Create Page',
            description: 'Create new Notion page',
            parameters: {
              parent: { type: 'object', required: true, description: 'Parent page or database' },
              properties: { type: 'object', required: true, description: 'Page properties' },
              children: { type: 'array', required: false, description: 'Page content blocks' }
            },
            requiredScopes: ['write']
          },
          {
            id: 'update_page',
            name: 'Update Page',
            description: 'Update existing page',
            parameters: {
              pageId: { type: 'string', required: true, description: 'Page ID' },
              properties: { type: 'object', required: false, description: 'Updated properties' }
            },
            requiredScopes: ['write']
          },
          {
            id: 'create_database_entry',
            name: 'Create Database Entry',
            description: 'Create entry in Notion database',
            parameters: {
              databaseId: { type: 'string', required: true, description: 'Database ID' },
              properties: { type: 'object', required: true, description: 'Entry properties' }
            },
            requiredScopes: ['write']
          },
          {
            id: 'query_database',
            name: 'Query Database',
            description: 'Query Notion database',
            parameters: {
              databaseId: { type: 'string', required: true, description: 'Database ID' },
              filter: { type: 'object', required: false, description: 'Query filter' },
              sorts: { type: 'array', required: false, description: 'Sort criteria' }
            },
            requiredScopes: ['read']
          }
        ],
        triggers: [
          {
            id: 'page_created',
            name: 'Page Created',
            description: 'Trigger when page is created',
            parameters: {
              parentId: { type: 'string', required: false, description: 'Filter by parent' }
            },
            requiredScopes: ['read']
          },
          {
            id: 'database_entry_created',
            name: 'Database Entry Created',
            description: 'Trigger when database entry is created',
            parameters: {
              databaseId: { type: 'string', required: true, description: 'Database ID' }
            },
            requiredScopes: ['read']
          }
        ],
        rateLimits: { requestsPerSecond: 3, requestsPerMinute: 100, dailyLimit: 10000 },
        pricing: { tier: 'premium', costPerExecution: 0.001 }
      }
    ];
  }

  /**
   * Generate connector JSON file
   */
  private generateConnectorFile(template: ConnectorTemplate): void {
    const filename = `${template.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    const filepath = join(this.connectorsPath, filename);

    const connector = {
      name: template.name,
      category: template.category,
      description: template.description,
      version: '1.0.0',
      authentication: {
        type: template.authType,
        config: this.getAuthConfig(template.authType, template.scopes)
      },
      actions: template.actions,
      triggers: template.triggers,
      rateLimits: template.rateLimits,
      pricing: template.pricing
    };

    try {
      writeFileSync(filepath, JSON.stringify(connector, null, 2));
      console.log(`✅ Generated ${filename} (${template.actions.length} actions, ${template.triggers.length} triggers)`);
    } catch (error) {
      console.error(`❌ Failed to generate ${filename}:`, error);
    }
  }

  /**
   * Get authentication configuration
   */
  private getAuthConfig(authType: string, scopes: string[]): any {
    switch (authType) {
      case 'oauth2':
        return {
          authUrl: 'https://api.example.com/oauth/authorize',
          tokenUrl: 'https://api.example.com/oauth/token',
          scopes
        };
      case 'api_key':
        return {
          type: 'header',
          name: 'Authorization',
          prefix: 'Bearer'
        };
      case 'basic':
        return {
          type: 'basic_auth'
        };
      default:
        return {};
    }
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const generator = new ConnectorGenerator();
  generator.generateAllConnectors();
}