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
};

type AuthStatus = 'idle' | 'loading';

type AuthResult = { success: true } | { success: false; error: string };

type StoredAuthState = {
  token?: string;
  refreshToken?: string;
  user?: AuthUser;
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
        user: result.user
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
        user: result.user
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
      set({ token: undefined, refreshToken: undefined, user: undefined, status: 'idle', error: undefined });
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
  }
}));

export const authStore = useAuthStore;
