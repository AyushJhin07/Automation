import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';

import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react';
import EnhancedConversationalWorkflowBuilder from '../EnhancedConversationalWorkflowBuilder';
import { MemoryRouter } from 'react-router-dom';

test.afterEach(() => {
  cleanup();
});

test('EnhancedConversationalWorkflowBuilder guides user when planner request fails', async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  if (!originalLocalStorage) {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); }
    };
  }
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;
    if (url.endsWith('/api/ai/generate-workflow')) {
      return new Response('Server error', { status: 500 });
    }
    if (url.endsWith('/api/workflow/build')) {
      return new Response(JSON.stringify({ success: false, error: 'build failed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    render(
      <MemoryRouter>
        <EnhancedConversationalWorkflowBuilder initialInput="Help me build an automation" />
      </MemoryRouter>
    );

    const sendButton = screen.getByTestId('workflow-send') as HTMLButtonElement;
    assert.equal(sendButton.disabled, false, 'send button should be enabled for preset input');

    act(() => {
      fireEvent.click(sendButton);
    });

    const guidance = await waitFor(() => screen.getByTestId('planner-guidance'));
    assert.ok(/workflow planner/i.test(guidance.textContent || ''));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalLocalStorage) {
      globalThis.localStorage = originalLocalStorage;
    }
  }
});
