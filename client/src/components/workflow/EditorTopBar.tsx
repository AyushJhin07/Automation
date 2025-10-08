import React from "react";
import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { Activity, Loader2, MoreHorizontal, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  statusLabel: string;
  statusTone?: "ready" | "warning" | "error";
  statusTooltip?: string;
  statusHelperText?: string | null;
  statusPulse?: boolean;
  onRun: () => void;
  runDisabled?: boolean;
  runTooltip?: string;
  isRunLoading?: boolean;
  runIdleText?: string;
  runLoadingText?: string;
  onValidate: () => void;
  validateDisabled?: boolean;
  validateTooltip?: string;
  isValidateLoading?: boolean;
  validateIdleText?: string;
  validateLoadingText?: string;
  banner?: React.ReactNode;
  overflowActions?: EditorTopBarAction[];
}

const STATUS_TONE_CLASS: Record<NonNullable<EditorTopBarProps["statusTone"]>, string> = {
  ready: "editor-topbar__status-dot--ready",
  warning: "editor-topbar__status-dot--warning",
  error: "editor-topbar__status-dot--error",
};

const EditorTopBar: React.FC<EditorTopBarProps> = ({
  statusLabel,
  statusTone = "ready",
  statusTooltip,
  statusHelperText,
  statusPulse,
  onRun,
  runDisabled,
  runTooltip,
  isRunLoading,
  runIdleText = "Run workflow",
  runLoadingText = "Enqueuing…",
  onValidate,
  validateDisabled,
  validateTooltip,
  isValidateLoading,
  validateIdleText = "Validate / Dry run",
  validateLoadingText = "Validating…",
  banner,
  overflowActions,
}) => {
  const showRunTooltip = Boolean(runTooltip);
  const showValidateTooltip = Boolean(validateTooltip);
  const hasOverflow = Boolean(overflowActions && overflowActions.length > 0);

  const runButton = (
    <Button
      type="button"
      onClick={onRun}
      disabled={runDisabled}
      className="editor-topbar__action editor-topbar__action--primary"
    >
      {isRunLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Play className="h-4 w-4" />
      )}
      <span>{isRunLoading ? runLoadingText : runIdleText}</span>
    </Button>
  );

  const validateButton = (
    <Button
      type="button"
      variant="outline"
      onClick={onValidate}
      disabled={validateDisabled}
      className="editor-topbar__action editor-topbar__action--secondary"
    >
      {isValidateLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Activity className="h-4 w-4" />
      )}
      <span>{isValidateLoading ? validateLoadingText : validateIdleText}</span>
    </Button>
  );

  const statusContent = (
    <div className="editor-topbar__status">
      <span
        className={clsx(
          "editor-topbar__status-dot",
          STATUS_TONE_CLASS[statusTone],
          statusPulse && "editor-topbar__status-dot--pulse"
        )}
      />
      <div className="editor-topbar__status-text">
        <span className="editor-topbar__status-label">{statusLabel}</span>
        {statusHelperText ? (
          <span className="editor-topbar__status-helper">{statusHelperText}</span>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="editor-topbar">
      <div className="editor-topbar__inner">
        {statusTooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>{statusContent}</TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-center">
              <p>{statusTooltip}</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          statusContent
        )}

        <div className="editor-topbar__controls">
          {showRunTooltip ? (
            <Tooltip>
              <TooltipTrigger asChild>{runButton}</TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-center">
                <p>{runTooltip}</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            runButton
          )}

          {showValidateTooltip ? (
            <Tooltip>
              <TooltipTrigger asChild>{validateButton}</TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-center">
                <p>{validateTooltip}</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            validateButton
          )}

          {hasOverflow ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="editor-topbar__overflow-trigger"
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">More actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="editor-topbar__overflow-menu">
                {overflowActions!.map((action) => {
                  const Icon = action.icon;
                  return (
                    <DropdownMenuItem
                      key={action.id}
                      onSelect={(event) => {
                        event.preventDefault();
                        if (!action.disabled) {
                          action.onSelect();
                        }
                      }}
                      disabled={action.disabled}
                      className="editor-topbar__overflow-item"
                    >
                      {Icon ? <Icon className="h-4 w-4" /> : null}
                      <span>{action.label}</span>
                      {action.description ? (
                        <span className="editor-topbar__overflow-description">{action.description}</span>
                      ) : null}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      {banner ? <div className="editor-topbar__banner">{banner}</div> : null}
    </div>
  );
};

export default EditorTopBar;
