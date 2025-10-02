import { randomUUID } from 'node:crypto';

import { APICredentials, APIResponse, BaseAPIClient } from './BaseAPIClient.js';

export interface SageIntacctCredentials extends APICredentials {
  userId?: string;
  user_id?: string;
  userPassword?: string;
  user_password?: string;
  companyId?: string;
  company_id?: string;
  senderId?: string;
  sender_id?: string;
  senderPassword?: string;
  sender_password?: string;
}

type QueryParams = {
  maxitems?: number;
  offset?: number;
  filter?: string;
};

const RETRIES = {
  retries: 2,
  initialDelayMs: 500,
  maxDelayMs: 2000
};

export class SageintacctAPIClient extends BaseAPIClient {
  private readonly senderId: string;
  private readonly senderPassword: string;
  private readonly userId: string;
  private readonly userPassword: string;
  private readonly companyId: string;

  constructor(credentials: SageIntacctCredentials) {
    const userId = credentials.userId ?? credentials.user_id;
    const userPassword = credentials.userPassword ?? credentials.user_password;
    const companyId = credentials.companyId ?? credentials.company_id;

    if (!userId || !userPassword || !companyId) {
      throw new Error('Sage Intacct integration requires userId, userPassword, and companyId');
    }

    const senderId = credentials.senderId ?? credentials.sender_id ?? userId;
    const senderPassword = credentials.senderPassword ?? credentials.sender_password ?? userPassword;

    super('https://api.intacct.com/ia/xml/xmlgw.phtml', credentials);

    this.senderId = senderId;
    this.senderPassword = senderPassword;
    this.userId = userId;
    this.userPassword = userPassword;
    this.companyId = companyId;

    this.registerHandlers({
      test_connection: () => this.testConnection(),
      get_customers: params => this.readByQuery('customer', params as QueryParams),
      create_customer: params => this.createRecord('create_customer', params as Record<string, any>),
      get_vendors: params => this.readByQuery('vendor', params as QueryParams),
      create_invoice: params => this.createRecord('create_invoice', params as Record<string, any>),
      get_invoices: params => this.readByQuery('invoice', params as QueryParams),
      create_bill: params => this.createRecord('create_bill', params as Record<string, any>),
      get_gl_accounts: params => this.readByQuery('glaccount', params as QueryParams)
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/xml',
      Accept: 'application/xml'
    };
  }

  public async testConnection(): Promise<APIResponse<any>> {
    return this.withRetries(
      () =>
        this.sendFunction(
          'readByQuery',
          `<object>customer</object><maxitems>1</maxitems>`
        ),
      RETRIES
    );
  }

  private async readByQuery(objectName: string, params: QueryParams = {}): Promise<APIResponse<any>> {
    const parts = [`<object>${objectName}</object>`];
    if (params.maxitems) {
      parts.push(`<maxitems>${params.maxitems}</maxitems>`);
    }
    if (params.offset) {
      parts.push(`<offset>${params.offset}</offset>`);
    }
    if (params.filter) {
      parts.push(`<query>${this.escapeXml(params.filter)}</query>`);
    }
    return this.withRetries(
      () => this.sendFunction('readByQuery', parts.join('')),
      RETRIES
    );
  }

  private async createRecord(functionName: string, params: Record<string, any>): Promise<APIResponse<any>> {
    const body = this.objectFieldsToXml(params);
    return this.withRetries(
      () => this.sendFunction(functionName, body),
      RETRIES
    );
  }

  private async sendFunction(functionName: string, body: string): Promise<APIResponse<any>> {
    const envelope = this.buildEnvelope(functionName, body);

    try {
      return await this.dispatch(envelope);
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  private async dispatch(xmlBody: string): Promise<APIResponse<any>> {
    try {
      const response = await fetch(this.baseURL, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: xmlBody
      });

      const text = await response.text();
      if (!response.ok) {
        return {
          success: false,
          statusCode: response.status,
          error: `HTTP ${response.status}`,
          data: { rawResponse: text }
        };
      }

      return {
        success: true,
        statusCode: response.status,
        data: { rawResponse: text }
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  private buildEnvelope(functionName: string, content: string): string {
    const controlId = randomUUID();
    return `<?xml version="1.0" encoding="utf-8"?>\n` +
      `<request>\n` +
      `  <control>\n` +
      `    <senderid>${this.escapeXml(this.senderId)}</senderid>\n` +
      `    <password>${this.escapeXml(this.senderPassword)}</password>\n` +
      `    <controlid>${controlId}</controlid>\n` +
      `    <uniqueid>false</uniqueid>\n` +
      `    <dtdversion>3.0</dtdversion>\n` +
      `  </control>\n` +
      `  <operation transaction="false">\n` +
      `    <authentication>\n` +
      `      <login>\n` +
      `        <userid>${this.escapeXml(this.userId)}</userid>\n` +
      `        <companyid>${this.escapeXml(this.companyId)}</companyid>\n` +
      `        <password>${this.escapeXml(this.userPassword)}</password>\n` +
      `      </login>\n` +
      `    </authentication>\n` +
      `    <content>\n` +
      `      <function controlid="${controlId}">\n` +
      `        <${functionName}>${content}</${functionName}>\n` +
      `      </function>\n` +
      `    </content>\n` +
      `  </operation>\n` +
      `</request>`;
  }

  private objectFieldsToXml(record: Record<string, any>): string {
    return Object.entries(record)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => this.objectToXml(key, value))
      .join('');
  }

  private objectToXml(rootName: string, value: any): string {
    if (value === null || value === undefined) {
      return `<${rootName}/>`;
    }

    if (Array.isArray(value)) {
      return value.map(item => this.objectToXml(rootName, item)).join('');
    }

    if (typeof value !== 'object') {
      return `<${rootName}>${this.escapeXml(String(value))}</${rootName}>`;
    }

    const children = Object.entries(value)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([key, v]) => this.objectToXml(key, v))
      .join('');

    return `<${rootName}>${children}</${rootName}>`;
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
