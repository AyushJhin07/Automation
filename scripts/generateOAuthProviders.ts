// COMPREHENSIVE OAUTH PROVIDER GENERATOR
// Generates OAuth provider configurations for ALL external applications

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

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
  actions: any[];
  triggers: any[];
}

interface OAuthProviderDefinition {
  id: string;
  name: string;
  displayName: string;
  authType: string;
  scopes: string[];
  authUrl?: string;
  tokenUrl?: string;
  userInfoUrl?: string;
  pkceRequired?: boolean;
  customParams?: Record<string, string>;
}

export class OAuthProviderGenerator {
  private connectorsPath: string;
  private oauthManagerPath: string;

  constructor() {
    this.connectorsPath = join(process.cwd(), 'connectors');
    this.oauthManagerPath = join(process.cwd(), 'server', 'oauth', 'OAuthManager.ts');
  }

  /**
   * Generate OAuth providers for all applications
   */
  async generateAllOAuthProviders(): Promise<{ generated: number; errors: string[] }> {
    console.log('🔐 Generating OAuth providers for all applications...\n');
    
    const results = {
      generated: 0,
      errors: [] as string[]
    };

    try {
      // Get all connectors
      const connectorFiles = readdirSync(this.connectorsPath).filter(f => f.endsWith('.json'));
      const providers: OAuthProviderDefinition[] = [];

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

          // Generate OAuth provider definition
          const provider = this.generateProviderDefinition(connector);
          if (provider) {
            providers.push(provider);
            console.log(`✅ Generated OAuth config for ${connector.name}`);
            results.generated++;
          }

        } catch (error) {
          const errorMsg = `Failed to process ${file}: ${error}`;
          console.error(`❌ ${errorMsg}`);
          results.errors.push(errorMsg);
        }
      }

      // Generate the OAuth manager code
      await this.generateOAuthManagerCode(providers);
      console.log(`\n✅ Generated comprehensive OAuth manager with ${providers.length} providers`);

      console.log(`\n🎯 OAuth provider generation complete:`);
      console.log(`  ✅ Generated: ${results.generated} providers`);
      console.log(`  ❌ Errors: ${results.errors.length} providers`);

      return results;

    } catch (error) {
      const errorMsg = `OAuth provider generation failed: ${error}`;
      console.error(`💥 ${errorMsg}`);
      results.errors.push(errorMsg);
      return results;
    }
  }

  /**
   * Generate OAuth provider definition for a connector
   */
  private generateProviderDefinition(connector: ConnectorData): OAuthProviderDefinition | null {
    const authType = connector.authentication?.type?.toLowerCase() || 'oauth2';
    
    // Skip basic auth and API key (these don't need OAuth flows)
    if (authType === 'basic' || authType === 'api_key') {
      console.log(`⚠️ Skipping ${connector.name} - uses ${authType} authentication`);
      return null;
    }

    // Skip Google Workspace apps (they share Google OAuth)
    if (this.isGoogleWorkspaceApp(connector.id)) {
      console.log(`⚠️ Skipping ${connector.name} - uses shared Google OAuth`);
      return null;
    }

    return {
      id: connector.id,
      name: connector.id,
      displayName: connector.name,
      authType: authType,
      scopes: this.generateDefaultScopes(connector),
      authUrl: this.getAuthUrl(connector),
      tokenUrl: this.getTokenUrl(connector),
      userInfoUrl: this.getUserInfoUrl(connector),
      pkceRequired: this.requiresPKCE(connector),
      customParams: this.getCustomParams(connector)
    };
  }

  /**
   * Generate default scopes for an application
   */
  private generateDefaultScopes(connector: ConnectorData): string[] {
    const category = connector.category.toLowerCase();
    const appId = connector.id.toLowerCase();

    // App-specific scopes
    if (appId.includes('slack')) {
      return ['channels:read', 'chat:write', 'users:read', 'files:write'];
    } else if (appId.includes('github')) {
      return ['repo', 'user:email', 'read:org'];
    } else if (appId.includes('shopify')) {
      return ['read_products', 'write_products', 'read_orders', 'write_orders'];
    } else if (appId.includes('stripe')) {
      return ['read_write'];
    } else if (appId.includes('hubspot')) {
      return ['contacts', 'content', 'reports', 'social', 'timeline'];
    } else if (appId.includes('salesforce')) {
      return ['api', 'chatter_api', 'full', 'id', 'refresh_token'];
    } else if (appId.includes('jira')) {
      return ['read:jira-work', 'write:jira-work', 'read:jira-user'];
    } else if (appId.includes('notion')) {
      return ['read', 'update', 'insert'];
    } else if (appId.includes('airtable')) {
      return ['data.records:read', 'data.records:write', 'schema.bases:read'];
    } else if (appId.includes('dropbox')) {
      return ['files.content.write', 'files.content.read', 'sharing.write'];
    } else if (appId.includes('mailchimp')) {
      return ['read', 'write'];
    } else if (appId.includes('twilio')) {
      return ['read', 'write'];
    }

    // Category-based default scopes
    if (category.includes('crm')) {
      return ['read', 'write', 'contacts'];
    } else if (category.includes('project')) {
      return ['read', 'write', 'projects'];
    } else if (category.includes('communication')) {
      return ['read', 'write', 'messages'];
    } else if (category.includes('storage')) {
      return ['read', 'write', 'files'];
    } else if (category.includes('marketing')) {
      return ['read', 'write', 'campaigns'];
    }

    // Default scopes
    return ['read', 'write'];
  }

  /**
   * Get authorization URL for application
   */
  private getAuthUrl(connector: ConnectorData): string {
    const appId = connector.id.toLowerCase();
    
    if (appId.includes('microsoft') || appId.includes('outlook') || appId.includes('sharepoint') || appId.includes('onedrive')) {
      return 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
    } else if (appId.includes('slack')) {
      return 'https://slack.com/oauth/v2/authorize';
    } else if (appId.includes('github')) {
      return 'https://github.com/login/oauth/authorize';
    } else if (appId.includes('shopify')) {
      return 'https://{shop}.myshopify.com/admin/oauth/authorize';
    } else if (appId.includes('stripe')) {
      return 'https://connect.stripe.com/oauth/authorize';
    } else if (appId.includes('hubspot')) {
      return 'https://app.hubspot.com/oauth/authorize';
    } else if (appId.includes('salesforce')) {
      return 'https://login.salesforce.com/services/oauth2/authorize';
    } else if (appId.includes('jira')) {
      return 'https://auth.atlassian.com/authorize';
    } else if (appId.includes('notion')) {
      return 'https://api.notion.com/v1/oauth/authorize';
    } else if (appId.includes('airtable')) {
      return 'https://airtable.com/oauth2/v1/authorize';
    } else if (appId.includes('dropbox')) {
      return 'https://www.dropbox.com/oauth2/authorize';
    } else if (appId.includes('mailchimp')) {
      return 'https://login.mailchimp.com/oauth2/authorize';
    } else if (appId.includes('twilio')) {
      return 'https://www.twilio.com/console/authorize';
    }

    // Default OAuth endpoint
    const baseUrl = connector.baseUrl || `https://api.${connector.id}.com`;
    return `${baseUrl}/oauth/authorize`;
  }

  /**
   * Get token URL for application
   */
  private getTokenUrl(connector: ConnectorData): string {
    const appId = connector.id.toLowerCase();
    
    if (appId.includes('microsoft') || appId.includes('outlook') || appId.includes('sharepoint') || appId.includes('onedrive')) {
      return 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
    } else if (appId.includes('slack')) {
      return 'https://slack.com/api/oauth.v2.access';
    } else if (appId.includes('github')) {
      return 'https://github.com/login/oauth/access_token';
    } else if (appId.includes('shopify')) {
      return 'https://{shop}.myshopify.com/admin/oauth/access_token';
    } else if (appId.includes('stripe')) {
      return 'https://connect.stripe.com/oauth/token';
    } else if (appId.includes('hubspot')) {
      return 'https://api.hubapi.com/oauth/v1/token';
    } else if (appId.includes('salesforce')) {
      return 'https://login.salesforce.com/services/oauth2/token';
    } else if (appId.includes('jira')) {
      return 'https://auth.atlassian.com/oauth/token';
    } else if (appId.includes('notion')) {
      return 'https://api.notion.com/v1/oauth/token';
    } else if (appId.includes('airtable')) {
      return 'https://airtable.com/oauth2/v1/token';
    } else if (appId.includes('dropbox')) {
      return 'https://api.dropboxapi.com/oauth2/token';
    } else if (appId.includes('mailchimp')) {
      return 'https://login.mailchimp.com/oauth2/token';
    } else if (appId.includes('twilio')) {
      return 'https://accounts.twilio.com/oauth2/token';
    }

    // Default OAuth endpoint
    const baseUrl = connector.baseUrl || `https://api.${connector.id}.com`;
    return `${baseUrl}/oauth/token`;
  }

  /**
   * Get user info URL for application
   */
  private getUserInfoUrl(connector: ConnectorData): string | undefined {
    const appId = connector.id.toLowerCase();
    
    if (appId.includes('microsoft') || appId.includes('outlook') || appId.includes('sharepoint') || appId.includes('onedrive')) {
      return 'https://graph.microsoft.com/v1.0/me';
    } else if (appId.includes('slack')) {
      return 'https://slack.com/api/users.identity';
    } else if (appId.includes('github')) {
      return 'https://api.github.com/user';
    } else if (appId.includes('hubspot')) {
      return 'https://api.hubapi.com/oauth/v1/access-tokens/{token}';
    } else if (appId.includes('salesforce')) {
      return 'https://login.salesforce.com/services/oauth2/userinfo';
    } else if (appId.includes('jira')) {
      return 'https://api.atlassian.com/me';
    } else if (appId.includes('notion')) {
      return 'https://api.notion.com/v1/users/me';
    } else if (appId.includes('dropbox')) {
      return 'https://api.dropboxapi.com/2/users/get_current_account';
    }

    return undefined;
  }

  /**
   * Check if application requires PKCE
   */
  private requiresPKCE(connector: ConnectorData): boolean {
    const appId = connector.id.toLowerCase();
    
    // Apps that require PKCE
    return (
      appId.includes('slack') ||
      appId.includes('shopify') ||
      appId.includes('stripe') ||
      appId.includes('notion') ||
      appId.includes('airtable')
    );
  }

  /**
   * Get custom OAuth parameters
   */
  private getCustomParams(connector: ConnectorData): Record<string, string> | undefined {
    const appId = connector.id.toLowerCase();
    
    if (appId.includes('slack')) {
      return { user_scope: 'identity.basic' };
    } else if (appId.includes('salesforce')) {
      return { prompt: 'consent' };
    } else if (appId.includes('hubspot')) {
      return { optional_scope: 'content' };
    }

    return undefined;
  }

  /**
   * Generate the complete OAuth manager code
   */
  private async generateOAuthManagerCode(providers: OAuthProviderDefinition[]): Promise<void> {
    const managerCode = `// COMPREHENSIVE OAUTH MANAGER - AUTO-GENERATED
// Handles OAuth flows for ALL ${providers.length} supported applications

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
${this.generateProviderInitializations(providers)}
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
      throw new Error(\`OAuth provider not found: \${providerId}\`);
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

    const authUrl = \`\${provider.config.authUrl}?\${params.toString()}\`;

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
      throw new Error(\`OAuth provider not found: \${providerId}\`);
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
        console.warn(\`Failed to get user info for \${providerId}:\`, error);
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
      throw new Error(\`OAuth provider not found: \${providerId}\`);
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
        throw new Error(\`Token refresh failed: \${response.status} \${response.statusText}\`);
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
      throw new Error(\`Token refresh failed: \${getErrorMessage(error)}\`);
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
        throw new Error(\`Token exchange failed: \${response.status} \${response.statusText} - \${errorText}\`);
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
      throw new Error(\`Token exchange failed: \${getErrorMessage(error)}\`);
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
          'Authorization': \`Bearer \${accessToken}\`,
          'Accept': 'application/json',
          'User-Agent': 'Apps-Script-Automation/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(\`User info request failed: \${response.status} \${response.statusText}\`);
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
      throw new Error(\`Failed to get user info: \${getErrorMessage(error)}\`);
    }
  }

  /**
   * Generate PKCE code verifier
   */
  private generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode.apply(null, Array.from(array)))
      .replace(/\\+/g, '-')
      .replace(/\\//g, '_')
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
      .replace(/\\+/g, '-')
      .replace(/\\//g, '_')
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

export const oauthManager = new OAuthManager();`;

    writeFileSync(this.oauthManagerPath, managerCode);
  }

  /**
   * Generate provider initialization code
   */
  private generateProviderInitializations(providers: OAuthProviderDefinition[]): string {
    return providers.map(provider => {
      const envPrefix = provider.id.toUpperCase().replace(/-/g, '_');
      
      return `    // ${provider.displayName}
    this.providers.set('${provider.id}', {
      name: '${provider.id}',
      displayName: '${provider.displayName}',
      config: {
        clientId: process.env.${envPrefix}_CLIENT_ID || '',
        clientSecret: process.env.${envPrefix}_CLIENT_SECRET || '',
        redirectUri: \`\${process.env.BASE_URL || 'http://localhost:5000'}/api/oauth/callback/${provider.id}\`,
        scopes: ${JSON.stringify(provider.scopes)},
        authUrl: '${provider.authUrl}',
        tokenUrl: '${provider.tokenUrl}',${provider.userInfoUrl ? `\n        userInfoUrl: '${provider.userInfoUrl}',` : ''}${provider.customParams ? `\n        additionalParams: ${JSON.stringify(provider.customParams)},` : ''}
      },${provider.pkceRequired ? `\n      pkceRequired: true,` : ''}${provider.customParams ? `\n      customAuthParams: ${JSON.stringify(provider.customParams)},` : ''}
    });`;
    }).join('\n\n');
  }

  /**
   * Load connector data
   */
  private loadConnector(filename: string): ConnectorData {
    const filePath = join(this.connectorsPath, filename);
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
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
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  async function runGeneration() {
    console.log('🚀 Running OAuth provider generation from CLI...\n');
    
    const generator = new OAuthProviderGenerator();
    
    try {
      const results = await generator.generateAllOAuthProviders();
      
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

export default OAuthProviderGenerator;