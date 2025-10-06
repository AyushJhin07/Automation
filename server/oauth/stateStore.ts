import type { OAuthState } from './OAuthManager';

export interface OAuthStateStoreEntry {
  state: OAuthState;
  expiresAt: number;
}

export interface OAuthStateConsumeResult {
  state?: OAuthState;
  found: boolean;
  expired: boolean;
  expiresAt?: number;
}

export interface OAuthStatePeekResult {
  state?: OAuthState;
  found: boolean;
  expired: boolean;
  expiresAt?: number;
}

export interface OAuthStateStore {
  set(stateKey: string, payload: OAuthState, ttlSeconds: number): void;
  consume(stateKey: string): OAuthStateConsumeResult;
  peek(stateKey: string): OAuthStatePeekResult;
  delete(stateKey: string): void;
  // Duplicate-callback guard helpers
  markConsumed(stateKey: string, data: Record<string, any> | undefined, ttlSeconds: number): void;
  getConsumed(stateKey: string): { found: boolean; data?: Record<string, any> };
  // Maintenance
  clearExpired(): void;
  clearAll(): void;
}

const GLOBAL_STORE_KEY = '__automationOAuthStateStore__';

interface GlobalWithStore extends typeof globalThis {
  [GLOBAL_STORE_KEY]?: DurableOAuthStateStore;
}

class DurableOAuthStateStore implements OAuthStateStore {
  private store: Map<string, OAuthStateStoreEntry>;
  private consumed: Map<string, { data?: Record<string, any>; expiresAt: number }>;

  constructor() {
    this.store = new Map();
    this.consumed = new Map();
  }

  set(stateKey: string, payload: OAuthState, ttlSeconds: number): void {
    const ttl = Math.max(1, ttlSeconds);
    const expiresAt = Date.now() + ttl * 1000;
    this.store.set(stateKey, { state: payload, expiresAt });
  }

  consume(stateKey: string): OAuthStateConsumeResult {
    const entry = this.store.get(stateKey);
    if (!entry) {
      return { found: false, expired: false };
    }

    this.store.delete(stateKey);
    const now = Date.now();
    const expired = now >= entry.expiresAt;

    if (expired) {
      return { found: true, expired: true, expiresAt: entry.expiresAt };
    }

    return { found: true, expired: false, state: entry.state, expiresAt: entry.expiresAt };
  }

  peek(stateKey: string): OAuthStatePeekResult {
    const entry = this.store.get(stateKey);
    if (!entry) {
      return { found: false, expired: false };
    }

    const now = Date.now();
    const expired = now >= entry.expiresAt;

    if (expired) {
      this.store.delete(stateKey);
      return { found: true, expired: true, expiresAt: entry.expiresAt };
    }

    return { found: true, expired: false, state: entry.state, expiresAt: entry.expiresAt };
  }

  delete(stateKey: string): void {
    this.store.delete(stateKey);
  }

  markConsumed(stateKey: string, data: Record<string, any> | undefined, ttlSeconds: number): void {
    const ttl = Math.max(1, ttlSeconds);
    const expiresAt = Date.now() + ttl * 1000;
    this.consumed.set(stateKey, { data, expiresAt });
  }

  getConsumed(stateKey: string): { found: boolean; data?: Record<string, any> } {
    const entry = this.consumed.get(stateKey);
    if (!entry) {
      return { found: false };
    }
    if (Date.now() >= entry.expiresAt) {
      this.consumed.delete(stateKey);
      return { found: false };
    }
    return { found: true, data: entry.data };
  }

  clearExpired(): void {
    const now = Date.now();
    for (const [stateKey, entry] of this.store.entries()) {
      if (now >= entry.expiresAt) {
        this.store.delete(stateKey);
      }
    }
    for (const [stateKey, entry] of this.consumed.entries()) {
      if (now >= entry.expiresAt) {
        this.consumed.delete(stateKey);
      }
    }
  }

  clearAll(): void {
    this.store.clear();
    this.consumed.clear();
  }
}

const globalScope = globalThis as GlobalWithStore;

if (!globalScope[GLOBAL_STORE_KEY]) {
  globalScope[GLOBAL_STORE_KEY] = new DurableOAuthStateStore();
}

export const oauthStateStore: OAuthStateStore = globalScope[GLOBAL_STORE_KEY]!;

export const DEFAULT_OAUTH_STATE_TTL_SECONDS = 12 * 60;
