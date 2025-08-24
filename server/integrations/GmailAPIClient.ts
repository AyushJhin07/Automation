// GMAIL API CLIENT - REAL IMPLEMENTATION
// Implements all Gmail functions with actual Google Gmail API calls

import { BaseAPIClient, APICredentials, APIResponse } from './BaseAPIClient';

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{ body?: { data?: string }; mimeType?: string }>;
  };
  internalDate: string;
  sizeEstimate: number;
}

export interface GmailLabel {
  id: string;
  name: string;
  messageListVisibility: string;
  labelListVisibility: string;
  type: string;
  color?: {
    textColor: string;
    backgroundColor: string;
  };
}

export interface GmailThread {
  id: string;
  snippet: string;
  historyId: string;
  messages: GmailMessage[];
}

export class GmailAPIClient extends BaseAPIClient {
  constructor(credentials: APICredentials) {
    super('https://gmail.googleapis.com/gmail/v1', credentials);
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.credentials.accessToken}`
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.get('/users/me/profile');
  }

  // ===== EMAIL MANAGEMENT =====

  /**
   * Send email message
   */
  public async sendEmail(params: {
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    body: string;
    htmlBody?: string;
    attachments?: Array<{ filename: string; content: string; mimeType: string }>;
    replyTo?: string;
    importance?: 'low' | 'normal' | 'high';
  }): Promise<APIResponse<GmailMessage>> {
    this.validateRequiredParams(params, ['to', 'subject', 'body']);

    // Build email message in RFC 2822 format
    const message = this.buildEmailMessage(params);
    const encodedMessage = Buffer.from(message).toString('base64url');

    return this.post('/users/me/messages/send', {
      raw: encodedMessage
    });
  }

  /**
   * Reply to email
   */
  public async replyToEmail(params: {
    messageId: string;
    body: string;
    htmlBody?: string;
    attachments?: Array<{ filename: string; content: string; mimeType: string }>;
    replyAll?: boolean;
  }): Promise<APIResponse<GmailMessage>> {
    this.validateRequiredParams(params, ['messageId', 'body']);

    // Get original message to extract reply information
    const originalResponse = await this.get<GmailMessage>(`/users/me/messages/${params.messageId}`);
    if (!originalResponse.success) {
      return originalResponse;
    }

    const original = originalResponse.data!;
    const headers = original.payload.headers;
    
    const fromHeader = headers.find(h => h.name.toLowerCase() === 'from');
    const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject');
    const messageIdHeader = headers.find(h => h.name.toLowerCase() === 'message-id');

    const replyParams = {
      to: fromHeader?.value || '',
      subject: `Re: ${subjectHeader?.value || ''}`,
      body: params.body,
      htmlBody: params.htmlBody,
      attachments: params.attachments,
      inReplyTo: messageIdHeader?.value,
      references: messageIdHeader?.value
    };

    const message = this.buildEmailMessage(replyParams);
    const encodedMessage = Buffer.from(message).toString('base64url');

    return this.post('/users/me/messages/send', {
      raw: encodedMessage,
      threadId: original.threadId
    });
  }

  /**
   * Forward email
   */
  public async forwardEmail(params: {
    messageId: string;
    to: string;
    message?: string;
    includeAttachments?: boolean;
  }): Promise<APIResponse<GmailMessage>> {
    this.validateRequiredParams(params, ['messageId', 'to']);

    // Get original message
    const originalResponse = await this.get<GmailMessage>(`/users/me/messages/${params.messageId}`);
    if (!originalResponse.success) {
      return originalResponse;
    }

    const original = originalResponse.data!;
    const headers = original.payload.headers;
    const subjectHeader = headers.find(h => h.name.toLowerCase() === 'subject');

    const forwardParams = {
      to: params.to,
      subject: `Fwd: ${subjectHeader?.value || ''}`,
      body: `${params.message || ''}\n\n---------- Forwarded message ----------\n${original.snippet}`,
      // TODO: Handle attachments if includeAttachments is true
    };

    const message = this.buildEmailMessage(forwardParams);
    const encodedMessage = Buffer.from(message).toString('base64url');

    return this.post('/users/me/messages/send', {
      raw: encodedMessage
    });
  }

  // ===== EMAIL SEARCH & FILTERING =====

  /**
   * Search emails using Gmail search syntax
   */
  public async searchEmails(params: {
    query: string;
    maxResults?: number;
    includeSpamTrash?: boolean;
    labelIds?: string[];
    after?: string;
    before?: string;
  }): Promise<APIResponse<{ messages: GmailMessage[]; resultSizeEstimate: number }>> {
    this.validateRequiredParams(params, ['query']);

    let query = params.query;
    
    // Add date filters
    if (params.after) query += ` after:${params.after}`;
    if (params.before) query += ` before:${params.before}`;
    
    // Add label filters
    if (params.labelIds?.length) {
      params.labelIds.forEach(labelId => {
        query += ` label:${labelId}`;
      });
    }

    const queryParams = {
      q: query,
      maxResults: params.maxResults || 10,
      includeSpamTrash: params.includeSpamTrash || false
    };

    return this.get(`/users/me/messages${this.buildQueryString(queryParams)}`);
  }

  /**
   * Get emails by label
   */
  public async getEmailsByLabel(params: {
    labelName: string;
    maxResults?: number;
    unreadOnly?: boolean;
  }): Promise<APIResponse<{ messages: GmailMessage[]; resultSizeEstimate: number }>> {
    this.validateRequiredParams(params, ['labelName']);

    let query = `label:${params.labelName}`;
    if (params.unreadOnly) {
      query += ' is:unread';
    }

    return this.searchEmails({
      query,
      maxResults: params.maxResults
    });
  }

  /**
   * Get unread emails
   */
  public async getUnreadEmails(params: {
    maxResults?: number;
    fromSender?: string;
    hasAttachment?: boolean;
  }): Promise<APIResponse<{ messages: GmailMessage[]; resultSizeEstimate: number }>> {
    let query = 'is:unread';
    
    if (params.fromSender) query += ` from:${params.fromSender}`;
    if (params.hasAttachment) query += ' has:attachment';

    return this.searchEmails({
      query,
      maxResults: params.maxResults
    });
  }

  // ===== EMAIL ORGANIZATION =====

  /**
   * Add label to email
   */
  public async addLabel(params: {
    messageId: string;
    labelNames: string[];
  }): Promise<APIResponse<GmailMessage>> {
    this.validateRequiredParams(params, ['messageId', 'labelNames']);

    // Get label IDs from names
    const labelIds = await this.getLabelIdsByNames(params.labelNames);
    if (!labelIds.success) {
      return labelIds;
    }

    return this.post(`/users/me/messages/${params.messageId}/modify`, {
      addLabelIds: labelIds.data
    });
  }

  /**
   * Remove label from email
   */
  public async removeLabel(params: {
    messageId: string;
    labelNames: string[];
  }): Promise<APIResponse<GmailMessage>> {
    this.validateRequiredParams(params, ['messageId', 'labelNames']);

    // Get label IDs from names
    const labelIds = await this.getLabelIdsByNames(params.labelNames);
    if (!labelIds.success) {
      return labelIds;
    }

    return this.post(`/users/me/messages/${params.messageId}/modify`, {
      removeLabelIds: labelIds.data
    });
  }

  /**
   * Create label
   */
  public async createLabel(params: {
    name: string;
    color?: string;
    visibility?: 'labelShow' | 'labelHide';
  }): Promise<APIResponse<GmailLabel>> {
    this.validateRequiredParams(params, ['name']);

    const labelData: any = {
      name: params.name,
      labelListVisibility: params.visibility || 'labelShow',
      messageListVisibility: 'show'
    };

    if (params.color) {
      labelData.color = {
        backgroundColor: params.color,
        textColor: '#ffffff'
      };
    }

    return this.post('/users/me/labels', labelData);
  }

  /**
   * Mark emails as read
   */
  public async markAsRead(params: {
    messageIds: string[];
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['messageIds']);

    const promises = params.messageIds.map(messageId =>
      this.post(`/users/me/messages/${messageId}/modify`, {
        removeLabelIds: ['UNREAD']
      })
    );

    const results = await Promise.all(promises);
    const failed = results.filter(r => !r.success);

    if (failed.length > 0) {
      return {
        success: false,
        error: `Failed to mark ${failed.length} messages as read`
      };
    }

    return { success: true, data: results };
  }

  /**
   * Mark emails as unread
   */
  public async markAsUnread(params: {
    messageIds: string[];
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['messageIds']);

    const promises = params.messageIds.map(messageId =>
      this.post(`/users/me/messages/${messageId}/modify`, {
        addLabelIds: ['UNREAD']
      })
    );

    const results = await Promise.all(promises);
    const failed = results.filter(r => !r.success);

    if (failed.length > 0) {
      return {
        success: false,
        error: `Failed to mark ${failed.length} messages as unread`
      };
    }

    return { success: true, data: results };
  }

  /**
   * Archive emails
   */
  public async archiveEmail(params: {
    messageIds: string[];
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['messageIds']);

    const promises = params.messageIds.map(messageId =>
      this.post(`/users/me/messages/${messageId}/modify`, {
        removeLabelIds: ['INBOX']
      })
    );

    const results = await Promise.all(promises);
    const failed = results.filter(r => !r.success);

    if (failed.length > 0) {
      return {
        success: false,
        error: `Failed to archive ${failed.length} messages`
      };
    }

    return { success: true, data: results };
  }

  /**
   * Delete emails
   */
  public async deleteEmail(params: {
    messageIds: string[];
  }): Promise<APIResponse<any>> {
    this.validateRequiredParams(params, ['messageIds']);

    const promises = params.messageIds.map(messageId =>
      this.delete(`/users/me/messages/${messageId}`)
    );

    const results = await Promise.all(promises);
    const failed = results.filter(r => !r.success);

    if (failed.length > 0) {
      return {
        success: false,
        error: `Failed to delete ${failed.length} messages`
      };
    }

    return { success: true, data: results };
  }

  // ===== HELPER METHODS =====

  /**
   * Build email message in RFC 2822 format
   */
  private buildEmailMessage(params: any): string {
    const headers = [
      `To: ${params.to}`,
      `Subject: ${params.subject}`
    ];

    if (params.cc) headers.push(`Cc: ${params.cc}`);
    if (params.bcc) headers.push(`Bcc: ${params.bcc}`);
    if (params.replyTo) headers.push(`Reply-To: ${params.replyTo}`);
    if (params.inReplyTo) headers.push(`In-Reply-To: ${params.inReplyTo}`);
    if (params.references) headers.push(`References: ${params.references}`);

    headers.push('Content-Type: text/plain; charset=utf-8');
    headers.push('');
    headers.push(params.body);

    return headers.join('\r\n');
  }

  /**
   * Get label IDs by names
   */
  private async getLabelIdsByNames(labelNames: string[]): Promise<APIResponse<string[]>> {
    const labelsResponse = await this.get<{ labels: GmailLabel[] }>('/users/me/labels');
    if (!labelsResponse.success) {
      return labelsResponse as APIResponse<string[]>;
    }

    const labels = labelsResponse.data!.labels;
    const labelIds: string[] = [];

    for (const labelName of labelNames) {
      const label = labels.find(l => l.name.toLowerCase() === labelName.toLowerCase());
      if (label) {
        labelIds.push(label.id);
      } else {
        return {
          success: false,
          error: `Label not found: ${labelName}`
        };
      }
    }

    return {
      success: true,
      data: labelIds
    };
  }
}