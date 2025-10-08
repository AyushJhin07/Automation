import React from "react";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { Activity, Loader2, MoreHorizontal, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface EditorTopBarAction {
  id: string;
  label: string;
  onSelect: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  description?: string;
}

export interface EditorTopBarProps {
  onPrimary?: () => void;
  showRun: boolean;
  canRun?: boolean;
  canValidate?: boolean;
  isRunning?: boolean;
  isValidating?: boolean;
  primaryDisabledReasons?: string[];
  workersOnline?: number | boolean;
  overflowActions?: EditorTopBarAction[];
  banner?: React.ReactNode;
}

const EditorTopBar: React.FC<EditorTopBarProps> = ({
  onPrimary,
  showRun,
  canRun = true,
  canValidate = true,
  isRunning = false,
  isValidating = false,
  primaryDisabledReasons = [],
  workersOnline = 0,
  overflowActions,
  banner,
}) => {
  const workerCount = typeof workersOnline === "number" ? workersOnline : workersOnline ? 1 : 0;
  const workersAvailable = workerCount > 0;

  const primaryAction = React.useMemo(() => {
    return showRun ? "run" : "validate";
  }, [showRun]);

  const isPrimaryLoading = primaryAction === "run" ? isRunning : isValidating;
  const canPrimary = primaryAction === "run" ? canRun : canValidate;
  const handlePrimaryClick = onPrimary;
  const primaryDisabled = !canPrimary || isPrimaryLoading || !onPrimary;

  const tooltipText = React.useMemo(() => {
    if (!primaryDisabled) {
      return null;
    }

    const reasons = (primaryDisabledReasons ?? []).filter(
      (reason) => typeof reason === "string" && reason.trim().length > 0,
    );

    if (reasons.length === 0) {
      return null;
    }

    return reasons.join("\n");
  }, [primaryDisabled, primaryDisabledReasons]);

  const primaryLabel = React.useMemo(() => {
    if (primaryAction === "run") {
      return isPrimaryLoading ? "Running…" : "Run workflow";
    }
    return isPrimaryLoading ? "Validating…" : "Validate";
  }, [isPrimaryLoading, primaryAction]);

  const primaryIcon = isPrimaryLoading ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : primaryAction === "run" ? (
    <Play className="h-4 w-4" />
  ) : (
    <Activity className="h-4 w-4" />
  );

  const overflowList = React.useMemo(
    () =>
      (overflowActions ?? []).filter(
        (action): action is EditorTopBarAction => Boolean(action),
      ),
    [overflowActions],
  );

  const hasOverflow = overflowList.length > 0;
  const [isOverflowOpen, setIsOverflowOpen] = React.useState(false);

  const closeOverflow = React.useCallback(() => {
    setIsOverflowOpen(false);
  }, []);

  return (
    <div className="editor-topbar">
      <div className="editor-topbar__inner">
        <div className="editor-topbar__status-pill">
          <span
            className={clsx(
              "editor-topbar__worker-dot",
              workersAvailable
                ? "editor-topbar__worker-dot--online"
                : "editor-topbar__worker-dot--offline",
            )}
          />
          <span className="editor-topbar__worker-label">
            {workersAvailable
              ? `${workerCount} worker${workerCount === 1 ? "" : "s"} ready`
              : "Workers offline"}
          </span>
        </div>

        <div className="editor-topbar__controls">
          {tooltipText ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    type="button"
                    onClick={handlePrimaryClick}
                    disabled={primaryDisabled}
                    className="editor-topbar__primary-action"
                  >
                    {primaryIcon}
                    <span>{primaryLabel}</span>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs whitespace-pre-wrap">
                <p>{tooltipText}</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button
              type="button"
              onClick={handlePrimaryClick}
              disabled={primaryDisabled}
              className="editor-topbar__primary-action"
            >
              {primaryIcon}
              <span>{primaryLabel}</span>
            </Button>
          )}

          {hasOverflow ? (
            <div
              className={clsx(
                "editor-topbar__overflow",
                isOverflowOpen && "editor-topbar__overflow--open",
              )}
              onMouseEnter={() => setIsOverflowOpen(true)}
              onMouseLeave={() => setIsOverflowOpen(false)}
              onFocusCapture={() => setIsOverflowOpen(true)}
              onBlurCapture={(event) => {
                const nextFocus = event.relatedTarget as Node | null;
                if (!nextFocus || !event.currentTarget.contains(nextFocus)) {
                  setIsOverflowOpen(false);
                }
              }}
            >
              <button
                type="button"
                className="editor-topbar__overflow-trigger"
                aria-haspopup="true"
                aria-expanded={isOverflowOpen}
                onClick={() => setIsOverflowOpen((prev) => !prev)}
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Workflow actions</span>
              </button>

              <div className="editor-topbar__overflow-sheet" aria-hidden={!isOverflowOpen}>
                <span className="editor-topbar__overflow-title">Workflow actions</span>
                <div className="editor-topbar__overflow-items">
                  {overflowList.map((action) => {
                    const Icon = action.icon;
                    const handleSelect = () => {
                      if (action.disabled) {
                        return;
                      }
                      action.onSelect();
                      closeOverflow();
                    };

                    return (
                      <button
                        key={action.id}
                        type="button"
                        role="menuitem"
                        onClick={handleSelect}
                        disabled={action.disabled}
                        className="editor-topbar__overflow-item"
                      >
                        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                        <span className="editor-topbar__overflow-text">
                          <span className="editor-topbar__overflow-label">{action.label}</span>
                          {action.description ? (
                            <span className="editor-topbar__overflow-description">
                              {action.description}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {banner ? <div className="editor-topbar__banner">{banner}</div> : null}
    </div>
  );
};

export default EditorTopBar;
