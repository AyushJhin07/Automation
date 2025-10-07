import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, within, waitFor, cleanup } from '@testing-library/react';
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

const waitingExecution = {
  executionId: 'exec-wait',
  workflowId: 'wf-wait',
  workflowName: 'Waiting Flow',
  organizationId: 'org-1',
  status: 'waiting',
  startTime: new Date().toISOString(),
  endTime: null,
  duration: 4200,
  triggerType: 'manual',
  triggerData: null,
  totalNodes: 1,
  completedNodes: 0,
  failedNodes: 0,
  nodeExecutions: [
    {
      nodeId: 'node-wait',
      nodeType: 'action.wait',
      nodeLabel: 'Wait for Callback',
      status: 'succeeded' as const,
      startTime: new Date().toISOString(),
      endTime: null,
      duration: 1200,
      attempt: 1,
      maxAttempts: 3,
      input: { foo: 'bar' },
      output: { ok: true },
      error: undefined,
      correlationId: 'corr-wait',
      retryHistory: [] as any[],
      timeline: [] as Array<Record<string, any>>,
      metadata: {
        waitingForCallback: true,
        resumeToken: 'resume-token-123',
        resumeSignature: 'resume-signature-abc',
        resumeCallbackUrl: 'https://callbacks.example.com',
        resumeExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        resume: {
          token: 'resume-token-123',
          signature: 'resume-signature-abc',
          callbackUrl: 'https://callbacks.example.com',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      },
    },
  ],
  finalOutput: null,
  error: null,
  correlationId: 'corr-wait',
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

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('RunViewer resume control', () => {
  beforeEach(() => {
    authFetchMock.mockReset();
    logoutMock.mockReset();
    toastMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('surfaces a resume button and posts credentials to the resume endpoint', async () => {
    let lastResumeRequest: { url: string; init?: RequestInit } | null = null;

    authFetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.startsWith('/api/executions?')) {
        return Promise.resolve(jsonResponse({ success: true, executions: [waitingExecution] }));
      }

      if (url === '/api/executions/exec-wait') {
        return Promise.resolve(jsonResponse({ success: true, execution: { nodeResults: {} } }));
      }

      if (url.startsWith('/api/workflows/wf-wait/duplicate-events')) {
        return Promise.resolve(jsonResponse({ success: true, events: [] }));
      }

      if (url.startsWith('/api/admin/executions')) {
        return Promise.resolve(jsonResponse({ success: true, entries: [] }));
      }

      if (url === '/api/runs/exec-wait/nodes/node-wait/resume') {
        lastResumeRequest = { url, init };
        return Promise.resolve(jsonResponse({ success: true }));
      }

      return Promise.resolve(jsonResponse({ success: true }));
    });

    render(<RunViewer />);

    const nodeLabels = await screen.findAllByText('Wait for Callback');
    const nodeHeader = nodeLabels[0].parentElement?.parentElement?.parentElement as HTMLElement | null;
    expect(nodeHeader).not.toBeNull();
    fireEvent.click(nodeHeader!);

    const nodeCard = nodeHeader!.parentElement as HTMLElement;
    const resumeButton = await within(nodeCard).findByRole('button', { name: /resume/i });
    fireEvent.click(resumeButton);

    await waitFor(() => {
      expect(lastResumeRequest).not.toBeNull();
    });

    expect(lastResumeRequest?.url).toBe('/api/runs/exec-wait/nodes/node-wait/resume');
    const parsedBody = lastResumeRequest?.init?.body
      ? JSON.parse(lastResumeRequest.init.body as string)
      : null;
    expect(parsedBody).toMatchObject({
      resumeToken: 'resume-token-123',
      resumeSignature: 'resume-signature-abc',
    });

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Resume enqueued' })
      );
    });
  });
});
