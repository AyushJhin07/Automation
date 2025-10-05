import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { JSDOM } from 'jsdom';
import React from 'react';

import { RunViewer } from '../RunViewer';

const originalFetch = globalThis.fetch;

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.defineProperty(globalThis, 'window', {
  value: dom.window,
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, 'self', {
  value: dom.window,
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, 'document', {
  value: dom.window.document,
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, 'HTMLElement', {
  value: dom.window.HTMLElement,
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, 'Node', {
  value: dom.window.Node,
  configurable: true,
  writable: true,
});

const createJsonResponse = (body: any, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

test('renders execution logs, stdout, and diagnostics for a successful node', async () => {
  const executionList = {
    success: true,
    executions: [
      {
        executionId: 'exec-success',
        workflowId: 'wf-1',
        workflowName: 'Sample Workflow',
        userId: 'user-1',
        status: 'succeeded',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        duration: 1500,
        triggerType: 'manual',
        triggerData: null,
        totalNodes: 1,
        completedNodes: 1,
        failedNodes: 0,
        nodeExecutions: [
          {
            nodeId: 'node-1',
            nodeType: 'action.test.run',
            nodeLabel: 'Test Node',
            status: 'succeeded',
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            duration: 1500,
            attempt: 1,
            maxAttempts: 3,
            input: { foo: 'bar' },
            output: { result: 42 },
            error: null,
            correlationId: 'corr-1',
            retryHistory: [],
            metadata: { costUSD: 0.25, tokensUsed: 32 },
            timeline: [],
          },
        ],
        finalOutput: { success: true },
        error: null,
        correlationId: 'corr-1',
        tags: [],
        metadata: {
          retryCount: 0,
          totalCostUSD: 0.25,
          totalTokensUsed: 32,
          cacheHitRate: 0.25,
          averageNodeDuration: 1500,
        },
      },
    ],
    pagination: { total: 1, limit: 50, offset: 0, hasMore: false },
  };

  const executionDetails = {
    success: true,
    execution: {
      id: 'exec-success',
      steps: [
        {
          nodeId: 'node-1',
          logs: ['log-line-1', 'log-line-2'],
          diagnostics: { branch: 'alpha', matched: true },
          output: { stdout: 'hello world' },
        },
      ],
    },
  };

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? `${input.pathname}${input.search}` : input.url;
    if (url.startsWith('/api/executions?')) {
      return createJsonResponse(executionList);
    }
    if (url === '/api/executions/exec-success') {
      return createJsonResponse(executionDetails);
    }
    if (url.startsWith('/api/workflows/')) {
      return createJsonResponse({ success: true, events: [] });
    }
    if (url.startsWith('/api/admin/executions')) {
      return createJsonResponse({ success: true, entries: [] });
    }
    return createJsonResponse({ success: true });
  }) as typeof fetch;

  const { getByText } = render(<RunViewer executionId="exec-success" workflowId="wf-1" />);

  await waitFor(() => assert.ok(getByText('Test Node')));

  fireEvent.click(getByText('Test Node'));

  await waitFor(() => assert.ok(getByText(/Execution Logs/i)));

  assert.ok(getByText('log-line-1'));
  assert.ok(getByText('log-line-2'));
  assert.ok(getByText(/Stdout/i));
  assert.ok(getByText('hello world'));
  assert.ok(getByText(/Diagnostic Metadata/i));
  assert.ok(getByText((content) => content.includes('branch')));
});

test('renders diagnostics and error messaging for a failed node', async () => {
  const executionList = {
    success: true,
    executions: [
      {
        executionId: 'exec-failure',
        workflowId: 'wf-2',
        workflowName: 'Broken Workflow',
        userId: 'user-2',
        status: 'failed',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        duration: 900,
        triggerType: 'manual',
        triggerData: null,
        totalNodes: 1,
        completedNodes: 0,
        failedNodes: 1,
        nodeExecutions: [
          {
            nodeId: 'node-fail',
            nodeType: 'action.test.fail',
            nodeLabel: 'Failure Node',
            status: 'failed',
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            duration: 900,
            attempt: 2,
            maxAttempts: 3,
            input: { foo: 'baz' },
            output: null,
            error: 'Node exploded',
            correlationId: 'corr-2',
            retryHistory: [
              { attempt: 1, timestamp: new Date().toISOString(), error: 'Timeout', duration: 450 },
            ],
            metadata: { costUSD: 0.1, tokensUsed: 12 },
            timeline: [],
          },
        ],
        finalOutput: null,
        error: 'Node exploded',
        correlationId: 'corr-2',
        tags: [],
        metadata: {
          retryCount: 1,
          totalCostUSD: 0.1,
          totalTokensUsed: 12,
          cacheHitRate: 0,
          averageNodeDuration: 900,
        },
      },
    ],
    pagination: { total: 1, limit: 50, offset: 0, hasMore: false },
  };

  const executionDetails = {
    success: true,
    execution: {
      id: 'exec-failure',
      steps: [
        {
          nodeId: 'node-fail',
          logs: ['failure-log'],
          diagnostics: { code: 'ERR_FAILURE', attempt: 2 },
          output: { stdout: ['line a', 'line b'] },
        },
      ],
    },
  };

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? `${input.pathname}${input.search}` : input.url;
    if (url.startsWith('/api/executions?')) {
      return createJsonResponse(executionList);
    }
    if (url === '/api/executions/exec-failure') {
      return createJsonResponse(executionDetails);
    }
    if (url.startsWith('/api/workflows/')) {
      return createJsonResponse({ success: true, events: [] });
    }
    if (url.startsWith('/api/admin/executions')) {
      return createJsonResponse({ success: true, entries: [] });
    }
    return createJsonResponse({ success: true });
  }) as typeof fetch;

  const { getByText, getAllByText } = render(<RunViewer executionId="exec-failure" workflowId="wf-2" />);

  await waitFor(() => assert.ok(getByText('Failure Node')));

  fireEvent.click(getByText('Failure Node'));

  await waitFor(() => assert.ok(getByText(/Execution Logs/i)));

  assert.ok(getByText('failure-log'));
  assert.ok(getByText(/Stdout/i));
  assert.ok(getByText((content) => content.includes('line a')));
  assert.ok(getByText((content) => content.includes('line b')));
  assert.ok(getAllByText(/Node exploded/).length > 0);
  assert.ok(getByText((content) => content.includes('ERR_FAILURE')));
});
