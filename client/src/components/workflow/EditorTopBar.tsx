import React, { ReactNode, useMemo } from "react";
import clsx from "clsx";
import { Brain, Save, Upload, Download, MoreHorizontal, AlertTriangle, CheckCircle2 } from "lucide-react";

import { Card, CardContent } from "../ui/card";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export interface EditorTopBarProps {
  nodesCount: number;
  runBanner: { type: "success" | "error"; message: string } | null;
  queueBadgeLabel: string;
  queueBadgeTone: string;
  queueBadgePulse: boolean;
  queueBadgeTooltip?: string;
  runDisabled: boolean;
  runDisableReason?: string;
  onRun: () => void;
  runLabel: ReactNode;
  validateDisabled: boolean;
  onValidate: () => void;
  validateLabel: ReactNode;
  onSave?: () => void;
  saveDisabled?: boolean;
  saveLabel?: string;
  onPromote?: () => void;
  promoteDisabled?: boolean;
  promoteLabel?: string;
  onExport?: () => void;
  exportDisabled?: boolean;
  exportLabel?: string;
}

type OverflowAction = {
  key: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
};

const DEFAULT_VALIDATE_TOOLTIP =
  "Dry runs can validate action-only drafts, but promoting to production still requires at least one trigger node.";

const EditorTopBar: React.FC<EditorTopBarProps> = ({
  nodesCount,
  runBanner,
  queueBadgeLabel,
  queueBadgeTone,
  queueBadgePulse,
  queueBadgeTooltip,
  runDisabled,
  runDisableReason,
  onRun,
  runLabel,
  validateDisabled,
  onValidate,
  validateLabel,
  onSave,
  saveDisabled,
  saveLabel = "Save",
  onPromote,
  promoteDisabled,
  promoteLabel = "Promote to production",
  onExport,
  exportDisabled,
  exportLabel = "Export JSON",
}) => {
  const overflowActions = useMemo<OverflowAction[]>(() => {
    const actions: OverflowAction[] = [];
    if (onSave) {
      actions.push({
        key: "save",
        label: saveLabel,
        onSelect: onSave,
        disabled: saveDisabled,
        icon: Save,
        shortcut: "⌘/Ctrl + S",
      });
    }
    if (onPromote) {
      actions.push({
        key: "promote",
        label: promoteLabel,
        onSelect: onPromote,
        disabled: promoteDisabled,
        icon: Upload,
      });
    }
    if (onExport) {
      actions.push({
        key: "export",
        label: exportLabel,
        onSelect: onExport,
        disabled: exportDisabled,
        icon: Download,
      });
    }
    return actions;
  }, [
    onSave,
    saveLabel,
    saveDisabled,
    onPromote,
    promoteLabel,
    promoteDisabled,
    onExport,
    exportLabel,
    exportDisabled,
  ]);

  const hasOverflowActions = overflowActions.length > 0;

  return (
    <div className="absolute top-4 left-4 right-4 z-10">
      <TooltipProvider delayDuration={150}>
        <Card className="bg-slate-800/90 backdrop-blur-sm border-slate-700">
          <CardContent className="p-3 space-y-3">
            {runBanner && (
              <Alert
                variant={runBanner.type === "error" ? "destructive" : "default"}
                className={clsx(
                  "mb-1",
                  runBanner.type === "error"
                    ? "bg-red-500/10 border-red-500/40 text-red-50"
                    : "bg-emerald-500/10 border-emerald-500/40 text-emerald-50",
                )}
              >
                {runBanner.type === "error" ? (
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                )}
                <AlertTitle>
                  {runBanner.type === "error" ? "Workflow run failed" : "Workflow run succeeded"}
                </AlertTitle>
                <AlertDescription>{runBanner.message}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h1 className="text-white font-bold text-lg flex items-center gap-2">
                  <Brain className="w-5 h-5 text-blue-400" aria-hidden="true" />
                  Workflow Designer
                </h1>
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                  {nodesCount} nodes
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Badge
                        className={clsx(
                          "px-2 py-1 text-xs uppercase tracking-wide border", // base classes
                          queueBadgeTone,
                          queueBadgePulse && "animate-pulse",
                        )}
                      >
                        {queueBadgeLabel}
                      </Badge>
                    </span>
                  </TooltipTrigger>
                  {queueBadgeTooltip && (
                    <TooltipContent className="max-w-xs">
                      <p>{queueBadgeTooltip}</p>
                    </TooltipContent>
                  )}
                </Tooltip>

                {runDisableReason ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          onClick={onRun}
                          disabled={runDisabled}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          {runLabel}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>{runDisableReason}</p>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Button
                    onClick={onRun}
                    disabled={runDisabled}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {runLabel}
                  </Button>
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button
                        variant="outline"
                        onClick={onValidate}
                        disabled={validateDisabled}
                        className="bg-amber-500/10 text-amber-200 border-amber-400 hover:bg-amber-500/20 hover:text-white"
                      >
                        {validateLabel}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>{DEFAULT_VALIDATE_TOOLTIP}</p>
                  </TooltipContent>
                </Tooltip>

                {hasOverflowActions && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="text-slate-200 hover:text-white hover:bg-slate-700"
                        aria-label="Workflow actions"
                        aria-haspopup="menu"
                      >
                        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56" aria-label="Workflow actions">
                      {overflowActions.map((action) => (
                        <DropdownMenuItem
                          key={action.key}
                          onSelect={(event) => {
                            if (action.disabled) {
                              event.preventDefault();
                              return;
                            }
                            action.onSelect();
                          }}
                          disabled={action.disabled}
                          aria-disabled={action.disabled || undefined}
                          className="flex items-center gap-2"
                        >
                          <action.icon className="h-4 w-4" aria-hidden="true" />
                          <span className="flex-1 text-left">{action.label}</span>
                          {action.shortcut && (
                            <span className="text-xs text-muted-foreground">{action.shortcut}</span>
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </TooltipProvider>
    </div>
  );
};

export default EditorTopBar;
