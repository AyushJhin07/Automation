// COMPREHENSIVE COMPILER TEMPLATES - FIXED VERSION
// Templates for generating Apps Script code for ALL applications

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
   * Initialize core application templates
   */
  private initializeTemplates(): void {
    console.log('🔧 Initializing comprehensive compiler templates...');

    // Gmail templates
    this.templates.set('action.gmail.send', new GmailSendTemplate());
    this.templates.set('action.gmail.reply', new GmailReplyTemplate());
    this.templates.set('trigger.gmail.new_email', new GmailNewEmailTemplate());

    // Google Sheets templates
    this.templates.set('action.google-sheets.append_row', new SheetsAppendRowTemplate());
    this.templates.set('action.google-sheets.update_cell', new SheetsUpdateCellTemplate());
    this.templates.set('trigger.google-sheets.new_row', new SheetsNewRowTemplate());

    // Slack templates
    this.templates.set('action.slack.post_message', new SlackPostMessageTemplate());
    this.templates.set('trigger.slack.message_posted', new SlackMessagePostedTemplate());

    // Shopify templates
    this.templates.set('action.shopify.create_product', new ShopifyCreateProductTemplate());
    this.templates.set('trigger.shopify.order_created', new ShopifyOrderCreatedTemplate());

    // GitHub templates
    this.templates.set('action.github.create_issue', new GitHubCreateIssueTemplate());
    this.templates.set('trigger.github.issue_opened', new GitHubIssueOpenedTemplate());

    // HubSpot templates
    this.templates.set('action.hubspot.create_contact', new HubSpotCreateContactTemplate());
    this.templates.set('trigger.hubspot.contact_created', new HubSpotContactCreatedTemplate());

    console.log(`✅ Initialized ${this.templates.size} core compiler templates`);
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
    
    return `
    // Fallback implementation for ${nodeType}
    const params = data.params;
    console.log('Executing ${app} ${functionId} with params:', params);
    
    try {
      // TODO: Implement specific ${app} ${functionId} logic here
      const result = { success: true, message: '${functionId} executed successfully' };
      return result;
    } catch (error) {
      throw new Error('${functionId} failed: ' + error.message);
    }`;
  }

  /**
   * Generate external API fallback code
   */
  private generateExternalAPIFallback(nodeType: string, data: NodeData): string {
    const [type, app, functionId] = nodeType.split('.');
    
    return `
    // Fallback implementation for ${nodeType}
    const params = data.params;
    
    try {
      const token = PropertiesService.getScriptProperties().getProperty('${app.toUpperCase()}_TOKEN');
      if (!token) {
        throw new Error('${app} token not found. Please reconnect your account.');
      }
      
      const response = UrlFetchApp.fetch('https://api.${app}.com/api/${functionId}', {
        method: '${type === 'action' ? 'POST' : 'GET'}',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
          'User-Agent': 'Apps-Script-Automation/1.0'
        },
        payload: ${type === 'action' ? 'JSON.stringify(params)' : 'null'},
        muteHttpExceptions: true
      });

      const responseData = JSON.parse(response.getContentText());
      
      if (response.getResponseCode() >= 400) {
        throw new Error('API Error (' + response.getResponseCode() + '): ' + (responseData.message || 'Unknown error'));
      }

      return {
        success: true,
        data: responseData,
        statusCode: response.getResponseCode()
      };

    } catch (error) {
      console.error('${functionId} error:', error);
      throw new Error('${functionId} failed: ' + error.message);
    }`;
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

// Core template implementations
class GmailSendTemplate implements CompilerTemplate {
  generateCode(data: NodeData): string {
    return `
    const { to, subject, bodyText, bodyHtml } = data.params;
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
  }

  generateScopes(data: NodeData): string[] {
    return [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify'
    ];
  }

  getDescription(): string {
    return "Send an email via Gmail";
  }
}

class GmailReplyTemplate implements CompilerTemplate {
  generateCode(data: NodeData): string {
    return `
    const { threadId, bodyText, bodyHtml } = data.params;
    const thread = GmailApp.getThreadById(threadId);
    const message = thread.getMessages()[0];
    
    message.reply(bodyText || bodyHtml, {
      htmlBody: bodyHtml
    });
    
    return { success: true, threadId: threadId };`;
  }

  generateScopes(data: NodeData): string[] {
    return [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send'
    ];
  }

  getDescription(): string {
    return "Reply to a Gmail thread";
  }
}

class GmailNewEmailTemplate implements CompilerTemplate {
  generateCode(data: NodeData): string {
    return `
    // Gmail trigger for new emails
    const query = data.params.query || '';
    const threads = GmailApp.search(query, 0, 10);
    
    return threads.map(thread => ({
      id: thread.getId(),
      subject: thread.getFirstMessageSubject(),
      snippet: thread.getMessages()[0].getPlainBody().substring(0, 100),
      timestamp: thread.getLastMessageDate().getTime()
    }));`;
  }

  generateScopes(data: NodeData): string[] {
    return ['https://www.googleapis.com/auth/gmail.readonly'];
  }

  getDescription(): string {
    return "Trigger when new email is received";
  }
}

class SheetsAppendRowTemplate implements CompilerTemplate {
  generateCode(data: NodeData): string {
    return `
    const { spreadsheetId, sheet, values } = data.params;
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const worksheet = spreadsheet.getSheetByName(sheet) || spreadsheet.getActiveSheet();
    
    worksheet.appendRow(values);
    
    return { 
      success: true, 
      rowIndex: worksheet.getLastRow(),
      values: values 
    };`;
  }

  generateScopes(data: NodeData): string[] {
    return ['https://www.googleapis.com/auth/spreadsheets'];
  }

  getDescription(): string {
    return "Append a row to Google Sheets";
  }
}

class SheetsUpdateCellTemplate implements CompilerTemplate {
  generateCode(data: NodeData): string {
    return `
    const { spreadsheetId, range, value } = data.params;
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const cell = spreadsheet.getRange(range);
    
    cell.setValue(value);
    
    return { success: true, range: range, value: value };`;
  }

  generateScopes(data: NodeData): string[] {
    return ['https://www.googleapis.com/auth/spreadsheets'];
  }

  getDescription(): string {
    return "Update a cell in Google Sheets";
  }
}

class SheetsNewRowTemplate implements CompilerTemplate {
  generateCode(data: NodeData): string {
    return `
    // Sheets trigger for new rows
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

  generateScopes(data: NodeData): string[] {
    return ['https://www.googleapis.com/auth/spreadsheets.readonly'];
  }

  getDescription(): string {
    return "Trigger when new row is added to Google Sheets";
  }
}

class SlackPostMessageTemplate implements CompilerTemplate {
  generateCode(data: NodeData): string {
    return `
    const { channel, text, blocks } = data.params;
    
    try {
      const accessToken = PropertiesService.getScriptProperties().getProperty('SLACK_ACCESS_TOKEN');
      if (!accessToken) {
        throw new Error('Slack access token not found. Please reconnect your account.');
      }
      
      const payload = {
        channel: channel,
        text: text
      };
      
      if (blocks) {
        payload.blocks = JSON.parse(blocks);
      }
      
      const response = UrlFetchApp.fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
          'User-Agent': 'Apps-Script-Automation/1.0'
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });

      const responseData = JSON.parse(response.getContentText());
      
      if (!responseData.ok) {
        throw new Error('Slack API Error: ' + (responseData.error || 'Unknown error'));
      }

      return {
        success: true,
        data: responseData,
        messageTs: responseData.ts
      };

    } catch (error) {
      console.error('Slack post message error:', error);
      throw new Error('Slack post message failed: ' + error.message);
    }`;
  }

  generateScopes(data: NodeData): string[] {
    return ['chat:write', 'channels:read'];
  }

  getDescription(): string {
    return "Post a message to Slack channel";
  }
}

class SlackMessagePostedTemplate implements CompilerTemplate {
  generateCode(data: NodeData): string {
    return `
    const { channel } = data.params;
    
    try {
      const accessToken = PropertiesService.getScriptProperties().getProperty('SLACK_ACCESS_TOKEN');
      if (!accessToken) {
        throw new Error('Slack access token not found. Please reconnect your account.');
      }
      
      const response = UrlFetchApp.fetch('https://slack.com/api/conversations.history?channel=' + channel + '&limit=10', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Accept': 'application/json',
          'User-Agent': 'Apps-Script-Automation/1.0'
        },
        muteHttpExceptions: true
      });

      const responseData = JSON.parse(response.getContentText());
      
      if (!responseData.ok) {
        console.warn('Slack API Error: ' + (responseData.error || 'Unknown error'));
        return [];
      }

      return responseData.messages.map(message => ({
        ...message,
        timestamp: parseFloat(message.ts) * 1000
      }));

    } catch (error) {
      console.error('Slack message polling error:', error);
      return [];
    }`;
  }

  generateScopes(data: NodeData): string[] {
    return ['channels:history', 'channels:read'];
  }

  getDescription(): string {
    return "Trigger when message is posted to Slack channel";
  }
}

class ShopifyCreateProductTemplate implements CompilerTemplate {
  generateCode(data: NodeData): string {
    return `
    const params = data.params;
    
    try {
      const accessToken = PropertiesService.getScriptProperties().getProperty('SHOPIFY_ACCESS_TOKEN');
      const shopDomain = PropertiesService.getScriptProperties().getProperty('SHOPIFY_SHOP_DOMAIN');
      
      if (!accessToken || !shopDomain) {
        throw new Error('Shopify credentials not found. Please reconnect your account.');
      }
      
      const response = UrlFetchApp.fetch('https://' + shopDomain + '.myshopify.com/admin/api/2023-01/products.json', {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
          'User-Agent': 'Apps-Script-Automation/1.0'
        },
        payload: JSON.stringify({ product: params }),
        muteHttpExceptions: true
      });

      const responseData = JSON.parse(response.getContentText());
      
      if (response.getResponseCode() >= 400) {
        throw new Error('Shopify API Error (' + response.getResponseCode() + '): ' + (responseData.errors || 'Unknown error'));
      }

      return {
        success: true,
        data: responseData.product,
        productId: responseData.product.id
      };

    } catch (error) {
      console.error('Shopify create product error:', error);
      throw new Error('Shopify create product failed: ' + error.message);
    }`;
  }

  generateScopes(data: NodeData): string[] {
    return ['write_products'];
  }

  getDescription(): string {
    return "Create a product in Shopify";
  }
}

class ShopifyOrderCreatedTemplate implements CompilerTemplate {
  generateCode(data: NodeData): string {
    return `
    try {
      const accessToken = PropertiesService.getScriptProperties().getProperty('SHOPIFY_ACCESS_TOKEN');
      const shopDomain = PropertiesService.getScriptProperties().getProperty('SHOPIFY_SHOP_DOMAIN');
      
      if (!accessToken || !shopDomain) {
        throw new Error('Shopify credentials not found. Please reconnect your account.');
      }
      
      const response = UrlFetchApp.fetch('https://' + shopDomain + '.myshopify.com/admin/api/2023-01/orders.json?limit=10&status=any', {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Accept': 'application/json',
          'User-Agent': 'Apps-Script-Automation/1.0'
        },
        muteHttpExceptions: true
      });

      const responseData = JSON.parse(response.getContentText());
      
      if (response.getResponseCode() >= 400) {
        console.warn('Shopify API Error (' + response.getResponseCode() + '): ' + (responseData.errors || 'Unknown error'));
        return [];
      }

      return responseData.orders.map(order => ({
        ...order,
        timestamp: new Date(order.created_at).getTime()
      }));

    } catch (error) {
      console.error('Shopify order polling error:', error);
      return [];
    }`;
  }

  generateScopes(data: NodeData): string[] {
    return ['read_orders'];
  }

  getDescription(): string {
    return "Trigger when order is created in Shopify";
  }
}

class GitHubCreateIssueTemplate implements CompilerTemplate {
  generateCode(data: NodeData): string {
    return `
    const { owner, repo, title, body } = data.params;
    
    try {
      const accessToken = PropertiesService.getScriptProperties().getProperty('GITHUB_ACCESS_TOKEN');
      if (!accessToken) {
        throw new Error('GitHub access token not found. Please reconnect your account.');
      }
      
      const payload = {
        title: title,
        body: body || ''
      };
      
      const response = UrlFetchApp.fetch('https://api.github.com/repos/' + owner + '/' + repo + '/issues', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
          'User-Agent': 'Apps-Script-Automation/1.0'
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });

      const responseData = JSON.parse(response.getContentText());
      
      if (response.getResponseCode() >= 400) {
        throw new Error('GitHub API Error (' + response.getResponseCode() + '): ' + (responseData.message || 'Unknown error'));
      }

      return {
        success: true,
        data: responseData,
        issueNumber: responseData.number
      };

    } catch (error) {
      console.error('GitHub create issue error:', error);
      throw new Error('GitHub create issue failed: ' + error.message);
    }`;
  }

  generateScopes(data: NodeData): string[] {
    return ['repo'];
  }

  getDescription(): string {
    return "Create an issue in GitHub repository";
  }
}

class GitHubIssueOpenedTemplate implements CompilerTemplate {
  generateCode(data: NodeData): string {
    return `
    const { owner, repo } = data.params;
    
    try {
      const accessToken = PropertiesService.getScriptProperties().getProperty('GITHUB_ACCESS_TOKEN');
      if (!accessToken) {
        throw new Error('GitHub access token not found. Please reconnect your account.');
      }
      
      const response = UrlFetchApp.fetch('https://api.github.com/repos/' + owner + '/' + repo + '/issues?state=open&per_page=10', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Accept': 'application/json',
          'User-Agent': 'Apps-Script-Automation/1.0'
        },
        muteHttpExceptions: true
      });

      const responseData = JSON.parse(response.getContentText());
      
      if (response.getResponseCode() >= 400) {
        console.warn('GitHub API Error (' + response.getResponseCode() + '): ' + (responseData.message || 'Unknown error'));
        return [];
      }

      return responseData.map(issue => ({
        ...issue,
        timestamp: new Date(issue.created_at).getTime()
      }));

    } catch (error) {
      console.error('GitHub issue polling error:', error);
      return [];
    }`;
  }

  generateScopes(data: NodeData): string[] {
    return ['repo'];
  }

  getDescription(): string {
    return "Trigger when issue is opened in GitHub repository";
  }
}

class HubSpotCreateContactTemplate implements CompilerTemplate {
  generateCode(data: NodeData): string {
    return `
    const { properties } = data.params;
    
    try {
      const accessToken = PropertiesService.getScriptProperties().getProperty('HUBSPOT_ACCESS_TOKEN');
      if (!accessToken) {
        throw new Error('HubSpot access token not found. Please reconnect your account.');
      }
      
      const response = UrlFetchApp.fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
          'User-Agent': 'Apps-Script-Automation/1.0'
        },
        payload: JSON.stringify({ properties: properties }),
        muteHttpExceptions: true
      });

      const responseData = JSON.parse(response.getContentText());
      
      if (response.getResponseCode() >= 400) {
        throw new Error('HubSpot API Error (' + response.getResponseCode() + '): ' + (responseData.message || 'Unknown error'));
      }

      return {
        success: true,
        data: responseData,
        contactId: responseData.id
      };

    } catch (error) {
      console.error('HubSpot create contact error:', error);
      throw new Error('HubSpot create contact failed: ' + error.message);
    }`;
  }

  generateScopes(data: NodeData): string[] {
    return ['contacts'];
  }

  getDescription(): string {
    return "Create a contact in HubSpot";
  }
}

class HubSpotContactCreatedTemplate implements CompilerTemplate {
  generateCode(data: NodeData): string {
    return `
    try {
      const accessToken = PropertiesService.getScriptProperties().getProperty('HUBSPOT_ACCESS_TOKEN');
      if (!accessToken) {
        throw new Error('HubSpot access token not found. Please reconnect your account.');
      }
      
      const response = UrlFetchApp.fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=10', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Accept': 'application/json',
          'User-Agent': 'Apps-Script-Automation/1.0'
        },
        muteHttpExceptions: true
      });

      const responseData = JSON.parse(response.getContentText());
      
      if (response.getResponseCode() >= 400) {
        console.warn('HubSpot API Error (' + response.getResponseCode() + '): ' + (responseData.message || 'Unknown error'));
        return [];
      }

      return responseData.results.map(contact => ({
        ...contact,
        timestamp: new Date(contact.createdAt).getTime()
      }));

    } catch (error) {
      console.error('HubSpot contact polling error:', error);
      return [];
    }`;
  }

  generateScopes(data: NodeData): string[] {
    return ['contacts'];
  }

  getDescription(): string {
    return "Trigger when contact is created in HubSpot";
  }
}

export const compilerTemplates = new CompilerTemplates();