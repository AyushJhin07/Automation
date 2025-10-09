import { create } from 'zustand';
import { toast } from 'sonner';

type AuthUser = {
  id: string;
  email: string;
  name?: string;
  role: string;
  planType: string;
  emailVerified?: boolean;
  quotaApiCalls?: number;
  quotaTokens?: number;
  organizationId?: string;
  organizationRole?: string;
};

type OrganizationSummary = {
  id: string;
  name: string;
  domain?: string | null;
  plan: string;
  status: string;
  role: string;
  isDefault: boolean;
  limits?: Record<string, any>;
  usage?: Record<string, any>;
};

type AuthStatus = 'idle' | 'loading';

type AuthResult = { success: true } | { success: false; error: string };

type StoredAuthState = {
  token?: string;
  refreshToken?: string;
  user?: AuthUser;
  organizations?: OrganizationSummary[];
  activeOrganization?: OrganizationSummary;
  activeOrganizationId?: string;
};

type AuthState = StoredAuthState & {
  status: AuthStatus;
  error?: string;
  initialized: boolean;
  initialize: () => void;
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (payload: { name?: string; email: string; password: string }) => Promise<AuthResult>;
  logout: (silent?: boolean) => Promise<void>;
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  refreshOrganizations: () => Promise<void>;
  selectOrganization: (organizationId: string) => Promise<AuthResult>;
  createOrganization: (payload: { name: string; domain?: string; plan?: string }) => Promise<AuthResult>;
};

const STORAGE_KEY = 'automation.auth.v1';

const sanitizeToken = (token?: string): string | undefined => {
  if (typeof token !== 'string') {
    return token ?? undefined;
  }
  const normalized = token.trim();
  if (normalized === '' || normalized === 'undefined' || normalized === 'null') {
    return undefined;
  }
  return normalized;
};

const sanitizeStoredAuthState = (state: StoredAuthState): StoredAuthState => ({
  ...state,
  token: sanitizeToken(state.token),
  refreshToken: sanitizeToken(state.refreshToken),
});

const persistState = (state: StoredAuthState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeStoredAuthState(state)));
  } catch (error) {
    console.warn('Failed to persist auth state', error);
  }
};

const restoreState = (): StoredAuthState => {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null || raw === '') return {};
    return sanitizeStoredAuthState(JSON.parse(raw) as StoredAuthState);
  } catch (error) {
    console.warn('Failed to restore auth state', error);
    return {};
  }
};

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'idle',
  initialized: false,
  ...restoreState(),
  initialize: () => {
    if (get().initialized) return;
    const restored = restoreState();
    set({ ...restored, initialized: true, status: 'idle', error: undefined });
  },
  login: async (email, password) => {
    set({ status: 'loading', error: undefined });
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        const error = result?.error || 'Login failed';
        set({ status: 'idle', error });
        return { success: false, error };
      }

      const nextState: StoredAuthState = {
        token: result.token,
        refreshToken: result.refreshToken,
        user: result.user,
        organizations: result.organizations,
        activeOrganization: result.activeOrganization,
        activeOrganizationId: result.activeOrganization?.id,
      };
      persistState(nextState);
      set({ ...nextState, status: 'idle', error: undefined });
      toast.success('Signed in successfully');
      return { success: true };
    } catch (error: any) {
      const message = error?.message || 'Unable to sign in';
      set({ status: 'idle', error: message });
      return { success: false, error: message };
    }
  },
  register: async ({ name, email, password }) => {
    set({ status: 'loading', error: undefined });
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        const error = result?.error || 'Registration failed';
        set({ status: 'idle', error });
        return { success: false, error };
      }

      const nextState: StoredAuthState = {
        token: result.token,
        refreshToken: result.refreshToken,
        user: result.user,
        organizations: result.organizations,
        activeOrganization: result.activeOrganization,
        activeOrganizationId: result.activeOrganization?.id,
      };
      persistState(nextState);
      set({ ...nextState, status: 'idle', error: undefined });
      toast.success('Account created and signed in');
      return { success: true };
    } catch (error: any) {
      const message = error?.message || 'Unable to register';
      set({ status: 'idle', error: message });
      return { success: false, error: message };
    }
  },
  logout: async (silent = false) => {
    const token = sanitizeToken(get().token);
    try {
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch (error) {
      if (!silent) {
        console.warn('Logout request failed', error);
      }
    } finally {
      persistState({});
      set({
        token: undefined,
        refreshToken: undefined,
        user: undefined,
        organizations: undefined,
        activeOrganization: undefined,
        activeOrganizationId: undefined,
        status: 'idle',
        error: undefined,
      });
      if (!silent) {
        toast.success('Signed out');
      }
    }
  },
  authFetch: async (input, init) => {
    const performRequest = async (tokenOverride?: string) => {
      const state = get();
      const token = sanitizeToken(tokenOverride ?? state.token);
      const headers = new Headers(init?.headers);
      if (!headers.has('Content-Type') && init?.body && !(init.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
      }
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      if (state.activeOrganizationId) {
        headers.set('X-Organization-Id', state.activeOrganizationId);
      }
      return fetch(input, { ...init, headers });
    };

    const response = await performRequest();
    if (response.status !== 401) {
      return response;
    }

    const storedRefreshToken = sanitizeToken(get().refreshToken);
    if (!storedRefreshToken) {
      await get().logout(true);
      return response;
    }

    let refreshedToken: string | undefined;
    try {
      const refreshResponse = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: storedRefreshToken })
      });

      const refreshData = await refreshResponse.json().catch(() => null);
      if (!refreshResponse.ok || !refreshData?.success || !refreshData?.token) {
        const errorMessage = refreshData?.error || `refresh failed with status ${refreshResponse.status}`;
        console.warn('Token refresh failed:', errorMessage);
        await get().logout(true);
        return response;
      }

      const nextState: StoredAuthState = {
        token: refreshData.token,
        refreshToken: refreshData.refreshToken,
        user: refreshData.user ?? get().user,
        organizations: refreshData.organizations ?? get().organizations,
        activeOrganization: refreshData.activeOrganization ?? get().activeOrganization,
        activeOrganizationId:
          refreshData.activeOrganizationId ?? refreshData.activeOrganization?.id ?? get().activeOrganizationId,
      };
      persistState(nextState);
      set((state) => ({ ...state, ...nextState }));
      refreshedToken = nextState.token;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      console.warn('Token refresh failed:', message);
      await get().logout(true);
      return response;
    }

    const retryResponse = await performRequest(refreshedToken);
    if (retryResponse.status === 401) {
      await get().logout(true);
    }
    return retryResponse;
  },
  refreshOrganizations: async () => {
    if (!get().token) return;
    const response = await get().authFetch('/api/organizations');
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data?.error || 'Failed to load workspaces');
    }
    const nextState: StoredAuthState = {
      token: get().token,
      refreshToken: get().refreshToken,
      user: get().user,
      organizations: data.organizations,
      activeOrganization: data.activeOrganization,
      activeOrganizationId: data.activeOrganizationId,
    };
    persistState(nextState);
    set((state) => ({ ...state, ...nextState }));
  },
  selectOrganization: async (organizationId) => {
    try {
      const response = await get().authFetch(`/api/organizations/${organizationId}/select`, {
        method: 'POST'
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        const error = data?.error || 'Failed to switch workspace';
        return { success: false, error };
      }
      const nextState: StoredAuthState = {
        token: get().token,
        refreshToken: get().refreshToken,
        user: get().user,
        organizations: data.organizations,
        activeOrganization: data.activeOrganization,
        activeOrganizationId: data.activeOrganization?.id,
      };
      persistState(nextState);
      set((state) => ({ ...state, ...nextState }));
      toast.success('Workspace switched');
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Failed to switch workspace' };
    }
  },
  createOrganization: async (payload) => {
    try {
      const response = await get().authFetch('/api/organizations', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        const error = data?.error || 'Failed to create workspace';
        return { success: false, error };
      }
      const nextState: StoredAuthState = {
        token: get().token,
        refreshToken: get().refreshToken,
        user: get().user,
        organizations: data.organizations,
        activeOrganization: data.activeOrganization,
        activeOrganizationId: data.activeOrganization?.id,
      };
      persistState(nextState);
      set((state) => ({ ...state, ...nextState }));
      toast.success('Workspace created');
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Failed to create workspace' };
    }
  }
}));

export const authStore = useAuthStore;
