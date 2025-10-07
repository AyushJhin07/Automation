import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
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

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('RunViewer authorization', () => {
  beforeEach(() => {
    authFetchMock.mockReset();
    logoutMock.mockReset();
    toastMock.mockReset();

    authFetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.startsWith('/api/executions?')) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            executions: [
              {
                executionId: 'exec-1',
                workflowId: 'wf-1',
                workflowName: 'Authorized Workflow',
                status: 'succeeded',
                startTime: new Date().toISOString(),
                endTime: new Date().toISOString(),
                duration: 1000,
                triggerType: 'manual',
                triggerData: null,
                totalNodes: 1,
                completedNodes: 1,
                failedNodes: 0,
                nodeExecutions: [],
                finalOutput: null,
                error: null,
                correlationId: 'corr-1',
                tags: [],
                metadata: {
                  retryCount: 0,
                  totalCostUSD: 0,
                  totalTokensUsed: 0,
                  cacheHitRate: 0,
                  averageNodeDuration: 0,
                },
              },
            ],
          })
        );
      }

      if (url === '/api/executions/exec-1') {
        return Promise.resolve(
          jsonResponse({ success: true, execution: { nodeResults: {} } })
        );
      }

      if (url.startsWith('/api/workflows/')) {
        return Promise.resolve(jsonResponse({ success: true, events: [] }));
      }

      if (url.includes('/verification-failures')) {
        return Promise.resolve(jsonResponse({ success: true, failures: [] }));
      }

      if (url.startsWith('/api/admin/executions')) {
        return Promise.resolve(jsonResponse({ success: true, entries: [] }));
      }

      return Promise.resolve(jsonResponse({ success: true }));
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('uses authFetch to load protected executions', async () => {
    render(<RunViewer workflowId="wf-1" />);

    expect(await screen.findByText('Authorized Workflow')).toBeInTheDocument();

    const calledWithAuthorizedEndpoint = authFetchMock.mock.calls.some(([request]) => {
      const url = typeof request === 'string' ? request : request instanceof URL ? request.toString() : request?.url;
      return typeof url === 'string' && url.startsWith('/api/executions?');
    });

    expect(calledWithAuthorizedEndpoint).toBe(true);
    expect(toastMock).not.toHaveBeenCalled();
  });
});
