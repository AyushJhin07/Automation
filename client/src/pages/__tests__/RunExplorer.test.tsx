import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

import RunExplorer from '../RunExplorer';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });

(global as any).window = dom.window;
(global as any).document = dom.window.document;
(global as any).navigator = dom.window.navigator;
(global as any).HTMLElement = dom.window.HTMLElement;
(global as any).SVGElement = dom.window.SVGElement;
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

const originalFetch = global.fetch;
const fetchCalls: string[] = [];

beforeEach(() => {
  cleanup();
  fetchCalls.length = 0;
  global.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    fetchCalls.push(url);

    if (url.startsWith('/api/runs/search')) {
      const responsePayload = {
        success: true,
        runs: [
          {
            executionId: 'exec-123',
            workflowId: 'wf-1',
            workflowName: 'Critical Workflow',
            organizationId: 'org-1',
            status: 'failed',
            startTime: '2024-01-01T00:00:00.000Z',
            endTime: '2024-01-01T00:01:00.000Z',
            durationMs: 60000,
            triggerType: 'webhook',
            totalNodes: 3,
            completedNodes: 2,
            failedNodes: 1,
            tags: ['prod'],
            correlationId: 'corr-1',
            requestId: 'req-1',
            connectors: ['slack'],
            duplicateEvents: [],
            metadata: {},
          },
        ],
        pagination: {
          total: 1,
          page: 1,
          pageSize: 25,
          hasMore: false,
        },
        facets: {
          status: [
            { value: 'failed', count: 1 },
            { value: 'succeeded', count: 0 },
          ],
          connector: [{ value: 'slack', count: 1 }],
        },
      };
      return Promise.resolve(
        new Response(JSON.stringify(responsePayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }

    if (url.startsWith('/api/executions')) {
      const executionsPayload = {
        success: true,
        executions: [
          {
            executionId: 'exec-123',
            workflowId: 'wf-1',
            workflowName: 'Critical Workflow',
            status: 'failed',
            startTime: '2024-01-01T00:00:00.000Z',
            endTime: '2024-01-01T00:01:00.000Z',
            duration: 60000,
            totalNodes: 3,
            completedNodes: 2,
            failedNodes: 1,
            nodeExecutions: [],
            correlationId: 'corr-1',
            tags: [],
            metadata: { retryCount: 0, totalCostUSD: 0, totalTokensUsed: 0, cacheHitRate: 0, averageNodeDuration: 0 },
          },
        ],
      };
      return Promise.resolve(
        new Response(JSON.stringify(executionsPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }

    if (url.includes('/duplicate-events')) {
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, events: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }

    if (url.includes('/verification-failures')) {
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, failures: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }

    if (url.startsWith('/api/admin/executions')) {
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, entries: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }

    console.warn('Unhandled fetch in RunExplorer test:', url, init);
    return Promise.resolve(new Response('{}', { status: 200 }));
  };
});

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
});

test('RunExplorer renders runs, toggles facets, and links to run viewer telemetry', async () => {
  render(<RunExplorer />);

  const workflowTitle = await screen.findByText('Critical Workflow');
  assert.ok(workflowTitle, 'workflow should appear in results');

  const connectorChip = await screen.findByText('slack');
  assert.ok(connectorChip, 'connector facet should render');

  const statusFacetButton = await screen.findByRole('button', { name: /failed/i });
  fireEvent.click(statusFacetButton);

  await waitFor(() => {
    assert.ok(fetchCalls.some((url) => url.includes('status=failed')), 'status filter should trigger API call');
  });

  const runViewerButton = await screen.findByRole('button', { name: /Open in Run Viewer/i });
  fireEvent.click(runViewerButton);

  await waitFor(() => {
    const logLink = screen.getByText(/Download JSON/i);
    assert.ok(logLink, 'log link should be visible for run');
  });

  const verificationMessage = await screen.findByText(/No signature verification failures recorded/i);
  assert.ok(verificationMessage, 'verification panel should render empty state message');
});
