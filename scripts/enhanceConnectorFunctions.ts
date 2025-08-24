// CONNECTOR FUNCTION ENHANCER - ADD MISSING FUNCTIONS FROM CHATGPT GAP ANALYSIS
// Adds comprehensive missing functions to existing connector files

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

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

interface ConnectorData {
  id: string;
  name: string;
  description: string;
  category: string;
  actions: ConnectorFunction[];
  triggers: ConnectorFunction[];
  [key: string]: any;
}

export class ConnectorFunctionEnhancer {
  private connectorsPath: string;

  constructor() {
    this.connectorsPath = join(process.cwd(), 'connectors');
  }

  /**
   * Enhance all connectors with missing functions
   */
  async enhanceAllConnectors(): Promise<{ enhanced: number; errors: string[] }> {
    console.log('🚀 Enhancing connectors with missing functions from ChatGPT gap analysis...\n');
    
    const results = {
      enhanced: 0,
      errors: [] as string[]
    };

    try {
      // Enhance each connector
      await this.enhanceSlack(results);
      await this.enhanceJira(results);
      await this.enhanceHubSpot(results);
      await this.enhanceGmail(results);
      await this.enhanceShopify(results);

      console.log(`\n🎯 Enhancement complete: ${results.enhanced} connectors enhanced, ${results.errors.length} errors`);
      return results;

    } catch (error) {
      const errorMsg = `Enhancement failed: ${error}`;
      console.error(`💥 ${errorMsg}`);
      results.errors.push(errorMsg);
      return results;
    }
  }

  /**
   * Enhance Slack with missing functions
   */
  private async enhanceSlack(results: { enhanced: number; errors: string[] }): Promise<void> {
    try {
      console.log('📱 Enhancing Slack connector...');
      
      const connector = this.loadConnector('slack.json');
      
      // Missing Actions from ChatGPT analysis
      const missingActions: ConnectorFunction[] = [
        {
          id: "reply_in_thread",
          name: "Reply in Thread",
          description: "Reply to a message in a thread",
          endpoint: "/chat.postMessage",
          method: "POST",
          params: {
            channel: { type: "string", required: true, description: "Channel ID" },
            thread_ts: { type: "string", required: true, description: "Timestamp of parent message" },
            text: { type: "string", required: true, description: "Reply text" }
          },
          requiredScopes: ["chat:write"]
        },
        {
          id: "update_message",
          name: "Update Message",
          description: "Update an existing message",
          endpoint: "/chat.update",
          method: "POST",
          params: {
            channel: { type: "string", required: true, description: "Channel ID" },
            ts: { type: "string", required: true, description: "Message timestamp" },
            text: { type: "string", required: true, description: "New message text" }
          },
          requiredScopes: ["chat:write"]
        },
        {
          id: "delete_message",
          name: "Delete Message",
          description: "Delete a message",
          endpoint: "/chat.delete",
          method: "POST",
          params: {
            channel: { type: "string", required: true, description: "Channel ID" },
            ts: { type: "string", required: true, description: "Message timestamp" }
          },
          requiredScopes: ["chat:write"]
        },
        {
          id: "schedule_message",
          name: "Schedule Message",
          description: "Schedule a message to be sent later",
          endpoint: "/chat.scheduleMessage",
          method: "POST",
          params: {
            channel: { type: "string", required: true, description: "Channel ID" },
            text: { type: "string", required: true, description: "Message text" },
            post_at: { type: "number", required: true, description: "Unix timestamp when to send" }
          },
          requiredScopes: ["chat:write"]
        },
        {
          id: "pin_message",
          name: "Pin Message",
          description: "Pin a message to a channel",
          endpoint: "/pins.add",
          method: "POST",
          params: {
            channel: { type: "string", required: true, description: "Channel ID" },
            timestamp: { type: "string", required: true, description: "Message timestamp" }
          },
          requiredScopes: ["pins:write"]
        },
        {
          id: "unpin_message",
          name: "Unpin Message",
          description: "Unpin a message from a channel",
          endpoint: "/pins.remove",
          method: "POST",
          params: {
            channel: { type: "string", required: true, description: "Channel ID" },
            timestamp: { type: "string", required: true, description: "Message timestamp" }
          },
          requiredScopes: ["pins:write"]
        },
        {
          id: "remove_reaction",
          name: "Remove Reaction",
          description: "Remove a reaction from a message",
          endpoint: "/reactions.remove",
          method: "POST",
          params: {
            channel: { type: "string", required: true, description: "Channel ID" },
            timestamp: { type: "string", required: true, description: "Message timestamp" },
            name: { type: "string", required: true, description: "Reaction emoji name" }
          },
          requiredScopes: ["reactions:write"]
        },
        {
          id: "list_users",
          name: "List Users",
          description: "Get a list of workspace users",
          endpoint: "/users.list",
          method: "GET",
          params: {
            limit: { type: "number", required: false, description: "Maximum number of users to return", default: 100 }
          },
          requiredScopes: ["users:read"]
        },
        {
          id: "list_channels",
          name: "List Channels",
          description: "Get a list of channels",
          endpoint: "/conversations.list",
          method: "GET",
          params: {
            types: { type: "string", required: false, description: "Channel types to include", default: "public_channel,private_channel" },
            limit: { type: "number", required: false, description: "Maximum number of channels to return", default: 100 }
          },
          requiredScopes: ["channels:read"]
        },
        {
          id: "archive_channel",
          name: "Archive Channel",
          description: "Archive a channel",
          endpoint: "/conversations.archive",
          method: "POST",
          params: {
            channel: { type: "string", required: true, description: "Channel ID to archive" }
          },
          requiredScopes: ["channels:write"]
        }
      ];

      // Missing Triggers from ChatGPT analysis
      const missingTriggers: ConnectorFunction[] = [
        {
          id: "message_edited",
          name: "Message Edited",
          description: "Triggered when a message is edited",
          params: {
            channel: { type: "string", required: false, description: "Filter by channel ID" }
          },
          requiredScopes: ["channels:history"]
        },
        {
          id: "reaction_removed",
          name: "Reaction Removed",
          description: "Triggered when a reaction is removed from a message",
          params: {
            channel: { type: "string", required: false, description: "Filter by channel ID" }
          },
          requiredScopes: ["reactions:read"]
        },
        {
          id: "file_uploaded",
          name: "File Uploaded",
          description: "Triggered when a file is uploaded",
          params: {
            channel: { type: "string", required: false, description: "Filter by channel ID" }
          },
          requiredScopes: ["files:read"]
        },
        {
          id: "user_left",
          name: "User Left",
          description: "Triggered when a user leaves the workspace",
          params: {},
          requiredScopes: ["users:read"]
        },
        {
          id: "channel_archived",
          name: "Channel Archived",
          description: "Triggered when a channel is archived",
          params: {},
          requiredScopes: ["channels:read"]
        }
      ];

      // Add missing functions
      connector.actions.push(...missingActions);
      connector.triggers.push(...missingTriggers);

      this.saveConnector('slack.json', connector);
      console.log(`✅ Enhanced Slack: +${missingActions.length} actions, +${missingTriggers.length} triggers`);
      results.enhanced++;

    } catch (error) {
      const errorMsg = `Failed to enhance Slack: ${error}`;
      console.error(`❌ ${errorMsg}`);
      results.errors.push(errorMsg);
    }
  }

  /**
   * Enhance Jira with missing functions
   */
  private async enhanceJira(results: { enhanced: number; errors: string[] }): Promise<void> {
    try {
      console.log('🎫 Enhancing Jira connector...');
      
      const connector = this.loadConnector('jira.json');
      
      // Missing Actions from ChatGPT analysis
      const missingActions: ConnectorFunction[] = [
        {
          id: "assign_issue",
          name: "Assign Issue",
          description: "Assign an issue to a user",
          endpoint: "/rest/api/3/issue/{issueIdOrKey}/assignee",
          method: "PUT",
          params: {
            issueKey: { type: "string", required: true, description: "Issue key or ID" },
            accountId: { type: "string", required: true, description: "Account ID of assignee" }
          },
          requiredScopes: ["write:jira-work"]
        },
        {
          id: "add_watcher",
          name: "Add Watcher",
          description: "Add a watcher to an issue",
          endpoint: "/rest/api/3/issue/{issueIdOrKey}/watchers",
          method: "POST",
          params: {
            issueKey: { type: "string", required: true, description: "Issue key or ID" },
            accountId: { type: "string", required: true, description: "Account ID of watcher" }
          },
          requiredScopes: ["write:jira-work"]
        },
        {
          id: "add_attachment",
          name: "Add Attachment",
          description: "Add an attachment to an issue",
          endpoint: "/rest/api/3/issue/{issueIdOrKey}/attachments",
          method: "POST",
          params: {
            issueKey: { type: "string", required: true, description: "Issue key or ID" },
            file: { type: "string", required: true, description: "File to attach" }
          },
          requiredScopes: ["write:jira-work"]
        },
        {
          id: "link_issues",
          name: "Link Issues",
          description: "Create a link between two issues",
          endpoint: "/rest/api/3/issueLink",
          method: "POST",
          params: {
            inwardIssue: { type: "string", required: true, description: "Key of inward issue" },
            outwardIssue: { type: "string", required: true, description: "Key of outward issue" },
            linkType: { type: "string", required: true, description: "Link type name" }
          },
          requiredScopes: ["write:jira-work"]
        },
        {
          id: "add_label",
          name: "Add Label",
          description: "Add a label to an issue",
          endpoint: "/rest/api/3/issue/{issueIdOrKey}",
          method: "PUT",
          params: {
            issueKey: { type: "string", required: true, description: "Issue key or ID" },
            label: { type: "string", required: true, description: "Label to add" }
          },
          requiredScopes: ["write:jira-work"]
        },
        {
          id: "add_worklog",
          name: "Add Worklog",
          description: "Log work on an issue",
          endpoint: "/rest/api/3/issue/{issueIdOrKey}/worklog",
          method: "POST",
          params: {
            issueKey: { type: "string", required: true, description: "Issue key or ID" },
            timeSpent: { type: "string", required: true, description: "Time spent (e.g., '1h 30m')" },
            comment: { type: "string", required: false, description: "Work description" }
          },
          requiredScopes: ["write:jira-work"]
        },
        {
          id: "create_subtask",
          name: "Create Subtask",
          description: "Create a subtask for an issue",
          endpoint: "/rest/api/3/issue",
          method: "POST",
          params: {
            parentKey: { type: "string", required: true, description: "Parent issue key" },
            summary: { type: "string", required: true, description: "Subtask summary" },
            description: { type: "string", required: false, description: "Subtask description" },
            assignee: { type: "string", required: false, description: "Assignee account ID" }
          },
          requiredScopes: ["write:jira-work"]
        }
      ];

      // Missing Triggers from ChatGPT analysis
      const missingTriggers: ConnectorFunction[] = [
        {
          id: "issue_deleted",
          name: "Issue Deleted",
          description: "Triggered when an issue is deleted",
          params: {
            projectKey: { type: "string", required: false, description: "Filter by project key" }
          },
          requiredScopes: ["read:jira-work"]
        },
        {
          id: "issue_commented",
          name: "Issue Commented",
          description: "Triggered when a comment is added to an issue",
          params: {
            projectKey: { type: "string", required: false, description: "Filter by project key" }
          },
          requiredScopes: ["read:jira-work"]
        },
        {
          id: "sprint_started",
          name: "Sprint Started",
          description: "Triggered when a sprint is started",
          params: {
            boardId: { type: "string", required: false, description: "Filter by board ID" }
          },
          requiredScopes: ["read:jira-work"]
        }
      ];

      // Add missing functions
      connector.actions.push(...missingActions);
      connector.triggers.push(...missingTriggers);

      this.saveConnector('jira.json', connector);
      console.log(`✅ Enhanced Jira: +${missingActions.length} actions, +${missingTriggers.length} triggers`);
      results.enhanced++;

    } catch (error) {
      const errorMsg = `Failed to enhance Jira: ${error}`;
      console.error(`❌ ${errorMsg}`);
      results.errors.push(errorMsg);
    }
  }

  /**
   * Enhance HubSpot with missing functions
   */
  private async enhanceHubSpot(results: { enhanced: number; errors: string[] }): Promise<void> {
    try {
      console.log('🏢 Enhancing HubSpot connector...');
      
      const connector = this.loadConnector('hubspot.json');
      
      // Missing Actions from ChatGPT analysis
      const missingActions: ConnectorFunction[] = [
        {
          id: "delete_contact",
          name: "Delete Contact",
          description: "Delete a contact from HubSpot",
          endpoint: "/crm/v3/objects/contacts/{contactId}",
          method: "DELETE",
          params: {
            contactId: { type: "string", required: true, description: "Contact ID to delete" }
          },
          requiredScopes: ["crm.objects.contacts.write"]
        },
        {
          id: "get_contact",
          name: "Get Contact",
          description: "Retrieve a specific contact",
          endpoint: "/crm/v3/objects/contacts/{contactId}",
          method: "GET",
          params: {
            contactId: { type: "string", required: true, description: "Contact ID to retrieve" },
            properties: { type: "array", required: false, description: "Properties to retrieve" }
          },
          requiredScopes: ["crm.objects.contacts.read"]
        },
        {
          id: "search_contacts",
          name: "Search Contacts",
          description: "Search for contacts using filters",
          endpoint: "/crm/v3/objects/contacts/search",
          method: "POST",
          params: {
            query: { type: "string", required: false, description: "Search query" },
            properties: { type: "array", required: false, description: "Properties to retrieve" },
            limit: { type: "number", required: false, description: "Number of results", default: 10 }
          },
          requiredScopes: ["crm.objects.contacts.read"]
        },
        {
          id: "update_company",
          name: "Update Company",
          description: "Update an existing company",
          endpoint: "/crm/v3/objects/companies/{companyId}",
          method: "PATCH",
          params: {
            companyId: { type: "string", required: true, description: "Company ID to update" },
            properties: { type: "object", required: true, description: "Company properties to update" }
          },
          requiredScopes: ["crm.objects.companies.write"]
        },
        {
          id: "delete_company",
          name: "Delete Company",
          description: "Delete a company from HubSpot",
          endpoint: "/crm/v3/objects/companies/{companyId}",
          method: "DELETE",
          params: {
            companyId: { type: "string", required: true, description: "Company ID to delete" }
          },
          requiredScopes: ["crm.objects.companies.write"]
        },
        {
          id: "update_deal",
          name: "Update Deal",
          description: "Update an existing deal",
          endpoint: "/crm/v3/objects/deals/{dealId}",
          method: "PATCH",
          params: {
            dealId: { type: "string", required: true, description: "Deal ID to update" },
            properties: { type: "object", required: true, description: "Deal properties to update" }
          },
          requiredScopes: ["crm.objects.deals.write"]
        },
        {
          id: "delete_deal",
          name: "Delete Deal",
          description: "Delete a deal from HubSpot",
          endpoint: "/crm/v3/objects/deals/{dealId}",
          method: "DELETE",
          params: {
            dealId: { type: "string", required: true, description: "Deal ID to delete" }
          },
          requiredScopes: ["crm.objects.deals.write"]
        },
        {
          id: "create_ticket",
          name: "Create Ticket",
          description: "Create a new support ticket",
          endpoint: "/crm/v3/objects/tickets",
          method: "POST",
          params: {
            subject: { type: "string", required: true, description: "Ticket subject" },
            content: { type: "string", required: true, description: "Ticket content" },
            priority: { type: "string", required: false, description: "Ticket priority", options: ["LOW", "MEDIUM", "HIGH"] },
            status: { type: "string", required: false, description: "Ticket status" }
          },
          requiredScopes: ["tickets"]
        }
      ];

      // Missing Triggers from ChatGPT analysis
      const missingTriggers: ConnectorFunction[] = [
        {
          id: "company_created",
          name: "Company Created",
          description: "Triggered when a new company is created",
          params: {},
          requiredScopes: ["crm.objects.companies.read"]
        },
        {
          id: "company_updated",
          name: "Company Updated",
          description: "Triggered when a company is updated",
          params: {},
          requiredScopes: ["crm.objects.companies.read"]
        },
        {
          id: "deal_created",
          name: "Deal Created",
          description: "Triggered when a new deal is created",
          params: {},
          requiredScopes: ["crm.objects.deals.read"]
        },
        {
          id: "ticket_created",
          name: "Ticket Created",
          description: "Triggered when a new ticket is created",
          params: {},
          requiredScopes: ["tickets"]
        },
        {
          id: "ticket_updated",
          name: "Ticket Updated",
          description: "Triggered when a ticket is updated",
          params: {},
          requiredScopes: ["tickets"]
        }
      ];

      // Add missing functions
      connector.actions.push(...missingActions);
      connector.triggers.push(...missingTriggers);

      this.saveConnector('hubspot.json', connector);
      console.log(`✅ Enhanced HubSpot: +${missingActions.length} actions, +${missingTriggers.length} triggers`);
      results.enhanced++;

    } catch (error) {
      const errorMsg = `Failed to enhance HubSpot: ${error}`;
      console.error(`❌ ${errorMsg}`);
      results.errors.push(errorMsg);
    }
  }

  /**
   * Enhance Gmail with missing functions
   */
  private async enhanceGmail(results: { enhanced: number; errors: string[] }): Promise<void> {
    try {
      console.log('📧 Enhancing Gmail connector...');
      
      const connector = this.loadConnector('gmail.json');
      
      // Missing Actions from ChatGPT analysis
      const missingActions: ConnectorFunction[] = [
        {
          id: "create_draft",
          name: "Create Draft",
          description: "Create a draft email",
          parameters: {
            to: { type: "string", required: true, description: "Recipient email address" },
            subject: { type: "string", required: true, description: "Email subject" },
            body: { type: "string", required: true, description: "Email body content" },
            cc: { type: "string", required: false, description: "CC recipients" },
            bcc: { type: "string", required: false, description: "BCC recipients" }
          },
          requiredScopes: ["https://www.googleapis.com/auth/gmail.compose"]
        },
        {
          id: "send_draft",
          name: "Send Draft",
          description: "Send an existing draft email",
          parameters: {
            draftId: { type: "string", required: true, description: "Draft ID to send" }
          },
          requiredScopes: ["https://www.googleapis.com/auth/gmail.send"]
        },
        {
          id: "modify_labels_batch",
          name: "Modify Labels (Batch)",
          description: "Add or remove labels from multiple emails",
          parameters: {
            messageIds: { type: "array", required: true, description: "Array of message IDs" },
            addLabelIds: { type: "array", required: false, description: "Label IDs to add" },
            removeLabelIds: { type: "array", required: false, description: "Label IDs to remove" }
          },
          requiredScopes: ["https://www.googleapis.com/auth/gmail.modify"]
        },
        {
          id: "stop_watch",
          name: "Stop Watch",
          description: "Stop watching for inbox changes",
          parameters: {},
          requiredScopes: ["https://www.googleapis.com/auth/gmail.readonly"]
        },
        {
          id: "get_profile",
          name: "Get Profile",
          description: "Get Gmail profile information",
          parameters: {},
          requiredScopes: ["https://www.googleapis.com/auth/gmail.readonly"]
        }
      ];

      // Missing Triggers from ChatGPT analysis
      const missingTriggers: ConnectorFunction[] = [
        {
          id: "thread_updated",
          name: "Thread Updated",
          description: "Triggered when a thread is updated",
          parameters: {
            query: { type: "string", required: false, description: "Filter by search query" }
          },
          requiredScopes: ["https://www.googleapis.com/auth/gmail.readonly"]
        }
      ];

      // Add missing functions
      connector.actions.push(...missingActions);
      connector.triggers.push(...missingTriggers);

      this.saveConnector('gmail.json', connector);
      console.log(`✅ Enhanced Gmail: +${missingActions.length} actions, +${missingTriggers.length} triggers`);
      results.enhanced++;

    } catch (error) {
      const errorMsg = `Failed to enhance Gmail: ${error}`;
      console.error(`❌ ${errorMsg}`);
      results.errors.push(errorMsg);
    }
  }

  /**
   * Enhance Shopify with missing functions
   */
  private async enhanceShopify(results: { enhanced: number; errors: string[] }): Promise<void> {
    try {
      console.log('🛍️ Enhancing Shopify connector...');
      
      const connector = this.loadConnector('shopify.json');
      
      // Missing Actions from ChatGPT analysis
      const missingActions: ConnectorFunction[] = [
        {
          id: "complete_draft_order",
          name: "Complete Draft Order",
          description: "Complete a draft order and convert to order",
          parameters: {
            draftOrderId: { type: "string", required: true, description: "Draft order ID to complete" },
            paymentPending: { type: "boolean", required: false, description: "Whether payment is pending", default: false }
          },
          requiredScopes: ["write_draft_orders", "write_orders"]
        },
        {
          id: "create_price_rule",
          name: "Create Price Rule",
          description: "Create a new price rule for discounts",
          parameters: {
            title: { type: "string", required: true, description: "Price rule title" },
            valueType: { type: "string", required: true, description: "Discount type", options: ["fixed_amount", "percentage"] },
            value: { type: "number", required: true, description: "Discount value" },
            customerSelection: { type: "string", required: false, description: "Customer selection", options: ["all", "prerequisite"], default: "all" },
            targetType: { type: "string", required: false, description: "Target type", options: ["line_item", "shipping_line"], default: "line_item" },
            targetSelection: { type: "string", required: false, description: "Target selection", options: ["all", "entitled"], default: "all" }
          },
          requiredScopes: ["write_price_rules"]
        },
        {
          id: "unarchive_product",
          name: "Unarchive Product",
          description: "Unarchive a previously archived product",
          parameters: {
            productId: { type: "string", required: true, description: "Product ID to unarchive" }
          },
          requiredScopes: ["write_products"]
        },
        {
          id: "add_product_to_collection",
          name: "Add Product to Collection",
          description: "Add a product to a collection",
          parameters: {
            collectionId: { type: "string", required: true, description: "Collection ID" },
            productId: { type: "string", required: true, description: "Product ID to add" }
          },
          requiredScopes: ["write_products"]
        },
        {
          id: "remove_product_from_collection",
          name: "Remove Product from Collection",
          description: "Remove a product from a collection",
          parameters: {
            collectionId: { type: "string", required: true, description: "Collection ID" },
            productId: { type: "string", required: true, description: "Product ID to remove" }
          },
          requiredScopes: ["write_products"]
        },
        {
          id: "create_fulfillment_service",
          name: "Create Fulfillment Service",
          description: "Create a new fulfillment service",
          parameters: {
            name: { type: "string", required: true, description: "Fulfillment service name" },
            callbackUrl: { type: "string", required: false, description: "Callback URL for notifications" },
            inventoryManagement: { type: "boolean", required: false, description: "Whether service manages inventory", default: false },
            trackingSupport: { type: "boolean", required: false, description: "Whether service supports tracking", default: false }
          },
          requiredScopes: ["write_fulfillment_services"]
        }
      ];

      // Missing Triggers from ChatGPT analysis
      const missingTriggers: ConnectorFunction[] = [
        {
          id: "refund_created",
          name: "Refund Created",
          description: "Triggered when a refund is created",
          parameters: {},
          requiredScopes: ["read_orders"]
        }
      ];

      // Add missing functions
      connector.actions.push(...missingActions);
      connector.triggers.push(...missingTriggers);

      this.saveConnector('shopify.json', connector);
      console.log(`✅ Enhanced Shopify: +${missingActions.length} actions, +${missingTriggers.length} triggers`);
      results.enhanced++;

    } catch (error) {
      const errorMsg = `Failed to enhance Shopify: ${error}`;
      console.error(`❌ ${errorMsg}`);
      results.errors.push(errorMsg);
    }
  }

  /**
   * Load connector from file
   */
  private loadConnector(filename: string): ConnectorData {
    const filePath = join(this.connectorsPath, filename);
    const fileContent = readFileSync(filePath, 'utf-8');
    return JSON.parse(fileContent);
  }

  /**
   * Save connector to file
   */
  private saveConnector(filename: string, connector: ConnectorData): void {
    const filePath = join(this.connectorsPath, filename);
    writeFileSync(filePath, JSON.stringify(connector, null, 2));
  }

  /**
   * Get enhancement statistics
   */
  getEnhancementStats(): { totalFunctions: number; byConnector: Record<string, number> } {
    const stats = {
      totalFunctions: 0,
      byConnector: {} as Record<string, number>
    };

    try {
      const connectors = ['slack.json', 'jira.json', 'hubspot.json', 'gmail.json', 'shopify.json'];
      
      connectors.forEach(filename => {
        try {
          const connector = this.loadConnector(filename);
          const functionCount = (connector.actions?.length || 0) + (connector.triggers?.length || 0);
          const appName = filename.replace('.json', '');
          
          stats.byConnector[appName] = functionCount;
          stats.totalFunctions += functionCount;
        } catch (error) {
          console.warn(`Could not read ${filename}: ${error}`);
        }
      });
    } catch (error) {
      console.error('Failed to get enhancement stats:', error);
    }

    return stats;
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  async function runEnhancement() {
    console.log('🚀 Running connector function enhancement from CLI...\n');
    
    const enhancer = new ConnectorFunctionEnhancer();
    
    try {
      // Enhance all connectors
      const results = await enhancer.enhanceAllConnectors();
      
      // Show statistics
      const stats = enhancer.getEnhancementStats();
      console.log('\n📊 Enhancement Statistics:');
      console.log(`Total Functions: ${stats.totalFunctions}`);
      console.log('\nBy Connector:');
      Object.entries(stats.byConnector).forEach(([connector, count]) => {
        console.log(`  ${connector}: ${count} functions`);
      });
      
      if (results.errors.length > 0) {
        console.log('\n❌ Errors:');
        results.errors.forEach(error => console.log(`  • ${error}`));
      }
      
    } catch (error) {
      console.error('💥 Enhancement failed:', error);
      process.exit(1);
    }
  }

  runEnhancement();
}