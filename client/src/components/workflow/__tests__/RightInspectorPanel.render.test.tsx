import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Node } from "reactflow";
import RightInspectorPanel from "../RightInspectorPanel";

vi.mock("../SmartParametersPanel", () => ({
  __esModule: true,
  default: () => <div data-testid="smart-parameters-panel" />,
}));

describe("RightInspectorPanel", () => {
  it("renders node properties without crashing", () => {
    const selectedNode = {
      id: "node-1",
      type: "action",
      position: { x: 0, y: 0 },
      data: { label: "Sample Node", description: "Example description" },
    } as unknown as Node;

    render(
      <RightInspectorPanel
        selectedNode={selectedNode}
        setSelectedNodeId={vi.fn()}
        setNodes={vi.fn() as unknown as React.Dispatch<React.SetStateAction<Node<any>[]>>}
        lastExecution={null}
        labelValue="Sample Node"
        setLabelValue={vi.fn()}
        descValue="Example description"
        setDescValue={vi.fn()}
        credentialsDraft=""
        setCredentialsDraft={vi.fn()}
        nodeRequiresConnection={vi.fn().mockReturnValue(false)}
        openNodeConfigModal={vi.fn()}
        connectorDefinitions={null}
        onRefreshConnectors={vi.fn()}
        isRefreshingConnectors={false}
        metadataError={null}
      />
    );

    expect(screen.getByText("Node Properties")).toBeInTheDocument();
    expect(screen.getByTestId("smart-parameters-panel")).toBeInTheDocument();
  });
});
