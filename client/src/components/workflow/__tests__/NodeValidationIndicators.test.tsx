import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActionNode, TransformNode } from "../ProfessionalGraphEditor";
import type { ValidationError } from "@shared/nodeGraphSchema";

describe("Graph node validation indicators", () => {
  it("highlights action nodes with validation errors", () => {
    const validationErrors: ValidationError[] = [
      {
        path: "nodes.node-1.params.url",
        message: "URL is required",
        severity: "error",
      },
      {
        path: "nodes.node-1.params.method",
        message: "Select an HTTP method",
        severity: "error",
      },
    ];

    const { container } = render(
      <ActionNode
        selected={false}
        data={{
          label: "HTTP Request",
          description: "Call an external API",
          app: "HTTP",
          validationErrors,
          executionStatus: "success",
        }}
      />,
    );

    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("URL is required")).toBeInTheDocument();
    expect(screen.getByText("+1 more issue")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("border-red-500/60");
  });

  it("renders transform node validation message without extra count", () => {
    const validationErrors: ValidationError[] = [
      {
        path: "nodes.node-2.params.template",
        message: "Add a template body",
        severity: "error",
      },
    ];

    render(
      <TransformNode
        selected={false}
        data={{
          label: "Format Text",
          description: "Prepare message output",
          app: "Formatter",
          validationErrors,
          executionStatus: "idle",
        }}
      />,
    );

    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("Add a template body")).toBeInTheDocument();
    expect(screen.queryByText(/more issue/)).toBeNull();
  });
});
