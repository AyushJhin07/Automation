import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("reactflow/dist/style.css", () => ({}), { virtual: true });

vi.mock("reactflow", () => {
  const React = require("react");
  const useNodesState = (initial: any) => React.useState(initial);
  const useEdgesState = (initial: any) => React.useState(initial);

  const ReactFlow = ({ children }: any) => <div data-testid="react-flow">{children}</div>;
  const Background = () => null;
  const Controls = () => null;
  const MiniMap = () => null;
  const Panel = ({ children }: any) => <>{children}</>;
  const Handle = ({ children }: any) => <>{children}</>;

  return {
    __esModule: true,
    default: ReactFlow,
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    Panel,
    Handle,
    addEdge: (edge: any, edges: any[]) => [...edges, edge],
    useNodesState,
    useEdgesState,
    useReactFlow: () => ({
      project: (point: any) => point,
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      setViewport: () => undefined,
    }),
    ReactFlowProvider: ({ children }: any) => <>{children}</>,
    MarkerType: { ArrowClosed: "arrowclosed" },
    Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
  };
});

const authFetchMock = vi.fn<typeof fetch>();

vi.mock("@/store/authStore", () => ({
  useAuthStore: (selector: any) =>
    selector({
      token: null,
      authFetch: authFetchMock,
      logout: vi.fn(),
    }),
}));

vi.mock("@/hooks/useConnectorDefinitions", () => ({
  useConnectorDefinitions: () => ({ data: null, loading: false, error: null }),
}));

vi.mock("@/state/specStore", () => ({
  useSpecStore: (selector: any) => selector({ spec: null }),
}));

vi.mock("@/hooks/useQueueHealth", () => ({
  useQueueHealth: () => ({ health: { message: "Queue ready" }, status: "pass", isLoading: false, error: null }),
}));

vi.mock("@/hooks/useWorkerHeartbeat", () => ({
  useWorkerHeartbeat: () => ({
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
      publicHeartbeatStatus: "pass",
      publicHeartbeatMessage: null,
      publicHeartbeatAt: "2024-01-01T00:00:00.000Z",
      publicHeartbeatAgeSeconds: 5,
      hasRecentPublicHeartbeat: true,
    },
    publicHeartbeat: {
      status: "pass",
      message: "Execution worker heartbeat is healthy.",
      latestHeartbeatAt: "2024-01-01T00:00:00.000Z",
      latestHeartbeatAgeMs: 5000,
      inlineWorker: false,
    },
    isLoading: false,
  }),
  WORKER_FLEET_GUIDANCE: "Start the worker fleet to enable executions.",
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("../RightInspectorPanel", () => ({
  __esModule: true,
  default: ({ selectedNode }: { selectedNode: { id: string } | null }) =>
    selectedNode ? <div data-testid="mock-inspector">{selectedNode.id}</div> : null,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

const loadEditor = () => import("../ProfessionalGraphEditor");

describe("ProfessionalGraphEditor inspector layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (global as any).fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    ) as typeof fetch;
    (global as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("does not render the inspector when no node is selected", async () => {
    const { default: ProfessionalGraphEditor } = await loadEditor();
    const { container } = render(<ProfessionalGraphEditor />);

    await waitFor(() => {
      expect(screen.queryByTestId("mock-inspector")).toBeNull();
    });

    const shell = container.querySelector(".editor-shell");
    expect(shell).not.toHaveClass("editor-shell--with-inspector");
  });

  it("shows the inspector and modifier class when a node is selected", async () => {
    localStorage.setItem(
      "draftWorkflow",
      JSON.stringify({
        id: "draft-1",
        name: "Draft",
        nodes: [
          {
            id: "trigger-1",
            type: "trigger.core.manual",
            position: { x: 0, y: 0 },
            data: {
              label: "Manual trigger",
              description: "",
              app: "core",
              parameters: {},
            },
          },
        ],
        edges: [],
      }),
    );

    const { default: ProfessionalGraphEditor } = await loadEditor();
    const { container } = render(<ProfessionalGraphEditor />);

    expect(await screen.findByTestId("mock-inspector")).toBeInTheDocument();

    const shell = container.querySelector(".editor-shell");
    expect(shell).toHaveClass("editor-shell--with-inspector");
  });
});
