import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Node } from "reactflow";

import RightInspectorPanel from "../RightInspectorPanel";

describe("RightInspectorPanel", () => {
  it("renders inspector content for a selected node", () => {
    const selectedNode = {
      id: "node-1",
      type: "action",
      position: { x: 0, y: 0 },
      data: { label: "Sample node" },
    } as Node;

    render(
      <RightInspectorPanel
        selectedNode={selectedNode}
        setSelectedNodeId={vi.fn() as any}
        setNodes={vi.fn() as any}
        lastExecution={null}
        labelValue="Sample node"
        setLabelValue={vi.fn() as any}
        descValue="Sample description"
        setDescValue={vi.fn() as any}
        nodeRequiresConnection={() => false}
        credentialsDraft=""
        setCredentialsDraft={vi.fn() as any}
        openNodeConfigModal={vi.fn() as any}
        connectorDefinitions={null}
        handleRefreshConnectorMetadata={vi.fn()}
        connectorDefinitionsLoading={false}
        connectorDefinitionsError={null}
      />,
    );

    expect(screen.getByText("Node Properties")).toBeInTheDocument();
  });
});
