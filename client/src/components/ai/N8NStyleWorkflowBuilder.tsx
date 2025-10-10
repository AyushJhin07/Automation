import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  NodeTypes,
  ReactFlowProvider,
  ReactFlowInstance,
  MarkerType,
  Position,
} from 'reactflow';
import type { NodeProps } from 'reactflow';
import 'reactflow/dist/style.css';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Brain,
  Sparkles,
  Loader2,
  RefreshCw,
  Settings,
  Play,
  Save,
  Zap,
  Mail,
  Sheet,
  Calendar,
  MessageSquare,
  CreditCard,
  ShoppingBag,
  CheckSquare,
  Trello as TrelloIcon,
  Cloud,
  Heart,
  X,
  Trash2,
  MessageCircle,
  Wand2,
  AlertTriangle,
} from 'lucide-react';
import { NodeConfigurationModal } from '@/components/workflow/NodeConfigurationModal';
import { useAuthStore } from '@/store/authStore';
import { enqueueExecution, ExecutionEnqueueError } from '@/services/executions';
import { toast } from 'sonner';
import { serializeGraphPayload } from '@/components/workflow/graphPayload';
import { ConversationalWorkflowBuilder } from './ConversationalWorkflowBuilder';
import type { FunctionDefinition } from '@/components/workflow/DynamicParameterForm';
import { useQueueHealth } from '@/hooks/useQueueHealth';
import { useWorkerHeartbeat, WORKER_FLEET_GUIDANCE } from '@/hooks/useWorkerHeartbeat';
import { useRuntimeCapabilityIndex } from '@/hooks/useRuntimeCapabilityIndex';
import { collectNodeConfigurationErrors } from '@/components/workflow/nodeConfigurationValidation';
import {
  findAppsScriptUnsupportedNode,
  type RuntimeUnsupportedNodeDetection,
} from '@/services/runtimeCapabilitiesService';
import type { ValidationError } from '@shared/nodeGraphSchema';
import clsx from 'clsx';
import { isDevIgnoreQueueEnabled } from '@/config/featureFlags';
import { RUNTIME_DISPLAY_NAMES, type RuntimeKey } from '@shared/runtimes';
import {
  sanitizeAnalyticsConnectorId,
  sanitizeAnalyticsOperationId,
  trackAnalyticsEvent,
} from '@/lib/analytics';

declare global {
  interface Window {
    __runtimeCapabilitiesRefresh?: () => Promise<void>;
  }
}

// N8N-Style Custom Node Component (visual only; configuration handled by parent modal)
const N8NNode: React.FC<NodeProps<any>> = ({ data }) => {
  const getAppIcon = (appName: string) => {
    const iconMap: Record<string, any> = {
      gmail: Mail,
      'google sheets': Sheet,
      'google calendar': Calendar,
      slack: MessageSquare,
      stripe: CreditCard,
      shopify: ShoppingBag,
      asana: CheckSquare,
      trello: TrelloIcon,
      salesforce: Cloud,
      hubspot: Heart,
    };

    const normalized = typeof appName === 'string' ? appName.toLowerCase() : '';
    const IconComponent = iconMap[normalized] || Zap;
    return <IconComponent className="w-6 h-6 text-white" />;
  };

  const configured = Boolean(data?.function);
  const hasConnection = Boolean(data?.connectionId);
  const isAiGenerated = Boolean(data?.aiOptimized);
  const description = data?.functionDescription || data?.description;

  return (
    <div
      className="relative bg-gray-800 border border-gray-600 rounded-lg shadow-lg hover:shadow-xl transition-all cursor-pointer group"
      style={{ width: '200px', minHeight: '80px' }}
    >
      {/* Node Header */}
      <div
        className="flex items-center gap-3 p-3 rounded-t-lg"
        style={{ backgroundColor: data?.color || '#6366f1' }}
      >
        {getAppIcon(data?.appName || data?.app)}
        <div className="flex-1">
          <div className="text-white font-medium text-sm">
            {data?.appName || data?.app || 'App'}
          </div>
          <div className="text-white/80 text-xs">
            {data?.category || (configured ? 'Configured' : 'Tap to configure')}
          </div>
        </div>
        <Settings className="w-4 h-4 text-white/60 group-hover:text-white transition-colors" />
      </div>

      {/* Node Content */}
      <div className="p-3 bg-gray-800 rounded-b-lg">
        <div className="text-white text-sm font-medium mb-1 truncate">
          {data?.function || data?.selectedFunction || 'Click to configure'}
        </div>
        <div className="text-gray-400 text-xs min-h-[32px]">
          {description || 'No function selected yet'}
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
          <span className={`flex items-center gap-1 ${configured ? 'text-emerald-400' : 'text-yellow-400'}`}>
            <div className={`w-2 h-2 rounded-full ${configured ? 'bg-emerald-500' : 'bg-yellow-500'}`} />
            {configured ? 'Configured' : 'Needs setup'}
          </span>
          <span className={`flex items-center gap-1 ${hasConnection ? 'text-sky-400' : 'text-gray-500'}`}>
            <div className={`w-2 h-2 rounded-full ${hasConnection ? 'bg-sky-500' : 'bg-gray-500'}`} />
            {hasConnection ? 'Connected' : 'No connection'}
          </span>
          {isAiGenerated && (
            <span className="flex items-center gap-1 text-purple-400">
              <Wand2 className="w-3 h-3" />
              AI
            </span>
          )}
        </div>
      </div>

      {/* Connection Points */}
      <div className="absolute -left-2 top-1/2 w-4 h-4 bg-gray-600 border-2 border-gray-400 rounded-full transform -translate-y-1/2" />
      <div className="absolute -right-2 top-1/2 w-4 h-4 bg-gray-600 border-2 border-gray-400 rounded-full transform -translate-y-1/2" />
    </div>
  );
};

const nodeTypes: NodeTypes = {
  n8nNode: N8NNode,
};

const normalizeAppId = (raw?: string): string => {
  if (!raw) return '';
  const value = raw.toLowerCase().trim();
  if (value.includes('gmail')) return 'gmail';
  if (value.includes('sheet')) return 'google-sheets';
  if (value.includes('calendar')) return 'google-calendar';
  if (value.includes('drive')) return 'google-drive';
  if (value.includes('slack')) return 'slack';
  if (value.includes('shopify')) return 'shopify';
  if (value.includes('stripe')) return 'stripe';
  if (value.includes('asana')) return 'asana';
  if (value.includes('trello')) return 'trello';
  if (value.includes('hubspot')) return 'hubspot';
  if (value.includes('salesforce')) return 'salesforce';
  return value.replace(/\s+/g, '-');
};

interface AIThinkingStep {
  step: number;
  title: string;
  description: string;
  duration: number;
  status: 'pending' | 'processing' | 'complete';
}

type WorkflowValidationState = {
  status: 'idle' | 'validating' | 'valid' | 'invalid';
  errors: ValidationError[];
  blockingErrors: ValidationError[];
  message?: string;
  error?: string;
};

export const N8NStyleWorkflowBuilder: React.FC = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  
  // AI Workflow Generation State
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('gemini');
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<AIThinkingStep[]>([]);
  const [currentThinkingStep, setCurrentThinkingStep] = useState(0);
  const [showAIPanel, setShowAIPanel] = useState(true);
  const [showConversationalAI, setShowConversationalAI] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [configNodeData, setConfigNodeData] = useState<any | null>(null);
  const [configFunctions, setConfigFunctions] = useState<FunctionDefinition[]>([]);
  const [configConnections, setConfigConnections] = useState<any[]>([]);
  const [configOAuthProviders, setConfigOAuthProviders] = useState<any[]>([]);
  const [dryRunResult, setDryRunResult] = useState<any | null>(null);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const [isRunningWorkflow, setIsRunningWorkflow] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState<string>('Visual Builder Workflow');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const authFetch = useAuthStore((state) => state.authFetch);
  const token = useAuthStore((state) => state.token);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const {
    health: queueHealth,
    isLoading: isQueueHealthLoading,
    error: queueHealthError,
  } = useQueueHealth({ intervalMs: 30000 });
  const {
    environmentWarnings: workerEnvironmentWarnings,
    summary: workerSummary,
    isLoading: isWorkerStatusLoading,
  } = useWorkerHeartbeat({ intervalMs: 30000 });
  const effectiveQueueStatus = queueHealth?.status ?? workerSummary.queueStatus ?? 'fail';
  const effectiveQueueDurable =
    queueHealth?.durable ??
    (typeof workerSummary.queueDurable === 'boolean' ? workerSummary.queueDurable : null);
  const effectiveQueueMessage =
    queueHealth?.message ??
    workerSummary.queueMessage ??
    queueHealthError ??
    'Execution queue is unavailable';
  const queueStatusPass = effectiveQueueStatus === 'pass';
  const queueDurableHealthy = effectiveQueueDurable !== false;
  const workerFleetReady = workerSummary.hasExecutionWorker;
  const workerNotices = useMemo(() => {
    const messages = workerEnvironmentWarnings.map((warning) => warning.message);
    if (!workerSummary.usesPublicHeartbeat) {
      if (!workerSummary.schedulerHealthy) {
        messages.push('Scheduler connectivity degraded. Scheduled triggers may not fire.');
      }
      if (!workerSummary.timerHealthy) {
        messages.push('Timer dispatcher lock unavailable. Timed workflows may be delayed.');
      }
    }
    return messages;
  }, [
    workerEnvironmentWarnings,
    workerSummary.schedulerHealthy,
    workerSummary.timerHealthy,
    workerSummary.usesPublicHeartbeat,
  ]);
  const workerBlockingMessage = useMemo(() => {
    if (workerFleetReady) {
      return undefined;
    }
    if (workerEnvironmentWarnings.length > 0) {
      return workerEnvironmentWarnings[0]?.message;
    }
    if (isWorkerStatusLoading) {
      return 'Checking worker and scheduler status…';
    }
    return WORKER_FLEET_GUIDANCE;
  }, [workerFleetReady, workerEnvironmentWarnings, isWorkerStatusLoading]);
  const workerStatusMessage = useMemo(() => {
    const parts = [] as string[];
    if (workerBlockingMessage) {
      parts.push(workerBlockingMessage);
    }
    workerNotices.forEach((message) => {
      if (message && !parts.includes(message)) {
        parts.push(message);
      }
    });
    return parts.join(' ');
  }, [workerBlockingMessage, workerNotices]);
  const queueGuidance = WORKER_FLEET_GUIDANCE;
  const queueStatusMessage = useMemo(() => {
    if (queueStatusPass && queueDurableHealthy) {
      return (
        effectiveQueueMessage || 'Worker and scheduler processes are connected to the queue.'
      );
    }
    const detail = effectiveQueueMessage;
    const suffix = detail.endsWith('.') ? '' : '.';
    if (detail.includes(queueGuidance)) {
      return detail;
    }
    return `${detail}${suffix} ${queueGuidance}`.trim();
  }, [queueStatusPass, queueDurableHealthy, effectiveQueueMessage, queueGuidance]);

  const queueDurabilityBypassed = useMemo(() => {
    if (queueStatusPass) {
      return false;
    }
    if (effectiveQueueDurable !== false) {
      return false;
    }
    return isDevIgnoreQueueEnabled();
  }, [queueStatusPass, effectiveQueueDurable]);

  const rawQueueReady = queueStatusPass && queueDurableHealthy;
  const queueReady = rawQueueReady || queueDurabilityBypassed;

  const queueDurabilityWarningMessage = useMemo(() => {
    if (!queueDurabilityBypassed) {
      return null;
    }

    const rawMessage = (effectiveQueueMessage ?? '').trim();
    const baseMessage = rawMessage.length > 0
      ? (rawMessage.endsWith('.') ? rawMessage : `${rawMessage}.`)
      : 'Queue driver is running in non-durable in-memory mode. Jobs will not be persisted.';

    return (
      `${baseMessage} ENABLE_DEV_IGNORE_QUEUE is active for development. ` +
      'Runs may be lost if the process restarts—connect Redis and turn off the flag when validating durability.'
    );
  }, [queueDurabilityBypassed, effectiveQueueMessage]);
  const runHealthTooltip = useMemo(() => {
    const parts = [] as string[];
    if (workerStatusMessage) {
      parts.push(workerStatusMessage);
    }
    if (queueDurabilityWarningMessage) {
      parts.push(queueDurabilityWarningMessage);
    } else if (queueStatusMessage) {
      parts.push(queueStatusMessage);
    }
    return parts.join(' ').trim();
  }, [workerStatusMessage, queueDurabilityWarningMessage, queueStatusMessage]);
  const isRunHealthLoading = isQueueHealthLoading || isWorkerStatusLoading;
  const runReady = queueReady && workerFleetReady;
  const {
    capabilities: runtimeCapabilities,
    index: runtimeCapabilityIndex,
    loading: runtimeCapabilitiesLoading,
    refresh: refreshRuntimeCapabilities,
  } = useRuntimeCapabilityIndex();
  const forceRefreshRuntimeCapabilities = useCallback(
    () => refreshRuntimeCapabilities(true),
    [refreshRuntimeCapabilities],
  );
  const handleRuntimeRefreshClick = useCallback(() => {
    void forceRefreshRuntimeCapabilities();
  }, [forceRefreshRuntimeCapabilities]);
  useEffect(() => {
    window.__runtimeCapabilitiesRefresh = forceRefreshRuntimeCapabilities;
    return () => {
      if (window.__runtimeCapabilitiesRefresh === forceRefreshRuntimeCapabilities) {
        delete window.__runtimeCapabilitiesRefresh;
      }
    };
  }, [forceRefreshRuntimeCapabilities]);
  const runtimeSelectionWasManualRef = useRef(false);
  const appsScriptDisableAnalyticsRef = useRef<string | null>(null);
  const [selectedRuntime, setSelectedRuntime] = useState<RuntimeKey>('appsScript');
  const appsScriptUnsupportedDetections = useMemo<RuntimeUnsupportedNodeDetection[]>(() => {
    if (runtimeCapabilitiesLoading) {
      return [];
    }
    return (
      findAppsScriptUnsupportedNode(nodes, {
        runtimeCapabilities,
        runtimeCapabilityIndex,
      }) ?? []
    );
  }, [nodes, runtimeCapabilitiesLoading, runtimeCapabilities, runtimeCapabilityIndex]);
  const primaryAppsScriptUnsupportedDetection =
    appsScriptUnsupportedDetections.length > 0 ? appsScriptUnsupportedDetections[0] : null;
  const appsScriptSupported = appsScriptUnsupportedDetections.length === 0;
  const runtimeUnsupportedAnalyticsContext = useMemo(() => {
    if (!primaryAppsScriptUnsupportedDetection) {
      return null;
    }

    const { support } = primaryAppsScriptUnsupportedDetection;
    const connectorId = sanitizeAnalyticsConnectorId(
      support.appId ?? support.appLabel ?? '',
    ) ?? undefined;
    const operationId = sanitizeAnalyticsOperationId(
      support.operationId ?? support.operationLabel ?? '',
    ) ?? undefined;

    return {
      connectorId,
      operationId,
      operationKind: support.kind,
      fallbackRuntime: support.fallbackRuntime,
      reason: support.reason,
      mode: support.mode,
    };
  }, [primaryAppsScriptUnsupportedDetection]);

  useEffect(() => {
    if (!appsScriptSupported && selectedRuntime === 'appsScript') {
      setSelectedRuntime('node');
      return;
    }
    if (appsScriptSupported && !runtimeSelectionWasManualRef.current && selectedRuntime !== 'appsScript') {
      setSelectedRuntime('appsScript');
    }
  }, [appsScriptSupported, selectedRuntime]);

  useEffect(() => {
    if (!primaryAppsScriptUnsupportedDetection) {
      appsScriptDisableAnalyticsRef.current = null;
      return;
    }

    const { support } = primaryAppsScriptUnsupportedDetection;
    const context = runtimeUnsupportedAnalyticsContext;
    const signatureParts = [
      context?.connectorId ?? sanitizeAnalyticsConnectorId(support.appId ?? support.appLabel ?? '') ?? 'unknown',
      context?.operationId ?? sanitizeAnalyticsOperationId(support.operationId ?? support.operationLabel ?? '') ?? 'unknown',
      support.kind ?? 'unknown',
    ];
    const signature = signatureParts.join('::');

    if (appsScriptDisableAnalyticsRef.current === signature) {
      return;
    }

    appsScriptDisableAnalyticsRef.current = signature;

    trackAnalyticsEvent('runtime.apps_script_disabled', {
      runtime: 'appsScript',
      connectorId: context?.connectorId,
      operationId: context?.operationId,
      operationKind: context?.operationKind,
      fallbackRuntime: context?.fallbackRuntime,
      reason: context?.reason ?? support.reason ?? 'unsupported',
      mode: context?.mode ?? support.mode,
      selection: selectedRuntime,
      manualSelection: runtimeSelectionWasManualRef.current,
    });
  }, [
    primaryAppsScriptUnsupportedDetection,
    runtimeUnsupportedAnalyticsContext,
    selectedRuntime,
  ]);

  const handleRuntimeChange = useCallback(
    (value: string) => {
      if (!value) {
        return;
      }

      const nextRuntime = value as RuntimeKey;
      if (nextRuntime === selectedRuntime) {
        return;
      }

      runtimeSelectionWasManualRef.current = true;
      setSelectedRuntime(nextRuntime);

      const payload: Record<string, unknown> = {
        from: selectedRuntime,
        to: nextRuntime,
      };

      if (!appsScriptSupported && selectedRuntime === 'appsScript' && runtimeUnsupportedAnalyticsContext) {
        payload.reason = 'apps_script_unsupported';
        payload.connectorId = runtimeUnsupportedAnalyticsContext.connectorId;
        payload.operationId = runtimeUnsupportedAnalyticsContext.operationId;
        payload.operationKind = runtimeUnsupportedAnalyticsContext.operationKind;
        payload.fallbackRuntime = runtimeUnsupportedAnalyticsContext.fallbackRuntime;
      }

      trackAnalyticsEvent('runtime.selection_changed', payload);
    },
    [selectedRuntime, appsScriptSupported, runtimeUnsupportedAnalyticsContext],
  );

  const primaryFallbackRuntimeName = useMemo(() => {
    const fallbackRuntimeKey =
      primaryAppsScriptUnsupportedDetection?.support.fallbackRuntime ?? 'node';
    return RUNTIME_DISPLAY_NAMES[fallbackRuntimeKey] ?? fallbackRuntimeKey;
  }, [primaryAppsScriptUnsupportedDetection]);
  const appsScriptUnsupportedReason = useMemo(() => {
    if (appsScriptSupported) {
      return null;
    }

    if (appsScriptUnsupportedDetections.length <= 1 && primaryAppsScriptUnsupportedDetection) {
      const { support } = primaryAppsScriptUnsupportedDetection;
      const appName = support.appLabel || support.appId || 'This connector';
      const operationName = support.operationLabel || support.operationId;
      if (operationName) {
        return `${appName} ${support.kind === 'trigger' ? 'trigger' : 'action'} "${operationName}" isn't available in Apps Script yet. Run it in ${primaryFallbackRuntimeName} instead.`;
      }
      return `${appName} isn't available in Apps Script yet. Run it in ${primaryFallbackRuntimeName} instead.`;
    }

    return `${appsScriptUnsupportedDetections.length} nodes aren't available in Apps Script yet. Run this workflow in ${primaryFallbackRuntimeName} instead.`;
  }, [
    appsScriptSupported,
    appsScriptUnsupportedDetections,
    primaryAppsScriptUnsupportedDetection,
    primaryFallbackRuntimeName,
  ]);

  const runtimeDisplayName = RUNTIME_DISPLAY_NAMES[selectedRuntime] ?? 'Apps Script';
  const runtimeReady = selectedRuntime !== 'appsScript' || appsScriptSupported;
  const runtimeBlockedReason = useMemo(() => {
    if (!runtimeReady) {
      return (
        appsScriptUnsupportedReason || 'Apps Script runtime is not available for this workflow yet.'
      );
    }
    return undefined;
  }, [runtimeReady, appsScriptUnsupportedReason]);
  const appsScriptUnsupportedList = useMemo(
    () =>
      appsScriptUnsupportedDetections.map((detection, index) => {
        const { support, node } = detection;
        const appName = support.appLabel || support.appId || 'This connector';
        const operationName = support.operationLabel || support.operationId;
        const fallbackRuntimeKey = support.fallbackRuntime ?? 'node';
        const fallbackRuntimeName =
          RUNTIME_DISPLAY_NAMES[fallbackRuntimeKey] ?? fallbackRuntimeKey;
        const label = operationName
          ? `${appName} ${support.kind === 'trigger' ? 'trigger' : 'action'} "${operationName}"`
          : appName;
        const message = operationName
          ? `${label} isn't available in Apps Script yet.`
          : `${appName} isn't available in Apps Script yet.`;

        return {
          id: String(node?.id ?? index),
          detection,
          label,
          message,
          fallbackRuntimeName,
        };
      }),
    [appsScriptUnsupportedDetections],
  );
  const handleFocusUnsupportedNode = useCallback(
    (detection: RuntimeUnsupportedNodeDetection) => {
      if (!reactFlowInstance) {
        return;
      }

      const nodeIdValue = detection.node?.id;
      if (nodeIdValue === undefined || nodeIdValue === null) {
        return;
      }

      const nodeId = String(nodeIdValue);
      const instanceNode =
        typeof (reactFlowInstance as any).getNode === 'function'
          ? ((reactFlowInstance as any).getNode(nodeId) as Node | undefined)
          : undefined;
      const targetNode =
        instanceNode ?? nodes.find((node) => node.id === nodeId) ?? null;
      if (!targetNode) {
        return;
      }

      if (typeof reactFlowInstance.fitView === 'function') {
        reactFlowInstance.fitView({
          nodes: [targetNode],
          duration: 500,
          padding: 0.6,
        });
        return;
      }

      const position = targetNode.positionAbsolute ?? targetNode.position ?? { x: 0, y: 0 };
      if (typeof (reactFlowInstance as any).setCenter === 'function') {
        (reactFlowInstance as any).setCenter(position.x, position.y, {
          zoom: 1.2,
          duration: 500,
        });
      }
    },
    [nodes, reactFlowInstance],
  );
  const [workflowValidation, setWorkflowValidation] = useState<WorkflowValidationState>({
    status: 'idle',
    errors: [],
    blockingErrors: [],
    message: undefined,
    error: undefined,
  });
  const dryRunStatus = useMemo(() => {
    if (!dryRunResult) return null;
    if (dryRunResult?.execution?.status) return dryRunResult.execution.status;
    return dryRunResult.encounteredError ? 'failed' : 'completed';
  }, [dryRunResult]);

  const runDisableReason = useMemo(() => {
    if (!token) {
      return 'Sign in to run workflows.';
    }
    if (nodes.length === 0) {
      return 'Add at least one node before running.';
    }
    if (!workerFleetReady) {
      return workerBlockingMessage || WORKER_FLEET_GUIDANCE;
    }
    if (!queueReady) {
      return queueStatusMessage;
    }
    if (!runtimeReady) {
      return runtimeBlockedReason;
    }
    if (combinedBlockingErrors.length > 0) {
      return combinedBlockingErrors[0]?.message;
    }
    if (workflowValidation.status === 'validating' || workflowValidation.status === 'idle') {
      return 'Validating workflow…';
    }
    if (workflowValidation.status === 'invalid') {
      return (
        workflowValidation.message ||
        workflowValidation.error ||
        'Resolve validation issues before running.'
      );
    }
    return undefined;
  }, [
    token,
    nodes.length,
    workerFleetReady,
    workerBlockingMessage,
    queueReady,
    queueStatusMessage,
    runtimeReady,
    runtimeBlockedReason,
    combinedBlockingErrors,
    workflowValidation.status,
    workflowValidation.message,
    workflowValidation.error,
  ]);

  const runDisabled =
    isRunningWorkflow ||
    nodes.length === 0 ||
    !token ||
    !queueReady ||
    !workerFleetReady ||
    !runtimeReady ||
    combinedBlockingErrors.length > 0 ||
    workflowValidation.status !== 'valid';

  const runButtonInner = isRunningWorkflow ? (
    <>
      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      Running in {runtimeDisplayName}…
    </>
  ) : (
    <>
      <Zap className="w-4 h-4 mr-2" />
      Run in {runtimeDisplayName}
    </>
  );
  const runtimeToggle = (
    <ToggleGroup
      type="single"
      value={selectedRuntime}
      onValueChange={handleRuntimeChange}
      variant="outline"
      size="sm"
      className="bg-gray-800 border border-gray-700 rounded-md px-1 py-0.5"
      aria-label="Select workflow runtime"
    >
      <ToggleGroupItem
        value="appsScript"
        disabled={!appsScriptSupported}
        className={clsx(
          'text-xs text-gray-200 hover:bg-gray-700',
          'data-[state=on]:bg-emerald-600 data-[state=on]:text-white',
        )}
      >
        Apps Script
      </ToggleGroupItem>
      <ToggleGroupItem
        value="node"
        className={clsx(
          'text-xs text-gray-200 hover:bg-gray-700',
          'data-[state=on]:bg-blue-600 data-[state=on]:text-white',
        )}
      >
        Node.js
      </ToggleGroupItem>
    </ToggleGroup>
  );
  const runtimeToggleControl = appsScriptUnsupportedReason ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{runtimeToggle}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>{appsScriptUnsupportedReason}</p>
      </TooltipContent>
    </Tooltip>
  ) : (
    runtimeToggle
  );
  const runtimeRefreshButton = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-xs text-gray-300 hover:text-white"
      onClick={handleRuntimeRefreshClick}
      disabled={runtimeCapabilitiesLoading}
    >
      {runtimeCapabilitiesLoading ? (
        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
      ) : (
        <RefreshCw className="w-3 h-3 mr-2" />
      )}
      Refresh runtime support
    </Button>
  );
  const runtimeControls = (
    <div className="flex items-center gap-2">
      {runtimeToggleControl}
      {runtimeRefreshButton}
    </div>
  );

  const queueBadgeLabel = queueDurabilityBypassed
    ? 'In-memory queue (non-durable)'
    : runReady
      ? 'Run ready'
      : isRunHealthLoading
        ? 'Checking status…'
        : !workerFleetReady
          ? 'Workers offline'
          : 'Queue offline';
  const queueBadgeTone = queueDurabilityBypassed
    ? 'bg-amber-500 text-white'
    : runReady
      ? 'bg-emerald-600 text-white'
      : isRunHealthLoading
        ? 'bg-amber-500 text-white'
        : 'bg-red-600 text-white';
  const queueBadgePulse = queueDurabilityBypassed || (!runReady && !isRunHealthLoading);
  const queueBadgeTooltip = queueDurabilityWarningMessage || runHealthTooltip || queueStatusMessage;

  const dryRunNodeSummaries = useMemo(() => {
    if (!dryRunResult?.execution?.nodes) return [] as Array<{ nodeId: string; status: string; label: string; message?: string }>;
    return Object.entries(dryRunResult.execution.nodes).map(([nodeId, details]: [string, any]) => ({
      nodeId,
      status: details?.status || 'unknown',
      label: details?.label || nodeId,
      message: details?.result?.summary || details?.result?.output?.summary || details?.error?.message || '',
    }));
  }, [dryRunResult]);

  const lastSavedLabel = useMemo(() => {
    if (!lastSavedAt) return null;
    try {
      const date = new Date(lastSavedAt);
      if (Number.isNaN(date.getTime())) {
        return null;
      }
      return date.toLocaleString();
    } catch {
      return null;
    }
  }, [lastSavedAt]);

  const buildGraphPayload = useCallback(
    (identifier: string, nameOverride?: string) => {
      const sanitizedNodes = nodes.map((node) => {
        const cleanedData: Record<string, any> = { ...(node.data || {}) };

        const canonicalApp = normalizeAppId(
          cleanedData.app || cleanedData.appName || cleanedData.application
        );
        if (canonicalApp) {
          cleanedData.app = canonicalApp;
          cleanedData.appName = cleanedData.appName || canonicalApp;
        }

        const functionId =
          cleanedData.function || cleanedData.selectedFunction || cleanedData.operation;
        if (functionId) {
          cleanedData.function = functionId;
          cleanedData.operation = functionId;
          cleanedData.selectedFunction = functionId;
        }

        const parameters: Record<string, any> = {
          ...(cleanedData.parameters || cleanedData.params || {}),
        };
        const connectionId =
          cleanedData.connectionId ||
          cleanedData.auth?.connectionId ||
          parameters.connectionId;
        if (connectionId) {
          cleanedData.connectionId = connectionId;
          cleanedData.auth = { ...(cleanedData.auth || {}), connectionId };
          parameters.connectionId = connectionId;
        } else {
          delete cleanedData.connectionId;
          if (cleanedData.auth) {
            delete cleanedData.auth.connectionId;
          }
          delete parameters.connectionId;
        }

        cleanedData.parameters = parameters;
        cleanedData.params = parameters;
        cleanedData.configured = Boolean(functionId);

        delete cleanedData.aiOptimized;
        delete cleanedData.functionDescription;
        delete cleanedData.onConfigure;
        delete cleanedData.color;
        delete cleanedData.connected;

        return {
          id: String(node.id),
          type: node.type,
          position: node.position,
          data: cleanedData,
          sourcePosition: node.sourcePosition,
          targetPosition: node.targetPosition,
        } as Node;
      });

      return serializeGraphPayload({
        nodes: sanitizedNodes,
        edges,
        workflowIdentifier: identifier,
        specName: nameOverride || workflowName || 'Visual Builder Workflow',
      });
    },
    [nodes, edges, workflowName]
  );

  const nodeRequiresConnection = useCallback(
    (node: Node): boolean => {
      if (!node) {
        return false;
      }
      const role = String(node.type || (node.data as any)?.role || '').toLowerCase();
      if (role.includes('trigger') || role.includes('transform')) {
        return false;
      }
      const data: any = node.data || {};
      const params: any = data.parameters || data.params || {};
      const connectionId = data.connectionId || data.auth?.connectionId || params.connectionId;
      const hasInlineCredentials = Boolean(data.credentials || params.credentials);
      return !connectionId && !hasInlineCredentials;
    },
    []
  );

  const nodeConfigurationErrors = useMemo(
    () => collectNodeConfigurationErrors(nodes as any[], { nodeRequiresConnection }),
    [nodes, nodeRequiresConnection]
  );

  const nodeBlockingErrors = useMemo(
    () => nodeConfigurationErrors.filter((error) => error.severity === 'error'),
    [nodeConfigurationErrors]
  );

  const hydrateCanvasFromGraph = useCallback(
    (graph: any) => {
      if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) {
        setNodes([]);
        setEdges([]);
        setDryRunResult(null);
        return;
      }

      const rfNodes: Node[] = graph.nodes.map((node: any, index: number) => {
        const data: Record<string, any> = {
          ...(node.data || {}),
        };

        const canonicalApp = normalizeAppId(
          data.app || data.appName || node.app || node.appName
        );
        if (canonicalApp) {
          data.app = canonicalApp;
          data.appName = data.appName || node.appName || canonicalApp;
        }

        const functionId =
          data.function || node.function || data.operation || data.selectedFunction;
        if (functionId) {
          data.function = functionId;
          data.operation = functionId;
          data.selectedFunction = functionId;
        }

        const parameters: Record<string, any> = {
          ...(data.parameters || data.params || node.parameters || node.params || {}),
        };
        const connectionId =
          data.connectionId || data.auth?.connectionId || parameters.connectionId;
        if (connectionId) {
          data.connectionId = connectionId;
          data.auth = { ...(data.auth || {}), connectionId };
          parameters.connectionId = connectionId;
        } else {
          delete data.connectionId;
          if (data.auth) {
            delete data.auth.connectionId;
          }
          delete parameters.connectionId;
        }

        data.parameters = parameters;
        data.params = parameters;
        data.configured = Boolean(data.function);
        if (node.color && !data.color) {
          data.color = node.color;
        }
        if (!data.label && node.label) {
          data.label = node.label;
        }
        if (!data.functionDescription && (node.functionDescription || node.aiReason)) {
          data.functionDescription = node.functionDescription || node.aiReason;
        }

        const position = node.position && typeof node.position.x === 'number' && typeof node.position.y === 'number'
          ? node.position
          : { x: 100 + index * 260, y: 100 + (index % 2) * 160 };

        return {
          id: String(node.id ?? `node-${index}`),
          type: 'n8nNode',
          position,
          data,
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
        } as Node;
      });

      const rawEdges = Array.isArray(graph.edges)
        ? graph.edges
        : Array.isArray(graph.connections)
        ? graph.connections
        : [];

      const rfEdges: Edge[] = rawEdges
        .map((edge: any, index: number) => {
          const source = edge.source ?? edge.from;
          const target = edge.target ?? edge.to;
          if (!source || !target) {
            return null;
          }

          return {
            id: String(edge.id ?? `edge-${index}-${source}-${target}`),
            source: String(source),
            target: String(target),
            type: edge.type || 'smoothstep',
            style: edge.style || { stroke: '#6366f1', strokeWidth: 2 },
            markerEnd: edge.markerEnd || { type: MarkerType.ArrowClosed, color: '#6366f1' },
            data: edge.data || {},
            label: edge.label || edge.dataType || '',
            labelStyle: edge.labelStyle || { fill: '#9CA3AF', fontSize: 12 },
            labelBgStyle: edge.labelBgStyle || { fill: '#1F2937', fillOpacity: 0.8 },
          } as Edge;
        })
        .filter(Boolean) as Edge[];

      setNodes(rfNodes);
      setEdges(rfEdges);
      setDryRunResult(null);
    },
    [setNodes, setEdges]
  );

  useEffect(() => {
    if (nodes.length === 0) {
      setWorkflowValidation({
        status: 'valid',
        errors: [],
        blockingErrors: [],
        message: undefined,
        error: undefined,
      });
      return;
    }

    let cancelled = false;
    setWorkflowValidation((previous) => ({
      ...previous,
      status: 'validating',
      error: undefined,
    }));

    const identifier = workflowId ?? `builder-${Date.now()}`;
    const payload = buildGraphPayload(identifier);
    const body = JSON.stringify({
      graph: payload,
      options: { preview: true },
    });
    const controller = new AbortController();

    const triggerValidation = async () => {
      try {
        const response = token
          ? await authFetch('/api/workflows/validate', {
              method: 'POST',
              body,
              signal: controller.signal,
            })
          : await fetch('/api/workflows/validate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body,
              signal: controller.signal,
            });
        const json = await response.json().catch(() => ({}));
        if (cancelled) {
          return;
        }
        if (!response.ok || json?.success === false) {
          const message = json?.message || json?.error || 'Unable to validate workflow';
          setWorkflowValidation({
            status: 'invalid',
            errors: [],
            blockingErrors: [],
            message,
            error: undefined,
          });
          return;
        }
        const validation = json?.validation ?? {};
        const errors = Array.isArray(validation.errors)
          ? (validation.errors as ValidationError[])
          : [];
        const blockingErrors = errors.filter((error) => error?.severity === 'error');
        setWorkflowValidation({
          status: blockingErrors.length === 0 && validation.valid !== false ? 'valid' : 'invalid',
          errors,
          blockingErrors,
          message: validation.message ?? json?.message,
          error: undefined,
        });
      } catch (error: any) {
        if (cancelled) {
          return;
        }
        setWorkflowValidation({
          status: 'invalid',
          errors: [],
          blockingErrors: [],
          message: undefined,
          error: error?.message || 'Unable to validate workflow',
        });
      }
    };

    const timer = window.setTimeout(() => {
      void triggerValidation();
    }, 300);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [nodes, workflowId, buildGraphPayload, authFetch, token]);

  const combinedBlockingErrors = useMemo(() => {
    const seen = new Set<string>();
    const blocking: ValidationError[] = [];
    [...nodeBlockingErrors, ...workflowValidation.blockingErrors].forEach((error) => {
      const key = `${error.nodeId ?? 'global'}|${error.path}|${error.message}`;
      if (!seen.has(key)) {
        seen.add(key);
        blocking.push(error);
      }
    });
    return blocking;
  }, [nodeBlockingErrors, workflowValidation.blockingErrors]);

  const onConnect = useCallback(
    (params: Connection) => {
      const edge = {
        ...params,
        type: 'smoothstep',
        style: { stroke: '#6366f1', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' }
      };
      setEdges((eds) => addEdge(edge, eds));
    },
    [setEdges]
  );

  const openNodeConfigModal = useCallback(
    async (node: Node) => {
      const data = node.data || {};
      const canonicalApp = normalizeAppId(data.app || data.appName || data.application);
      const params = { ...(data.parameters || data.params || {}) };
      const connectionId = data.connectionId || data.auth?.connectionId || params.connectionId;
      const nodeType = String(node.type || '').startsWith('trigger') ? 'trigger' : 'action';

      setConfigNodeData({
        id: String(node.id),
        type: nodeType,
        appName: canonicalApp || 'gmail',
        functionId: data.function || data.operation || data.selectedFunction,
        label: data.label || data.appName || String(node.id),
        parameters: params,
        connectionId: connectionId,
      });
      setConfigFunctions([]);
      setConfigConnections([]);
      setConfigOAuthProviders([]);
      setConfigOpen(true);

      try {
        if (canonicalApp) {
          try {
            const response = await fetch(`/api/functions/${encodeURIComponent(canonicalApp)}`);
            if (response.ok) {
              const payload = await response.json().catch(() => ({}));
              const list = payload?.data?.functions || payload?.functions || [];
              setConfigFunctions(Array.isArray(list) ? list : []);
            } else {
              setConfigFunctions([]);
            }
          } catch {
            setConfigFunctions([]);
          }
        }

        try {
          if (token) {
            const response = await authFetch('/api/connections');
            const payload = await response.json().catch(() => ({}));
            const list = payload?.connections || [];
            setConfigConnections(Array.isArray(list) ? list : []);
          } else {
            setConfigConnections([]);
          }
        } catch {
          setConfigConnections([]);
        }

        try {
          const response = token ? await authFetch('/api/oauth/providers') : await fetch('/api/oauth/providers');
          if (response.ok) {
            const payload = await response.json().catch(() => ({}));
            const list = payload?.data?.providers || payload?.providers || [];
            setConfigOAuthProviders(Array.isArray(list) ? list : []);
          } else {
            setConfigOAuthProviders([]);
          }
        } catch {
          setConfigOAuthProviders([]);
        }
      } catch (error) {
        console.error('Failed to load configuration metadata', error);
      }
    },
    [authFetch, token]
  );

  const handleNodeConfigSave = useCallback(
    (updated: any) => {
      if (!updated?.id) {
        setConfigOpen(false);
        return;
      }

      setNodes((existingNodes) =>
        existingNodes.map((node) => {
          if (String(node.id) !== String(updated.id)) {
            return node;
          }

          const baseData: Record<string, any> = { ...(node.data || {}) };
          const params: Record<string, any> = { ...(baseData.parameters || baseData.params || {}) };

          const canonicalApp = normalizeAppId(updated.appName || baseData.app || baseData.appName);
          if (canonicalApp) {
            baseData.app = canonicalApp;
            baseData.appName = updated.appName || baseData.appName || canonicalApp;
          }

          if (updated.label) {
            baseData.label = updated.label;
          }

          if (updated.functionId) {
            baseData.function = updated.functionId;
            baseData.operation = updated.functionId;
            baseData.selectedFunction = updated.functionId;
            if ((updated.type || '').toLowerCase() === 'action') {
              baseData.actionId = updated.functionId;
            }
            if ((updated.type || '').toLowerCase() === 'trigger') {
              baseData.triggerId = updated.functionId;
            }
          }

          if (updated.parameters && typeof updated.parameters === 'object') {
            Object.assign(params, updated.parameters);
          }

          const connectionId = updated.connectionId || params.connectionId;
          if (connectionId) {
            baseData.connectionId = connectionId;
            baseData.auth = { ...(baseData.auth || {}), connectionId };
            params.connectionId = connectionId;
          } else {
            delete baseData.connectionId;
            if (baseData.auth) {
              delete baseData.auth.connectionId;
            }
            if ('connectionId' in params) {
              delete params.connectionId;
            }
          }

          baseData.parameters = params;
          baseData.params = params;
          baseData.configured = Boolean(baseData.function);

          return {
            ...node,
            data: baseData,
          };
        })
      );

      setConfigOpen(false);
      setConfigNodeData(null);
      toast.success('Node configuration saved');
    },
    [setNodes]
  );

  const runDryRun = useCallback(async () => {
    if (!nodes.length) {
      toast.error('Add at least one node before running a test');
      return;
    }

    if (nodeBlockingErrors.length > 0) {
      toast.error(
        nodeBlockingErrors[0]?.message || 'Configure all nodes before running a test'
      );
      return;
    }

    setIsDryRunning(true);
    setDryRunResult(null);

    try {
      const identifier = workflowId ?? `builder-${Date.now()}`;
      const payload = buildGraphPayload(identifier);

      const body = JSON.stringify({
        workflowId: payload.id,
        graph: payload,
        options: { stopOnError: false },
      });

      const response = token
        ? await authFetch('/api/executions/dry-run', { method: 'POST', body })
        : await fetch('/api/executions/dry-run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || result?.success === false) {
        const message = result?.message || result?.error || 'Dry run failed';
        toast.error(message);
        setDryRunResult(result);
        return;
      }

      toast.success('Dry run completed');
      setDryRunResult(result);
    } catch (error: any) {
      console.error('Dry run failed', error);
      toast.error(error?.message || 'Unable to execute dry run');
    } finally {
      setIsDryRunning(false);
    }
  }, [nodes, nodeBlockingErrors, workflowId, buildGraphPayload, authFetch, token]);

  const runWorkflow = useCallback(async () => {
    if (!nodes.length) {
      toast.error('Add at least one node before running');
      return;
    }

    if (!queueReady) {
      toast.error(queueStatusMessage);
      return;
    }

    if (selectedRuntime === 'appsScript' && !appsScriptSupported) {
      trackAnalyticsEvent('runtime.run_blocked', {
        runtime: selectedRuntime,
        connectorId: runtimeUnsupportedAnalyticsContext?.connectorId,
        operationId: runtimeUnsupportedAnalyticsContext?.operationId,
        operationKind: runtimeUnsupportedAnalyticsContext?.operationKind,
        fallbackRuntime: runtimeUnsupportedAnalyticsContext?.fallbackRuntime,
        reason:
          runtimeUnsupportedAnalyticsContext?.reason ??
          appsScriptUnsupportedReason ??
          'apps_script_unsupported',
      });
      toast.error(
        appsScriptUnsupportedReason || 'Apps Script runtime is not available for this workflow yet.',
      );
      return;
    }

    const blockingError = combinedBlockingErrors[0];
    if (blockingError) {
      toast.error(blockingError.message || 'Resolve configuration issues before running.');
      return;
    }

    if (!token) {
      toast.error('Sign in to run workflows');
      return;
    }

    if (workflowValidation.status !== 'valid') {
      toast.error(
        workflowValidation.message ||
          workflowValidation.error ||
          'Resolve validation issues before running.'
      );
      return;
    }

    setIsRunningWorkflow(true);

    try {
      const identifier = workflowId ?? `builder-${Date.now()}`;
      const payload = buildGraphPayload(identifier);
      const name = workflowName?.trim() || payload.name || 'Visual Builder Workflow';

      const saveResponse = await authFetch('/api/flows/save', {
        method: 'POST',
        body: JSON.stringify({
          id: identifier,
          name,
          graph: payload,
          metadata: payload.metadata,
        }),
      });
      const saveResult = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok || saveResult?.success === false) {
        const message = saveResult?.message || saveResult?.error || 'Failed to save workflow';
        toast.error(message);
        return;
      }

      const savedWorkflowId: string = saveResult?.workflowId || identifier;
      setWorkflowId(savedWorkflowId);
      setWorkflowName(name);
      const savedAt = new Date().toISOString();
      setLastSavedAt(savedAt);
      if (typeof window !== 'undefined') {
        try {
          const draft = {
            id: savedWorkflowId,
            name,
            savedAt,
            graph: payload,
          };
          localStorage.setItem('automation.builder.draft', JSON.stringify(draft));
        } catch (storageError) {
          console.warn('Failed to persist local draft after run save', storageError);
        }
      }

      const { executionId } = await enqueueExecution({
        workflowId: savedWorkflowId,
        triggerType: 'manual',
        initialData: null,
        runtime: selectedRuntime,
      });

      toast.success('Workflow execution started');

      if (executionId) {
        navigate(`/runs/${executionId}`);
      }
    } catch (error: any) {
      console.error('Failed to run workflow', error);

      let message = error?.message || 'Unable to run workflow';

      if (error instanceof ExecutionEnqueueError) {
        const isDefaultMessage =
          error.message === `Failed to enqueue workflow execution (status ${error.status}).`;

        if (error.status === 401) {
          await logout(true);
          message = 'Sign in to run workflows.';
        } else if (error.status === 404) {
          message = 'Workflow not found. Save the workflow before running.';
        } else if (error.status === 503 || error.code === 'QUEUE_UNAVAILABLE') {
          const details = (error.details ?? {}) as Record<string, any>;
          const queueTarget = details?.target ? ` (${details.target})` : '';
          message =
            !isDefaultMessage && error.message
              ? error.message
              : `Execution queue is unavailable${queueTarget}. Verify worker and Redis health before retrying.`;
        } else if (error.code === 'EXECUTION_QUOTA_EXCEEDED') {
          message =
            !isDefaultMessage && error.message
              ? error.message
              : 'Execution quota exceeded. Wait for the current window to reset before trying again.';
        } else if (error.code === 'CONNECTOR_CONCURRENCY_EXCEEDED') {
          message =
            !isDefaultMessage && error.message
              ? error.message
              : 'Connector concurrency limits were reached. Wait for in-flight runs to finish.';
        } else if (error.code === 'USAGE_QUOTA_EXCEEDED') {
          const details = (error.details ?? {}) as Record<string, any>;
          const quotaType = details?.quotaType
            ? String(details.quotaType).replace(/_/g, ' ').toLowerCase()
            : 'usage';
          message =
            !isDefaultMessage && error.message
              ? error.message
              : `Your ${quotaType} quota has been reached. Adjust limits or try again later.`;
        } else {
          message = error.message || message;
        }
      }

      toast.error(message);
    } finally {
      setIsRunningWorkflow(false);
    }
  }, [
    nodes,
    token,
    workflowId,
    workflowName,
    buildGraphPayload,
    authFetch,
    navigate,
    queueReady,
    queueStatusMessage,
    selectedRuntime,
    appsScriptSupported,
    appsScriptUnsupportedReason,
    runtimeUnsupportedAnalyticsContext,
    combinedBlockingErrors,
    workflowValidation.status,
    workflowValidation.message,
    workflowValidation.error,
    logout,
  ]);

  const saveWorkflow = useCallback(async () => {
    if (!nodes.length) {
      toast.error('Add at least one node before saving');
      return;
    }

    const identifier = workflowId ?? `builder-${Date.now()}`;
    const payload = buildGraphPayload(identifier);
    const name = workflowName?.trim() || payload.name || 'Visual Builder Workflow';

    const requestBody = {
      id: identifier,
      name,
      graph: payload,
      metadata: payload.metadata,
    };

    if (token) {
      setIsSaving(true);
      try {
        const response = await authFetch('/api/flows/save', {
          method: 'POST',
          body: JSON.stringify(requestBody),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.success === false) {
          const message = result?.error || 'Failed to save workflow';
          toast.error(message);
          return;
        }

        const savedId: string = result.workflowId || identifier;
        setWorkflowId(savedId);
        setWorkflowName(name);
        const savedAt = new Date().toISOString();
        setLastSavedAt(savedAt);
        if (typeof window !== 'undefined') {
          try {
            const draft = {
              id: savedId,
              name,
              savedAt,
              graph: payload,
            };
            localStorage.setItem('automation.builder.draft', JSON.stringify(draft));
          } catch (storageError) {
            console.warn('Failed to persist local draft after save', storageError);
          }
        }
        toast.success('Workflow saved');
      } catch (error: any) {
        const message = error?.message || 'Unable to save workflow';
        toast.error(message);
      } finally {
        setIsSaving(false);
      }
      return;
    }

    try {
      if (typeof window === 'undefined') {
        throw new Error('Local storage is unavailable in this environment');
      }
      const savedAt = new Date().toISOString();
      const draft = {
        id: identifier,
        name,
        savedAt,
        graph: payload,
      };
      localStorage.setItem('automation.builder.draft', JSON.stringify(draft));
      setWorkflowId(identifier);
      setWorkflowName(name);
      setLastSavedAt(savedAt);
      toast.success('Saved locally (sign in to sync)');
    } catch (error: any) {
      const message = error?.message || 'Failed to save locally';
      toast.error(message);
    }
  }, [nodes, token, workflowId, workflowName, buildGraphPayload, authFetch]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const raw = localStorage.getItem('automation.builder.draft');
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      const graph = parsed?.graph;
      if (graph?.nodes?.length) {
        hydrateCanvasFromGraph(graph);
        setWorkflowId(parsed?.id || graph.id || null);
        setWorkflowName(parsed?.name || graph.name || 'Visual Builder Workflow');
        setLastSavedAt(parsed?.savedAt || null);
        setShowAIPanel(false);
      }
    } catch (error) {
      console.warn('Failed to restore local builder draft', error);
    }
  }, [hydrateCanvasFromGraph]);

  const generateWorkflowWithThinking = async () => {
    if (!prompt.trim()) return;

    setIsThinking(true);
    setCurrentThinkingStep(0);
    
    // Define AI thinking steps
    const steps: AIThinkingStep[] = [
      {
        step: 1,
        title: 'Analyzing Request',
        description: 'Understanding your automation requirements...',
        duration: 2000,
        status: 'processing'
      },
      {
        step: 2,
        title: 'Identifying Apps',
        description: 'Determining which applications are needed...',
        duration: 1500,
        status: 'pending'
      },
      {
        step: 3,
        title: 'Mapping Data Flow',
        description: 'Planning how data will flow between apps...',
        duration: 2500,
        status: 'pending'
      },
      {
        step: 4,
        title: 'Selecting Functions',
        description: 'Choosing optimal functions for each app...',
        duration: 2000,
        status: 'pending'
      },
      {
        step: 5,
        title: 'Generating Workflow',
        description: 'Creating visual workflow and connections...',
        duration: 1500,
        status: 'pending'
      },
      {
        step: 6,
        title: 'Code Generation',
        description: 'Generating Google Apps Script code...',
        duration: 1000,
        status: 'pending'
      }
    ];

    setThinkingSteps(steps);

    // Execute thinking steps with realistic timing
    for (let i = 0; i < steps.length; i++) {
      setCurrentThinkingStep(i);
      
      // Update current step to processing
      setThinkingSteps(prev => prev.map((step, idx) => ({
        ...step,
        status: idx === i ? 'processing' : idx < i ? 'complete' : 'pending'
      })));

      await new Promise(resolve => setTimeout(resolve, steps[i].duration));

      // Mark current step as complete
      setThinkingSteps(prev => prev.map((step, idx) => ({
        ...step,
        status: idx <= i ? 'complete' : 'pending'
      })));
    }

    // Generate actual workflow
    try {
      const response = await fetch('/api/ai/generate-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: prompt.trim(),
          userId: 'admin-user',
          preferredModel: selectedModel
        }),
      });

      if (response.ok) {
        const workflow = await response.json();

        const baseNodes = workflow.nodes || workflow.graph?.nodes || [];
        const graphLike = {
          nodes: Array.isArray(baseNodes)
            ? baseNodes.map((node: any) => ({
                ...node,
                data: node.data ? { ...node.data, aiOptimized: true } : node.data,
                aiOptimized: true,
              }))
            : [],
          edges: workflow.edges || workflow.graph?.edges || [],
          connections: workflow.connections || workflow.graph?.connections || [],
        };

        hydrateCanvasFromGraph(graphLike);
        setWorkflowId(
          workflow.id || workflow.workflowId || workflow.graph?.id || null
        );
        setWorkflowName(
          workflow.name || workflow.title || workflow.graph?.name || 'AI Generated Workflow'
        );
        setLastSavedAt(null);
        setDryRunResult(null);
      }
    } catch (error) {
      console.error('Error generating workflow:', error);
    } finally {
      setIsThinking(false);
      setShowAIPanel(false);
    }
  };

  const clearWorkflow = () => {
    setNodes([]);
    setEdges([]);
    setPrompt('');
    setShowAIPanel(true);
    setDryRunResult(null);
    setWorkflowId(null);
    setWorkflowName('Visual Builder Workflow');
    setLastSavedAt(null);
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('automation.builder.draft');
      }
    } catch (error) {
      console.warn('Failed to clear local builder draft', error);
    }
  };

  return (
    <div className="relative flex h-screen bg-gray-900">
      {queueDurabilityWarningMessage ? (
        <div className="pointer-events-none absolute left-1/2 top-4 z-20 w-[min(90vw,640px)] -translate-x-1/2">
          <Alert className="pointer-events-auto border-amber-200 bg-amber-50 text-amber-900 shadow-lg">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            <AlertTitle>In-memory queue mode</AlertTitle>
            <AlertDescription>{queueDurabilityWarningMessage}</AlertDescription>
          </Alert>
        </div>
      ) : null}
      {/* Left Sidebar - AI Panel */}
      {showAIPanel && (
        <div className="w-80 bg-gray-800 border-r border-gray-700 p-6 overflow-y-auto">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white mb-2">AI Workflow Generator</h2>
            <p className="text-gray-400 text-sm">
              Describe your automation and watch AI build it step by step
            </p>
          </div>

          {/* AI Model Selection */}
          <div className="mb-6">
            <Label className="text-white mb-2 block">AI Model</Label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-600">
                <SelectItem value="gemini">💎 Gemini Pro (Fastest & Cheapest)</SelectItem>
                <SelectItem value="claude">🧠 Claude Haiku (Most Accurate)</SelectItem>
                <SelectItem value="gpt4">⚡ GPT-4o Mini (Balanced)</SelectItem>
                <SelectItem value="local">🏠 Local Analysis (Free)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Prompt Input */}
          <div className="mb-6">
            <Label className="text-white mb-2 block">Describe Your Automation</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Example: Create an automatic email responder that replies to customer inquiries with a professional message..."
              className="bg-gray-700 border-gray-600 text-white min-h-[120px]"
              disabled={isThinking}
            />
          </div>

                     {/* Generate Buttons */}
           <div className="space-y-3 mb-6">
             <Button 
               onClick={() => setShowConversationalAI(true)}
               className="w-full bg-green-600 hover:bg-green-700"
             >
               <MessageCircle className="w-4 h-4 mr-2" />
               Chat with AI (Real LLM)
             </Button>
             
             <Button 
               onClick={generateWorkflowWithThinking}
               disabled={!prompt.trim() || isThinking}
               className="w-full bg-purple-600 hover:bg-purple-700"
             >
               {isThinking ? (
                 <>
                   <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                   AI Thinking...
                 </>
               ) : (
                 <>
                   <Brain className="w-4 h-4 mr-2" />
                   Quick Generate
                 </>
               )}
             </Button>
           </div>

          {/* AI Thinking Process */}
          {isThinking && (
            <div className="space-y-3">
              <h3 className="text-white font-medium">AI Thinking Process</h3>
              {thinkingSteps.map((step, index) => (
                <div 
                  key={step.step}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    step.status === 'complete' ? 'bg-green-900/50 border-green-600' :
                    step.status === 'processing' ? 'bg-blue-900/50 border-blue-600' :
                    'bg-gray-800 border-gray-600'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    step.status === 'complete' ? 'bg-green-600 text-white' :
                    step.status === 'processing' ? 'bg-blue-600 text-white' :
                    'bg-gray-600 text-gray-300'
                  }`}>
                    {step.status === 'processing' ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      step.step
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-white text-sm font-medium">{step.title}</div>
                    <div className="text-gray-400 text-xs">{step.description}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Example Prompts */}
          {!isThinking && (
            <div>
              <h3 className="text-white font-medium mb-3">Example Automations</h3>
              <div className="space-y-2">
                {[
                  "Create automatic email responder for customer inquiries",
                  "Track leads from Gmail and add to Salesforce",
                  "Notify Slack when Shopify orders are received",
                  "Generate weekly reports from Google Sheets data"
                ].map((example, index) => (
                  <button
                    key={index}
                    onClick={() => setPrompt(example)}
                    className="w-full text-left p-2 text-gray-300 hover:text-white hover:bg-gray-700 rounded text-sm transition-colors"
                    disabled={isThinking}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Workflow Canvas */}
      <div className="flex-1 relative">
        {appsScriptUnsupportedDetections.length > 0 ? (
          <div className="pointer-events-none absolute left-4 top-24 z-20 w-[min(360px,calc(100vw-2rem))]">
            <Card className="pointer-events-auto border border-amber-400/60 bg-amber-500/10 text-amber-100 shadow-xl backdrop-blur">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">
                  Apps Script can't run {appsScriptUnsupportedList.length > 1 ? 'these steps yet' : 'this step yet'}
                </CardTitle>
                <p className="text-xs text-amber-200/80">
                  {appsScriptUnsupportedList.length > 1
                    ? `Remove or replace the steps below, or switch to ${primaryFallbackRuntimeName} to run this workflow.`
                    : `Remove or replace the step below, or switch to ${primaryFallbackRuntimeName} to run this workflow.`}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {appsScriptUnsupportedList.map(({ id, detection, label, message, fallbackRuntimeName }) => (
                  <div
                    key={id}
                    className="rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-amber-100">{label}</div>
                        <p className="text-xs text-amber-200/80">
                          {message} Run it in {fallbackRuntimeName} instead.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-amber-400/70 bg-transparent text-amber-100 hover:bg-amber-400/20 hover:text-amber-50"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          handleFocusUnsupportedNode(detection);
                        }}
                      >
                        Focus
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        ) : null}
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onNodeClick={(_, node) => {
              void openNodeConfigModal(node);
            }}
            nodeTypes={nodeTypes}
            fitView
            className="bg-gray-900"
            connectionLineStyle={{ stroke: '#6366f1', strokeWidth: 2 }}
            defaultEdgeOptions={{
              style: { stroke: '#6366f1', strokeWidth: 2 },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' }
            }}
          >
            <Background color="#374151" gap={20} />
            <Controls className="bg-gray-800 border-gray-600" />
          </ReactFlow>
        </ReactFlowProvider>

        {/* Top Toolbar */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <h1 className="text-white text-xl font-bold">Workflow Builder</h1>
            <Badge className="bg-purple-600 text-white">AI-Powered</Badge>
            <Input
              value={workflowName}
              onChange={(event) => setWorkflowName(event.target.value)}
              className="h-8 w-60 bg-gray-800 border-gray-700 text-gray-100 text-sm"
              placeholder="Workflow name"
            />
          </div>
          
          <div className="flex items-center gap-3">
            {!showAIPanel && (
              <Button 
                onClick={() => setShowAIPanel(true)}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Brain className="w-4 h-4 mr-2" />
                AI Assistant
              </Button>
            )}
            
            <Button 
              onClick={clearWorkflow}
              variant="outline"
              className="border-gray-600 text-gray-300 hover:bg-gray-800"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              disabled={nodes.length === 0 || isSaving}
              onClick={saveWorkflow}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </>
              )}
            </Button>

            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Badge
                    className={clsx(
                      'px-2 py-1 text-xs uppercase tracking-wide border',
                      queueBadgeTone,
                      queueBadgePulse && 'animate-pulse'
                    )}
                  >
                    {queueBadgeLabel}
                  </Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>{queueBadgeTooltip}</p>
              </TooltipContent>
            </Tooltip>

            {runtimeControls}

            {runDisableReason ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700"
                      disabled={runDisabled}
                      onClick={runWorkflow}
                    >
                      {runButtonInner}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>{runDisableReason}</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={runDisabled}
                onClick={runWorkflow}
              >
                {runButtonInner}
              </Button>
            )}

            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={
                nodes.length === 0 ||
                isDryRunning ||
                isRunningWorkflow ||
                nodeBlockingErrors.length > 0
              }
              onClick={runDryRun}
            >
              {isDryRunning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testing…
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Dry Run
                </>
              )}
            </Button>
            {lastSavedLabel && (
              <span className="text-xs text-gray-500">
                Last saved {lastSavedLabel}
              </span>
            )}
          </div>
        </div>

        {/* Empty State */}
        {nodes.length === 0 && !isThinking && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Brain className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-white text-xl font-semibold mb-2">
                Start with AI Workflow Generation
              </h3>
              <p className="text-gray-400 mb-6 max-w-md">
                Describe your automation in plain English and watch AI build a professional workflow for you
              </p>
              {!showAIPanel && (
                <Button 
                  onClick={() => setShowAIPanel(true)}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Open AI Assistant
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Conversational AI Overlay */}
        {showConversationalAI && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="w-full max-w-4xl h-5/6 bg-gray-900 rounded-lg border border-gray-700 shadow-2xl relative">
              <ConversationalWorkflowBuilder 
                onWorkflowGenerated={(workflow) => {
                  console.log('Workflow generated from conversation:', workflow);
                  setShowConversationalAI(false);
                  // TODO: Convert conversation workflow to visual nodes
                }}
              />
              
              {/* Close Button */}
              <button
                onClick={() => setShowConversationalAI(false)}
                className="absolute top-4 right-4 w-8 h-8 bg-gray-800 hover:bg-gray-700 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition-colors z-10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Dry Run Result Panel */}
        {dryRunResult && (
          <div className="absolute bottom-6 right-6 w-[360px] z-20">
            <Card className="bg-gray-950/90 border-gray-700 text-gray-100 shadow-xl">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-semibold">
                    Dry Run {dryRunStatus ? dryRunStatus.toUpperCase() : ''}
                  </CardTitle>
                  <p className="text-xs text-gray-400">
                    {dryRunResult?.execution?.summary || dryRunResult?.message || 'Execution preview available'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-gray-400 hover:text-white"
                  onClick={() => setDryRunResult(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs uppercase tracking-wide text-gray-500">
                  Node results
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {dryRunNodeSummaries.map(({ nodeId, status, label, message }) => (
                    <div
                      key={nodeId}
                      className="rounded-md border border-gray-700 bg-gray-900/80 px-3 py-2"
                    >
                      <div className="flex items-center justify-between text-xs text-gray-300">
                        <span className="font-medium truncate" title={label}>{label}</span>
                        <span
                          className={`text-[11px] font-semibold ${
                            status === 'success'
                              ? 'text-emerald-400'
                              : status === 'error'
                              ? 'text-red-400'
                              : 'text-gray-400'
                          }`}
                        >
                          {status.toUpperCase()}
                        </span>
                      </div>
                      {message && (
                        <p className="mt-1 text-xs text-gray-400 line-clamp-2" title={message}>
                          {message}
                        </p>
                      )}
                    </div>
                  ))}
                  {dryRunNodeSummaries.length === 0 && (
                    <p className="text-xs text-gray-500">
                      No node level details available for this execution.
                    </p>
                  )}
                </div>
                {dryRunResult?.encounteredError && (
                  <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    Errors were encountered. Review node logs above.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Node configuration modal */}
      {configOpen && configNodeData && (
        <NodeConfigurationModal
          isOpen={configOpen}
          onClose={() => {
            setConfigOpen(false);
            setConfigNodeData(null);
          }}
          nodeData={configNodeData}
          onSave={handleNodeConfigSave}
          availableFunctions={configFunctions}
          connections={configConnections}
          oauthProviders={configOAuthProviders}
        />
      )}
    </div>
  );
};
