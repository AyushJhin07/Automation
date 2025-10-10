import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import React from "react";
import { NodeSidebar } from "../ProfessionalGraphEditor";
import { buildRuntimeCapabilityIndex, mergeWithFallbackCapabilities } from "@/services/runtimeCapabilitiesService";

describe("NodeSidebar connector metadata integration", () => {
  it("surfaces new connectors discovered via metadata definitions", () => {
    const catalog = {
      connectors: {
        "novel-ai": {
          name: "Legacy Name",
          category: "Legacy",
          hasImplementation: true,
          actions: [
            {
              id: "analyze",
              name: "Analyze",
              description: "Analyze data",
              parameters: {},
              nodeType: "action.novel-ai.analyze",
            },
          ],
          triggers: [],
          release: { status: "beta", semver: "0.9.0", isBeta: true },
          lifecycle: {
            status: "beta",
            badges: [{ id: "beta", label: "Beta", tone: "warning" }],
          },
        },
      },
    };

    const connectorDefinitions = {
      "novel-ai": {
        id: "novel-ai",
        name: "Novel AI Suite",
        category: "AI Automation",
        icon: "brain",
        color: "#663399",
        actions: [],
        triggers: [],
        release: { status: "beta", semver: "1.0.0", isBeta: true },
        lifecycle: {
          status: "beta",
          badges: [{ id: "beta", label: "Beta", tone: "warning" }],
        },
      },
    };

    const runtimeCapabilities = mergeWithFallbackCapabilities({
      "novel-ai": {
        appId: "novel-ai",
        actions: new Set(["analyze"]),
        triggers: new Set<string>(),
      },
    } as any);

    const runtimeCapabilityIndex = buildRuntimeCapabilityIndex(
      runtimeCapabilities,
      connectorDefinitions as any,
    );

    render(
      <NodeSidebar
        onAddNode={vi.fn()}
        catalog={catalog}
        loading={false}
        connectorDefinitions={connectorDefinitions as any}
        runtimeCapabilities={runtimeCapabilities}
        runtimeCapabilitiesLoading={false}
        runtimeCapabilityIndex={runtimeCapabilityIndex}
      />,
    );

    expect(screen.getByText("Novel AI Suite")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "AI Automation" }),
    ).toBeInTheDocument();

    const appCard = screen.getByTestId("app-card-novel-ai");
    expect(within(appCard).getByText("Novel AI Suite")).toBeInTheDocument();

    const iconWrapper = within(appCard).getByTestId("app-icon-novel-ai");
    expect(
      iconWrapper.querySelector('svg[data-lucide="brain"]'),
    ).not.toBeNull();

    const runtimeIndicator = within(appCard).getByTestId("runtime-status-novel-ai-analyze");
    expect(runtimeIndicator).toHaveAttribute("aria-label", "Apps Script ready");
    const actionButton = within(appCard).getByTestId("sidebar-node-novel-ai-analyze");
    expect(actionButton).toHaveAttribute("data-runtime-supported", "true");
    expect(actionButton).toHaveAttribute("draggable", "true");
  });

  it("disables actions when runtime capabilities are missing", () => {
    const catalog = {
      connectors: {
        "alpha-app": {
          name: "Alpha App",
          category: "Testing",
          hasImplementation: true,
          actions: [
            {
              id: "sync",
              name: "Sync",
              description: "Sync records",
              parameters: {},
              nodeType: "action.alpha-app.sync",
            },
          ],
          triggers: [],
        },
      },
    };

    const runtimeCapabilities = mergeWithFallbackCapabilities({} as any);

    const runtimeCapabilityIndex = buildRuntimeCapabilityIndex(runtimeCapabilities, {} as any);

    render(
      <NodeSidebar
        onAddNode={vi.fn()}
        catalog={catalog}
        loading={false}
        connectorDefinitions={{} as any}
        runtimeCapabilities={runtimeCapabilities}
        runtimeCapabilitiesLoading={false}
        runtimeCapabilityIndex={runtimeCapabilityIndex}
      />,
    );

    const appCard = screen.getByTestId("app-card-alpha-app");
    const actionButton = within(appCard).getByTestId("sidebar-node-alpha-app-sync");

    expect(actionButton).toBeDisabled();
    expect(actionButton).toHaveAttribute("data-runtime-supported", "false");
    expect(actionButton).toHaveAttribute("draggable", "false");
    expect(within(appCard).getByTestId("runtime-status-alpha-app-sync")).toHaveAttribute(
      "aria-label",
      "Unavailable",
    );
  });

  it("surfaces fallback mode when runtime support is missing but connector implementation exists", () => {
    const catalog = {
      connectors: {
        "beta-app": {
          name: "Beta App",
          category: "Testing",
          hasImplementation: true,
          actions: [
            {
              id: "sync",
              name: "Sync",
              description: "Sync records",
              parameters: {},
              nodeType: "action.beta-app.sync",
            },
          ],
          triggers: [],
        },
      },
    };

    const connectorDefinitions = {
      "beta-app": {
        id: "beta-app",
        name: "Beta App",
        hasImplementation: true,
        actions: [{ id: "sync", name: "Sync" }],
        triggers: [],
      },
    } as any;

    const runtimeCapabilities = mergeWithFallbackCapabilities({} as any);
    const runtimeCapabilityIndex = buildRuntimeCapabilityIndex(runtimeCapabilities, connectorDefinitions);

    render(
      <NodeSidebar
        onAddNode={vi.fn()}
        catalog={catalog}
        loading={false}
        connectorDefinitions={connectorDefinitions}
        runtimeCapabilities={runtimeCapabilities}
        runtimeCapabilitiesLoading={false}
        runtimeCapabilityIndex={runtimeCapabilityIndex}
      />,
    );

    const appCard = screen.getByTestId("app-card-beta-app");
    const actionButton = within(appCard).getByTestId("sidebar-node-beta-app-sync");

    expect(actionButton).not.toBeDisabled();
    expect(actionButton).toHaveAttribute("data-runtime-mode", "fallback");
    expect(actionButton).toHaveAttribute("data-runtime-supported", "true");
    expect(within(appCard).getByTestId("runtime-status-beta-app-sync")).toHaveAttribute(
      "aria-label",
      "Node.js only",
    );
  });

  it("updates runtime badges when native support becomes available", () => {
    const catalog = {
      connectors: {
        "gamma-app": {
          name: "Gamma App",
          category: "Testing",
          hasImplementation: true,
          actions: [
            {
              id: "send",
              name: "Send",
              description: "Send records",
              parameters: {},
              nodeType: "action.gamma-app.send",
            },
          ],
          triggers: [],
        },
      },
    };

    const connectorDefinitions = {
      "gamma-app": {
        id: "gamma-app",
        name: "Gamma App",
        hasImplementation: true,
        actions: [{ id: "send", name: "Send" }],
        triggers: [],
      },
    } as any;

    const initialCapabilities = mergeWithFallbackCapabilities({} as any);
    const initialIndex = buildRuntimeCapabilityIndex(initialCapabilities, connectorDefinitions);

    const { rerender } = render(
      <NodeSidebar
        onAddNode={vi.fn()}
        catalog={catalog}
        loading={false}
        connectorDefinitions={connectorDefinitions}
        runtimeCapabilities={initialCapabilities}
        runtimeCapabilitiesLoading={false}
        runtimeCapabilityIndex={initialIndex}
      />,
    );

    const appCard = screen.getByTestId("app-card-gamma-app");
    const actionButton = within(appCard).getByTestId("sidebar-node-gamma-app-send");
    expect(actionButton).toHaveAttribute("data-runtime-mode", "fallback");

    const nativeCapabilities = mergeWithFallbackCapabilities({
      "gamma-app": {
        appId: "gamma-app",
        actions: new Set(["send"]),
        triggers: new Set<string>(),
      },
    } as any);
    const nativeIndex = buildRuntimeCapabilityIndex(nativeCapabilities, connectorDefinitions);

    rerender(
      <NodeSidebar
        onAddNode={vi.fn()}
        catalog={catalog}
        loading={false}
        connectorDefinitions={connectorDefinitions}
        runtimeCapabilities={nativeCapabilities}
        runtimeCapabilitiesLoading={false}
        runtimeCapabilityIndex={nativeIndex}
      />,
    );

    const updatedIndicator = within(appCard).getByTestId("runtime-status-gamma-app-send");
    expect(updatedIndicator).toHaveAttribute("aria-label", "Apps Script ready");
    expect(within(appCard).getByTestId("sidebar-node-gamma-app-send")).toHaveAttribute("data-runtime-mode", "native");
  });
});
