import React from "react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import EditorTopBar from "../EditorTopBar";

describe("EditorTopBar overflow actions", () => {
  const baseProps = {
    nodesCount: 2,
    runBanner: null,
    queueBadgeLabel: "Run ready",
    queueBadgeTone: "bg-emerald-600 text-white",
    queueBadgePulse: false,
    queueBadgeTooltip: "Workers healthy",
    runDisabled: false,
    onRun: vi.fn(),
    runLabel: "Run",
    validateDisabled: false,
    onValidate: vi.fn(),
    validateLabel: "Validate",
  } as const;

  it("invokes overflow action callbacks", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onPromote = vi.fn();
    const onExport = vi.fn();

    render(
      <EditorTopBar
        {...baseProps}
        onSave={onSave}
        saveLabel="Save"
        onPromote={onPromote}
        promoteLabel="Promote"
        onExport={onExport}
        exportLabel="Export"
      />,
    );

    const overflowButton = screen.getByRole("button", { name: /workflow actions/i });
    await user.click(overflowButton);

    await user.click(screen.getByRole("menuitem", { name: /save/i }));
    expect(onSave).toHaveBeenCalledTimes(1);

    await user.click(overflowButton);
    await user.click(screen.getByRole("menuitem", { name: /promote/i }));
    expect(onPromote).toHaveBeenCalledTimes(1);

    await user.click(overflowButton);
    await user.click(screen.getByRole("menuitem", { name: /export/i }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("hides overflow trigger when no extra actions are provided", () => {
    render(<EditorTopBar {...baseProps} />);

    expect(
      screen.queryByRole("button", { name: /workflow actions/i }),
    ).not.toBeInTheDocument();
  });
});
