import React from "react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";

import { useEditorKeyboardShortcuts } from "../ProfessionalGraphEditor";

type TestProps = {
  runDisabled?: boolean;
  validateDisabled?: boolean;
  onRun?: () => void;
  onValidate?: () => void;
  includeTextarea?: boolean;
};

const ShortcutHarness: React.FC<TestProps> = ({
  runDisabled = false,
  validateDisabled = false,
  onRun = () => undefined,
  onValidate = () => undefined,
  includeTextarea = false,
}) => {
  useEditorKeyboardShortcuts({
    runDisabled,
    onRun,
    validateDisabled,
    onValidate,
  });

  return (
    <div>
      <div data-testid="shortcut-root">Shortcut harness</div>
      {includeTextarea && <textarea data-testid="editor-input" />}
    </div>
  );
};

describe("useEditorKeyboardShortcuts", () => {
  it("invokes onRun when pressing meta+enter", () => {
    const onRun = vi.fn();
    const onValidate = vi.fn();

    render(<ShortcutHarness onRun={onRun} onValidate={onValidate} />);

    fireEvent.keyDown(window, { key: "Enter", metaKey: true });

    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onValidate).not.toHaveBeenCalled();
  });

  it("invokes onRun when pressing ctrl+enter", () => {
    const onRun = vi.fn();
    render(<ShortcutHarness onRun={onRun} />);

    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });

    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("invokes onValidate for shift+enter when enabled", () => {
    const onValidate = vi.fn();

    render(<ShortcutHarness validateDisabled={false} onValidate={onValidate} />);

    fireEvent.keyDown(window, { key: "Enter", shiftKey: true });

    expect(onValidate).toHaveBeenCalledTimes(1);
  });

  it("does not validate when shift+enter originates from editable fields", () => {
    const onValidate = vi.fn();
    const { getByTestId } = render(
      <ShortcutHarness validateDisabled={false} onValidate={onValidate} includeTextarea />,
    );

    const textarea = getByTestId("editor-input");
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

    expect(onValidate).not.toHaveBeenCalled();
  });

  it("does not trigger shortcuts while disabled", () => {
    const onRun = vi.fn();
    const onValidate = vi.fn();

    render(
      <ShortcutHarness
        runDisabled
        validateDisabled
        onRun={onRun}
        onValidate={onValidate}
      />,
    );

    fireEvent.keyDown(window, { key: "Enter", metaKey: true });
    fireEvent.keyDown(window, { key: "Enter", shiftKey: true });

    expect(onRun).not.toHaveBeenCalled();
    expect(onValidate).not.toHaveBeenCalled();
  });
});
