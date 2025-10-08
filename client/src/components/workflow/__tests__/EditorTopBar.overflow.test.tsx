import React from "react";
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import EditorTopBar from "../EditorTopBar";

const baseProps = {
  onRun: vi.fn(),
  onValidate: vi.fn(),
  canRun: true,
  canValidate: true,
  isRunning: false,
  isValidating: false,
  workersOnline: 3,
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
        overflowActions={[
          { id: "save", label: "Save draft", onSelect: onSave },
          { id: "promote", label: "Promote", onSelect: onPromote },
          { id: "export", label: "Export workflow JSON", onSelect: onExport },
        ]}
      />,
    );

    const trigger = screen.getByRole("button", { name: /more actions/i });

    await user.hover(trigger);
    const saveItem = await screen.findByRole("menuitem", { name: /save draft/i });
    await user.click(saveItem);
    expect(onSave).toHaveBeenCalledTimes(1);

    await user.hover(trigger);
    const promoteItem = await screen.findByRole("menuitem", { name: /promote/i });
    await user.click(promoteItem);
    expect(onPromote).toHaveBeenCalledTimes(1);

    await user.hover(trigger);
    const exportItem = await screen.findByRole("menuitem", { name: /export workflow json/i });
    await user.click(exportItem);
    expect(onExport).toHaveBeenCalledTimes(1);
  });
});
