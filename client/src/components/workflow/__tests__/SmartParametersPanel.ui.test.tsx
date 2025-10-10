import React from "react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react-dom/test-utils";

const extractUrl = (request: RequestInfo | URL): string => {
  if (typeof request === "string") return request;
  if (request instanceof URL) return request.toString();
  if (typeof Request !== "undefined" && request instanceof Request) {
    return request.url;
  }
  return String(request);
};

const createJsonResponse = (body: any, status = 200) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as Response);

const mockNodes: any[] = [];
const mockEdges: any[] = [];

const originalFetch = global.fetch;
let fetchMock: vi.Mock;
const toastMock = vi.fn();

vi.mock("reactflow", async () => {
  const actual = await vi.importActual<any>("reactflow");
  return {
    ...actual,
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useReactFlow: () => ({
      getNodes: () => mockNodes,
      setNodes: () => undefined,
      setEdges: () => undefined,
      getEdges: () => mockEdges,
      project: (value: any) => value,
    }),
    useStore: (selector: any) =>
      selector({
        nodes: mockNodes,
        edges: mockEdges,
        getNodes: () => mockNodes,
        getEdges: () => mockEdges,
      }),
  };
});

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}));

import SmartParametersPanel from "../SmartParametersPanel";

describe("SmartParametersPanel metadata-driven UI", () => {
  beforeEach(() => {
    mockNodes.splice(0, mockNodes.length);
    mockEdges.splice(0, mockEdges.length);
    fetchMock = vi.fn((input: RequestInfo | URL) => createJsonResponse({}));
    global.fetch = fetchMock as any;
    toastMock.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("surfaces quick picks and preview payloads from normalized metadata", async () => {
    mockNodes.push(
      {
        id: "upstream",
        type: "action",
        data: {
          label: "CRM Source",
          metadata: {
            outputs: {
              $: {
                columns: ["email", "name"],
                sample: { email: "ada@example.com", name: "Ada" },
              },
            },
          },
        },
      },
      {
        id: "selected",
        type: "action",
        selected: true,
        data: {
          label: "Destination",
          app: "notion",
          parameters: { email: "" },
          metadata: {
            schema: {
              email: { type: "string", title: "Email" },
            },
          },
        },
      },
    );

    mockEdges.push({ id: "edge-upstream-selected", source: "upstream", target: "selected" });

    render(<SmartParametersPanel />);

    const emailFieldLabel = await screen.findByText(/Email/);
    expect(emailFieldLabel).toBeInTheDocument();

    const modeSelect = screen.getAllByRole("combobox")[0];
    fireEvent.change(modeSelect, { target: { value: "dynamic" } });

    expect(await screen.findByText(/Quick Picks/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /CRM Source • email/i }),
    ).toBeInTheDocument();

    const previewToggle = screen.getByTestId("metadata-preview-toggle");
    fireEvent.click(previewToggle);
    expect(screen.getByText(/"email": "ada@example.com"/i)).toBeInTheDocument();
    expect(screen.queryByText(/metadata .* unavailable/i)).not.toBeInTheDocument();
  });

  it("posts metadata resolution requests and applies sheet extras", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = extractUrl(input);
      if (url === "/api/ai/models") {
        return createJsonResponse({ providers: { available: [] } });
      }
      if (url.startsWith("/api/google/sheets/")) {
        return createJsonResponse({ sheets: [] });
      }
      if (url === "/api/metadata/resolve") {
        return createJsonResponse({
          success: true,
          connector: "google-sheets",
          metadata: { columns: ["server-email"] },
          extras: { tabs: ["Server Tab", "Archive"] },
          warnings: ["Sample warning"],
        });
      }
      return createJsonResponse({});
    });

    mockNodes.push({
      id: "selected",
      type: "action",
      selected: true,
      data: {
        label: "Sheets Destination",
        app: "google-sheets",
        actionId: "append_row",
        parameters: { spreadsheetId: "sheet-123", sheet: "", range: "" },
        metadata: {
          schema: {
            spreadsheetId: { type: "string", title: "Spreadsheet" },
            sheet: { type: "string", title: "Sheet" },
            range: { type: "string", title: "Range" },
          },
        },
      },
    });

    render(<SmartParametersPanel />);

    await screen.findByText(/Spreadsheet/);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("automation:connection-selected", {
          detail: {
            nodeId: "selected",
            params: { spreadsheetId: "sheet-123", sheet: "", range: "" },
            reason: "test-refresh",
          },
        }),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      const metadataCall = fetchMock.mock.calls.find(([request]) =>
        extractUrl(request).includes("/api/metadata/resolve"),
      );
      expect(metadataCall).toBeTruthy();
    });

    const metadataCall = fetchMock.mock.calls.find(([request]) =>
      extractUrl(request).includes("/api/metadata/resolve"),
    )!;
    const metadataInit = metadataCall[1] as RequestInit | undefined;
    const bodyText =
      typeof metadataInit?.body === "string"
        ? metadataInit.body
        : metadataInit?.body instanceof URLSearchParams
          ? metadataInit.body.toString()
          : metadataInit?.body
            ? String(metadataInit.body)
            : "";
    const parsedBody = bodyText ? JSON.parse(bodyText) : {};

    expect(parsedBody).toMatchObject({
      connector: "google-sheets",
      params: expect.objectContaining({ spreadsheetId: "sheet-123" }),
    });
    expect(parsedBody.options).toMatchObject({
      nodeId: "selected",
    });
    expect(parsedBody).not.toHaveProperty("credentials");

    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Server Tab" })).toBeInTheDocument(),
    );

    expect(await screen.findByText(/Sample warning/)).toBeInTheDocument();
    expect(screen.getByText(/Metadata warnings/i)).toBeInTheDocument();

    warnSpy.mockRestore();
  });

  it("prompts users to connect an account when metadata refresh returns a missing connection error", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = extractUrl(input);
      if (url === "/api/ai/models") {
        return createJsonResponse({ providers: { available: [] } });
      }
      if (url === "/api/metadata/resolve") {
        return createJsonResponse({
          success: false,
          error: "CONNECTION_NOT_FOUND_DEV",
          warnings: ["Connect a Sheets account to refresh metadata."],
        }, 400);
      }
      return createJsonResponse({});
    });

    mockNodes.push({
      id: "selected",
      type: "action",
      selected: true,
      data: {
        label: "Sheets Destination",
        app: "google-sheets",
        actionId: "append_row",
        parameters: { spreadsheetId: "sheet-123", sheet: "", range: "" },
        metadata: {
          schema: {
            spreadsheetId: { type: "string", title: "Spreadsheet" },
            sheet: { type: "string", title: "Sheet" },
            range: { type: "string", title: "Range" },
          },
        },
      },
    });

    render(<SmartParametersPanel />);

    await screen.findByText(/Spreadsheet/);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent("automation:connection-selected", {
          detail: {
            nodeId: "selected",
            params: { spreadsheetId: "sheet-123", sheet: "", range: "" },
            reason: "connection",
          },
        }),
      );
      await Promise.resolve();
    });

    await waitFor(() => expect(toastMock).toHaveBeenCalledTimes(1));

    const toastArgs = toastMock.mock.calls[0]?.[0];
    expect(toastArgs).toMatchObject({
      title: expect.stringMatching(/connect an account/i),
      description: expect.stringMatching(/connect an account/i),
      variant: "destructive",
    });

    expect(await screen.findByText(/Metadata refresh failed:/i)).toBeInTheDocument();
    expect(screen.getByText(/Connect an account for this connector/i)).toBeInTheDocument();
    expect(screen.queryByText(/CONNECTION_NOT_FOUND/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Metadata warnings/i)).toBeInTheDocument();
    expect(screen.getByText(/Connect a Sheets account/i)).toBeInTheDocument();
  });
});
