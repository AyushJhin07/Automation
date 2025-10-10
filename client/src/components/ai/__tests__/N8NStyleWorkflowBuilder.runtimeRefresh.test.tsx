import React from 'react';
import '@testing-library/jest-dom/vitest';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

const runtimeRefreshSpy = vi.fn<(force?: boolean) => void>();
const runtimeState: {
  setSnapshot?: React.Dispatch<React.SetStateAction<{ capabilities: Record<string, unknown>; index: Record<string, unknown> }>>;
  setLoading?: React.Dispatch<React.SetStateAction<boolean>>;
  onRefresh?: (force?: boolean) => Promise<void> | void;
} = {};

vi.mock('@/hooks/useRuntimeCapabilityIndex', () => {
  const React = require('react');
  return {
    useRuntimeCapabilityIndex: () => {
      const [snapshot, setSnapshot] = React.useState({
        capabilities: { unsupported: true } as Record<string, unknown>,
        index: { unsupported: true } as Record<string, unknown>,
      });
      const [loading, setLoading] = React.useState(false);

      React.useEffect(() => {
        runtimeState.setSnapshot = setSnapshot;
        runtimeState.setLoading = setLoading;
      }, [setSnapshot, setLoading]);

      const refresh = React.useCallback(async (force?: boolean) => {
        runtimeRefreshSpy(force);
        runtimeState.setLoading?.(true);
        if (runtimeState.onRefresh) {
          await runtimeState.onRefresh(force);
        }
        runtimeState.setLoading?.(false);
      }, []);

      return {
        capabilities: snapshot.capabilities,
        index: snapshot.index,
        loading,
        error: null,
        refresh,
      };
    },
  };
});

let appsScriptSupported = false;
const unsupportedDetection = {
  node: { id: 'action-1' },
  support: {
    appId: 'test-app',
    appLabel: 'Test App',
    operationId: 'test-operation',
    operationLabel: 'Test Operation',
    kind: 'action',
    fallbackRuntime: 'node',
    reason: 'Apps Script is not available for this connector yet.',
    mode: 'unavailable',
  },
};

vi.mock('@/services/runtimeCapabilitiesService', async () => {
  const actual = await vi.importActual<typeof import('@/services/runtimeCapabilitiesService')>(
    '@/services/runtimeCapabilitiesService',
  );
  return {
    ...actual,
    findAppsScriptUnsupportedNode: vi.fn(() => (appsScriptSupported ? null : (unsupportedDetection as any))),
  };
});

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

describe('N8NStyleWorkflowBuilder runtime capability refresh', () => {
  beforeEach(() => {
    appsScriptSupported = false;
    runtimeRefreshSpy.mockClear();
    runtimeState.onRefresh = undefined;
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
          jsonResponse({ success: true, validation: { valid: true, errors: [], warnings: [] } }),
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

  it('forces a runtime capability refresh and updates the selector when capabilities change', async () => {
    const user = userEvent.setup();
    const { default: Builder } = await import('../N8NStyleWorkflowBuilder');
    render(<Builder />);

    const appsScriptToggle = await screen.findByRole('button', { name: /apps script/i });
    await waitFor(() => {
      expect(appsScriptToggle).toBeDisabled();
    });

    runtimeState.onRefresh = async () => {
      appsScriptSupported = true;
      runtimeState.setSnapshot?.({
        capabilities: { supported: true } as Record<string, unknown>,
        index: { supported: true } as Record<string, unknown>,
      });
    };

    const refreshButton = await screen.findByRole('button', { name: /refresh runtime support/i });
    await user.click(refreshButton);

    await waitFor(() => {
      expect(runtimeRefreshSpy).toHaveBeenCalledWith(true);
    });

    await waitFor(() => {
      expect(appsScriptToggle).not.toBeDisabled();
    });

    expect(window.__runtimeCapabilitiesRefresh).toBeTypeOf('function');
  });
});
