import { connectionService } from '../../services/ConnectionService';
import { env } from '../../env';
import { DEFAULT_OAUTH_STATE_TTL_SECONDS, oauthStateStore } from '../stateStore';
import type {
  OAuthConfig,
  OAuthProvider,
  OAuthState,
  OAuthTokens,
  OAuthUserInfo,
} from '../OAuthManager';

export type { OAuthConfig, OAuthProvider, OAuthTokens, OAuthUserInfo } from '../OAuthManager';

interface ProviderMetadata {
  provider: OAuthProvider;
  tokens?: Partial<OAuthTokens>;
  userInfo?: OAuthUserInfo;
}

const DEFAULT_RETURN_BASE = () => env.SERVER_PUBLIC_URL || process.env.BASE_URL || 'http://localhost:5000';
const DEFAULT_EXPIRES_AT = 1_700_000_000_000;

function normalizeReturnUrl(providerId: string, returnUrl?: string): string {
  if (returnUrl) {
    return returnUrl;
  }

  const base = DEFAULT_RETURN_BASE();
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  return `${normalizedBase}/oauth/callback/${providerId}`;
}

export class MockOAuthManager {
  private providers = new Map<string, ProviderMetadata>();
  private stateCounter = 0;

  reset() {
    this.providers.clear();
    oauthStateStore.clearAll();
    this.stateCounter = 0;
  }

  registerProvider(
    providerId: string,
    options: {
      displayName?: string;
      config?: Partial<OAuthConfig>;
      tokens?: Partial<OAuthTokens>;
      userInfo?: OAuthUserInfo;
    } = {}
  ) {
    const normalizedId = providerId.toLowerCase();
    const defaultConfig: OAuthConfig = {
      clientId: `${normalizedId}-client-id`,
      clientSecret: `${normalizedId}-client-secret`,
      redirectUri: normalizeReturnUrl(normalizedId),
      scopes: options.config?.scopes ?? ['read'],
      authUrl: options.config?.authUrl ?? `https://example.test/oauth/${normalizedId}`,
      tokenUrl: options.config?.tokenUrl ?? `https://example.test/token/${normalizedId}`,
      userInfoUrl: options.config?.userInfoUrl,
      additionalParams: options.config?.additionalParams,
    };

    const provider: OAuthProvider = {
      name: normalizedId,
      displayName: options.displayName ?? providerId,
      config: {
        ...defaultConfig,
        ...options.config,
        scopes: options.config?.scopes ?? defaultConfig.scopes,
      },
    };

    this.providers.set(normalizedId, {
      provider,
      tokens: options.tokens,
      userInfo: options.userInfo,
    });
  }

  supportsOAuth(providerId: string): boolean {
    return this.providers.has(providerId.toLowerCase());
  }

  listProviders(): OAuthProvider[] {
    return Array.from(this.providers.values()).map(({ provider }) => provider);
  }

  listDisabledProviders(): Array<{ provider: OAuthProvider; reason: string }> {
    return [];
  }

  getProvider(providerId: string): OAuthProvider | undefined {
    return this.providers.get(providerId.toLowerCase())?.provider;
  }

  getSupportedProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  isProviderConfigured(providerId: string): boolean {
    return this.supportsOAuth(providerId);
  }

  resolveReturnUrl(providerId: string, state?: string): string {
    if (state) {
      const lookup = oauthStateStore.peek(state);
      if (lookup.found && !lookup.expired && lookup.state?.provider === providerId.toLowerCase() && lookup.state.returnUrl) {
        return lookup.state.returnUrl;
      }
    }
    return normalizeReturnUrl(providerId.toLowerCase());
  }

  async generateAuthUrl(
    providerId: string,
    userId: string,
    organizationId: string,
    returnUrl?: string,
    additionalScopes?: string[],
    options: { connectionId?: string; label?: string } = {}
  ): Promise<{ authUrl: string; state: string }> {
    const normalizedId = providerId.toLowerCase();
    const metadata = this.providers.get(normalizedId);

    if (!metadata) {
      throw new Error(`Unsupported OAuth provider: ${providerId}`);
    }

    const state = `mock-${normalizedId}-${++this.stateCounter}`;
    const redirectUri = normalizeReturnUrl(normalizedId, returnUrl);

    const storedState: OAuthState = {
      userId,
      organizationId,
      provider: normalizedId,
      returnUrl: redirectUri,
      connectionId: options.connectionId,
      label: options.label,
      scopes: additionalScopes ?? metadata.provider.config.scopes,
      codeVerifier: undefined,
      nonce: `mock-nonce-${state}`,
      createdAt: Date.now(),
    };

    oauthStateStore.set(state, storedState, DEFAULT_OAUTH_STATE_TTL_SECONDS);

    const authUrl = `${metadata.provider.config.authUrl}?response_type=code&client_id=${encodeURIComponent(metadata.provider.config.clientId)}&redirect_uri=${encodeURIComponent(metadata.provider.config.redirectUri)}&state=${encodeURIComponent(state)}`;

    return { authUrl, state };
  }

  private buildTokens(providerId: string, override?: Partial<OAuthTokens>): OAuthTokens {
    const normalizedId = providerId.toLowerCase();
    const accessToken = override?.accessToken ?? `${normalizedId}-access-token`;
    const refreshToken = override?.refreshToken ?? `${normalizedId}-refresh-token`;

    return {
      accessToken,
      refreshToken,
      expiresAt: override?.expiresAt ?? DEFAULT_EXPIRES_AT,
      tokenType: override?.tokenType ?? 'Bearer',
      scope: override?.scope,
    };
  }

  private buildUserInfo(providerId: string, userId: string, override?: OAuthUserInfo): OAuthUserInfo {
    if (override) {
      return override;
    }

    return {
      id: `${providerId}-user-${userId}`,
      email: `${userId}@example.test`,
      name: `${providerId.toUpperCase()} Test User`,
    };
  }

  async handleCallback(code: string, state: string, providerId: string): Promise<{
    tokens: OAuthTokens;
    userInfo?: OAuthUserInfo;
    returnUrl: string;
    connectionId: string;
    label: string;
    userInfoError?: string;
  }> {
    const normalizedId = providerId.toLowerCase();
    const { state: storedState, found, expired } = oauthStateStore.consume(state);

    if (!found || !storedState || storedState.provider !== normalizedId) {
      throw new Error('Invalid OAuth state');
    }

    if (expired) {
      throw new Error('OAuth state expired');
    }

    const metadata = this.providers.get(normalizedId);
    if (!metadata) {
      throw new Error(`Unsupported OAuth provider: ${providerId}`);
    }

    const tokens = this.buildTokens(normalizedId, metadata.tokens);
    if (tokens.scope === undefined && storedState.scopes?.length) {
      tokens.scope = storedState.scopes.join(' ');
    }

    const userInfo = this.buildUserInfo(normalizedId, storedState.userId, metadata.userInfo);
    const label = storedState.label ?? userInfo.email ?? `${metadata.provider.displayName} account`;

    const connectionId = await connectionService.storeConnection(
      storedState.userId,
      storedState.organizationId,
      normalizedId,
      tokens,
      userInfo,
      {
        name: label,
        connectionId: storedState.connectionId,
        metadata: {
          providerId: normalizedId,
          scopes: storedState.scopes ?? metadata.provider.config.scopes ?? [],
          authUrl: metadata.provider.config.authUrl,
          tokenUrl: metadata.provider.config.tokenUrl,
          deterministic: true,
        },
      }
    );

    return {
      tokens,
      userInfo,
      returnUrl: storedState.returnUrl,
      connectionId,
      label,
    };
  }

  async refreshToken(userId: string, organizationId: string, providerId: string): Promise<OAuthTokens> {
    const metadata = this.providers.get(providerId.toLowerCase());
    const tokens = this.buildTokens(providerId, metadata?.tokens);

    await connectionService.storeConnection(
      userId,
      organizationId,
      providerId,
      tokens,
      metadata?.userInfo,
      {
        metadata: {
          providerId,
          deterministic: true,
        },
      }
    );

    return tokens;
  }
}

export const oauthManager = new MockOAuthManager();
