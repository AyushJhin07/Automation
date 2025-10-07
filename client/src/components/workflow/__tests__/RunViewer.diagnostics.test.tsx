import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

import { RunViewer } from '../RunViewer';

const authFetchMock = vi.fn<typeof fetch>();
const logoutMock = vi.fn();
const toastMock = vi.fn();

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: any) => any) =>
    selector({
      authFetch: authFetchMock,
      logout: logoutMock,
    }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}));

const sampleExecution = {
  executionId: 'exec-1',
  workflowId: 'wf-1',
  workflowName: 'Test Workflow',
  organizationId: 'org-1',
  userId: 'user-1',
  status: 'succeeded' as const,
  startTime: new Date().toISOString(),
  endTime: new Date().toISOString(),
  duration: 1234,
  triggerType: 'manual',
  triggerData: null,
  totalNodes: 1,
  completedNodes: 1,
  failedNodes: 0,
  nodeExecutions: [
    {
      nodeId: 'node-1',
      nodeType: 'action',
      nodeLabel: 'Test Node',
      status: 'succeeded' as const,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      duration: 250,
      attempt: 1,
      maxAttempts: 3,
      input: { foo: 'bar' },
      output: { result: 'ok' },
      error: undefined,
      correlationId: 'corr-1',
      retryHistory: [] as any[],
      metadata: {} as Record<string, any>,
      timeline: [] as Array<Record<string, any>>,
    },
  ],
  finalOutput: null,
  error: null,
  correlationId: 'corr-1',
  tags: [] as string[],
  timeline: [] as Array<Record<string, any>>,
  metadata: {
    retryCount: 0,
    totalCostUSD: 0,
    totalTokensUsed: 0,
    cacheHitRate: 0,
    averageNodeDuration: 0,
    openCircuitBreakers: [] as any[],
  },
};

beforeEach(() => {
  authFetchMock.mockReset();
  logoutMock.mockReset();
  toastMock.mockReset();
});

afterEach(() => {
  cleanup();
});

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockAuthFetch(detailResponse: any, detailStatus = 200) {
  authFetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url.startsWith('/api/executions?')) {
      return Promise.resolve(
        jsonResponse({ success: true, executions: [sampleExecution] })
      );
    }

    if (url === '/api/executions/exec-1') {
      return Promise.resolve(jsonResponse(detailResponse, detailStatus));
    }

    if (url.startsWith('/api/workflows/')) {
      return Promise.resolve(jsonResponse({ success: true, events: [] }));
    }

    if (url.startsWith('/api/admin/executions')) {
      return Promise.resolve(jsonResponse({ success: true, entries: [] }));
    }

    if (url.includes('/verification-failures')) {
      return Promise.resolve(jsonResponse({ success: true, failures: [] }));
    }

    return Promise.resolve(jsonResponse({ success: true }));
  });
}

describe('RunViewer execution diagnostics', () => {
  it('renders logs, stdout, and diagnostics when execution details load', async () => {
    mockAuthFetch({
      success: true,
      execution: {
        nodeResults: {
          'node-1': {
            output: { value: 42, stdout: 'hello world' },
            logs: ['line one', 'line two'],
            diagnostics: { branch: 'success' },
          },
        },
      },
    });

    render(<RunViewer />);

    const nodeLabels = await screen.findAllByText('Test Node');
    const nodeHeader = nodeLabels[0].parentElement?.parentElement?.parentElement as HTMLElement | null;
    expect(nodeHeader).not.toBeNull();
    expect(nodeHeader?.className).toContain('cursor-pointer');
    fireEvent.click(nodeHeader!);

    const nodeCard = nodeHeader!.parentElement as HTMLElement;
    await within(nodeCard).findByRole('button', { name: /copy output/i });
    const inspectButton = await within(nodeCard).findByRole('button', { name: /inspect/i });
    fireEvent.click(inspectButton);

    await waitFor(() => expect(within(nodeCard).getByText('line one')).toBeInTheDocument());
    expect(within(nodeCard).getByText('line two')).toBeInTheDocument();
    expect(within(nodeCard).getByText('Stdout', { selector: 'div' })).toBeInTheDocument();
    expect(within(nodeCard).getByText('hello world')).toBeInTheDocument();
    expect(within(nodeCard).getByText(/branch/i)).toBeInTheDocument();
  });

  it('shows an error message when execution details cannot be loaded', async () => {
    mockAuthFetch({ success: false, error: 'details unavailable' });

    render(<RunViewer />);

    const nodeLabels = await screen.findAllByText('Test Node');
    const nodeHeader = nodeLabels[0].parentElement?.parentElement?.parentElement as HTMLElement | null;
    expect(nodeHeader).not.toBeNull();
    expect(nodeHeader?.className).toContain('cursor-pointer');
    fireEvent.click(nodeHeader!);

    const nodeCard = nodeHeader!.parentElement as HTMLElement;
    await within(nodeCard).findByRole('button', { name: /copy output/i });
    const inspectButton = await within(nodeCard).findByRole('button', { name: /inspect/i });
    fireEvent.click(inspectButton);

    await waitFor(() => expect(screen.getByText('details unavailable')).toBeInTheDocument());
  });
});
