import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';

import { RunViewer } from '../RunViewer';
import { useAuthStore } from '@/store/authStore';

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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockFetch(detailResponse: any, detailStatus = 200, execution: any = sampleExecution) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url.startsWith('/api/executions?')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, executions: [execution] }),
      } as unknown as Response);
    }

    if (url === '/api/executions/exec-1') {
      return Promise.resolve({
        ok: detailStatus >= 200 && detailStatus < 300,
        status: detailStatus,
        json: async () => detailResponse,
      } as unknown as Response);
    }

    if (url.startsWith('/api/workflows/')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, events: [] }),
      } as unknown as Response);
    }

    if (url.startsWith('/api/admin/executions')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, entries: [] }),
      } as unknown as Response);
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as unknown as Response);
  });
}

describe('RunViewer execution diagnostics', () => {
  it('renders logs, stdout, and diagnostics when execution details load', async () => {
    mockFetch({
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
    mockFetch({ success: false, error: 'details unavailable' });

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

  it('renders a resume button for waiting nodes and posts resume credentials', async () => {
    const resumeCallback =
      '/api/runs/exec-1/nodes/node-1/resume?token=token-123&signature=sig-456';
    const waitingExecution = {
      ...sampleExecution,
      status: 'waiting' as const,
      nodeExecutions: sampleExecution.nodeExecutions.map((node) => ({
        ...node,
        status: 'running' as const,
        waitingForCallback: true,
        resume: {
          waiting: true,
          callbackUrl: resumeCallback,
          token: 'token-123',
          signature: 'sig-456',
          expiresAt: new Date().toISOString(),
        },
      })),
    };

    mockFetch({ success: true, execution: { nodeResults: {} } }, 200, waitingExecution);

    const originalAuthFetch = useAuthStore.getState().authFetch;
    const authFetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as unknown as Response);
    useAuthStore.setState((state) => ({ ...state, authFetch: authFetchMock }));

    try {
      render(<RunViewer />);

      const resumeButton = await screen.findByRole('button', { name: /Resume/i });
      fireEvent.click(resumeButton);

      await waitFor(() => expect(authFetchMock).toHaveBeenCalled());

      expect(authFetchMock.mock.calls[0]?.[0]).toContain(
        '/api/runs/exec-1/nodes/node-1/resume'
      );
      const requestInit = authFetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect(requestInit?.method).toBe('POST');
      const payload = requestInit?.body ? JSON.parse(requestInit.body as string) : {};
      expect(payload).toMatchObject({ resumeToken: 'token-123', resumeSignature: 'sig-456' });
    } finally {
      useAuthStore.setState((state) => ({ ...state, authFetch: originalAuthFetch }));
    }
  });
});
