// COMPREHENSIVE OAUTH MANAGER - AUTO-GENERATED
// Handles OAuth flows for ALL 68 supported applications

import { getErrorMessage } from '../types/common';
import { connectionService } from '../services/ConnectionService';
import { EncryptionService } from '../services/EncryptionService';

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  authUrl: string;
  tokenUrl: string;
  userInfoUrl?: string;
  additionalParams?: Record<string, string>;
}

export interface OAuthProvider {
  name: string;
  displayName: string;
  config: OAuthConfig;
  pkceRequired?: boolean;
  customAuthParams?: Record<string, string>;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
  scope?: string;
}

export interface OAuthUserInfo {
  id: string;
  email?: string;
  name?: string;
  avatar?: string;
  additionalData?: Record<string, any>;
}

export interface OAuthState {
  userId: string;
  provider: string;
  returnUrl?: string;
  codeVerifier?: string; // For PKCE
  nonce: string;
  createdAt: number;
}

export class OAuthManager {
  private providers: Map<string, OAuthProvider> = new Map();
  private pendingStates: Map<string, OAuthState> = new Map();

  constructor() {
    this.initializeProviders();
  }

  /**
   * Initialize OAuth providers for ALL supported applications
   */
  private initializeProviders(): void {
    // ADP
    this.providers.set('adp', {
      name: 'adp',
      displayName: 'ADP',
      config: {
        clientId: process.env.ADP_CLIENT_ID || '',
        clientSecret: process.env.ADP_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/adp`,
        scopes: ["read","write"],
        authUrl: 'https://api.adp.com/oauth/authorize',
        tokenUrl: 'https://api.adp.com/oauth/token',
      },
    });

    // Asana Enhanced
    this.providers.set('asana-enhanced', {
      name: 'asana-enhanced',
      displayName: 'Asana Enhanced',
      config: {
        clientId: process.env.ASANA_ENHANCED_CLIENT_ID || '',
        clientSecret: process.env.ASANA_ENHANCED_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/asana-enhanced`,
        scopes: ["read","write","projects"],
        authUrl: 'https://app.asana.com/api/1.0/oauth/authorize',
        tokenUrl: 'https://app.asana.com/api/1.0/oauth/token',
      },
    });

    // Basecamp
    this.providers.set('basecamp', {
      name: 'basecamp',
      displayName: 'Basecamp',
      config: {
        clientId: process.env.BASECAMP_CLIENT_ID || '',
        clientSecret: process.env.BASECAMP_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/basecamp`,
        scopes: ["read","write","projects"],
        authUrl: 'https://api.example.com/oauth/authorize',
        tokenUrl: 'https://api.example.com/oauth/token',
      },
    });

    // BigQuery
    this.providers.set('bigquery', {
      name: 'bigquery',
      displayName: 'BigQuery',
      config: {
        clientId: process.env.BIGQUERY_CLIENT_ID || '',
        clientSecret: process.env.BIGQUERY_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/bigquery`,
        scopes: ["read","write"],
        authUrl: 'https://api.example.com/oauth/authorize',
        tokenUrl: 'https://api.example.com/oauth/token',
      },
    });

    // Bitbucket
    this.providers.set('bitbucket', {
      name: 'bitbucket',
      displayName: 'Bitbucket',
      config: {
        clientId: process.env.BITBUCKET_CLIENT_ID || '',
        clientSecret: process.env.BITBUCKET_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/bitbucket`,
        scopes: ["read","write"],
        authUrl: 'https://api.bitbucket.org/2.0/oauth/authorize',
        tokenUrl: 'https://api.bitbucket.org/2.0/oauth/token',
      },
    });

    // Box
    this.providers.set('box', {
      name: 'box',
      displayName: 'Box',
      config: {
        clientId: process.env.BOX_CLIENT_ID || '',
        clientSecret: process.env.BOX_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/box`,
        scopes: ["read","write","files"],
        authUrl: 'https://api.box.com/2.0/oauth/authorize',
        tokenUrl: 'https://api.box.com/2.0/oauth/token',
      },
    });

    // Confluence
    this.providers.set('confluence', {
      name: 'confluence',
      displayName: 'Confluence',
      config: {
        clientId: process.env.CONFLUENCE_CLIENT_ID || '',
        clientSecret: process.env.CONFLUENCE_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/confluence`,
        scopes: ["read","write"],
        authUrl: 'https://api.atlassian.com/ex/confluence/oauth/authorize',
        tokenUrl: 'https://api.atlassian.com/ex/confluence/oauth/token',
      },
    });

    // Coupa
    this.providers.set('coupa', {
      name: 'coupa',
      displayName: 'Coupa',
      config: {
        clientId: process.env.COUPA_CLIENT_ID || '',
        clientSecret: process.env.COUPA_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/coupa`,
        scopes: ["read","write"],
        authUrl: 'https://api.example.com/oauth/authorize',
        tokenUrl: 'https://api.example.com/oauth/token',
      },
    });

    // Databricks
    this.providers.set('databricks', {
      name: 'databricks',
      displayName: 'Databricks',
      config: {
        clientId: process.env.DATABRICKS_CLIENT_ID || '',
        clientSecret: process.env.DATABRICKS_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/databricks`,
        scopes: ["read","write"],
        authUrl: 'https://api.example.com/oauth/authorize',
        tokenUrl: 'https://api.example.com/oauth/token',
      },
    });

    // Dropbox Enhanced
    this.providers.set('dropbox-enhanced', {
      name: 'dropbox-enhanced',
      displayName: 'Dropbox Enhanced',
      config: {
        clientId: process.env.DROPBOX_ENHANCED_CLIENT_ID || '',
        clientSecret: process.env.DROPBOX_ENHANCED_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/dropbox-enhanced`,
        scopes: ["files.content.write","files.content.read","sharing.write"],
        authUrl: 'https://www.dropbox.com/oauth2/authorize',
        tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
        userInfoUrl: 'https://api.dropboxapi.com/2/users/get_current_account',
      },
    });

    // Dropbox
    this.providers.set('dropbox', {
      name: 'dropbox',
      displayName: 'Dropbox',
      config: {
        clientId: process.env.DROPBOX_CLIENT_ID || '',
        clientSecret: process.env.DROPBOX_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/dropbox`,
        scopes: ["files.content.write","files.content.read","sharing.write"],
        authUrl: 'https://www.dropbox.com/oauth2/authorize',
        tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
        userInfoUrl: 'https://api.dropboxapi.com/2/users/get_current_account',
      },
    });

    // Excel Online
    this.providers.set('excel-online', {
      name: 'excel-online',
      displayName: 'Excel Online',
      config: {
        clientId: process.env.EXCEL_ONLINE_CLIENT_ID || '',
        clientSecret: process.env.EXCEL_ONLINE_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/excel-online`,
        scopes: ["read","write"],
        authUrl: 'https://graph.microsoft.com/v1.0/oauth/authorize',
        tokenUrl: 'https://graph.microsoft.com/v1.0/oauth/token',
      },
    });

    // GitHub Enhanced
    this.providers.set('github-enhanced', {
      name: 'github-enhanced',
      displayName: 'GitHub Enhanced',
      config: {
        clientId: process.env.GITHUB_ENHANCED_CLIENT_ID || '',
        clientSecret: process.env.GITHUB_ENHANCED_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/github-enhanced`,
        scopes: ["repo","user:email","read:org"],
        authUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        userInfoUrl: 'https://api.github.com/user',
      },
    });

    // GitHub
    this.providers.set('github', {
      name: 'github',
      displayName: 'GitHub',
      config: {
        clientId: process.env.GITHUB_CLIENT_ID || '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/github`,
        scopes: ["repo","user:email","read:org"],
        authUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        userInfoUrl: 'https://api.github.com/user',
      },
    });

    // Gitlab
    this.providers.set('gitlab', {
      name: 'gitlab',
      displayName: 'Gitlab',
      config: {
        clientId: process.env.GITLAB_CLIENT_ID || '',
        clientSecret: process.env.GITLAB_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/gitlab`,
        scopes: ["read","write"],
        authUrl: 'https://api.gitlab.com/oauth/authorize',
        tokenUrl: 'https://api.gitlab.com/oauth/token',
      },
    });

    // Gmail Enhanced
    this.providers.set('gmail-enhanced', {
      name: 'gmail-enhanced',
      displayName: 'Gmail Enhanced',
      config: {
        clientId: process.env.GMAIL_ENHANCED_CLIENT_ID || '',
        clientSecret: process.env.GMAIL_ENHANCED_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/gmail-enhanced`,
        scopes: ["read","write"],
        authUrl: 'https://gmail.googleapis.com/gmail/v1/oauth/authorize',
        tokenUrl: 'https://gmail.googleapis.com/gmail/v1/oauth/token',
      },
    });

    // Hubspot Enhanced
    this.providers.set('hubspot-enhanced', {
      name: 'hubspot-enhanced',
      displayName: 'Hubspot Enhanced',
      config: {
        clientId: process.env.HUBSPOT_ENHANCED_CLIENT_ID || '',
        clientSecret: process.env.HUBSPOT_ENHANCED_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/hubspot-enhanced`,
        scopes: ["contacts","content","reports","social","timeline"],
        authUrl: 'https://app.hubspot.com/oauth/authorize',
        tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
        userInfoUrl: 'https://api.hubapi.com/oauth/v1/access-tokens/{token}',
        additionalParams: {"optional_scope":"content"},
      },
      customAuthParams: {"optional_scope":"content"},
    });

    // HubSpot
    this.providers.set('hubspot', {
      name: 'hubspot',
      displayName: 'HubSpot',
      config: {
        clientId: process.env.HUBSPOT_CLIENT_ID || '',
        clientSecret: process.env.HUBSPOT_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/hubspot`,
        scopes: ["contacts","content","reports","social","timeline"],
        authUrl: 'https://app.hubspot.com/oauth/authorize',
        tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
        userInfoUrl: 'https://api.hubapi.com/oauth/v1/access-tokens/{token}',
        additionalParams: {"optional_scope":"content"},
      },
      customAuthParams: {"optional_scope":"content"},
    });

    // Intercom
    this.providers.set('intercom', {
      name: 'intercom',
      displayName: 'Intercom',
      config: {
        clientId: process.env.INTERCOM_CLIENT_ID || '',
        clientSecret: process.env.INTERCOM_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/intercom`,
        scopes: ["read","write"],
        authUrl: 'https://api.intercom.com/oauth/authorize',
        tokenUrl: 'https://api.intercom.com/oauth/token',
      },
    });

    // Jenkins
    this.providers.set('jenkins', {
      name: 'jenkins',
      displayName: 'Jenkins',
      config: {
        clientId: process.env.JENKINS_CLIENT_ID || '',
        clientSecret: process.env.JENKINS_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/jenkins`,
        scopes: ["read","write"],
        authUrl: 'https://api.jenkins.com/oauth/authorize',
        tokenUrl: 'https://api.jenkins.com/oauth/token',
      },
    });

    // Jira Service Management
    this.providers.set('jira-service-management', {
      name: 'jira-service-management',
      displayName: 'Jira Service Management',
      config: {
        clientId: process.env.JIRA_SERVICE_MANAGEMENT_CLIENT_ID || '',
        clientSecret: process.env.JIRA_SERVICE_MANAGEMENT_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/jira-service-management`,
        scopes: ["read:jira-work","write:jira-work","read:jira-user"],
        authUrl: 'https://auth.atlassian.com/authorize',
        tokenUrl: 'https://auth.atlassian.com/oauth/token',
        userInfoUrl: 'https://api.atlassian.com/me',
      },
    });

    // Jira
    this.providers.set('jira', {
      name: 'jira',
      displayName: 'Jira',
      config: {
        clientId: process.env.JIRA_CLIENT_ID || '',
        clientSecret: process.env.JIRA_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/jira`,
        scopes: ["read:jira-work","write:jira-work","read:jira-user"],
        authUrl: 'https://auth.atlassian.com/authorize',
        tokenUrl: 'https://auth.atlassian.com/oauth/token',
        userInfoUrl: 'https://api.atlassian.com/me',
      },
    });

    // Jotform
    this.providers.set('jotform', {
      name: 'jotform',
      displayName: 'Jotform',
      config: {
        clientId: process.env.JOTFORM_CLIENT_ID || '',
        clientSecret: process.env.JOTFORM_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/jotform`,
        scopes: ["read","write"],
        authUrl: 'https://api.jotform.com/oauth/authorize',
        tokenUrl: 'https://api.jotform.com/oauth/token',
      },
    });

    // Klaviyo
    this.providers.set('klaviyo', {
      name: 'klaviyo',
      displayName: 'Klaviyo',
      config: {
        clientId: process.env.KLAVIYO_CLIENT_ID || '',
        clientSecret: process.env.KLAVIYO_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/klaviyo`,
        scopes: ["read","write"],
        authUrl: 'https://api.klaviyo.com/oauth/authorize',
        tokenUrl: 'https://api.klaviyo.com/oauth/token',
      },
    });

    // Linear
    this.providers.set('linear', {
      name: 'linear',
      displayName: 'Linear',
      config: {
        clientId: process.env.LINEAR_CLIENT_ID || '',
        clientSecret: process.env.LINEAR_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/linear`,
        scopes: ["read","write"],
        authUrl: 'https://api.linear.com/oauth/authorize',
        tokenUrl: 'https://api.linear.com/oauth/token',
      },
    });

    // Looker
    this.providers.set('looker', {
      name: 'looker',
      displayName: 'Looker',
      config: {
        clientId: process.env.LOOKER_CLIENT_ID || '',
        clientSecret: process.env.LOOKER_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/looker`,
        scopes: ["read","write"],
        authUrl: 'https://api.example.com/oauth/authorize',
        tokenUrl: 'https://api.example.com/oauth/token',
      },
    });

    // Mailchimp Enhanced
    this.providers.set('mailchimp-enhanced', {
      name: 'mailchimp-enhanced',
      displayName: 'Mailchimp Enhanced',
      config: {
        clientId: process.env.MAILCHIMP_ENHANCED_CLIENT_ID || '',
        clientSecret: process.env.MAILCHIMP_ENHANCED_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/mailchimp-enhanced`,
        scopes: ["read","write"],
        authUrl: 'https://login.mailchimp.com/oauth2/authorize',
        tokenUrl: 'https://login.mailchimp.com/oauth2/token',
      },
    });

    // Mailchimp
    this.providers.set('mailchimp', {
      name: 'mailchimp',
      displayName: 'Mailchimp',
      config: {
        clientId: process.env.MAILCHIMP_CLIENT_ID || '',
        clientSecret: process.env.MAILCHIMP_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/mailchimp`,
        scopes: ["read","write"],
        authUrl: 'https://login.mailchimp.com/oauth2/authorize',
        tokenUrl: 'https://login.mailchimp.com/oauth2/token',
      },
    });

    // Microsoft Teams
    this.providers.set('microsoft-teams', {
      name: 'microsoft-teams',
      displayName: 'Microsoft Teams',
      config: {
        clientId: process.env.MICROSOFT_TEAMS_CLIENT_ID || '',
        clientSecret: process.env.MICROSOFT_TEAMS_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/microsoft-teams`,
        scopes: ["read","write"],
        authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
      },
    });

    // Microsoft To Do
    this.providers.set('microsoft-todo', {
      name: 'microsoft-todo',
      displayName: 'Microsoft To Do',
      config: {
        clientId: process.env.MICROSOFT_TODO_CLIENT_ID || '',
        clientSecret: process.env.MICROSOFT_TODO_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/microsoft-todo`,
        scopes: ["read","write"],
        authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
      },
    });

    // Monday Enhanced
    this.providers.set('monday-enhanced', {
      name: 'monday-enhanced',
      displayName: 'Monday Enhanced',
      config: {
        clientId: process.env.MONDAY_ENHANCED_CLIENT_ID || '',
        clientSecret: process.env.MONDAY_ENHANCED_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/monday-enhanced`,
        scopes: ["read","write"],
        authUrl: 'https://api.monday.com/oauth/authorize',
        tokenUrl: 'https://api.monday.com/oauth/token',
      },
    });

    // New Relic
    this.providers.set('newrelic', {
      name: 'newrelic',
      displayName: 'New Relic',
      config: {
        clientId: process.env.NEWRELIC_CLIENT_ID || '',
        clientSecret: process.env.NEWRELIC_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/newrelic`,
        scopes: ["read","write"],
        authUrl: 'https://api.example.com/oauth/authorize',
        tokenUrl: 'https://api.example.com/oauth/token',
      },
    });

    // Notion Enhanced
    this.providers.set('notion-enhanced', {
      name: 'notion-enhanced',
      displayName: 'Notion Enhanced',
      config: {
        clientId: process.env.NOTION_ENHANCED_CLIENT_ID || '',
        clientSecret: process.env.NOTION_ENHANCED_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/notion-enhanced`,
        scopes: ["read","update","insert"],
        authUrl: 'https://api.notion.com/v1/oauth/authorize',
        tokenUrl: 'https://api.notion.com/v1/oauth/token',
        userInfoUrl: 'https://api.notion.com/v1/users/me',
      },
      pkceRequired: true,
    });

    // Notion
    this.providers.set('notion', {
      name: 'notion',
      displayName: 'Notion',
      config: {
        clientId: process.env.NOTION_CLIENT_ID || '',
        clientSecret: process.env.NOTION_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/notion`,
        scopes: ["read","update","insert"],
        authUrl: 'https://api.notion.com/v1/oauth/authorize',
        tokenUrl: 'https://api.notion.com/v1/oauth/token',
        userInfoUrl: 'https://api.notion.com/v1/users/me',
      },
      pkceRequired: true,
    });

    // OneDrive
    this.providers.set('onedrive', {
      name: 'onedrive',
      displayName: 'OneDrive',
      config: {
        clientId: process.env.ONEDRIVE_CLIENT_ID || '',
        clientSecret: process.env.ONEDRIVE_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/onedrive`,
        scopes: ["read","write","files"],
        authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
      },
    });

    // Opsgenie
    this.providers.set('opsgenie', {
      name: 'opsgenie',
      displayName: 'Opsgenie',
      config: {
        clientId: process.env.OPSGENIE_CLIENT_ID || '',
        clientSecret: process.env.OPSGENIE_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/opsgenie`,
        scopes: ["read","write"],
        authUrl: 'https://api.example.com/oauth/authorize',
        tokenUrl: 'https://api.example.com/oauth/token',
      },
    });

    // Outlook
    this.providers.set('outlook', {
      name: 'outlook',
      displayName: 'Outlook',
      config: {
        clientId: process.env.OUTLOOK_CLIENT_ID || '',
        clientSecret: process.env.OUTLOOK_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/outlook`,
        scopes: ["read","write"],
        authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
      },
    });

    // Pipedrive
    this.providers.set('pipedrive', {
      name: 'pipedrive',
      displayName: 'Pipedrive',
      config: {
        clientId: process.env.PIPEDRIVE_CLIENT_ID || '',
        clientSecret: process.env.PIPEDRIVE_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/pipedrive`,
        scopes: ["read","write"],
        authUrl: 'https://api.pipedrive.com/oauth/authorize',
        tokenUrl: 'https://api.pipedrive.com/oauth/token',
      },
    });

    // Power BI Enhanced
    this.providers.set('powerbi-enhanced', {
      name: 'powerbi-enhanced',
      displayName: 'Power BI Enhanced',
      config: {
        clientId: process.env.POWERBI_ENHANCED_CLIENT_ID || '',
        clientSecret: process.env.POWERBI_ENHANCED_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/powerbi-enhanced`,
        scopes: ["read","write"],
        authUrl: 'https://api.example.com/oauth/authorize',
        tokenUrl: 'https://api.example.com/oauth/token',
      },
    });

    // Power BI
    this.providers.set('powerbi', {
      name: 'powerbi',
      displayName: 'Power BI',
      config: {
        clientId: process.env.POWERBI_CLIENT_ID || '',
        clientSecret: process.env.POWERBI_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/powerbi`,
        scopes: ["read","write"],
        authUrl: 'https://api.powerbi.com/v1.0/oauth/authorize',
        tokenUrl: 'https://api.powerbi.com/v1.0/oauth/token',
      },
    });

    // QuickBooks
    this.providers.set('quickbooks', {
      name: 'quickbooks',
      displayName: 'QuickBooks',
      config: {
        clientId: process.env.QUICKBOOKS_CLIENT_ID || '',
        clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/quickbooks`,
        scopes: ["read","write"],
        authUrl: 'https://api.example.com/oauth/authorize',
        tokenUrl: 'https://api.example.com/oauth/token',
      },
    });

    // Razorpay
    this.providers.set('razorpay', {
      name: 'razorpay',
      displayName: 'Razorpay',
      config: {
        clientId: process.env.RAZORPAY_CLIENT_ID || '',
        clientSecret: process.env.RAZORPAY_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/razorpay`,
        scopes: ["read","write"],
        authUrl: 'https://api.razorpay.com/oauth/authorize',
        tokenUrl: 'https://api.razorpay.com/oauth/token',
      },
    });

    // Salesforce Enhanced
    this.providers.set('salesforce-enhanced', {
      name: 'salesforce-enhanced',
      displayName: 'Salesforce Enhanced',
      config: {
        clientId: process.env.SALESFORCE_ENHANCED_CLIENT_ID || '',
        clientSecret: process.env.SALESFORCE_ENHANCED_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/salesforce-enhanced`,
        scopes: ["api","chatter_api","full","id","refresh_token"],
        authUrl: 'https://login.salesforce.com/services/oauth2/authorize',
        tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
        userInfoUrl: 'https://login.salesforce.com/services/oauth2/userinfo',
        additionalParams: {"prompt":"consent"},
      },
      customAuthParams: {"prompt":"consent"},
    });

    // Salesforce
    this.providers.set('salesforce', {
      name: 'salesforce',
      displayName: 'Salesforce',
      config: {
        clientId: process.env.SALESFORCE_CLIENT_ID || '',
        clientSecret: process.env.SALESFORCE_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/salesforce`,
        scopes: ["api","chatter_api","full","id","refresh_token"],
        authUrl: 'https://login.salesforce.com/services/oauth2/authorize',
        tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
        userInfoUrl: 'https://login.salesforce.com/services/oauth2/userinfo',
        additionalParams: {"prompt":"consent"},
      },
      customAuthParams: {"prompt":"consent"},
    });

    // SAP Ariba
    this.providers.set('sap-ariba', {
      name: 'sap-ariba',
      displayName: 'SAP Ariba',
      config: {
        clientId: process.env.SAP_ARIBA_CLIENT_ID || '',
        clientSecret: process.env.SAP_ARIBA_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/sap-ariba`,
        scopes: ["read","write"],
        authUrl: 'https://api.example.com/oauth/authorize',
        tokenUrl: 'https://api.example.com/oauth/token',
      },
    });

    // Sendgrid
    this.providers.set('sendgrid', {
      name: 'sendgrid',
      displayName: 'Sendgrid',
      config: {
        clientId: process.env.SENDGRID_CLIENT_ID || '',
        clientSecret: process.env.SENDGRID_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/sendgrid`,
        scopes: ["read","write"],
        authUrl: 'https://api.sendgrid.com/oauth/authorize',
        tokenUrl: 'https://api.sendgrid.com/oauth/token',
      },
    });

    // Sentry
    this.providers.set('sentry', {
      name: 'sentry',
      displayName: 'Sentry',
      config: {
        clientId: process.env.SENTRY_CLIENT_ID || '',
        clientSecret: process.env.SENTRY_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/sentry`,
        scopes: ["read","write"],
        authUrl: 'https://api.example.com/oauth/authorize',
        tokenUrl: 'https://api.example.com/oauth/token',
      },
    });

    // SharePoint
    this.providers.set('sharepoint', {
      name: 'sharepoint',
      displayName: 'SharePoint',
      config: {
        clientId: process.env.SHAREPOINT_CLIENT_ID || '',
        clientSecret: process.env.SHAREPOINT_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/sharepoint`,
        scopes: ["read","write"],
        authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
      },
    });

    // Shopify Enhanced
    this.providers.set('shopify-enhanced', {
      name: 'shopify-enhanced',
      displayName: 'Shopify Enhanced',
      config: {
        clientId: process.env.SHOPIFY_ENHANCED_CLIENT_ID || '',
        clientSecret: process.env.SHOPIFY_ENHANCED_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/shopify-enhanced`,
        scopes: ["read_products","write_products","read_orders","write_orders"],
        authUrl: 'https://{shop}.myshopify.com/admin/oauth/authorize',
        tokenUrl: 'https://{shop}.myshopify.com/admin/oauth/access_token',
      },
      pkceRequired: true,
    });

    // Shopify
    this.providers.set('shopify', {
      name: 'shopify',
      displayName: 'Shopify',
      config: {
        clientId: process.env.SHOPIFY_CLIENT_ID || '',
        clientSecret: process.env.SHOPIFY_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/shopify`,
        scopes: ["read_products","write_products","read_orders","write_orders"],
        authUrl: 'https://{shop}.myshopify.com/admin/oauth/authorize',
        tokenUrl: 'https://{shop}.myshopify.com/admin/oauth/access_token',
      },
      pkceRequired: true,
    });

    // Slack Enhanced
    this.providers.set('slack-enhanced', {
      name: 'slack-enhanced',
      displayName: 'Slack Enhanced',
      config: {
        clientId: process.env.SLACK_ENHANCED_CLIENT_ID || '',
        clientSecret: process.env.SLACK_ENHANCED_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/slack-enhanced`,
        scopes: ["channels:read","chat:write","users:read","files:write"],
        authUrl: 'https://slack.com/oauth/v2/authorize',
        tokenUrl: 'https://slack.com/api/oauth.v2.access',
        userInfoUrl: 'https://slack.com/api/users.identity',
        additionalParams: {"user_scope":"identity.basic"},
      },
      pkceRequired: true,
      customAuthParams: {"user_scope":"identity.basic"},
    });

    // Slack
    this.providers.set('slack', {
      name: 'slack',
      displayName: 'Slack',
      config: {
        clientId: process.env.SLACK_CLIENT_ID || '',
        clientSecret: process.env.SLACK_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/slack`,
        scopes: ["channels:read","chat:write","users:read","files:write"],
        authUrl: 'https://slack.com/oauth/v2/authorize',
        tokenUrl: 'https://slack.com/api/oauth.v2.access',
        userInfoUrl: 'https://slack.com/api/users.identity',
        additionalParams: {"user_scope":"identity.basic"},
      },
      pkceRequired: true,
      customAuthParams: {"user_scope":"identity.basic"},
    });

    // Smartsheet
    this.providers.set('smartsheet', {
      name: 'smartsheet',
      displayName: 'Smartsheet',
      config: {
        clientId: process.env.SMARTSHEET_CLIENT_ID || '',
        clientSecret: process.env.SMARTSHEET_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/smartsheet`,
        scopes: ["read","write","projects"],
        authUrl: 'https://api.example.com/oauth/authorize',
        tokenUrl: 'https://api.example.com/oauth/token',
      },
    });

    // Snowflake
    this.providers.set('snowflake', {
      name: 'snowflake',
      displayName: 'Snowflake',
      config: {
        clientId: process.env.SNOWFLAKE_CLIENT_ID || '',
        clientSecret: process.env.SNOWFLAKE_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/snowflake`,
        scopes: ["read","write"],
        authUrl: 'https://{account}.snowflakecomputing.com/api/v2/oauth/authorize',
        tokenUrl: 'https://{account}.snowflakecomputing.com/api/v2/oauth/token',
      },
    });

    // Stripe Enhanced
    this.providers.set('stripe-enhanced', {
      name: 'stripe-enhanced',
      displayName: 'Stripe Enhanced',
      config: {
        clientId: process.env.STRIPE_ENHANCED_CLIENT_ID || '',
        clientSecret: process.env.STRIPE_ENHANCED_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/stripe-enhanced`,
        scopes: ["read_write"],
        authUrl: 'https://connect.stripe.com/oauth/authorize',
        tokenUrl: 'https://connect.stripe.com/oauth/token',
      },
      pkceRequired: true,
    });

    // SuccessFactors
    this.providers.set('successfactors', {
      name: 'successfactors',
      displayName: 'SuccessFactors',
      config: {
        clientId: process.env.SUCCESSFACTORS_CLIENT_ID || '',
        clientSecret: process.env.SUCCESSFACTORS_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/successfactors`,
        scopes: ["read","write"],
        authUrl: 'https://api4.successfactors.com/odata/v2/oauth/authorize',
        tokenUrl: 'https://api4.successfactors.com/odata/v2/oauth/token',
      },
    });

    // Tableau
    this.providers.set('tableau', {
      name: 'tableau',
      displayName: 'Tableau',
      config: {
        clientId: process.env.TABLEAU_CLIENT_ID || '',
        clientSecret: process.env.TABLEAU_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/tableau`,
        scopes: ["read","write"],
        authUrl: 'https://api.example.com/oauth/authorize',
        tokenUrl: 'https://api.example.com/oauth/token',
      },
    });

    // Trello Enhanced
    this.providers.set('trello-enhanced', {
      name: 'trello-enhanced',
      displayName: 'Trello Enhanced',
      config: {
        clientId: process.env.TRELLO_ENHANCED_CLIENT_ID || '',
        clientSecret: process.env.TRELLO_ENHANCED_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/trello-enhanced`,
        scopes: ["read","write"],
        authUrl: 'https://api.trello.com/oauth/authorize',
        tokenUrl: 'https://api.trello.com/oauth/token',
      },
    });

    // Typeform
    this.providers.set('typeform', {
      name: 'typeform',
      displayName: 'Typeform',
      config: {
        clientId: process.env.TYPEFORM_CLIENT_ID || '',
        clientSecret: process.env.TYPEFORM_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/typeform`,
        scopes: ["read","write"],
        authUrl: 'https://api.typeform.com/oauth/authorize',
        tokenUrl: 'https://api.typeform.com/oauth/token',
      },
    });

    // VictorOps
    this.providers.set('victorops', {
      name: 'victorops',
      displayName: 'VictorOps',
      config: {
        clientId: process.env.VICTOROPS_CLIENT_ID || '',
        clientSecret: process.env.VICTOROPS_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/victorops`,
        scopes: ["read","write"],
        authUrl: 'https://api.example.com/oauth/authorize',
        tokenUrl: 'https://api.example.com/oauth/token',
      },
    });

    // Woocommerce
    this.providers.set('woocommerce', {
      name: 'woocommerce',
      displayName: 'Woocommerce',
      config: {
        clientId: process.env.WOOCOMMERCE_CLIENT_ID || '',
        clientSecret: process.env.WOOCOMMERCE_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/woocommerce`,
        scopes: ["read","write"],
        authUrl: 'https://api.woocommerce.com/oauth/authorize',
        tokenUrl: 'https://api.woocommerce.com/oauth/token',
      },
    });

    // Workday
    this.providers.set('workday', {
      name: 'workday',
      displayName: 'Workday',
      config: {
        clientId: process.env.WORKDAY_CLIENT_ID || '',
        clientSecret: process.env.WORKDAY_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/workday`,
        scopes: ["read","write"],
        authUrl: 'https://wd5-impl-services1.workday.com/ccx/api/v1/oauth/authorize',
        tokenUrl: 'https://wd5-impl-services1.workday.com/ccx/api/v1/oauth/token',
      },
    });

    // Workfront
    this.providers.set('workfront', {
      name: 'workfront',
      displayName: 'Workfront',
      config: {
        clientId: process.env.WORKFRONT_CLIENT_ID || '',
        clientSecret: process.env.WORKFRONT_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/workfront`,
        scopes: ["read","write","projects"],
        authUrl: 'https://api.example.com/oauth/authorize',
        tokenUrl: 'https://api.example.com/oauth/token',
      },
    });

    // Xero
    this.providers.set('xero', {
      name: 'xero',
      displayName: 'Xero',
      config: {
        clientId: process.env.XERO_CLIENT_ID || '',
        clientSecret: process.env.XERO_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/xero`,
        scopes: ["read","write"],
        authUrl: 'https://api.example.com/oauth/authorize',
        tokenUrl: 'https://api.example.com/oauth/token',
      },
    });

    // Zendesk
    this.providers.set('zendesk', {
      name: 'zendesk',
      displayName: 'Zendesk',
      config: {
        clientId: process.env.ZENDESK_CLIENT_ID || '',
        clientSecret: process.env.ZENDESK_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/zendesk`,
        scopes: ["read","write"],
        authUrl: 'https://{subdomain}.zendesk.com/api/v2/oauth/authorize',
        tokenUrl: 'https://{subdomain}.zendesk.com/api/v2/oauth/token',
      },
    });

    // Zoho Books
    this.providers.set('zoho-books', {
      name: 'zoho-books',
      displayName: 'Zoho Books',
      config: {
        clientId: process.env.ZOHO_BOOKS_CLIENT_ID || '',
        clientSecret: process.env.ZOHO_BOOKS_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/zoho-books`,
        scopes: ["read","write"],
        authUrl: 'https://api.example.com/oauth/authorize',
        tokenUrl: 'https://api.example.com/oauth/token',
      },
    });

    // Zoho Crm
    this.providers.set('zoho-crm', {
      name: 'zoho-crm',
      displayName: 'Zoho Crm',
      config: {
        clientId: process.env.ZOHO_CRM_CLIENT_ID || '',
        clientSecret: process.env.ZOHO_CRM_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/zoho-crm`,
        scopes: ["read","write"],
        authUrl: 'https://api.zoho-crm.com/oauth/authorize',
        tokenUrl: 'https://api.zoho-crm.com/oauth/token',
      },
    });

    // Zoom Enhanced
    this.providers.set('zoom-enhanced', {
      name: 'zoom-enhanced',
      displayName: 'Zoom Enhanced',
      config: {
        clientId: process.env.ZOOM_ENHANCED_CLIENT_ID || '',
        clientSecret: process.env.ZOOM_ENHANCED_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/zoom-enhanced`,
        scopes: ["read","write"],
        authUrl: 'https://api.zoom.com/oauth/authorize',
        tokenUrl: 'https://api.zoom.com/oauth/token',
      },
    });
  }

  /**
   * Generate authorization URL with state and PKCE
   */
  async generateAuthUrl(
    providerId: string, 
    userId: string, 
    returnUrl?: string,
    additionalScopes?: string[]
  ): Promise<{ authUrl: string; state: string }> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`OAuth provider not found: ${providerId}`);
    }

    // Generate state
    const state = EncryptionService.generateSecureId();
    const nonce = EncryptionService.generateSecureId();
    
    // Generate code verifier for PKCE if required
    let codeVerifier: string | undefined;
    let codeChallenge: string | undefined;
    
    if (provider.pkceRequired) {
      codeVerifier = this.generateCodeVerifier();
      codeChallenge = await this.generateCodeChallenge(codeVerifier);
    }

    // Store state
    this.pendingStates.set(state, {
      userId,
      provider: providerId,
      returnUrl,
      codeVerifier,
      nonce,
      createdAt: Date.now()
    });

    // Build authorization URL
    const scopes = [...provider.config.scopes];
    if (additionalScopes) {
      scopes.push(...additionalScopes);
    }

    const params = new URLSearchParams({
      client_id: provider.config.clientId,
      redirect_uri: provider.config.redirectUri,
      scope: scopes.join(' '),
      response_type: 'code',
      state,
      ...provider.config.additionalParams,
      ...provider.customAuthParams
    });

    if (codeChallenge) {
      params.set('code_challenge', codeChallenge);
      params.set('code_challenge_method', 'S256');
    }

    const authUrl = `${provider.config.authUrl}?${params.toString()}`;

    return { authUrl, state };
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleCallback(
    code: string, 
    state: string, 
    providerId: string
  ): Promise<{ tokens: OAuthTokens; userInfo?: OAuthUserInfo }> {
    // Verify state
    const storedState = this.pendingStates.get(state);
    if (!storedState || storedState.provider !== providerId) {
      throw new Error('Invalid OAuth state');
    }

    // Clean up state
    this.pendingStates.delete(state);

    // Check state expiry (15 minutes)
    if (Date.now() - storedState.createdAt > 15 * 60 * 1000) {
      throw new Error('OAuth state expired');
    }

    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`OAuth provider not found: ${providerId}`);
    }

    // Exchange code for tokens
    const tokens = await this.exchangeCodeForTokens(
      provider, 
      code, 
      storedState.codeVerifier
    );

    // Get user info if URL is provided
    let userInfo: OAuthUserInfo | undefined;
    if (provider.config.userInfoUrl && tokens.accessToken) {
      try {
        userInfo = await this.getUserInfo(provider, tokens.accessToken);
      } catch (error) {
        console.warn(`Failed to get user info for ${providerId}:`, error);
      }
    }

    // Store connection
    await connectionService.storeConnection(
      storedState.userId,
      providerId,
      tokens,
      userInfo
    );

    return { tokens, userInfo };
  }

  /**
   * Refresh access token
   */
  async refreshToken(userId: string, providerId: string): Promise<OAuthTokens> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`OAuth provider not found: ${providerId}`);
    }

    // Get stored connection
    const connection = await connectionService.getConnection(userId, providerId);
    if (!connection || !connection.refreshToken) {
      throw new Error('No refresh token available');
    }

    // Refresh tokens
    const tokenData = {
      grant_type: 'refresh_token',
      refresh_token: connection.refreshToken,
      client_id: provider.config.clientId,
      client_secret: provider.config.clientSecret
    };

    try {
      const response = await fetch(provider.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'Apps-Script-Automation/1.0'
        },
        body: new URLSearchParams(tokenData)
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      const newTokens: OAuthTokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || connection.refreshToken,
        expiresAt: data.expires_in ? Date.now() + (data.expires_in * 1000) : undefined,
        tokenType: data.token_type || 'Bearer',
        scope: data.scope
      };

      // Update stored connection
      await connectionService.updateConnection(userId, providerId, newTokens);

      return newTokens;

    } catch (error) {
      throw new Error(`Token refresh failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Exchange authorization code for tokens
   */
  private async exchangeCodeForTokens(
    provider: OAuthProvider, 
    code: string, 
    codeVerifier?: string
  ): Promise<OAuthTokens> {
    const tokenData: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: provider.config.redirectUri,
      client_id: provider.config.clientId,
      client_secret: provider.config.clientSecret
    };

    if (codeVerifier) {
      tokenData.code_verifier = codeVerifier;
    }

    try {
      const response = await fetch(provider.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'Apps-Script-Automation/1.0'
        },
        body: new URLSearchParams(tokenData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token exchange failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_in ? Date.now() + (data.expires_in * 1000) : undefined,
        tokenType: data.token_type || 'Bearer',
        scope: data.scope
      };

    } catch (error) {
      throw new Error(`Token exchange failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Get user information
   */
  private async getUserInfo(provider: OAuthProvider, accessToken: string): Promise<OAuthUserInfo> {
    if (!provider.config.userInfoUrl) {
      throw new Error('No user info URL configured');
    }

    try {
      const response = await fetch(provider.config.userInfoUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'User-Agent': 'Apps-Script-Automation/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`User info request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        id: data.id || data.sub || data.user_id || data.userId,
        email: data.email || data.emailAddress,
        name: data.name || data.display_name || data.displayName,
        avatar: data.avatar || data.picture || data.avatar_url,
        additionalData: data
      };

    } catch (error) {
      throw new Error(`Failed to get user info: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Generate PKCE code verifier
   */
  private generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode.apply(null, Array.from(array)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Generate PKCE code challenge
   */
  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(digest))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Clean up expired states
   */
  private cleanupExpiredStates(): void {
    const now = Date.now();
    const expiredStates: string[] = [];

    for (const [state, data] of this.pendingStates) {
      if (now - data.createdAt > 15 * 60 * 1000) { // 15 minutes
        expiredStates.push(state);
      }
    }

    expiredStates.forEach(state => this.pendingStates.delete(state));
  }

  /**
   * Get provider by ID
   */
  getProvider(providerId: string): OAuthProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * List all available providers
   */
  listProviders(): OAuthProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Check if provider supports OAuth
   */
  supportsOAuth(providerId: string): boolean {
    return this.providers.has(providerId);
  }
}

export const oauthManager = new OAuthManager();