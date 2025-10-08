import React from "react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const mockNodes: any[] = [];
const mockEdges: any[] = [];

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

import SmartParametersPanel from "../SmartParametersPanel";

describe("SmartParametersPanel metadata-driven UI", () => {
  beforeEach(() => {
    mockNodes.splice(0, mockNodes.length);
    mockEdges.splice(0, mockEdges.length);
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
});
