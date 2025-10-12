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

vi.mock('@/hooks/useRuntimeCapabilityIndex', () => ({
  useRuntimeCapabilityIndex: () => ({
    capabilities: {},
    index: {},
    loading: false,
    error: null,
    refresh: vi.fn(),
    environment: {
      connectorSimulatorEnabled: false,
      genericExecutorEnabled: false,
    },
  }),
}));

const findAppsScriptUnsupportedNodeMock = vi.fn();
vi.mock('@/services/runtimeCapabilitiesService', () => ({
  findAppsScriptUnsupportedNode: (...args: any[]) => findAppsScriptUnsupportedNodeMock(...args),
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
    {
      id: 'action-2',
      type: 'n8nNode',
      position: { x: 640, y: 0 },
      data: {
        app: 'slack',
        label: 'Send Message',
        function: 'slack.send',
        configured: true,
        parameters: {},
      },
    },
  ],
  edges: [
    { id: 'edge-1', source: 'trigger-1', target: 'action-1' },
    { id: 'edge-2', source: 'action-1', target: 'action-2' },
  ],
};

describe('N8NStyleWorkflowBuilder unsupported nodes banner', () => {
  beforeEach(() => {
    queueHealthMock.mockReset();
    workerHeartbeatMock.mockReset();
    authFetchMock.mockReset();
    logoutMock.mockReset();
    findAppsScriptUnsupportedNodeMock.mockReset();
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
      summary: {
        totalWorkers: 1,
        healthyWorkers: 1,
        staleWorkers: 0,
        totalQueueDepth: 0,
        maxQueueDepth: 0,
        hasExecutionWorker: true,
        schedulerHealthy: true,
        timerHealthy: true,
        usesPublicHeartbeat: false,
        queueStatus: null,
        queueDurable: null,
        queueMessage: null,
      },
      scheduler: null,
      queue: null,
      source: 'admin',
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
    findAppsScriptUnsupportedNodeMock.mockReset();
    localStorage.clear();
    isDevIgnoreQueueEnabledMock.mockReset();
  });

  it('lists each unsupported node with focus actions', async () => {
    findAppsScriptUnsupportedNodeMock.mockReturnValue([
      {
        node: { id: 'action-1', data: sampleDraft.nodes[1].data },
        support: {
          supported: false,
          nativeSupported: false,
          kind: 'action',
          appId: 'gmail',
          appLabel: 'Gmail',
          operationId: 'sendEmail',
          operationLabel: 'Send Email',
          fallbackRuntime: 'node',
          reason: 'unsupported',
        },
      },
      {
        node: { id: 'action-2', data: sampleDraft.nodes[2].data },
        support: {
          supported: false,
          nativeSupported: false,
          kind: 'action',
          appId: 'slack',
          appLabel: 'Slack',
          operationId: 'sendMessage',
          operationLabel: 'Send Message',
          fallbackRuntime: 'node',
          reason: 'unsupported',
        },
      },
    ]);

    const { default: Builder } = await import('../N8NStyleWorkflowBuilder');
    render(<Builder />);

    await waitFor(() => {
      expect(findAppsScriptUnsupportedNodeMock).toHaveBeenCalled();
    });

    await screen.findByText(/Apps Script can't run these steps yet/i);

    expect(
      screen.getByText(/Gmail action "Send Email" isn't available in Apps Script yet\./i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Slack action "Send Message" isn't available in Apps Script yet\./i),
    ).toBeInTheDocument();

    const focusButtons = screen.getAllByRole('button', { name: /focus/i });
    expect(focusButtons).toHaveLength(2);
  });
});
