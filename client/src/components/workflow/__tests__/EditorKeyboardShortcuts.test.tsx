import React from "react";
import "@testing-library/jest-dom/vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  useEditorKeyboardShortcuts,
  type EditorKeyboardShortcutOptions,
} from "../ProfessionalGraphEditor";

const ShortcutHarness: React.FC<EditorKeyboardShortcutOptions> = (props) => {
  useEditorKeyboardShortcuts(props);
  return <div data-testid="shortcut-harness">Harness</div>;
};

describe("useEditorKeyboardShortcuts", () => {
  afterEach(() => {
    cleanup();
  });

  it("invokes the primary handler for run shortcuts when enabled", () => {
    const onPrimary = vi.fn();

    render(
      <ShortcutHarness onPrimary={onPrimary} showRun primaryDisabled={false} />,
    );

    fireEvent.keyDown(document.body, { key: "Enter", metaKey: true });
    fireEvent.keyDown(document.body, { key: "Enter", ctrlKey: true });

    expect(onPrimary).toHaveBeenCalledTimes(2);
  });

  it("invokes the primary handler for validation shortcuts and respects disabled contexts", () => {
    const onPrimary = vi.fn();

    const { rerender } = render(
      <ShortcutHarness onPrimary={onPrimary} showRun={false} primaryDisabled={false} />,
    );

    fireEvent.keyDown(document.body, { key: "Enter", shiftKey: true });
    expect(onPrimary).toHaveBeenCalledTimes(1);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "Enter", metaKey: true });
    expect(onPrimary).toHaveBeenCalledTimes(1);
    input.remove();

    onPrimary.mockClear();

    rerender(<ShortcutHarness onPrimary={onPrimary} showRun={false} primaryDisabled />);

    fireEvent.keyDown(document.body, { key: "Enter", shiftKey: true });
    expect(onPrimary).not.toHaveBeenCalled();
  });
});
