import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';

import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { AIWorkflowBuilder } from '../AIWorkflowBuilder';

test.afterEach(() => {
  cleanup();
});

test('AIWorkflowBuilder disables deploy when prerequisites endpoint is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;
    if (url.endsWith('/api/ai/models')) {
      return new Response(JSON.stringify({ models: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url.endsWith('/api/deployment/prerequisites')) {
      return new Response('Not Found', { status: 404 });
    }
    if (url.endsWith('/api/ai-planner/plan-workflow')) {
      return new Response('Server error', { status: 500 });
    }
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const demoWorkflow = {
      id: 'demo',
      title: 'Demo Automation',
      description: 'Generated in tests',
      nodes: [],
      connections: [],
      appsScriptCode: '// code',
      estimatedValue: '$0'
    };

    render(<AIWorkflowBuilder initialWorkflow={demoWorkflow} />);

    const feedbackBanner = await waitFor(() => screen.getByTestId('deploy-feedback'));
    assert.ok(/unavailable/i.test(feedbackBanner.textContent || ''));

    const deployButton = screen.getByTestId('deploy-button') as HTMLButtonElement;
    assert.equal(deployButton.disabled, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
