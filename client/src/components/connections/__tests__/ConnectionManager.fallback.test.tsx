import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';

import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { ConnectionManager } from '../ConnectionManager';
import { useAuthStore } from '@/store/authStore';

test.afterEach(() => {
  cleanup();
  useAuthStore.setState(state => ({
    ...state,
    token: undefined,
    user: undefined,
    authFetch: state.authFetch,
    logout: state.logout
  }));
});

test('ConnectionManager shows fallback error when connections API fails', async () => {
  useAuthStore.setState(state => ({
    ...state,
    token: 'test-token',
    user: {
      id: 'user-1',
      email: 'user@example.com',
      role: 'admin',
      planType: 'pro'
    },
    authFetch: async (input: RequestInfo | URL) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
      if (url.endsWith('/api/connections/providers')) {
        return new Response(JSON.stringify({ success: true, providers: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (url.endsWith('/api/connections')) {
        return new Response('Server unavailable', { status: 500 });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    },
    logout: async () => {}
  }));

  render(<ConnectionManager />);

  const errorAlert = await waitFor(() => screen.getByTestId('connections-empty-error'));
  assert.ok(errorAlert.textContent?.includes('Unable to load connections'));
});
