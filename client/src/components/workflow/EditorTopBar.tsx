import React from "react";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { Activity, Loader2, MoreHorizontal, Play } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface EditorTopBarAction {
  id: string;
  label: string;
  onSelect: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  description?: string;
}

export interface EditorTopBarProps {
  canRun: boolean;
  canValidate: boolean;
  isRunning: boolean;
  isValidating: boolean;
  workersOnline: number;
  onRun: () => void;
  onValidate: () => void;
  overflowActions?: EditorTopBarAction[];
}

const EditorTopBar: React.FC<EditorTopBarProps> = ({
  canRun,
  canValidate,
  isRunning,
  isValidating,
  workersOnline,
  onRun,
  onValidate,
  overflowActions = [],
}) => {
  const hasWorkersOnline = workersOnline > 0;
  const workerLabel = hasWorkersOnline
    ? `${workersOnline} worker${workersOnline === 1 ? "" : "s"} online`
    : "No workers online";

  const primaryAction = React.useMemo(() => {
    if (isRunning || (canRun && !isValidating)) {
      return {
        label: isRunning ? "Running…" : "Run workflow",
        Icon: Play,
        onClick: onRun,
        disabled: !canRun || isRunning,
        isLoading: isRunning,
      } as const;
    }

    return {
      label: isValidating ? "Validating…" : "Validate workflow",
      Icon: Activity,
      onClick: onValidate,
      disabled: !canValidate || isValidating,
      isLoading: isValidating,
    } as const;
  }, [canRun, canValidate, isRunning, isValidating, onRun, onValidate]);

  return (
    <div className="editor-topbar">
      <div className="editor-topbar__status" role="status" aria-live="polite">
        <span
          aria-hidden="true"
          className={clsx(
            "editor-topbar__status-indicator",
            hasWorkersOnline
              ? "editor-topbar__status-indicator--online"
              : "editor-topbar__status-indicator--offline",
          )}
        />
        <span className="editor-topbar__status-label">{workerLabel}</span>
      </div>

      <div className="editor-topbar__controls">
        <Button
          type="button"
          onClick={primaryAction.onClick}
          disabled={primaryAction.disabled}
          className="editor-topbar__primary"
        >
          {primaryAction.isLoading ? (
            <Loader2 className="editor-topbar__primary-spinner" />
          ) : (
            <primaryAction.Icon className="editor-topbar__primary-icon" />
          )}
          <span>{primaryAction.label}</span>
        </Button>

        {overflowActions.length > 0 ? (
          <div className="editor-topbar__overflow">
            <button
              type="button"
              className="editor-topbar__overflow-trigger"
              aria-haspopup="menu"
              aria-label="More actions"
            >
              <MoreHorizontal className="editor-topbar__overflow-icon" />
            </button>
            <div className="editor-topbar__overflow-sheet" role="menu">
              {overflowActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    role="menuitem"
                    className="editor-topbar__overflow-item"
                    onClick={action.onSelect}
                    disabled={action.disabled}
                  >
                    {Icon ? <Icon className="editor-topbar__overflow-item-icon" /> : null}
                    <span className="editor-topbar__overflow-item-label">{action.label}</span>
                    {action.description ? (
                      <span className="editor-topbar__overflow-item-description">{action.description}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default EditorTopBar;
