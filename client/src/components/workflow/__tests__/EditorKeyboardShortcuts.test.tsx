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

  it("invokes run handlers for meta+enter and ctrl+enter when enabled", () => {
    const onRun = vi.fn();
    const onValidate = vi.fn();

    render(
      <ShortcutHarness
        onRun={onRun}
        canRun
        runDisabled={false}
        onValidate={onValidate}
        canValidate
        validateDisabled={false}
      />,
    );

    fireEvent.keyDown(document.body, { key: "Enter", metaKey: true });
    fireEvent.keyDown(document.body, { key: "Enter", ctrlKey: true });

    expect(onRun).toHaveBeenCalledTimes(2);
    expect(onValidate).not.toHaveBeenCalled();
  });

  it("invokes validate handler for shift+enter and ignores disallowed contexts", () => {
    const onRun = vi.fn();
    const onValidate = vi.fn();

    const { rerender } = render(
      <ShortcutHarness
        onRun={onRun}
        canRun
        runDisabled={false}
        onValidate={onValidate}
        canValidate
        validateDisabled={false}
      />,
    );

    fireEvent.keyDown(document.body, { key: "Enter", shiftKey: true });
    expect(onValidate).toHaveBeenCalledTimes(1);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "Enter", metaKey: true });
    expect(onRun).not.toHaveBeenCalled();
    input.remove();

    onRun.mockClear();
    onValidate.mockClear();

    rerender(
      <ShortcutHarness
        onRun={onRun}
        canRun={false}
        runDisabled
        onValidate={onValidate}
        canValidate={false}
        validateDisabled
      />,
    );

    fireEvent.keyDown(document.body, { key: "Enter", metaKey: true });
    fireEvent.keyDown(document.body, { key: "Enter", shiftKey: true });

    expect(onRun).not.toHaveBeenCalled();
    expect(onValidate).not.toHaveBeenCalled();
  });
});
