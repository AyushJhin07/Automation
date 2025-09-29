import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';

import { AIWorkflowBuilder } from '../ai/AIWorkflowBuilder';
import { EnhancedConversationalWorkflowBuilder } from '../ai/EnhancedConversationalWorkflowBuilder';
import ConnectionManager from '../connections/ConnectionManager';
import { useWorkflowState } from '@/store/workflowState';
import { useAuthStore } from '@/store/authStore';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });

(global as any).window = dom.window;
(global as any).document = dom.window.document;
(global as any).navigator = dom.window.navigator;
(global as any).HTMLElement = dom.window.HTMLElement;
(global as any).SVGElement = dom.window.SVGElement;
(global as any).customElements = dom.window.customElements;
(global as any).getComputedStyle = dom.window.getComputedStyle;
(global as any).MutationObserver = dom.window.MutationObserver;
(global as any).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

if (!('localStorage' in global)) {
  (global as any).localStorage = dom.window.localStorage;
}
if (!('sessionStorage' in global)) {
  (global as any).sessionStorage = dom.window.sessionStorage;
}

window.open = () => null;

const originalFetch = global.fetch;

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  useWorkflowState.getState().clear();
  const workflowState = useWorkflowState.getState();
  useWorkflowState.setState({
    last: undefined,
    set: workflowState.set,
    clear: workflowState.clear,
  });
  const authState = useAuthStore.getState();
  useAuthStore.setState({
    ...authState,
    token: undefined,
    refreshToken: undefined,
    user: undefined,
    status: 'idle',
    error: undefined,
    initialized: true,
  });
  global.fetch = originalFetch;
});

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
});

test('AIWorkflowBuilder disables deploy action and surfaces message when deployment endpoint returns 404', async () => {
  global.fetch = (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === '/api/workflow/deploy') {
      return Promise.resolve(new Response(null, { status: 404, statusText: 'Not Found' }));
    }
    if (url === '/api/ai/models') {
      return Promise.resolve(new Response(JSON.stringify({ models: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
  };

  render(<AIWorkflowBuilder />);

  await waitFor(() => screen.getByText('Automatic deployment unavailable'));
  const alertText = screen.getByText(/This environment has not enabled automated deployment yet/i);
  assert.ok(alertText);
});

test('Enhanced conversational builder guides the user when planning endpoint returns 500', async () => {
  global.fetch = (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === '/api/ai/generate-workflow') {
      return Promise.resolve(new Response(null, { status: 500, statusText: 'Server error' }));
    }
    if (url === '/api/ai/models') {
      return Promise.resolve(new Response(JSON.stringify({ models: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    if (url === '/api/ai/config') {
      return Promise.resolve(new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
  };

  render(
    <MemoryRouter>
      <EnhancedConversationalWorkflowBuilder />
    </MemoryRouter>
  );

  const textarea = await screen.findByPlaceholderText(/Describe the automation/i);
  fireEvent.change(textarea, { target: { value: 'Build a demo workflow' } });

  const sendButton = screen.getByLabelText('Send message');
  fireEvent.click(sendButton);

  await waitFor(() => screen.getByText(/I can't reach the automation planner/i));
  const message = screen.getByText(/Please check your connection and try again when you're ready/i);
  assert.ok(message);
});

test('ConnectionManager shows fallback state when connections API returns 500', async () => {
  useAuthStore.setState((state) => ({
    ...state,
    token: 'test-token',
    user: { id: '1', email: 'user@example.com', role: 'admin', planType: 'pro' },
    initialized: true,
    status: 'idle',
    error: undefined,
  }));

  global.fetch = (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === '/api/connections/providers') {
      return Promise.resolve(new Response(JSON.stringify({ success: true, providers: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    if (url === '/api/connections') {
      return Promise.resolve(new Response(null, { status: 500, statusText: 'Server error' }));
    }
    return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
  };

  render(
    <MemoryRouter>
      <ConnectionManager />
    </MemoryRouter>
  );

  await waitFor(() => screen.getByText('Connections service unavailable'));
  const emptyState = screen.getByText(/We were unable to load your saved connections/i);
  assert.ok(emptyState);
});
