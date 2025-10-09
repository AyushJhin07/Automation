import React from "react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastWarning = vi.fn();
const isDevIgnoreQueueEnabledMock = vi.fn(() => false);

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: toastSuccess,
    error: toastError,
    warning: toastWarning,
  }),
}));

const authFetchMock = vi.fn<typeof fetch>();

vi.mock("@/store/authStore", () => ({
  useAuthStore: (selector: any) => {
    const state = {
      token: null,
      authFetch: authFetchMock,
      logout: vi.fn(),
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock("@/hooks/useConnectorDefinitions", () => ({
  useConnectorDefinitions: () => ({ data: null, loading: false, error: null }),
}));

vi.mock("@/state/specStore", () => ({
  useSpecStore: (selector: any) => selector({ spec: null }),
}));

vi.mock("@/config/featureFlags", () => ({
  isDevIgnoreQueueEnabled: (...args: any[]) => isDevIgnoreQueueEnabledMock(...args),
}));

vi.mock("reactflow/dist/style.css", () => ({}), { virtual: true });

vi.mock("../SmartParametersPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="smart-parameters-panel" />, // minimal stub
  syncNodeParameters: (data: any, params: any) => ({ ...(data ?? {}), parameters: params, params }),
}));

const refreshQueueHealthMock = vi.fn();
let queueHealthReturn: any;
const useQueueHealthMock = vi.fn(() => queueHealthReturn);

vi.mock('@/hooks/useQueueHealth', () => ({
  useQueueHealth: (...args: any[]) => useQueueHealthMock(...args),
}));

const workerHeartbeatMock = vi.fn();
vi.mock('@/hooks/useWorkerHeartbeat', () => ({
  useWorkerHeartbeat: (...args: any[]) => workerHeartbeatMock(...args),
  WORKER_FLEET_GUIDANCE: 'Start the execution worker and scheduler processes to run workflows.',
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

const loadEditor = () => import("../ProfessionalGraphEditor");
const VALIDATION_DEBOUNCE_MS = 600;

const jsonResponse = (body: any, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const streamResponse = (events: any[]) => {
  const encoder = new TextEncoder();
  const queue = [...events];
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (queue.length === 0) {
            return { done: true, value: undefined };
          }
          const chunk = encoder.encode(`${JSON.stringify(queue.shift())}\n`);
          return { done: false, value: chunk };
        },
        releaseLock: () => undefined,
      }),
    },
  } as Response;
};

const seedDraftWorkflow = () => {
  const draftWorkflow = {
    id: "draft-1",
    name: "Draft",
    nodes: [
      {
        id: "trigger-1",
        type: "trigger.core.manual",
        position: { x: 0, y: 0 },
        data: {
          label: "Manual trigger",
          description: "Kick off",
          app: "core",
          parameters: {},
        },
      },
      {
        id: "action-1",
        type: "action.http.request",
        position: { x: 320, y: 0 },
        data: {
          label: "Call API",
          description: "Invoke endpoint",
          app: "built_in",
          connectionId: "conn-1",
          parameters: {},
        },
      },
    ],
    edges: [
      { id: "edge-1", source: "trigger-1", target: "action-1" },
    ],
  };
  localStorage.setItem("draftWorkflow", JSON.stringify(draftWorkflow));
};

let fetchMock: ReturnType<typeof vi.fn>;

const buildWorkerSummary = (overrides: Partial<any> = {}) => {
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
    message: 'Execution worker heartbeat is healthy.',
    latestHeartbeatAt: now,
    latestHeartbeatAgeMs: 5000,
    inlineWorker: false,
    ...overrides,
  };
};

const clickRunWorkflow = async () => {
  const buttons = await screen.findAllByRole("button", { name: /run workflow/i });
  const runButton = buttons[0];
  fireEvent.click(runButton);
  return runButton;
};

const findRunButton = async () => (await screen.findAllByRole("button", { name: /run workflow/i }))[0];
const findValidateButton = async () =>
  (await screen.findAllByRole("button", { name: /validate \/ dry run/i }))[0];

beforeEach(() => {
  fetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  authFetchMock.mockImplementation((input, init) => global.fetch(input as any, init));
  localStorage.clear();
  seedDraftWorkflow();
  window.alert = vi.fn();
  window.history.replaceState({}, "", "/");
  (global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  isDevIgnoreQueueEnabledMock.mockReturnValue(false);
  queueHealthReturn = {
    health: {
      status: 'pass',
      durable: true,
      message: 'Redis connection healthy',
      latencyMs: 5,
      checkedAt: new Date().toISOString(),
    },
    status: 'pass',
    isLoading: false,
    error: null,
    refresh: refreshQueueHealthMock,
  };
  useQueueHealthMock.mockReturnValue(queueHealthReturn);
  workerHeartbeatMock.mockReset();
  workerHeartbeatMock.mockReturnValue({
    workers: [],
    environmentWarnings: [],
    summary: buildWorkerSummary(),
    scheduler: null,
    queue: null,
    publicHeartbeat: buildPublicHeartbeat(),
    lastUpdated: new Date().toISOString(),
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  });
});

afterEach(() => {
  fetchMock.mockReset();
  authFetchMock.mockReset();
  workerHeartbeatMock.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  toastWarning.mockReset();
  useQueueHealthMock.mockReset();
  refreshQueueHealthMock.mockReset();
  isDevIgnoreQueueEnabledMock.mockReset();
});

const extractUrl = (input: any): string => {
  if (!input) return "";
  if (typeof input === "string") return input;
  if (typeof URL !== "undefined" && input instanceof URL) {
    return input.toString();
  }
  if (typeof input === "object" && typeof input.url === "string") {
    return input.url;
  }
  if (typeof input === "object" && typeof input.href === "string") {
    return input.href;
  }
  if (typeof input?.toString === "function") {
    return input.toString();
  }
  return "";
};

const fetchCallsForPath = (path: string) =>
  fetchMock.mock.calls.filter(([request]) => extractUrl(request).includes(path));

const authCallsForPath = (path: string) =>
  authFetchMock.mock.calls.filter(([request]) => extractUrl(request).includes(path));

const expectNoExecuteCall = () => {
  const calledExecute = fetchCallsForPath("/execute").length > 0;
  expect(calledExecute).toBe(false);
};

describe("ProfessionalGraphEditor validation gating", () => {
  it("blocks runs when required parameters are missing", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/registry/catalog")) {
        return Promise.resolve(jsonResponse({ success: true, catalog: { connectors: {} } }));
      }
      if (url.includes("/api/workflows/validate")) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            validation: {
              valid: false,
              errors: [
                {
                  nodeId: "action-1",
                  path: "/nodes/action-1/params/url",
                  message: "URL is required",
                  severity: "error",
                },
                {
                  nodeId: "action-1",
                  path: "/nodes/action-1/params/method",
                  message: "Choose an HTTP method",
                  severity: "error",
                },
              ],
              warnings: [],
            },
          })
        );
      }
      return Promise.resolve(jsonResponse({ success: true }));
    });

    const { default: ProfessionalGraphEditor } = await loadEditor();
    render(<ProfessionalGraphEditor />);

    await clickRunWorkflow();

    await waitFor(() => {
      expect(authFetchMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(authCallsForPath("/api/workflows/validate").length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(screen.getByText("Needs attention")).toBeInTheDocument();
      expect(
        screen.getByText("Resolve validation issues before running: URL is required")
      ).toBeInTheDocument();
    });

    expect(screen.getByText("URL is required")).toBeInTheDocument();
    expect(screen.getByText("+1 more issue for Call API")).toBeInTheDocument();
    expectNoExecuteCall();
  });

  it("opens node configuration when clicking Fix on validation banner", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/registry/catalog")) {
        return Promise.resolve(jsonResponse({ success: true, catalog: { connectors: {} } }));
      }
      if (url.includes("/api/workflows/validate")) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            validation: {
              valid: false,
              errors: [
                {
                  nodeId: "action-1",
                  path: "/nodes/action-1/params/url",
                  message: "URL is required",
                  severity: "error",
                },
                {
                  nodeId: "action-1",
                  path: "/nodes/action-1/params/method",
                  message: "Choose an HTTP method",
                  severity: "error",
                },
              ],
              warnings: [],
            },
          })
        );
      }
      if (url.includes("/api/functions/built_in")) {
        return Promise.resolve(jsonResponse({ data: { functions: [] } }));
      }
      if (url.includes("/api/oauth/providers")) {
        return Promise.resolve(jsonResponse({ data: { providers: [] } }));
      }
      return Promise.resolve(jsonResponse({ success: true }));
    });

    const { default: ProfessionalGraphEditor } = await loadEditor();
    render(<ProfessionalGraphEditor />);

    await clickRunWorkflow();

    const fixButton = await screen.findByRole("button", { name: /Fix Call API/i });
    fireEvent.click(fixButton);

    await waitFor(() => {
      expect(screen.getByText("Configure built_in action")).toBeInTheDocument();
      expect(
        screen.getByText("Choose the action function for built_in")
      ).toBeInTheDocument();
    });
  });

  it("shows a banner when cycles are detected", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/registry/catalog")) {
        return Promise.resolve(jsonResponse({ success: true, catalog: { connectors: {} } }));
      }
      if (url.includes("/api/workflows/validate")) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            validation: {
              valid: false,
              errors: [
                {
                  path: "/graph",
                  message: "Graph contains cycles which are not allowed",
                  severity: "error",
                },
              ],
              warnings: [],
            },
          })
        );
      }
      return Promise.resolve(jsonResponse({ success: true }));
    });

    const { default: ProfessionalGraphEditor } = await loadEditor();
    render(<ProfessionalGraphEditor />);

    await clickRunWorkflow();

    await waitFor(() => {
      expect(authCallsForPath("/api/workflows/validate").length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(
        screen.getByText(
          "Resolve validation issues before running: Graph contains cycles which are not allowed"
        )
      ).toBeInTheDocument();
    });

    expect(screen.queryByText("Needs attention")).toBeNull();
    expectNoExecuteCall();
  });

  it("streams execution when validation passes", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/registry/catalog")) {
        return Promise.resolve(jsonResponse({ success: true, catalog: { connectors: {} } }));
      }
      if (url.includes("/api/workflows/validate")) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            validation: {
              valid: true,
              errors: [],
              warnings: [],
            },
          })
        );
      }
      if (url.includes("/execute")) {
        return Promise.resolve(
          streamResponse([
            { type: "summary", success: true, message: "Run finished" },
          ])
        );
      }
      return Promise.resolve(jsonResponse({ success: true }));
    });

    const { default: ProfessionalGraphEditor } = await loadEditor();
    render(<ProfessionalGraphEditor />);

    await clickRunWorkflow();

    await waitFor(() => {
      expect(authCallsForPath("/api/workflows/validate").length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(screen.getByText("Run finished")).toBeInTheDocument();
    });

    expect(fetchCallsForPath("/execute").length).toBeGreaterThan(0);
    expect(screen.queryByText("Needs attention")).toBeNull();
  });

  it('disables the run button when queue health fails', async () => {
    queueHealthReturn = {
      health: {
        status: 'fail',
        durable: true,
        message: 'Redis ping failed',
        latencyMs: 12,
        checkedAt: new Date().toISOString(),
      },
      status: 'fail',
      isLoading: false,
      error: null,
      refresh: refreshQueueHealthMock,
    };
    useQueueHealthMock.mockReturnValue(queueHealthReturn);

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/registry/catalog')) {
        return Promise.resolve(jsonResponse({ success: true, catalog: { connectors: {} } }));
      }
      if (url.includes('/api/workflows/validate')) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            validation: { valid: true, errors: [], warnings: [] },
          })
        );
      }
      return Promise.resolve(jsonResponse({ success: true }));
    });

    const { default: ProfessionalGraphEditor } = await loadEditor();
    render(<ProfessionalGraphEditor />);

    await waitFor(() => {
      expect(authCallsForPath('/api/workflows/validate').length).toBeGreaterThan(0);
    });

    const runButton = await findRunButton();
    const validateButton = await findValidateButton();
    await waitFor(() => {
      expect(runButton).toBeDisabled();
      expect(validateButton).toBeDisabled();
    });
  });

  it('treats in-memory queue as warning when the dev override flag is enabled', async () => {
    queueHealthReturn = {
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
      refresh: refreshQueueHealthMock,
    };
    useQueueHealthMock.mockReturnValue(queueHealthReturn);
    isDevIgnoreQueueEnabledMock.mockReturnValue(true);

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/registry/catalog')) {
        return Promise.resolve(jsonResponse({ success: true, catalog: { connectors: {} } }));
      }
      return Promise.resolve(jsonResponse({ success: true }));
    });

    const { default: ProfessionalGraphEditor } = await loadEditor();
    render(<ProfessionalGraphEditor />);

    const runButton = await findRunButton();
    await waitFor(() => {
      expect(runButton).not.toBeDisabled();
    });

    expect(
      screen.getByText(/Queue driver is running in non-durable in-memory mode/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/ENABLE_DEV_IGNORE_QUEUE is active/i)).toBeInTheDocument();
  });

  it('disables the run button while enqueuing and re-enables when the request finishes', async () => {
    let resolveExecution: ((value: Response) => void) | undefined;
    const executionResponse = new Promise<Response>((resolve) => {
      resolveExecution = resolve;
    });

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/registry/catalog')) {
        return Promise.resolve(jsonResponse({ success: true, catalog: { connectors: {} } }));
      }
      if (url.includes('/api/workflows/validate')) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            validation: { valid: true, errors: [], warnings: [] },
          })
        );
      }
      if (url.includes('/api/flows/save')) {
        return Promise.resolve(jsonResponse({ success: true, workflowId: 'wf-123' }));
      }
      if (url.includes('/api/executions')) {
        return executionResponse;
      }
      return Promise.resolve(jsonResponse({ success: true }));
    });

    const { default: ProfessionalGraphEditor } = await loadEditor();
    render(<ProfessionalGraphEditor />);

    await waitFor(() => {
      expect(authCallsForPath('/api/workflows/validate').length).toBeGreaterThan(0);
    });

    const runButton = await findRunButton();

    await waitFor(() => {
      expect(runButton).not.toBeDisabled();
    });

    fireEvent.click(runButton);

    await waitFor(() => {
      expect(runButton).toBeDisabled();
    });

    resolveExecution?.(jsonResponse({ success: true, executionId: 'exec-123' }));

    await waitFor(() => {
      expect(runButton).not.toBeDisabled();
    });
  });

  it('disables the run button when node configuration metadata is missing', async () => {
    const raw = localStorage.getItem('draftWorkflow');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.nodes?.[1]) {
        delete parsed.nodes[1].data.function;
        delete parsed.nodes[1].data.operation;
      }
      localStorage.setItem('draftWorkflow', JSON.stringify(parsed));
    }

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/registry/catalog')) {
        return Promise.resolve(jsonResponse({ success: true, catalog: { connectors: {} } }));
      }
      if (url.includes('/api/workflows/validate')) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            validation: { valid: true, errors: [], warnings: [] },
          })
        );
      }
      return Promise.resolve(jsonResponse({ success: true }));
    });

    const { default: ProfessionalGraphEditor } = await loadEditor();
    render(<ProfessionalGraphEditor />);

    await waitFor(() => {
      expect(authCallsForPath('/api/workflows/validate').length).toBeGreaterThan(0);
    });

    const [runButton] = await screen.findAllByRole('button', { name: /run workflow/i });
    await waitFor(() => {
      expect(runButton).toBeDisabled();
    });
  });

  it('only resolves the latest validation request when edits happen rapidly', async () => {
    const DEBOUNCE_MS = VALIDATION_DEBOUNCE_MS;
    vi.useFakeTimers();
    const validationRequests: Array<{
      resolve: (value: Response) => void;
      reject: (reason?: any) => void;
      signal?: AbortSignal;
    }> = [];
    const abortedRequests: number[] = [];
    const resolvedRequests: number[] = [];

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/registry/catalog')) {
        return Promise.resolve(jsonResponse({ success: true, catalog: { connectors: {} } }));
      }
      if (url.includes('/api/workflows/validate')) {
        return new Promise<Response>((resolve, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          const index = validationRequests.length;
          const entry = {
            signal,
            resolve: (value: Response) => {
              resolvedRequests.push(index);
              resolve(value);
            },
            reject,
          };
          validationRequests.push(entry);
          signal?.addEventListener('abort', () => {
            abortedRequests.push(index);
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
          });
        });
      }
      return Promise.resolve(jsonResponse({ success: true }));
    });

    try {
      const { default: ProfessionalGraphEditor } = await loadEditor();
      render(<ProfessionalGraphEditor />);

      const labelInput = await screen.findByPlaceholderText('Enter node label...');

      await act(async () => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
        await Promise.resolve();
      });

      expect(validationRequests).toHaveLength(1);
      expect(validationRequests[0].signal?.aborted ?? false).toBe(false);

      await act(async () => {
        fireEvent.change(labelInput, { target: { value: 'First change' } });
        fireEvent.blur(labelInput);
      });

      await act(async () => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
        await Promise.resolve();
      });

      expect(validationRequests).toHaveLength(2);

      await waitFor(() => {
        expect(abortedRequests).toEqual([0]);
      });

      await act(async () => {
        validationRequests[1].resolve(
          jsonResponse({
            success: true,
            validation: { valid: true, errors: [], warnings: [] },
          })
        );
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(resolvedRequests).toEqual([1]);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('debounces validation requests until the user pauses editing', async () => {
    const DEBOUNCE_MS = VALIDATION_DEBOUNCE_MS;
    vi.useFakeTimers();

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/registry/catalog')) {
        return Promise.resolve(jsonResponse({ success: true, catalog: { connectors: {} } }));
      }
      if (url.includes('/api/workflows/validate')) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            validation: { valid: true, errors: [], warnings: [] },
          })
        );
      }
      return Promise.resolve(jsonResponse({ success: true }));
    });

    try {
      const { default: ProfessionalGraphEditor } = await loadEditor();
      render(<ProfessionalGraphEditor />);

      const labelInput = await screen.findByPlaceholderText('Enter node label...');

      await act(async () => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
        await Promise.resolve();
      });

      authFetchMock.mockClear();

      await act(async () => {
        fireEvent.change(labelInput, { target: { value: 'First change' } });
        fireEvent.blur(labelInput);
      });

      await act(async () => {
        fireEvent.change(labelInput, { target: { value: 'Second change' } });
        fireEvent.blur(labelInput);
      });

      await act(async () => {
        fireEvent.change(labelInput, { target: { value: 'Final change' } });
        fireEvent.blur(labelInput);
      });

      expect(authCallsForPath('/api/workflows/validate').length).toBe(0);

      await act(async () => {
        vi.advanceTimersByTime(DEBOUNCE_MS - 50);
        await Promise.resolve();
      });

      expect(authCallsForPath('/api/workflows/validate').length).toBe(0);

      await act(async () => {
        vi.advanceTimersByTime(50);
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(authCallsForPath('/api/workflows/validate').length).toBe(1);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends a single validation request after rapid inline edits pause', async () => {
    const DEBOUNCE_MS = VALIDATION_DEBOUNCE_MS;
    vi.useFakeTimers();

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/registry/catalog')) {
        return Promise.resolve(jsonResponse({ success: true, catalog: { connectors: {} } }));
      }
      if (url.includes('/api/flows/save')) {
        return Promise.resolve(jsonResponse({ success: true, workflowId: 'wf-123' }));
      }
      if (url.includes('/api/workflows/validate')) {
        return Promise.resolve(
          jsonResponse({
            success: true,
            validation: { valid: true, errors: [], warnings: [] },
          })
        );
      }
      if (url.includes('/api/workflows/')) {
        return Promise.resolve(jsonResponse({ success: false }, 404));
      }
      if (url.includes('/api/oauth/providers')) {
        return Promise.resolve(jsonResponse({ data: { providers: [] } }));
      }
      if (url.includes('/api/connections')) {
        return Promise.resolve(jsonResponse({ connections: [] }));
      }
      return Promise.resolve(jsonResponse({ success: true }));
    });

    try {
      const { default: ProfessionalGraphEditor } = await loadEditor();
      render(<ProfessionalGraphEditor />);

      const connectionInput = await screen.findByPlaceholderText(
        'e.g. conn_abc123 (if using saved connection)'
      );

      await act(async () => {
        vi.advanceTimersByTime(DEBOUNCE_MS);
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(authCallsForPath('/api/workflows/validate').length).toBeGreaterThan(0);
      });

      authFetchMock.mockClear();

      await act(() => {
        fireEvent.change(connectionInput, { target: { value: 'conn-1' } });
        fireEvent.change(connectionInput, { target: { value: 'conn-12' } });
        fireEvent.change(connectionInput, { target: { value: 'conn-123' } });
      });

      expect(authCallsForPath('/api/workflows/validate').length).toBe(0);

      await act(async () => {
        vi.advanceTimersByTime(DEBOUNCE_MS - 50);
        await Promise.resolve();
      });

      expect(authCallsForPath('/api/workflows/validate').length).toBe(0);

      await act(async () => {
        vi.advanceTimersByTime(50);
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(authCallsForPath('/api/workflows/validate').length).toBe(1);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('disables the run button when worker telemetry reports no active workers', async () => {
    workerHeartbeatMock.mockReturnValue({
      workers: [],
      environmentWarnings: [],
      summary: buildWorkerSummary({
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

    const { default: ProfessionalGraphEditor } = await loadEditor();
    render(<ProfessionalGraphEditor />);

    const runButton = await findRunButton();
    const validateButton = await findValidateButton();
    await waitFor(() => {
      expect(runButton).toBeDisabled();
      expect(validateButton).toBeDisabled();
    });

    await waitFor(() => {
      expect(
        screen.getByText('Start the execution worker and scheduler processes to run workflows.')
      ).toBeInTheDocument();
    });
  });
});
