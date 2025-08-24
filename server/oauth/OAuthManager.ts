// OAUTH MANAGER - HANDLES OAUTH FLOWS FOR ALL BUSINESS APPLICATIONS
// Provides unified OAuth2 authentication for Gmail, Shopify, GitHub, etc.

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
   * Initialize OAuth providers for all supported applications
   */
  private initializeProviders(): void {
    // Gmail (Google)
    this.providers.set('gmail', {
      name: 'gmail',
      displayName: 'Gmail',
      config: {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/gmail`,
        scopes: [
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/gmail.modify',
          'https://www.googleapis.com/auth/gmail.labels'
        ],
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo'
      }
    });

    // Google Sheets
    this.providers.set('google-sheets', {
      name: 'google-sheets',
      displayName: 'Google Sheets',
      config: {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/google-sheets`,
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive.readonly'
        ],
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo'
      }
    });

    // Shopify
    this.providers.set('shopify', {
      name: 'shopify',
      displayName: 'Shopify',
      config: {
        clientId: process.env.SHOPIFY_CLIENT_ID || '',
        clientSecret: process.env.SHOPIFY_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/shopify`,
        scopes: [
          'read_products',
          'write_products',
          'read_orders',
          'write_orders',
          'read_customers',
          'write_customers',
          'read_inventory',
          'write_inventory'
        ],
        authUrl: 'https://{shop}.myshopify.com/admin/oauth/authorize',
        tokenUrl: 'https://{shop}.myshopify.com/admin/oauth/access_token'
      }
    });

    // GitHub
    this.providers.set('github', {
      name: 'github',
      displayName: 'GitHub',
      config: {
        clientId: process.env.GITHUB_CLIENT_ID || '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/github`,
        scopes: ['repo', 'user:email', 'read:org'],
        authUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        userInfoUrl: 'https://api.github.com/user'
      }
    });

    // Slack
    this.providers.set('slack', {
      name: 'slack',
      displayName: 'Slack',
      config: {
        clientId: process.env.SLACK_CLIENT_ID || '',
        clientSecret: process.env.SLACK_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/slack`,
        scopes: [
          'channels:read',
          'channels:write',
          'chat:write',
          'users:read',
          'files:write'
        ],
        authUrl: 'https://slack.com/oauth/v2/authorize',
        tokenUrl: 'https://slack.com/api/oauth.v2.access',
        userInfoUrl: 'https://slack.com/api/auth.test'
      }
    });

    // Stripe
    this.providers.set('stripe', {
      name: 'stripe',
      displayName: 'Stripe',
      config: {
        clientId: process.env.STRIPE_CLIENT_ID || '',
        clientSecret: process.env.STRIPE_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/stripe`,
        scopes: ['read_write'],
        authUrl: 'https://connect.stripe.com/oauth/authorize',
        tokenUrl: 'https://connect.stripe.com/oauth/token',
        userInfoUrl: 'https://api.stripe.com/v1/account'
      }
    });

    // Mailchimp
    this.providers.set('mailchimp', {
      name: 'mailchimp',
      displayName: 'Mailchimp',
      config: {
        clientId: process.env.MAILCHIMP_CLIENT_ID || '',
        clientSecret: process.env.MAILCHIMP_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/mailchimp`,
        scopes: ['read', 'write'],
        authUrl: 'https://login.mailchimp.com/oauth2/authorize',
        tokenUrl: 'https://login.mailchimp.com/oauth2/token',
        userInfoUrl: 'https://login.mailchimp.com/oauth2/metadata'
      }
    });

    // Twilio (uses API keys, but we'll support OAuth for enterprise)
    this.providers.set('twilio', {
      name: 'twilio',
      displayName: 'Twilio',
      config: {
        clientId: process.env.TWILIO_CLIENT_ID || '',
        clientSecret: process.env.TWILIO_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/twilio`,
        scopes: ['messaging', 'voice', 'video'],
        authUrl: 'https://www.twilio.com/oauth/authorize',
        tokenUrl: 'https://api.twilio.com/oauth/token'
      }
    });

    // Airtable
    this.providers.set('airtable', {
      name: 'airtable',
      displayName: 'Airtable',
      config: {
        clientId: process.env.AIRTABLE_CLIENT_ID || '',
        clientSecret: process.env.AIRTABLE_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/airtable`,
        scopes: ['data:read', 'data:write', 'schema:read'],
        authUrl: 'https://airtable.com/oauth2/v1/authorize',
        tokenUrl: 'https://airtable.com/oauth2/v1/token'
      },
      pkceRequired: true
    });

    // Dropbox
    this.providers.set('dropbox', {
      name: 'dropbox',
      displayName: 'Dropbox',
      config: {
        clientId: process.env.DROPBOX_CLIENT_ID || '',
        clientSecret: process.env.DROPBOX_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/dropbox`,
        scopes: ['files.content.read', 'files.content.write', 'files.metadata.read'],
        authUrl: 'https://www.dropbox.com/oauth2/authorize',
        tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
        userInfoUrl: 'https://api.dropboxapi.com/2/users/get_current_account'
      }
    });

    // HubSpot
    this.providers.set('hubspot', {
      name: 'hubspot',
      displayName: 'HubSpot',
      config: {
        clientId: process.env.HUBSPOT_CLIENT_ID || '',
        clientSecret: process.env.HUBSPOT_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/hubspot`,
        scopes: ['contacts', 'content', 'reports', 'social', 'automation'],
        authUrl: 'https://app.hubspot.com/oauth/authorize',
        tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
        userInfoUrl: 'https://api.hubapi.com/oauth/v1/access-tokens'
      }
    });

    // Notion
    this.providers.set('notion', {
      name: 'notion',
      displayName: 'Notion',
      config: {
        clientId: process.env.NOTION_CLIENT_ID || '',
        clientSecret: process.env.NOTION_CLIENT_SECRET || '',
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/notion`,
        scopes: ['read', 'update', 'insert'],
        authUrl: 'https://api.notion.com/v1/oauth/authorize',
        tokenUrl: 'https://api.notion.com/v1/oauth/token'
      }
    });
  }

  /**
   * Generate OAuth authorization URL
   */
  public async generateAuthUrl(
    provider: string,
    userId: string,
    additionalParams?: Record<string, string>
  ): Promise<{ authUrl: string; state: string }> {
    const oauthProvider = this.providers.get(provider);
    if (!oauthProvider) {
      throw new Error(`OAuth provider ${provider} not supported`);
    }

    // Generate state for CSRF protection
    const state = this.generateSecureState();
    const nonce = this.generateNonce();

    // Generate PKCE parameters if required
    let codeVerifier: string | undefined;
    let codeChallenge: string | undefined;
    
    if (oauthProvider.pkceRequired) {
      codeVerifier = this.generateCodeVerifier();
      codeChallenge = await this.generateCodeChallenge(codeVerifier);
    }

    // Store state information
    const oauthState: OAuthState = {
      userId,
      provider,
      nonce,
      codeVerifier,
      createdAt: Date.now()
    };
    
    this.pendingStates.set(state, oauthState);

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: oauthProvider.config.clientId,
      redirect_uri: oauthProvider.config.redirectUri,
      scope: oauthProvider.config.scopes.join(' '),
      response_type: 'code',
      state,
      access_type: 'offline', // For refresh tokens
      prompt: 'consent'
    });

    // Add PKCE parameters if required
    if (codeChallenge) {
      params.append('code_challenge', codeChallenge);
      params.append('code_challenge_method', 'S256');
    }

    // Add additional parameters
    if (additionalParams) {
      Object.entries(additionalParams).forEach(([key, value]) => {
        params.append(key, value);
      });
    }

    // Handle provider-specific URL patterns
    let authUrl = oauthProvider.config.authUrl;
    if (provider === 'shopify' && additionalParams?.shop) {
      authUrl = authUrl.replace('{shop}', additionalParams.shop);
    }

    const fullAuthUrl = `${authUrl}?${params.toString()}`;

    return { authUrl: fullAuthUrl, state };
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  public async handleCallback(
    provider: string,
    code: string,
    state: string,
    additionalParams?: Record<string, string>
  ): Promise<{ tokens: OAuthTokens; userInfo?: OAuthUserInfo }> {
    // Validate state
    const oauthState = this.pendingStates.get(state);
    if (!oauthState || oauthState.provider !== provider) {
      throw new Error('Invalid OAuth state');
    }

    // Check state expiration (10 minutes)
    if (Date.now() - oauthState.createdAt > 10 * 60 * 1000) {
      this.pendingStates.delete(state);
      throw new Error('OAuth state expired');
    }

    const oauthProvider = this.providers.get(provider);
    if (!oauthProvider) {
      throw new Error(`OAuth provider ${provider} not supported`);
    }

    try {
      // Exchange code for tokens
      const tokens = await this.exchangeCodeForTokens(
        oauthProvider,
        code,
        oauthState.codeVerifier,
        additionalParams
      );

      // Get user information if URL is provided
      let userInfo: OAuthUserInfo | undefined;
      if (oauthProvider.config.userInfoUrl && tokens.accessToken) {
        userInfo = await this.fetchUserInfo(oauthProvider, tokens.accessToken);
      }

      // Clean up state
      this.pendingStates.delete(state);

      return { tokens, userInfo };

    } catch (error) {
      this.pendingStates.delete(state);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  public async refreshToken(
    provider: string,
    refreshToken: string
  ): Promise<OAuthTokens> {
    const oauthProvider = this.providers.get(provider);
    if (!oauthProvider) {
      throw new Error(`OAuth provider ${provider} not supported`);
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: oauthProvider.config.clientId,
      client_secret: oauthProvider.config.clientSecret
    });

    const response = await fetch(oauthProvider.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
    }

    const tokenData = await response.json();
    
    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || refreshToken, // Keep old refresh token if new one not provided
      expiresAt: tokenData.expires_in ? Date.now() + (tokenData.expires_in * 1000) : undefined,
      tokenType: tokenData.token_type || 'Bearer',
      scope: tokenData.scope
    };
  }

  /**
   * Store OAuth connection for user
   */
  public async storeConnection(
    userId: string,
    provider: string,
    tokens: OAuthTokens,
    userInfo?: OAuthUserInfo,
    additionalConfig?: Record<string, any>
  ): Promise<string> {
    const credentials = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      tokenType: tokens.tokenType,
      scope: tokens.scope,
      ...additionalConfig
    };

    const connectionName = `${provider}-${userInfo?.email || userInfo?.id || 'connection'}`;

    return await connectionService.createConnection(
      userId,
      provider,
      connectionName,
      credentials
    );
  }

  /**
   * Get supported OAuth providers
   */
  public getSupportedProviders(): Array<{ name: string; displayName: string; scopes: string[] }> {
    return Array.from(this.providers.values()).map(provider => ({
      name: provider.name,
      displayName: provider.displayName,
      scopes: provider.config.scopes
    }));
  }

  /**
   * Check if provider is configured
   */
  public isProviderConfigured(provider: string): boolean {
    const oauthProvider = this.providers.get(provider);
    return !!(oauthProvider?.config.clientId && oauthProvider?.config.clientSecret);
  }

  // ===== PRIVATE HELPER METHODS =====

  /**
   * Exchange authorization code for tokens
   */
  private async exchangeCodeForTokens(
    provider: OAuthProvider,
    code: string,
    codeVerifier?: string,
    additionalParams?: Record<string, string>
  ): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: provider.config.redirectUri,
      client_id: provider.config.clientId,
      client_secret: provider.config.clientSecret
    });

    // Add PKCE verifier if used
    if (codeVerifier) {
      params.append('code_verifier', codeVerifier);
    }

    // Handle provider-specific token URL patterns
    let tokenUrl = provider.config.tokenUrl;
    if (provider.name === 'shopify' && additionalParams?.shop) {
      tokenUrl = tokenUrl.replace('{shop}', additionalParams.shop);
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
    }

    const tokenData = await response.json();

    if (tokenData.error) {
      throw new Error(`OAuth error: ${tokenData.error_description || tokenData.error}`);
    }

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: tokenData.expires_in ? Date.now() + (tokenData.expires_in * 1000) : undefined,
      tokenType: tokenData.token_type || 'Bearer',
      scope: tokenData.scope
    };
  }

  /**
   * Fetch user information using access token
   */
  private async fetchUserInfo(
    provider: OAuthProvider,
    accessToken: string
  ): Promise<OAuthUserInfo> {
    if (!provider.config.userInfoUrl) {
      throw new Error('User info URL not configured for provider');
    }

    const response = await fetch(provider.config.userInfoUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user info: ${response.status}`);
    }

    const userData = await response.json();

    // Normalize user data across providers
    return {
      id: userData.id || userData.sub || userData.user_id,
      email: userData.email,
      name: userData.name || userData.display_name || userData.login,
      avatar: userData.picture || userData.avatar_url,
      additionalData: userData
    };
  }

  /**
   * Generate secure random state
   */
  private generateSecureState(): string {
    return EncryptionService.generateRandomString(32);
  }

  /**
   * Generate nonce for additional security
   */
  private generateNonce(): string {
    return EncryptionService.generateRandomString(16);
  }

  /**
   * Generate PKCE code verifier
   */
  private generateCodeVerifier(): string {
    return EncryptionService.generateRandomString(128);
  }

  /**
   * Generate PKCE code challenge
   */
  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Buffer.from(digest).toString('base64url');
  }
}

// Export singleton instance
export const oauthManager = new OAuthManager();