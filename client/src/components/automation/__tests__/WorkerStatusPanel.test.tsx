import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import WorkerStatusPanel from '../WorkerStatusPanel';
import { useAuthStore } from '@/store/authStore';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });

(global as any).window = dom.window;
(global as any).document = dom.window.document;
(global as any).navigator = dom.window.navigator;
(global as any).HTMLElement = dom.window.HTMLElement;
(global as any).SVGElement = dom.window.SVGElement;
(global as any).MutationObserver =
  (dom.window as any).MutationObserver ||
  class {
    observe() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };

if (!('ResizeObserver' in global)) {
  (global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

beforeEach(() => {
  cleanup();
  useAuthStore.setState((state) => ({
    ...state,
    authFetch: async () =>
      new Response('offline', {
        status: 500,
        statusText: 'Server error',
      }),
  }));
});

afterEach(() => {
  cleanup();
});

test('renders error state when worker status endpoint fails', async () => {
  render(<WorkerStatusPanel />);

  await waitFor(() => screen.getByText('Unable to load worker status'));

  const message = screen.getByText('Unable to load worker status');
  assert.ok(message);
});
