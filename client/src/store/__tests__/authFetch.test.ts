import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { authStore } from '../authStore';

const createMemoryStorage = (): Storage => {
  const storage = new Map<string, string>();
  return {
    get length() {
      return storage.size;
    },
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    removeItem: (key: string) => {
      storage.delete(key);
    },
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
  } as Storage;
};

describe('authFetch', () => {
  const originalFetch = global.fetch;
  const originalWarn = console.warn;
  const originalState = authStore.getState();
  const originalLogout = authStore.getState().logout;

  beforeEach(() => {
    const memoryStorage = createMemoryStorage();
    Object.defineProperty(global, 'localStorage', {
      configurable: true,
      value: memoryStorage,
    });

    authStore.setState({
      token: 'old-token',
      refreshToken: 'old-refresh-token',
      activeOrganizationId: 'org-1',
      user: {
        id: 'user-1',
        email: 'user@example.com',
        role: 'admin',
        planType: 'enterprise',
      },
      organizations: [
        {
          id: 'org-1',
          name: 'Org One',
          plan: 'enterprise',
          status: 'active',
          role: 'admin',
          isDefault: true,
        },
      ],
      activeOrganization: {
        id: 'org-1',
        name: 'Org One',
        plan: 'enterprise',
        status: 'active',
        role: 'admin',
        isDefault: true,
      },
    } as any);
  });

  afterEach(() => {
    authStore.setState({
      token: originalState.token,
      refreshToken: originalState.refreshToken,
      activeOrganizationId: originalState.activeOrganizationId,
      user: originalState.user,
      organizations: originalState.organizations,
      activeOrganization: originalState.activeOrganization,
      logout: originalLogout,
    } as any);
    global.fetch = originalFetch;
    console.warn = originalWarn;
  });

  it('refreshes the access token and retries the original request once', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            token: 'new-token',
            refreshToken: 'new-refresh-token',
            activeOrganization: {
              id: 'org-1',
              name: 'Org One',
              plan: 'enterprise',
              status: 'active',
              role: 'admin',
              isDefault: true,
            },
            organizations: [
              {
                id: 'org-1',
                name: 'Org One',
                plan: 'enterprise',
                status: 'active',
                role: 'admin',
                isDefault: true,
              },
            ],
            user: {
              id: 'user-1',
              email: 'user@example.com',
              role: 'admin',
              planType: 'enterprise',
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    global.fetch = fetchMock as any;

    const response = await authStore.getState().authFetch('/api/protected');

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const firstHeaders = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(firstHeaders.get('Authorization')).toBe('Bearer old-token');

    expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/refresh');
    const refreshHeaders = new Headers(fetchMock.mock.calls[1][1]?.headers);
    expect(refreshHeaders.get('Content-Type')).toBe('application/json');
    const refreshBody = fetchMock.mock.calls[1][1]?.body as string;
    expect(JSON.parse(refreshBody).refreshToken).toBe('old-refresh-token');

    const retryHeaders = new Headers(fetchMock.mock.calls[2][1]?.headers);
    expect(retryHeaders.get('Authorization')).toBe('Bearer new-token');
    expect(authStore.getState().token).toBe('new-token');
    expect(authStore.getState().refreshToken).toBe('new-refresh-token');
  });

  it('logs a sanitized warning and logs out when refresh fails', async () => {
    const logoutMock = vi.fn().mockResolvedValue(undefined);
    authStore.setState({ logout: logoutMock } as any);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: false, error: 'Invalid refresh token' }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

    global.fetch = fetchMock as any;

    const warnMock = vi.fn();
    console.warn = warnMock;

    const response = await authStore.getState().authFetch('/api/protected');

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/refresh');
    expect(logoutMock).toHaveBeenCalledWith(true);
    expect(warnMock).toHaveBeenCalledTimes(1);
    const loggedArgs = warnMock.mock.calls[0];
    expect(loggedArgs.some((arg) => typeof arg === 'string' && arg.includes('old-refresh-token'))).toBe(false);
  });
});
