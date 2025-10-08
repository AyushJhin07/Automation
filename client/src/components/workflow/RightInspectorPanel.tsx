import React, { type Dispatch, type SetStateAction } from "react";
import type { Node } from "reactflow";
import clsx from "clsx";
import { toast } from "sonner";
import { Settings, X, Activity, Clock, FileText, MessageSquare, Link, Copy, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Alert, AlertDescription } from "../ui/alert";
import SmartParametersPanel from "./SmartParametersPanel";
import type { ConnectorDefinitionMap } from "@/services/connectorDefinitionsService";

export interface RightInspectorPanelProps {
  selectedNode: Node<any> | null;
  setSelectedNodeId: (id: string | null) => void;
  setNodes: Dispatch<SetStateAction<Node<any>[]>>;
  lastExecution: any;
  labelValue: string;
  setLabelValue: Dispatch<SetStateAction<string>>;
  descValue: string;
  setDescValue: Dispatch<SetStateAction<string>>;
  credentialsDraft: string;
  setCredentialsDraft: Dispatch<SetStateAction<string>>;
  nodeRequiresConnection: (node: Node<any>) => boolean;
  openNodeConfigModal: (node: Node<any>) => void;
  connectorDefinitions: ConnectorDefinitionMap | null;
  onRefreshConnectors: () => void;
  isRefreshingConnectors: boolean;
  metadataError: Error | null;
}

const RightInspectorPanel: React.FC<RightInspectorPanelProps> = ({
  selectedNode,
  setSelectedNodeId,
  setNodes,
  lastExecution,
  labelValue,
  setLabelValue,
  descValue,
  setDescValue,
  credentialsDraft,
  setCredentialsDraft,
  nodeRequiresConnection,
  openNodeConfigModal,
  connectorDefinitions,
  onRefreshConnectors,
  isRefreshingConnectors,
  metadataError,
}) => {
  if (!selectedNode) {
    return null;
  }

  return (
    <div
      data-inspector
      className="workflow-inspector-panel w-full bg-gradient-to-br from-slate-50 to-white border-l-2 border-slate-200 shadow-xl overflow-y-auto nopan"
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      onMouseUp={(e) => {
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
      }}
      onPointerDownCapture={(e) => {
        e.stopPropagation();
        const ne: any = (e as any).nativeEvent;
        if (ne?.stopImmediatePropagation) ne.stopImmediatePropagation();
      }}
      onMouseDownCapture={(e) => {
        e.stopPropagation();
        const ne: any = (e as any).nativeEvent;
        if (ne?.stopImmediatePropagation) ne.stopImmediatePropagation();
      }}
      onClickCapture={(e) => {
        e.stopPropagation();
        const ne: any = (e as any).nativeEvent;
        if (ne?.stopImmediatePropagation) ne.stopImmediatePropagation();
      }}
      onKeyDownCapture={(event) => {
        if (event.ctrlKey || event.metaKey) {
          event.stopPropagation();
          const nativeEvent: any = event.nativeEvent;
          if (nativeEvent?.stopImmediatePropagation) nativeEvent.stopImmediatePropagation();
        }
      }}
      onKeyUpCapture={(event) => {
        if (event.ctrlKey || event.metaKey) {
          event.stopPropagation();
          const nativeEvent: any = event.nativeEvent;
          if (nativeEvent?.stopImmediatePropagation) nativeEvent.stopImmediatePropagation();
        }
      }}
      style={{ pointerEvents: "auto" }}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Node Properties</h3>
              <p className="text-xs text-blue-100 mt-0.5">{selectedNode.type}</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelectedNodeId(null);
              setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
            }}
            className="text-white/70 hover:text-white hover:bg-white/20 transition-all duration-200"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {lastExecution && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity
                  className={clsx(
                    "w-4 h-4",
                    lastExecution?.status === "success"
                      ? "text-emerald-500"
                      : lastExecution?.status === "error"
                      ? "text-red-500"
                      : "text-blue-500",
                  )}
                />
                <span className="text-sm font-semibold text-slate-700">Last execution</span>
              </div>
              <Badge
                className={clsx(
                  "text-xs",
                  lastExecution?.status === "success"
                    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                    : lastExecution?.status === "error"
                    ? "bg-red-100 text-red-700 border-red-200"
                    : "bg-slate-100 text-slate-700 border-slate-200",
                )}
              >
                {lastExecution?.status === "success"
                  ? "Success"
                  : lastExecution?.status === "error"
                  ? "Failed"
                  : "Completed"}
              </Badge>
            </div>
            <div className="mt-3 space-y-2 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>{lastExecution?.finishedAt ? new Date(lastExecution.finishedAt).toLocaleString() : "Just now"}</span>
              </div>
              {lastExecution?.summary && (
                <p className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700">{lastExecution.summary}</p>
              )}
              {lastExecution?.error?.message && (
                <p className="bg-red-50 border border-red-200 rounded-lg p-2 text-red-600">{lastExecution.error.message}</p>
              )}
              {Array.isArray(lastExecution?.logs) && lastExecution.logs.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-1">
                  {lastExecution.logs.slice(0, 5).map((log: string, index: number) => (
                    <div key={index} className="font-mono text-[11px] text-slate-500 truncate">
                      {log}
                    </div>
                  ))}
                </div>
              )}
              {lastExecution?.result && (
                <details className="bg-slate-50 border border-slate-200 rounded-lg">
                  <summary className="cursor-pointer px-2 py-1 text-slate-600 font-medium">Output preview</summary>
                  <pre className="px-2 pb-2 text-[11px] text-slate-600 whitespace-pre-wrap break-words">
                    {JSON.stringify(lastExecution.result?.preview ?? lastExecution.result, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        )}

        {/* Basic Information */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <label className="text-sm font-semibold text-slate-700 mb-3 block flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500" />
              Label
            </label>
            <Input
              value={labelValue}
              onChange={(e) => setLabelValue(e.target.value)}
              onBlur={() => {
                const next = labelValue;
                setNodes((nds) =>
                  nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, label: next } } : n)),
                );
              }}
              className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20 transition-colors"
              placeholder="Enter node label..."
            />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <label className="text-sm font-semibold text-slate-700 mb-3 block flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-slate-500" />
              Description
            </label>
            <Textarea
              value={descValue}
              onChange={(e) => setDescValue(e.target.value)}
              onBlur={() => {
                const next = descValue;
                setNodes((nds) =>
                  nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, description: next } } : n)),
                );
              }}
              className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20 transition-colors resize-none"
              placeholder="Describe what this node does..."
              rows={3}
            />
          </div>

          {/* Authentication (Connection / Inline Credentials) */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <label className="text-sm font-semibold text-slate-700 mb-3 block flex items-center gap-2">
              <Link className="w-4 h-4 text-slate-500" />
              Authentication
            </label>

            {/* Connection ID */}
            <div className="space-y-1 mb-3">
              <div className="text-xs font-medium text-slate-600">Connection ID (optional)</div>
              <Input
                value={String((selectedNode.data as any)?.connectionId || "")}
                onChange={(e) => {
                  const next = e.target.value;
                  setNodes((nds) =>
                    nds.map((n) => {
                      if (n.id !== selectedNode.id) return n;
                      const baseData: any = { ...(n.data || {}) };
                      const params: any = { ...(baseData.parameters || baseData.params || {}) };
                      baseData.connectionId = next || undefined;
                      baseData.auth = { ...(baseData.auth || {}), connectionId: next || undefined };
                      params.connectionId = next || undefined;
                      return { ...n, data: { ...baseData, parameters: params, params } } as any;
                    }),
                  );
                }}
                placeholder="e.g. conn_abc123 (if using saved connection)"
                className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20 transition-colors"
              />
              <div className="text-[11px] text-slate-500">
                If set, the server will use your saved connection. Leave empty to use inline credentials below.
              </div>
            </div>

            {/* Inline credentials JSON */}
            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-600">Inline credentials JSON (for quick tests)</div>
              {nodeRequiresConnection(selectedNode) && (
                <Alert className="bg-amber-50 border-amber-200 text-amber-900">
                  <AlertDescription className="flex flex-col gap-2">
                    This step needs a connected account. Use the button below to connect one—it’s the easiest option for non-technical users.
                    <Button
                      size="sm"
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedNodeId(String(selectedNode.id));
                        toast.message("Opening connection setup…");
                        void openNodeConfigModal(selectedNode);
                      }}
                      className="self-start bg-amber-500 text-white hover:bg-amber-600"
                    >
                      Connect Account
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              <Textarea
                value={credentialsDraft}
                onChange={(e) => {
                  setCredentialsDraft(e.target.value);
                }}
                onBlur={() => {
                  const text = credentialsDraft.trim();

                  if (!text) {
                    setNodes((nds) =>
                      nds.map((n) => {
                        if (n.id !== selectedNode.id) return n;
                        const baseData: any = { ...(n.data || {}) };
                        const params: any = { ...(baseData.parameters || baseData.params || {}) };
                        delete baseData.credentials;
                        if (params.credentials !== undefined) delete params.credentials;
                        return { ...n, data: { ...baseData, parameters: params, params } } as any;
                      }),
                    );
                    setCredentialsDraft("");
                    return;
                  }

                  try {
                    const parsed = JSON.parse(text);
                    setNodes((nds) =>
                      nds.map((n) => {
                        if (n.id !== selectedNode.id) return n;
                        const baseData: any = { ...(n.data || {}) };
                        const params: any = { ...(baseData.parameters || baseData.params || {}) };
                        baseData.credentials = parsed;
                        params.credentials = parsed;
                        return { ...n, data: { ...baseData, parameters: params, params } } as any;
                      }),
                    );
                    setCredentialsDraft(JSON.stringify(parsed, null, 2));
                    toast.success("Inline credentials saved");
                  } catch (err) {
                    toast.error("Invalid JSON. Please enter valid credentials.");
                  }
                }}
                placeholder='{"accessToken":"..."} or {"apiKey":"..."}'
                className="bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20 transition-colors resize-none"
                rows={6}
              />
              <div className="text-[11px] text-slate-500">
                Stored only in this workflow preview. The server will prefer inline credentials when provided.
              </div>
            </div>
          </div>
        </div>

        {/* ChatGPT Schema Fix: Smart Parameters Panel */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-sm">
          <SmartParametersPanel
            connectorDefinitions={connectorDefinitions}
            onRefreshConnectors={onRefreshConnectors}
            isRefreshingConnectors={isRefreshingConnectors}
            metadataError={metadataError}
          />
        </div>

        {/* Node Actions */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <label className="text-sm font-semibold text-slate-700 mb-3 block flex items-center gap-2">
            <Activity className="w-4 h-4 text-slate-500" />
            Actions
          </label>
          <div className="space-y-3">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                openNodeConfigModal(selectedNode);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-full bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100 hover:border-blue-400 transition-colors flex items-center justify-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Configure Node
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                const newNode = {
                  ...selectedNode,
                  id: `${selectedNode.type}-${Date.now()}`,
                  position: {
                    x: selectedNode.position.x + 50,
                    y: selectedNode.position.y + 50,
                  },
                  data: {
                    ...selectedNode.data,
                    label: `${(selectedNode.data as any).label} (Copy)`
                  },
                } as Node<any>;
                setNodes((nds) => [...nds, newNode]);
                setSelectedNodeId(newNode.id);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-full bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100 hover:border-slate-400 transition-colors flex items-center justify-center gap-2"
            >
              <Copy className="w-4 h-4" />
              Duplicate Node
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
                setSelectedNodeId(null);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-full bg-red-50 text-red-600 border-red-300 hover:bg-red-100 hover:border-red-400 transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete Node
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RightInspectorPanel;
