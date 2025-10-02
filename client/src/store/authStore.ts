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
  activeOrganizationId?: string | null;
  organizationRole?: string;
  organizationPermissions?: OrganizationPermissions;
};

type OrganizationPermissions = {
  canCreateWorkflows: boolean;
  canEditWorkflows: boolean;
  canDeleteWorkflows: boolean;
  canManageUsers: boolean;
  canViewAnalytics: boolean;
  canManageBilling: boolean;
  canAccessApi: boolean;
};

type OrganizationSummary = {
  id: string;
  name: string;
  domain?: string | null;
  plan: string;
  status: string;
  role: string;
  isDefault: boolean;
  limits: {
    workflows: number;
    executions: number;
    apiCalls: number;
    users: number;
    storage: number;
  };
  usage: {
    apiCalls: number;
    workflowExecutions: number;
    storage: number;
    usersActive: number;
  };
  permissions: OrganizationPermissions;
};

type AuthStatus = 'idle' | 'loading';

type AuthResult = { success: true } | { success: false; error: string };

type StoredAuthState = {
  token?: string;
  refreshToken?: string;
  user?: AuthUser;
  organizations?: OrganizationSummary[];
  activeOrganizationId?: string | null;
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
  fetchOrganizations: () => Promise<void>;
  setActiveOrganization: (organizationId: string) => Promise<AuthResult>;
  createOrganization: (payload: { name: string; domain?: string; plan?: string; makeDefault?: boolean }) => Promise<AuthResult>;
  inviteToOrganization: (organizationId: string, payload: { email: string; role?: string; expiresInDays?: number }) => Promise<AuthResult>;
};

const STORAGE_KEY = 'automation.auth.v1';

const persistState = (state: StoredAuthState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
    if (!raw) return {};
    return JSON.parse(raw) as StoredAuthState;
  } catch (error) {
    console.warn('Failed to restore auth state', error);
    return {};
  }
};

export const useAuthStore = create<AuthState>((set, get) => {
  const restored = restoreState();

  return {
    status: 'idle',
    initialized: false,
    ...restored,
    organizations: restored.organizations ?? [],
    activeOrganizationId: restored.activeOrganizationId ?? null,
    initialize: () => {
      if (get().initialized) return;
      const state = restoreState();
      set({
        ...state,
        organizations: state.organizations ?? [],
        activeOrganizationId: state.activeOrganizationId ?? null,
        initialized: true,
        status: 'idle',
        error: undefined,
      });
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
          organizations: result.organizations || [],
          activeOrganizationId: result.activeOrganizationId ?? result.user?.activeOrganizationId ?? null,
        };
        persistState(nextState);
        set({
          ...nextState,
          organizations: nextState.organizations ?? [],
          activeOrganizationId: nextState.activeOrganizationId ?? null,
          status: 'idle',
          error: undefined,
        });
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
          organizations: result.organizations || [],
          activeOrganizationId: result.activeOrganizationId ?? result.user?.activeOrganizationId ?? null,
        };
        persistState(nextState);
        set({
          ...nextState,
          organizations: nextState.organizations ?? [],
          activeOrganizationId: nextState.activeOrganizationId ?? null,
          status: 'idle',
          error: undefined,
        });
        toast.success('Account created and signed in');
        return { success: true };
      } catch (error: any) {
        const message = error?.message || 'Unable to register';
        set({ status: 'idle', error: message });
        return { success: false, error: message };
      }
    },
    logout: async (silent = false) => {
      const token = get().token;
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
          status: 'idle',
          error: undefined,
          organizations: [],
          activeOrganizationId: null,
        });
        if (!silent) {
          toast.success('Signed out');
        }
      }
    },
    authFetch: async (input, init) => {
      const token = get().token;
      const headers = new Headers(init?.headers);
      if (!headers.has('Content-Type') && init?.body && !(init.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
      }
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      const response = await fetch(input, { ...init, headers });
      if (response.status === 401) {
        await get().logout(true);
      }
      return response;
    },
    async fetchOrganizations() {
      const response = await get().authFetch('/api/organizations');
      const result = await response.json();
      if (response.ok && result?.success) {
        set((state) => {
          const updatedUser = state.user ? {
            ...state.user,
            activeOrganizationId: result.activeOrganizationId ?? state.user?.activeOrganizationId ?? null,
            organizationRole: result.organizations?.find((org: OrganizationSummary) => org.id === (result.activeOrganizationId ?? state.user?.activeOrganizationId))?.role ?? state.user?.organizationRole,
            organizationPermissions: result.organizations?.find((org: OrganizationSummary) => org.id === (result.activeOrganizationId ?? state.user?.activeOrganizationId))?.permissions ?? state.user?.organizationPermissions,
          } : state.user;
          const nextState: StoredAuthState = {
            token: state.token,
            refreshToken: state.refreshToken,
            user: updatedUser,
            organizations: result.organizations,
            activeOrganizationId: result.activeOrganizationId ?? updatedUser?.activeOrganizationId ?? null,
          };
          persistState(nextState);
          return {
            ...state,
            user: updatedUser,
            organizations: result.organizations ?? [],
            activeOrganizationId: result.activeOrganizationId ?? updatedUser?.activeOrganizationId ?? null,
          };
        });
      }
    },
    async setActiveOrganization(organizationId) {
      const response = await get().authFetch(`/api/organizations/${organizationId}/activate`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        const error = result?.error || 'Unable to switch workspace';
        return { success: false, error };
      }
      set((state) => {
        const activeOrg: OrganizationSummary | undefined = result.organizations?.find((org: OrganizationSummary) => org.id === result.activeOrganizationId);
        const updatedUser = state.user ? {
          ...state.user,
          activeOrganizationId: result.activeOrganizationId ?? null,
          organizationRole: activeOrg?.role,
          organizationPermissions: activeOrg?.permissions,
        } : state.user;
        const nextState: StoredAuthState = {
          token: state.token,
          refreshToken: state.refreshToken,
          user: updatedUser,
          organizations: result.organizations,
          activeOrganizationId: result.activeOrganizationId ?? null,
        };
        persistState(nextState);
        return {
          ...state,
          user: updatedUser,
          organizations: result.organizations ?? [],
          activeOrganizationId: result.activeOrganizationId ?? null,
        };
      });
      return { success: true };
    },
    async createOrganization(payload) {
      const response = await get().authFetch('/api/organizations', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        const error = result?.error || 'Unable to create workspace';
        return { success: false, error };
      }
      set((state) => {
        const activeOrg: OrganizationSummary | undefined = result.organizations?.find((org: OrganizationSummary) => org.id === result.activeOrganizationId);
        const updatedUser = state.user ? {
          ...state.user,
          activeOrganizationId: result.activeOrganizationId ?? state.user.activeOrganizationId ?? null,
          organizationRole: activeOrg?.role ?? state.user.organizationRole,
          organizationPermissions: activeOrg?.permissions ?? state.user.organizationPermissions,
        } : state.user;
        const nextState: StoredAuthState = {
          token: state.token,
          refreshToken: state.refreshToken,
          user: updatedUser,
          organizations: result.organizations,
          activeOrganizationId: result.activeOrganizationId ?? updatedUser?.activeOrganizationId ?? null,
        };
        persistState(nextState);
        return {
          ...state,
          user: updatedUser,
          organizations: result.organizations ?? [],
          activeOrganizationId: result.activeOrganizationId ?? updatedUser?.activeOrganizationId ?? null,
        };
      });
      return { success: true };
    },
    async inviteToOrganization(organizationId, payload) {
      const response = await get().authFetch(`/api/organizations/${organizationId}/invite`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        const error = result?.error || 'Unable to send invitation';
        return { success: false, error };
      }
      return { success: true };
    }
};
});

export const authStore = useAuthStore;
