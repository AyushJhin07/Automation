import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const authFetchMock = vi.fn<typeof fetch>();
const logoutMock = vi.fn();
const isDevIgnoreQueueEnabledMock = vi.fn(() => false);

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: any) => {
    const state = {
      token: 'token',
      authFetch: authFetchMock,
      logout: logoutMock,
    };
    return selector ? selector(state) : state;
  },
}));

const queueHealthMock = vi.fn();
vi.mock('@/hooks/useQueueHealth', () => ({
  useQueueHealth: (...args: any[]) => queueHealthMock(...args),
}));

vi.mock('@/config/featureFlags', () => ({
  isDevIgnoreQueueEnabled: (...args: any[]) => isDevIgnoreQueueEnabledMock(...args),
}));

const workerHeartbeatMock = vi.fn();
vi.mock('@/hooks/useWorkerHeartbeat', () => ({
  useWorkerHeartbeat: (...args: any[]) => workerHeartbeatMock(...args),
  WORKER_FLEET_GUIDANCE: 'Start the execution worker and scheduler processes to run workflows.',
}));

vi.mock('@/components/workflow/NodeConfigurationModal', () => ({
  NodeConfigurationModal: () => null,
}));

vi.mock('reactflow/dist/style.css', () => ({}), { virtual: true });

const jsonResponse = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const sampleDraft = {
  id: 'draft-1',
  name: 'Draft Workflow',
  nodes: [
    {
      id: 'trigger-1',
      type: 'n8nNode',
      position: { x: 0, y: 0 },
      data: {
        app: 'core',
        label: 'Manual Trigger',
        function: 'core.manual',
        configured: true,
      },
    },
    {
      id: 'action-1',
      type: 'n8nNode',
      position: { x: 320, y: 0 },
      data: {
        app: 'gmail',
        label: 'Send Email',
        function: 'gmail.send',
        connectionId: 'conn-1',
        auth: { connectionId: 'conn-1' },
        configured: true,
        parameters: {},
      },
    },
  ],
  edges: [
    { id: 'edge-1', source: 'trigger-1', target: 'action-1' },
  ],
};

const buildSummary = (overrides: Partial<any> = {}) => {
  const now = new Date().toISOString();
  return {
    totalWorkers: 1,
    healthyWorkers: 1,
    staleWorkers: 0,
    totalQueueDepth: 0,
    maxQueueDepth: 0,
    hasExecutionWorker: true,
    schedulerHealthy: true,
    timerHealthy: true,
    publicHeartbeatStatus: 'pass',
    publicHeartbeatMessage: null,
    publicHeartbeatAt: now,
    publicHeartbeatAgeSeconds: 5,
    hasRecentPublicHeartbeat: true,
    ...overrides,
  };
};

const buildPublicHeartbeat = (overrides: Partial<any> = {}) => {
  const now = new Date().toISOString();
  return {
    status: 'pass',
    message: 'Execution worker heartbeat is healthy and queue is drained.',
    latestHeartbeatAt: now,
    latestHeartbeatAgeMs: 5000,
    inlineWorker: false,
    ...overrides,
  };
};

describe('N8NStyleWorkflowBuilder toolbar gating', () => {
  beforeEach(() => {
    queueHealthMock.mockReset();
    workerHeartbeatMock.mockReset();
    authFetchMock.mockReset();
    logoutMock.mockReset();
    localStorage.clear();
    localStorage.setItem('automation.builder.draft', JSON.stringify(sampleDraft));
    (global as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    isDevIgnoreQueueEnabledMock.mockReturnValue(false);
    queueHealthMock.mockReturnValue({
      health: {
        status: 'pass',
        durable: true,
        message: 'Queue ready',
        latencyMs: 5,
        checkedAt: new Date().toISOString(),
      },
      status: 'pass',
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    workerHeartbeatMock.mockReturnValue({
      workers: [],
      environmentWarnings: [],
      summary: buildSummary(),
      scheduler: null,
      queue: null,
      publicHeartbeat: buildPublicHeartbeat(),
      lastUpdated: new Date().toISOString(),
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    authFetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/workflows/validate')) {
        return Promise.resolve(
          jsonResponse({ success: true, validation: { valid: true, errors: [], warnings: [] } })
        );
      }
      return Promise.resolve(jsonResponse({ success: true }));
    });
  });

  afterEach(() => {
    queueHealthMock.mockReset();
    workerHeartbeatMock.mockReset();
    authFetchMock.mockReset();
    localStorage.clear();
    isDevIgnoreQueueEnabledMock.mockReset();
  });

  it('disables the run button when queue health is failing', async () => {
    queueHealthMock.mockReturnValue({
      health: {
        status: 'fail',
        durable: true,
        message: 'Redis unavailable',
        latencyMs: 15,
        checkedAt: new Date().toISOString(),
      },
      status: 'fail',
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    const { default: Builder } = await import('../N8NStyleWorkflowBuilder');
    render(<Builder />);

    await waitFor(() => {
      expect(authFetchMock).toHaveBeenCalled();
    });

    const runButton = await screen.findByRole('button', { name: /run workflow/i });
    await waitFor(() => {
      expect(runButton).toBeDisabled();
    });
  });

  it('shows a durability warning but keeps run enabled when the dev override flag is set', async () => {
    queueHealthMock.mockReturnValue({
      health: {
        status: 'fail',
        durable: false,
        message: 'Queue driver is running in non-durable in-memory mode. Jobs will not be persisted.',
        latencyMs: null,
        checkedAt: new Date().toISOString(),
      },
      status: 'fail',
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    isDevIgnoreQueueEnabledMock.mockReturnValue(true);

    const { default: Builder } = await import('../N8NStyleWorkflowBuilder');
    render(<Builder />);

    const runButton = await screen.findByRole('button', { name: /run workflow/i });
    await waitFor(() => {
      expect(runButton).not.toBeDisabled();
    });

    expect(
      screen.getByText(/Queue driver is running in non-durable in-memory mode/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/ENABLE_DEV_IGNORE_QUEUE is active/i)).toBeInTheDocument();
  });

  it('disables the run button when no workers are reporting', async () => {
    workerHeartbeatMock.mockReturnValue({
      workers: [],
      environmentWarnings: [],
      summary: buildSummary({
        totalWorkers: 0,
        healthyWorkers: 0,
        hasExecutionWorker: false,
        schedulerHealthy: false,
        timerHealthy: false,
        hasRecentPublicHeartbeat: false,
        publicHeartbeatStatus: 'fail',
        publicHeartbeatMessage: 'Execution worker heartbeat unavailable.',
        publicHeartbeatAt: null,
        publicHeartbeatAgeSeconds: null,
      }),
      scheduler: null,
      queue: null,
      publicHeartbeat: buildPublicHeartbeat({
        status: 'fail',
        message: 'Execution worker heartbeat unavailable.',
        latestHeartbeatAt: null,
        latestHeartbeatAgeMs: null,
      }),
      lastUpdated: new Date().toISOString(),
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    const { default: Builder } = await import('../N8NStyleWorkflowBuilder');
    render(<Builder />);

    const runButton = await screen.findByRole('button', { name: /run workflow/i });
    await waitFor(() => {
      expect(runButton).toBeDisabled();
    });

    await waitFor(() => {
      expect(
        screen.getByText('Start the execution worker and scheduler processes to run workflows.')
      ).toBeInTheDocument();
    });
  });

  it('enables the run button when only the public heartbeat is healthy', async () => {
    workerHeartbeatMock.mockReturnValue({
      workers: [],
      environmentWarnings: [],
      summary: buildSummary({
        totalWorkers: 0,
        healthyWorkers: 0,
        hasExecutionWorker: false,
        hasRecentPublicHeartbeat: true,
        publicHeartbeatStatus: 'pass',
        publicHeartbeatMessage: 'Execution worker heartbeat is healthy.',
      }),
      scheduler: null,
      queue: null,
      publicHeartbeat: buildPublicHeartbeat({
        status: 'pass',
        message: 'Execution worker heartbeat is healthy.',
      }),
      lastUpdated: new Date().toISOString(),
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    const { default: Builder } = await import('../N8NStyleWorkflowBuilder');
    render(<Builder />);

    const runButton = await screen.findByRole('button', { name: /run workflow/i });
    await waitFor(() => {
      expect(runButton).not.toBeDisabled();
    });
  });

  it('shows scheduler warnings without blocking workflow runs', async () => {
    workerHeartbeatMock.mockReturnValue({
      workers: [],
      environmentWarnings: [],
      summary: buildSummary({
        schedulerHealthy: false,
        timerHealthy: false,
      }),
      scheduler: null,
      queue: null,
      publicHeartbeat: buildPublicHeartbeat({
        status: 'pass',
      }),
      lastUpdated: new Date().toISOString(),
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    const { default: Builder } = await import('../N8NStyleWorkflowBuilder');
    render(<Builder />);

    const runButton = await screen.findByRole('button', { name: /run workflow/i });
    await waitFor(() => {
      expect(runButton).not.toBeDisabled();
    });
    expect(
      screen.getByText(/Scheduler process is offline. Timed or delayed workflow steps will not execute until it reconnects./i)
    ).toBeInTheDocument();
  });
  it('keeps the run button disabled when nodes require configuration', async () => {
    const draft = JSON.parse(localStorage.getItem('automation.builder.draft') || 'null');
    if (draft?.nodes?.[1]) {
      delete draft.nodes[1].data.function;
      localStorage.setItem('automation.builder.draft', JSON.stringify(draft));
    }

    const { default: Builder } = await import('../N8NStyleWorkflowBuilder');
    render(<Builder />);

    await waitFor(() => {
      expect(authFetchMock).toHaveBeenCalled();
    });

    const runButton = await screen.findByRole('button', { name: /run workflow/i });
    await waitFor(() => {
      expect(runButton).toBeDisabled();
    });
  });
});

