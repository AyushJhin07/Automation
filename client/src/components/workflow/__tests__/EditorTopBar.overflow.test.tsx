import React from "react";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import EditorTopBar from "../EditorTopBar";
import { TooltipProvider } from "@/components/ui/tooltip";

const baseProps = {
  onPrimary: vi.fn(),
  showRun: true,
  canRun: true,
  canValidate: true,
  isRunning: false,
  isValidating: false,
  workersOnline: 1,
};

describe("EditorTopBar overflow actions", () => {
  afterEach(() => {
    cleanup();
  });

  it("hides the overflow trigger when no actions are provided", () => {
    render(<EditorTopBar {...baseProps} />);
    expect(screen.queryByRole("button", { name: /workflow actions/i })).toBeNull();
  });

  it("invokes provided overflow handlers", async () => {
    const onSave = vi.fn();
    const onPromote = vi.fn();
    const onExport = vi.fn();
    const user = userEvent.setup();

    render(
      <EditorTopBar
        {...baseProps}
        overflowActions={[
          { id: "save", label: "Save draft", onSelect: onSave },
          { id: "promote", label: "Promote", onSelect: onPromote },
          { id: "export", label: "Export workflow JSON", onSelect: onExport },
        ]}
      />,
    );

    const trigger = screen.getByRole("button", { name: /workflow actions/i });

    await user.click(trigger);
    const saveItem = await screen.findByRole("menuitem", { name: /save draft/i });
    await user.click(saveItem);
    expect(onSave).toHaveBeenCalledTimes(1);

    await user.click(trigger);
    const promoteItem = await screen.findByRole("menuitem", { name: /promote/i });
    await user.click(promoteItem);
    expect(onPromote).toHaveBeenCalledTimes(1);

    await user.click(trigger);
    const exportItem = await screen.findByRole("menuitem", { name: /export workflow json/i });
    await user.click(exportItem);
    expect(onExport).toHaveBeenCalledTimes(1);
  });
});

describe("EditorTopBar worker status", () => {
  afterEach(() => {
    cleanup();
  });

  const renderWithTooltip = (ui: React.ReactElement) => {
    return render(<TooltipProvider>{ui}</TooltipProvider>);
  };

  it("shows the worker pill when workers are available", () => {
    renderWithTooltip(<EditorTopBar {...baseProps} workersOnline={2} />);

    expect(screen.getByText(/2 workers ready/i)).toBeInTheDocument();
  });

  it("renders a compact status indicator with tooltip when workers are offline", async () => {
    const user = userEvent.setup();
    renderWithTooltip(
      <EditorTopBar
        {...baseProps}
        workersOnline={0}
        workerStatusMessage="Start the worker fleet to enable executions."
      />,
    );

    expect(screen.queryByText(/workers offline/i)).toBeNull();
    const indicator = screen.getByRole("status", {
      name: /start the worker fleet/i,
    });

    await user.hover(indicator);

    expect(
      await screen.findByText(/start the worker fleet to enable executions./i),
    ).toBeInTheDocument();
  });

  it("surfaces worker notices even when workers are available", async () => {
    const user = userEvent.setup();
    renderWithTooltip(
      <EditorTopBar
        {...baseProps}
        workersOnline={1}
        workerNoticeMessage="Scheduler process is offline."
      />,
    );

    const pill = screen.getByRole("status", { name: /scheduler process is offline/i });
    await user.hover(pill);

    expect(await screen.findByText(/scheduler process is offline./i)).toBeInTheDocument();
  });
});
