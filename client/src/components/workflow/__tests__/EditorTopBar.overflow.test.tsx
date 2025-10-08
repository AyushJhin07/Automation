import React from "react";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import EditorTopBar from "../EditorTopBar";

const baseProps = {
  statusLabel: "Ready",
  statusTone: "ready" as const,
  statusHelperText: "All systems go",
  onRun: vi.fn(),
  canRun: true,
  runDisabled: false,
  onValidate: vi.fn(),
  canValidate: true,
  validateDisabled: false,
};

describe("EditorTopBar overflow actions", () => {
  afterEach(() => {
    cleanup();
  });

  it("hides the overflow trigger when no actions are provided", () => {
    render(<EditorTopBar {...baseProps} />);
    expect(screen.queryByRole("button", { name: /more actions/i })).toBeNull();
  });

  it("invokes provided overflow handlers", async () => {
    const onSave = vi.fn();
    const onPromote = vi.fn();
    const onExport = vi.fn();
    const user = userEvent.setup();

    render(
      <EditorTopBar
        {...baseProps}
        onSave={{ id: "save", label: "Save draft", onSelect: onSave }}
        onPromote={{ id: "promote", label: "Promote", onSelect: onPromote }}
        onExport={{ id: "export", label: "Export workflow JSON", onSelect: onExport }}
      />,
    );

    const trigger = screen.getByRole("button", { name: /more actions/i });

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
