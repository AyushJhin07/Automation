import React from "react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const toastSuccess = vi.fn();
const toastError = vi.fn();
const toastWarning = vi.fn();

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

const loadEditor = () => import("../ProfessionalGraphEditor");

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

const clickRunWorkflow = async () => {
  const buttons = await screen.findAllByRole("button", { name: /run workflow/i });
  const runButton = buttons[0];
  fireEvent.click(runButton);
  return runButton;
};

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
});

afterEach(() => {
  fetchMock.mockReset();
  authFetchMock.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  toastWarning.mockReset();
  useQueueHealthMock.mockReset();
  refreshQueueHealthMock.mockReset();
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
    expect(screen.getByText("+1 more issue")).toBeInTheDocument();
    expectNoExecuteCall();
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

    const [runButton] = await screen.findAllByRole('button', { name: /run workflow/i });
    await waitFor(() => {
      expect(runButton).toBeDisabled();
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
});
