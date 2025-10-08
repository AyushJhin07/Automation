// PROFESSIONAL N8N-STYLE GRAPH EDITOR
// Beautiful visual workflow builder with smooth animations

import React, { useState, useCallback, useRef, useEffect, useMemo, useContext, createContext } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  Connection,
  NodeTypes,
  EdgeTypes,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
  Panel,
  MiniMap,
  Handle,
  Position
} from 'reactflow';
import 'reactflow/dist/style.css';

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Textarea } from '../ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import SmartParametersPanel, { syncNodeParameters } from './SmartParametersPanel';
import EditorTopBar, { type EditorTopBarAction } from './EditorTopBar';
import { buildMetadataFromNode } from './metadata';
import { normalizeWorkflowNode } from './graphSync';
import { applyExecutionStateDefaults, sanitizeExecutionState, serializeGraphPayload } from './graphPayload';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../ui/accordion';
import { AIParameterEditor } from './AIParameterEditor';
import { useSpecStore } from '../../state/specStore';
import { specToReactFlow } from '../../graph/transform';
import type { WorkflowDiffSummary } from '../../../../common/workflow-types';
import {
  Plus,
  Save,
  Upload,
  Settings,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  Zap,
  Clock,
  Mail,
  Sheet,
  Calendar,
  Database,
  Globe,
  Filter,
  Code,
  MessageSquare,
  Sparkles,
  ChevronDown,
  Search,
  X,
  Users,
  Shield,
  DollarSign,
  BarChart,
  FileText,
  Box,
  AlertTriangle,
  Activity,
  AppWindow,
  Video,
  Phone,
  CreditCard,
  ShoppingCart,
  Folder,
  BookOpen,
  MapPin,
  Calculator,
  CheckCircle2,
  Link,
  Download
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NodeGraph, GraphNode, VisualNode } from '../../../shared/nodeGraphSchema';
import type { ValidationError } from '../../../shared/nodeGraphSchema';
import clsx from 'clsx';
import debounce from 'lodash/debounce';
import type { DebouncedFunc } from 'lodash';
import { toast } from 'sonner';
import { NodeConfigurationModal } from './NodeConfigurationModal';
import { useAuthStore } from '@/store/authStore';
import { useConnectorDefinitions } from '@/hooks/useConnectorDefinitions';
import type { ConnectorDefinitionMap } from '@/services/connectorDefinitionsService';
import { normalizeConnectorId } from '@/services/connectorDefinitionsService';
import { useQueueHealth } from '@/hooks/useQueueHealth';
import { useWorkerHeartbeat, WORKER_FLEET_GUIDANCE } from '@/hooks/useWorkerHeartbeat';
import { collectNodeConfigurationErrors } from './nodeConfigurationValidation';
import './editor-topbar.css';

// Enhanced Node Template Interface
interface NodeTemplate {
  id: string;
  type: 'trigger' | 'action' | 'transform';
  category: string;
  label: string;
  description: string;
  icon: any;
  app: string;
  color?: string;
  data: any;
}

// Icon mapping for different applications (deduplicated)
const appIconsMap: Record<string, LucideIcon> = {
  default: Zap,
  core: AppWindow,
  built_in: AppWindow,
  'built-in': AppWindow,
  time: Clock,
  'time-trigger': Clock,
  http: Globe,
  'http-request': Globe,
  webhook: Link,
};

type ExecutionStatus = 'idle' | 'running' | 'success' | 'error';

const STATUS_LABELS: Record<ExecutionStatus, string> = {
  idle: 'Idle',
  running: 'Running',
  success: 'Completed',
  error: 'Failed'
};

const STATUS_RING: Record<ExecutionStatus, string> = {
  idle: '',
  running: 'ring-2 ring-amber-300/60 shadow-lg shadow-amber-200/40',
  success: 'ring-2 ring-emerald-300/60 shadow-lg shadow-emerald-200/30',
  error: 'ring-2 ring-red-400/60 shadow-lg shadow-red-200/40'
};

const STATUS_INDICATOR: Record<ExecutionStatus, string> = {
  idle: 'bg-white/60',
  running: 'bg-amber-300 animate-pulse shadow-[0_0_10px_rgba(251,191,36,0.7)]',
  success: 'bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.7)]',
  error: 'bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.7)]'
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_REGEX.test(value);

type WorkflowValidationState = {
  status: 'idle' | 'validating' | 'valid' | 'invalid';
  errors: ValidationError[];
  blockingErrors: ValidationError[];
  message?: string;
  error?: string;
};


const normalizedIconMap: Record<string, LucideIcon> = {};
Object.entries(appIconsMap).forEach(([key, Icon]) => {
  const normalizedKey = normalizeConnectorId(key);
  if (!normalizedIconMap[normalizedKey]) {
    normalizedIconMap[normalizedKey] = Icon;
  }
});

const lucideIconCache: Record<string, LucideIcon | null> = {};

const buildIconNameCandidates = (value: string): string[] => {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const lower = trimmed.toLowerCase();
  const parts = lower.split(/[-_\s]+/);
  const pascal = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
  const title = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  const condensed = parts.join('');
  const candidates = new Set<string>();

  [pascal, title, trimmed, lower, condensed, pascal.toUpperCase()].forEach((candidate) => {
    if (candidate) {
      candidates.add(candidate);
    }
  });

  return Array.from(candidates);
};

const getLucideIconByName = (iconName: string): LucideIcon | undefined => {
  const cacheKey = iconName.toLowerCase();
  if (cacheKey in lucideIconCache) {
    const cached = lucideIconCache[cacheKey];
    return cached ?? undefined;
  }

  const iconsRecord = LucideIcons as Record<string, LucideIcon>;
  for (const candidate of buildIconNameCandidates(iconName)) {
    const icon = iconsRecord[candidate];
    if (icon) {
      lucideIconCache[cacheKey] = icon;
      return icon;
    }
  }

  lucideIconCache[cacheKey] = null;
  return undefined;
};

const resolveConnectorIcon = (appId: string, iconName?: string): LucideIcon => {
  if (iconName) {
    const dynamicIcon = getLucideIconByName(iconName);
    if (dynamicIcon) {
      return dynamicIcon;
    }
    const normalizedIcon = normalizeConnectorId(iconName);
    if (normalizedIcon && normalizedIconMap[normalizedIcon]) {
      return normalizedIconMap[normalizedIcon];
    }
  }

  const normalizedAppId = normalizeConnectorId(appId);
  return normalizedIconMap[normalizedAppId] ?? normalizedIconMap['default'];
};

// Get app color based on category
const getAppColor = (category: string) => {
  const colorMap: Record<string, string> = {
    'Google Workspace': '#4285F4',
    'Communication': '#7B68EE',
    'CRM': '#FF6347',
    'E-commerce': '#32CD32',
    'Identity Management': '#4169E1',
    'HR Management': '#FF8C00',
    'ITSM': '#DC143C',
    'Data Analytics': '#9932CC',
    'Collaboration': '#20B2AA',
    'Project Management': '#1E90FF',
    'Accounting': '#228B22',
    'Recruitment': '#FF69B4'
  };

  return colorMap[category] || '#6366F1';
};

const isErrorSeverity = (severity?: string): boolean => {
  if (!severity) return true;
  const normalized = severity.toLowerCase();
  return normalized === 'error';
};

const ValidationFixContext = createContext<((nodeId: string) => void) | null>(null);

const shouldIgnoreShortcutTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable || target.closest('[contenteditable="true"]')) {
    return true;
  }

  const tagName = target.tagName?.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true;
  }

  const role = target.getAttribute('role');
  if (role === 'textbox' || role === 'combobox') {
    return true;
  }

  if (target.closest('input, textarea, select, [role="textbox"], [role="combobox"]')) {
    return true;
  }

  return false;
};

export interface EditorKeyboardShortcutOptions {
  onRun?: () => void;
  canRun?: boolean;
  runDisabled?: boolean;
  onValidate?: () => void;
  canValidate?: boolean;
  validateDisabled?: boolean;
}

export const useEditorKeyboardShortcuts = ({
  onRun,
  canRun,
  runDisabled,
  onValidate,
  canValidate,
  validateDisabled,
}: EditorKeyboardShortcutOptions) => {
  const runEnabled = Boolean(onRun) && !(runDisabled ?? false) && (typeof canRun === 'boolean' ? canRun : true);
  const validateEnabled =
    Boolean(onValidate) && !(validateDisabled ?? false) && (typeof canValidate === 'boolean' ? canValidate : true);

  useEffect(() => {
    if (!runEnabled && !validateEnabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Enter' || event.repeat) {
        return;
      }

      if (shouldIgnoreShortcutTarget(event.target)) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && runEnabled) {
        event.preventDefault();
        onRun?.();
        return;
      }

      if (event.shiftKey && !event.metaKey && !event.ctrlKey && validateEnabled) {
        event.preventDefault();
        onValidate?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [runEnabled, validateEnabled, onRun, onValidate]);
};

interface NodeValidationBannerProps {
  errors?: ValidationError[];
  nodeId?: string;
  nodeLabel?: string;
  onFix?: (nodeId: string) => void;
}

const NodeValidationBanner: React.FC<NodeValidationBannerProps> = ({ errors, nodeId, nodeLabel, onFix }) => {
  const issues = Array.isArray(errors)
    ? errors.filter((issue) => isErrorSeverity((issue as any)?.severity))
    : [];

  if (issues.length === 0) {
    return null;
  }

  const [firstIssue, ...rest] = issues;
  const additionalCount = rest.length;
  const resolvedFirstNodeId = firstIssue ? getNodeIdFromValidationError(firstIssue) : null;
  const targetNodeId = resolvedFirstNodeId ?? nodeId ?? null;
  const handleFixClick = () => {
    if (targetNodeId && onFix) {
      onFix(targetNodeId);
    }
  };
  const showFixButton = Boolean(onFix && targetNodeId);
  const fixLabel = additionalCount > 0 && nodeLabel ? `Fix ${nodeLabel}` : 'Fix';
  const additionalLabel = additionalCount === 1 ? 'issue' : 'issues';
  const additionalButtonText = nodeLabel
    ? `+${additionalCount} more ${additionalLabel} for ${nodeLabel}`
    : `+${additionalCount} more ${additionalLabel}`;

  return (
    <div className="mb-3 rounded-lg border border-red-500/80 bg-red-500/90 px-3 py-2 text-white shadow-md">
      <div className="flex items-center justify-between gap-2 text-xs font-semibold">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Needs attention</span>
        </div>
        {showFixButton && (
          <button
            type="button"
            onClick={handleFixClick}
            className="rounded-md border border-white/50 bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white transition hover:bg-white/20"
          >
            {fixLabel}
          </button>
        )}
      </div>
      {firstIssue?.message && (
        <p className="mt-1 text-[11px] leading-snug text-red-50/95">{firstIssue.message}</p>
      )}
      {additionalCount > 0 && (
        <TooltipProvider delayDuration={100}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="mt-2 text-[11px] font-medium text-red-50/90 underline decoration-dotted underline-offset-2 transition-colors hover:text-white"
              >
                {additionalButtonText}
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <ul className="space-y-1 text-xs text-slate-100">
                {rest.map((issue, index) => (
                  <li key={`${issue.path ?? 'issue'}-${index}`}>
                    {nodeLabel ? `${nodeLabel}: ${issue.message}` : issue.message}
                  </li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
};

const parseNodeIdFromPath = (path?: string | null): string | null => {
  if (!path || typeof path !== 'string') {
    return null;
  }

  const normalized = path.replace(/^[#/]+/, '').replace(/[\[\]]/g, '.');
  const tokens = normalized.split(/[./]/).filter(Boolean);

  const nodesIndex = tokens.indexOf('nodes');
  if (nodesIndex !== -1 && tokens[nodesIndex + 1]) {
    return tokens[nodesIndex + 1];
  }

  const fallback = tokens.find((token) => token.startsWith('node-') || token.startsWith('trigger') || token.startsWith('action'));
  return fallback ?? null;
};

const getNodeIdFromValidationError = (error: ValidationError): string | null => {
  if (error?.nodeId) {
    return String(error.nodeId);
  }
  return parseNodeIdFromPath(error?.path);
};

type WorkflowValidationResult = {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  message?: string;
};

export const TriggerNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const fixValidation = useContext(ValidationFixContext);
  const status = (data?.executionStatus ?? 'idle') as ExecutionStatus;
  const statusLabel = STATUS_LABELS[status];
  const ringClass = STATUS_RING[status];
  const indicatorClass = STATUS_INDICATOR[status];
  const validationErrors = Array.isArray(data?.validationErrors)
    ? (data.validationErrors as ValidationError[])
    : [];
  const hasValidationErrors = validationErrors.length > 0;

  return (
    <div
      className={clsx(
        'relative bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg border-2 transition-all duration-300 ease-out',
        selected ? 'border-white shadow-xl scale-105' : 'border-green-400/30',
        'hover:shadow-2xl hover:scale-102 min-w-[200px] max-w-[280px]',
        ringClass,
        hasValidationErrors && 'border-red-500/60 shadow-red-500/30'
      )}
    >
      {/* Animated pulse effect */}
      <div className="absolute -inset-1 bg-gradient-to-r from-green-400 to-emerald-500 rounded-xl opacity-30 blur animate-pulse"></div>

      <div className="relative bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-white/20 rounded-lg">
              <Clock className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-semibold text-sm">TRIGGER</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-white hover:bg-white/20 p-1 h-6 w-6"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        {/* Content */}
        <div className="text-white">
          <NodeValidationBanner
            errors={validationErrors}
            nodeLabel={data.label}
            onFix={fixValidation ?? undefined}
          />
          <h3 className="font-bold text-base mb-1">{data.label}</h3>
          <p className="text-green-100 text-xs mb-2 opacity-90">{data.description}</p>

          {/* Status indicator */}
          <div className="flex items-center gap-2 text-xs">
            <div className={clsx('w-2.5 h-2.5 rounded-full', indicatorClass)}></div>
            <span className="text-white font-medium">{statusLabel}</span>
          </div>

          {status === 'error' && data.executionError?.message && (
            <p className="mt-2 text-xs text-red-100 bg-black/20 border border-white/10 rounded-lg px-2 py-1">
              {data.executionError.message}
            </p>
          )}

          {status === 'success' && data.lastExecution?.summary && (
            <p className="mt-2 text-xs text-emerald-100 bg-black/10 border border-white/10 rounded-lg px-2 py-1">
              {data.lastExecution.summary}
            </p>
          )}
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-white/20 animate-in slide-in-from-top-2 duration-200">
            <div className="space-y-2 text-xs text-green-100">
              {Object.entries(data.params ?? data.parameters ?? {}).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="opacity-75">{key}:</span>
                  <span className="font-medium">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ReactFlow Handles */}
        <Handle
          type="source"
          position={Position.Right}
          className="w-3 h-3 bg-white border-2 border-green-500"
        />
      </div>
    </div>
  );
};

export const ActionNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const fixValidation = useContext(ValidationFixContext);
  const status = (data?.executionStatus ?? 'idle') as ExecutionStatus;
  const ringClass = STATUS_RING[status];
  const indicatorClass = STATUS_INDICATOR[status];
  const statusLabel = STATUS_LABELS[status];
  const validationErrors = Array.isArray(data?.validationErrors)
    ? (data.validationErrors as ValidationError[])
    : [];
  const hasValidationErrors = validationErrors.length > 0;

  const getIcon = () => {
    if (data.app === 'Gmail') return <Mail className="w-4 h-4 text-white" />;
    if (data.app === 'Google Sheets') return <Sheet className="w-4 h-4 text-white" />;
    if (data.app === 'Google Calendar') return <Calendar className="w-4 h-4 text-white" />;
    return <Zap className="w-4 h-4 text-white" />;
  };

  return (
    <div
      className={clsx(
        'relative bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg border-2 transition-all duration-300 ease-out',
        selected ? 'border-white shadow-xl scale-105' : 'border-blue-400/30',
        'hover:shadow-2xl hover:scale-102 min-w-[200px] max-w-[280px]',
        ringClass,
        hasValidationErrors && 'border-red-500/60 shadow-red-500/30'
      )}
    >
      {/* Animated glow effect */}
      <div className="absolute -inset-1 bg-gradient-to-r from-blue-400 to-indigo-500 rounded-xl opacity-30 blur animate-pulse"></div>

      <div className="relative bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-white/20 rounded-lg">
              {getIcon()}
            </div>
            <span className="text-white font-semibold text-sm">ACTION</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-white hover:bg-white/20 p-1 h-6 w-6"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        {/* Content */}
        <div className="text-white">
          <NodeValidationBanner
            errors={validationErrors}
            nodeLabel={data.label}
            onFix={fixValidation ?? undefined}
          />
          <h3 className="font-bold text-base mb-1">{data.label}</h3>
          <p className="text-blue-100 text-xs mb-2 opacity-90">{data.description}</p>

          {/* App badge */}
          <Badge className="bg-white/20 text-white border-white/30 text-xs">
            {data.app || 'Generic'}
          </Badge>

          <div className="mt-2 flex items-center gap-2 text-xs">
            <div className={clsx('w-2.5 h-2.5 rounded-full', indicatorClass)}></div>
            <span className="text-white font-medium">{statusLabel}</span>
          </div>

          {status === 'error' && data.executionError?.message && (
            <p className="mt-2 text-xs text-red-100 bg-black/20 border border-white/10 rounded-lg px-2 py-1">
              {data.executionError.message}
            </p>
          )}

          {status === 'success' && data.lastExecution?.summary && (
            <p className="mt-2 text-xs text-emerald-100 bg-black/10 border border-white/10 rounded-lg px-2 py-1">
              {data.lastExecution.summary}
            </p>
          )}
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-white/20 animate-in slide-in-from-top-2 duration-200">
            <div className="space-y-2 text-xs text-blue-100">
              {Object.entries(data.params ?? data.parameters ?? {}).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="opacity-75">{key}:</span>
                  <span className="font-medium">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ReactFlow Handles */}
        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 bg-white border-2 border-blue-500"
        />
        <Handle
          type="source"
          position={Position.Right}
          className="w-3 h-3 bg-white border-2 border-blue-500"
        />
      </div>
    </div>
  );
};

export const TransformNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const fixValidation = useContext(ValidationFixContext);
  const status = (data?.executionStatus ?? 'idle') as ExecutionStatus;
  const ringClass = STATUS_RING[status];
  const indicatorClass = STATUS_INDICATOR[status];
  const statusLabel = STATUS_LABELS[status];
  const validationErrors = Array.isArray(data?.validationErrors)
    ? (data.validationErrors as ValidationError[])
    : [];
  const hasValidationErrors = validationErrors.length > 0;

  return (
    <div
      className={clsx(
        'relative bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl shadow-lg border-2 transition-all duration-300 ease-out',
        selected ? 'border-white shadow-xl scale-105' : 'border-purple-400/30',
        'hover:shadow-2xl hover:scale-102 min-w-[200px] max-w-[280px]',
        ringClass,
        hasValidationErrors && 'border-red-500/60 shadow-red-500/30'
      )}
    >
      {/* Animated shimmer effect */}
      <div className="absolute -inset-1 bg-gradient-to-r from-purple-400 to-violet-500 rounded-xl opacity-30 blur animate-pulse"></div>

      <div className="relative bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-white/20 rounded-lg">
              <Filter className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-semibold text-sm">TRANSFORM</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-white hover:bg-white/20 p-1 h-6 w-6"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        {/* Content */}
        <div className="text-white">
          <NodeValidationBanner
            errors={validationErrors}
            nodeLabel={data.label}
            onFix={fixValidation ?? undefined}
          />
          <h3 className="font-bold text-base mb-1">{data.label}</h3>
          <p className="text-purple-100 text-xs mb-2 opacity-90">{data.description}</p>

          <div className="flex items-center gap-2 text-xs">
            <div className={clsx('w-2.5 h-2.5 rounded-full', indicatorClass)}></div>
            <span className="text-white font-medium">{statusLabel}</span>
          </div>

          {status === 'error' && data.executionError?.message && (
            <p className="mt-2 text-xs text-red-100 bg-black/20 border border-white/10 rounded-lg px-2 py-1">
              {data.executionError.message}
            </p>
          )}

          {status === 'success' && data.lastExecution?.summary && (
            <p className="mt-2 text-xs text-emerald-100 bg-black/10 border border-white/10 rounded-lg px-2 py-1">
              {data.lastExecution.summary}
            </p>
          )}
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-white/20 animate-in slide-in-from-top-2 duration-200">
            <div className="space-y-2 text-xs text-purple-100">
              {Object.entries(data.params ?? data.parameters ?? {}).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="opacity-75">{key}:</span>
                  <span className="font-medium">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ReactFlow Handles */}
        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 bg-white border-2 border-purple-500"
        />
        <Handle
          type="source"
          position={Position.Right}
          className="w-3 h-3 bg-white border-2 border-purple-500"
        />
      </div>
    </div>
  );
};

const ConditionNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const status = (data?.executionStatus ?? 'idle') as ExecutionStatus;
  const ringClass = STATUS_RING[status];
  const indicatorClass = STATUS_INDICATOR[status];
  const statusLabel = STATUS_LABELS[status];
  const availableBranches = useMemo(() => {
    if (Array.isArray(data?.availableBranches)) {
      return data.availableBranches as Array<{ label?: string; value?: string }>;
    }
    if (Array.isArray(data?.branches)) {
      return data.branches as Array<{ label?: string; value?: string }>;
    }
    if (Array.isArray(data?.config?.branches)) {
      return data.config.branches as Array<{ label?: string; value?: string }>;
    }
    return [];
  }, [data]);

  const getBranchLabel = (value: string | undefined, fallback: string) => {
    if (!value) return fallback;
    const normalized = value.toLowerCase();
    if (normalized === 'true') return 'True';
    if (normalized === 'false') return 'False';
    return value;
  };

  return (
    <div
      className={clsx(
        'relative bg-gradient-to-br from-amber-500 to-rose-500 rounded-xl shadow-lg border-2 transition-all duration-300 ease-out',
        selected ? 'border-white shadow-xl scale-105' : 'border-amber-400/30',
        'hover:shadow-2xl hover:scale-102 min-w-[220px] max-w-[300px]',
        ringClass
      )}
    >
      <div className="absolute -inset-1 bg-gradient-to-r from-amber-400 to-rose-400 rounded-xl opacity-30 blur animate-pulse"></div>

      <div className="relative bg-gradient-to-br from-amber-500 to-rose-500 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-white/20 rounded-lg">
              <Filter className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-semibold text-sm">CONDITION</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-white hover:bg-white/20 p-1 h-6 w-6"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </Button>
        </div>

        <div className="text-white">
          <h3 className="font-bold text-base mb-1">{data.label || 'Condition'}</h3>
          <p className="text-amber-100 text-xs mb-2 opacity-90">{data.description || 'Branch your workflow based on rules'}</p>

          <div className="mt-2 flex items-center gap-2 text-xs">
            <div className={clsx('w-2.5 h-2.5 rounded-full', indicatorClass)}></div>
            <span className="text-white font-medium">{statusLabel}</span>
          </div>

          {Array.isArray(data?.lastExecution?.evaluations) && data.lastExecution.evaluations.length > 0 && (
            <div className="mt-2 bg-black/20 rounded-lg px-2 py-1 text-[11px] text-white/80">
              <p className="font-semibold">Last evaluation</p>
              <p className="truncate text-white/70">{String(data.lastExecution.evaluations[0]?.expression ?? '')}</p>
            </div>
          )}
        </div>

        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-white/20 animate-in slide-in-from-top-2 duration-200">
            <div className="space-y-2 text-xs text-white/90">
              {availableBranches.map((branch, index) => (
                <div key={index} className="flex items-center justify-between gap-2">
                  <span className="opacity-80">{branch.label || getBranchLabel(branch.value, index === 0 ? 'True path' : 'False path')}</span>
                  <Badge className="bg-white/20 text-white border-white/30 text-[10px]">
                    {getBranchLabel(branch.value, index === 0 ? 'True' : 'False')}
                  </Badge>
                </div>
              ))}
              {availableBranches.length === 0 && (
                <p className="text-white/70">Connect branches to downstream steps</p>
              )}
            </div>
          </div>
        )}

        <Handle
          type="target"
          id="input"
          position={Position.Left}
          className="w-3 h-3 bg-white border-2 border-amber-500"
        />
        <Handle
          type="source"
          id="true"
          position={Position.Right}
          className="w-3 h-3 bg-white border-2 border-emerald-500"
          style={{ top: '35%' }}
        />
        <Handle
          type="source"
          id="false"
          position={Position.Right}
          className="w-3 h-3 bg-white border-2 border-rose-500"
          style={{ top: '65%' }}
        />

        <div className="absolute right-3 top-[32%] text-[10px] text-white/80 uppercase tracking-wide">True</div>
        <div className="absolute right-3 top-[62%] text-[10px] text-white/80 uppercase tracking-wide">False</div>
      </div>
    </div>
  );
};

// Custom Edge Component
const AnimatedEdge = ({ 
  id, 
  sourceX, 
  sourceY, 
  targetX, 
  targetY, 
  sourcePosition, 
  targetPosition,
  style = {},
  markerEnd 
}: any) => {
  const edgePath = `M${sourceX},${sourceY} C${sourceX + 50},${sourceY} ${targetX - 50},${targetY} ${targetX},${targetY}`;
  
  return (
    <g>
      {/* Glow effect */}
      <path
        id={`${id}-glow`}
        style={{ ...style, stroke: '#60a5fa', strokeWidth: 6, opacity: 0.3 }}
        className="react-flow__edge-path animate-pulse"
        d={edgePath}
        markerEnd={markerEnd}
      />
      {/* Main edge */}
      <path
        id={id}
        style={{ ...style, stroke: '#3b82f6', strokeWidth: 2 }}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
      />
      {/* Animated flow dots */}
      <circle r="3" fill="#60a5fa" className="opacity-80">
        <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
      </circle>
    </g>
  );
};

// Node Types
const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  transform: TransformNode,
  condition: ConditionNode,
};

// Edge Types
const edgeTypes: EdgeTypes = {
  animated: AnimatedEdge,
};

// --- Helpers: brand icon with gradient/3D & hover pop ---
const GRADIENT_CLASSES = [
  "from-sky-500 to-blue-600",
  "from-emerald-500 to-green-600", 
  "from-fuchsia-500 to-violet-600",
  "from-rose-500 to-red-600",
  "from-amber-500 to-orange-600",
  "from-cyan-500 to-teal-600",
  "from-indigo-500 to-purple-600",
];

function getGradientForApp(appId: string) {
  // deterministic pick without generating dynamic class names (safe for Tailwind)
  let sum = 0;
  for (const ch of appId) sum = (sum + ch.charCodeAt(0)) % GRADIENT_CLASSES.length;
  return GRADIENT_CLASSES[sum];
}

/**
 * 3D Gradient Glass Brand Icon Component
 * Real brand icons with 3D glass effect, gradient background, and hover zoom animation
 */
const BrandIcon: React.FC<{ appId: string; appName: string; iconName?: string }> = ({ appId, appName, iconName }) => {
  const Icon = resolveConnectorIcon(appId, iconName);

  return (
    <div className="group relative" data-testid={`app-icon-${appId}`}>
      <div
        className={clsx(
          "w-10 h-10 rounded-2xl bg-gradient-to-br from-slate-100/20 to-slate-300/20 backdrop-blur",
          "shadow-[inset_0_1px_2px_rgba(255,255,255,0.5),0_8px_16px_rgba(0,0,0,0.25)]",
          "ring-1 ring-white/20",
          "flex items-center justify-center",
          "transition-transform duration-200 transform group-hover:scale-110"
        )}
      >
        {/* Try brand SVG first */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/icons/${appId}.svg`}
          alt={`${appName} icon`}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          className="w-6 h-6 object-contain drop-shadow"
        />
        {/* Fallback to lucide icon */}
        {Icon && <Icon className="absolute w-5 h-5 text-white/90" data-testid={`app-icon-lucide-${appId}`} />}
      </div>
    </div>
  );
};

// Sidebar Component (REPLACEMENT)
interface NodeSidebarProps {
  onAddNode: (nodeType: string, nodeData: any) => void;
  catalog: any | null;
  loading?: boolean;
  connectorDefinitions?: ConnectorDefinitionMap | null;
}

export const NodeSidebar = ({ onAddNode, catalog, loading: catalogLoading, connectorDefinitions }: NodeSidebarProps) => {
  // Search & filters
  const [searchTerm, setSearchTerm] = useState(() => {
    return localStorage.getItem('sidebar_search') || "";
  });
  const [selectedCategory, setSelectedCategory] = useState(() => localStorage.getItem('sidebar_category') || 'all');

  // Data built from registry
  type NodeTpl = {
    id: string;                            // e.g. action.gmail.sendEmail
    kind: "action" | "trigger" | "transform";
    name: string;
    description?: string;
    nodeType: string;                      // "action.gmail.sendEmail"
    params?: any;
  };

  type AppGroup = {
    appId: string;                         // "gmail"
    appName: string;                       // "Gmail"
    category: string;                      // "Email"
    iconName?: string;
    actions: NodeTpl[];
    triggers: NodeTpl[];
    color?: string;
    release?: {
      semver?: string;
      status?: string;
      isBeta?: boolean;
      deprecationWindow?: { startDate?: string | null; sunsetDate?: string | null };
    };
    lifecycle?: {
      alpha?: boolean;
      beta?: boolean;
      stable?: boolean;
    };
  };

  const [apps, setApps] = useState<Record<string, AppGroup>>({});
  const [categories, setCategories] = useState<string[]>([]);
  const isLoading = Boolean(catalogLoading);

  // Persist user preferences
  useEffect(() => {
    localStorage.setItem('sidebar_search', searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    localStorage.setItem('sidebar_category', selectedCategory);
  }, [selectedCategory]);

  useEffect(() => {
    const nextApps: Record<string, AppGroup> = {};
    const catSet = new Set<string>();
    const definitions = connectorDefinitions ?? null;

    const resolveDefinition = (appId: string) => {
      if (!definitions) return null;
      const normalizedId = normalizeConnectorId(appId);
      return definitions[normalizedId] ?? null;
    };

    const builtInId = 'built_in';
    nextApps[builtInId] = {
      appId: builtInId,
      appName: 'Built-in Tools',
      category: 'Built-in',
      iconName: builtInId,
      actions: [
        {
          id: 'action-http-request',
          kind: 'action',
          name: 'HTTP Request',
          description: 'Call external API',
          nodeType: 'action.http.request',
          params: { method: 'GET', url: '', headers: {} },
        },
        {
          id: 'transform-format-text',
          kind: 'transform',
          name: 'Format Text',
          description: 'Template interpolation',
          nodeType: 'transform.format.text',
        },
        {
          id: 'transform-filter-data',
          kind: 'transform',
          name: 'Filter Data',
          description: 'Filter items by condition',
          nodeType: 'transform.filter.data',
        },
      ],
      triggers: [
        {
          id: 'trigger-every-15-min',
          kind: 'trigger',
          name: 'Every 15 Minutes',
          description: 'Run every 15 minutes',
          nodeType: 'trigger.time.every15',
          params: { everyMinutes: 15 },
        },
        {
          id: 'trigger-every-hour',
          kind: 'trigger',
          name: 'Every Hour',
          description: 'Run every hour',
          nodeType: 'trigger.time.hourly',
          params: { everyMinutes: 60 },
        },
        {
          id: 'trigger-daily-9am',
          kind: 'trigger',
          name: 'Daily at 9 AM',
          description: 'Run daily at 9 AM',
          nodeType: 'trigger.time.daily9',
          params: { atHour: 9 },
        },
      ],
    };
    catSet.add('Built-in');

    if (catalog?.connectors) {
      for (const [appId, def] of Object.entries<any>(catalog.connectors)) {
        if (!def?.hasImplementation) {
          continue;
        }
        const definition = resolveDefinition(appId);
        const appName = definition?.name || def.name || appId;
        const primaryCategory =
          (definition?.categories && definition.categories[0]) ||
          definition?.category ||
          def.category ||
          'Business Apps';
        if (primaryCategory) {
          catSet.add(primaryCategory);
        }
        if (Array.isArray(definition?.categories)) {
          definition.categories
            .filter((cat): cat is string => typeof cat === 'string' && cat.trim().length > 0)
            .forEach((cat) => catSet.add(cat));
        }

        const iconName = definition?.icon || def.icon || appId;

        const actions: NodeTpl[] = (def.actions || []).map((a: any) => ({
          id: `action-${appId}-${a.id}`,
          kind: 'action',
          name: a.name,
          description: a.description || '',
          nodeType: `action.${appId}.${a.id}`,
          params: a.parameters || {},
        }));

        const triggers: NodeTpl[] = (def.triggers || []).map((t: any) => ({
          id: `trigger-${appId}-${t.id}`,
          kind: 'trigger',
          name: t.name,
          description: t.description || '',
          nodeType: `trigger.${appId}.${t.id}`,
          params: t.parameters || {},
        }));

        nextApps[appId] = {
          appId,
          appName,
          category: primaryCategory,
          iconName,
          actions,
          triggers,
          release: definition?.release ?? def.release,
          lifecycle: definition?.lifecycle ?? def.lifecycle,
          color: definition?.color ?? def.color,
        };
      }
    }

    setApps(nextApps);
    setCategories(['all', ...Array.from(catSet).sort()]);
  }, [catalog, connectorDefinitions]);

  // -------- Filtering logic --------
  const search = searchTerm.trim().toLowerCase();
  const showCategoriesBar = !search;  // hide categories when searching

  const filteredAppList = Object.values(apps)
    .filter(app => selectedCategory === "all" || app.category === selectedCategory)
    .map(app => {
      if (!search) return app;
      const nodes = [...app.triggers, ...app.actions];
      const matched = nodes.filter(n =>
        n.name.toLowerCase().includes(search) ||
        n.description?.toLowerCase().includes(search) ||
        app.appName.toLowerCase().includes(search)
      );
      // If any node matches search, keep app but only with the matched nodes
      return matched.length
        ? {
            ...app,
            triggers: matched.filter(n => n.kind === "trigger"),
            actions: matched.filter(n => n.kind === "action" || n.kind === "transform"),
          }
        : null;
    })
    .filter(Boolean) as AppGroup[];

  // Count nodes for the small counter
  const totalNodes = Object.values(apps).reduce(
    (acc, a) => acc + a.triggers.length + a.actions.length, 0
  );
  const filteredNodes = filteredAppList.reduce(
    (acc, a) => acc + a.triggers.length + a.actions.length, 0
  );

  // -------- Render --------
  return (
    <TooltipProvider delayDuration={100}>
      <div className="w-80 bg-white border-r border-gray-100 h-full flex flex-col">
      {/* Sticky top: title + search + category chips */}
      <div className="p-4 sticky top-0 bg-white z-10 border-b border-gray-100">
        <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-blue-100 text-blue-600">+</span>
          Add Nodes
        </h2>

        {/* Search */}
        <div className="relative">
          <Input
            placeholder="Search apps or nodes…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-3 bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-500"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Clear"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category chips (single row, scrollable). Hidden while searching */}
        {showCategoriesBar && (
          <div className="mt-3 flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {categories.map((cat) => (
              <Button
                key={cat}
                size="sm"
                variant={selectedCategory === cat ? "default" : "outline"}
                onClick={() => setSelectedCategory(cat)}
                className={clsx(
                  "shrink-0 text-xs whitespace-nowrap",
                  selectedCategory === cat
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200"
                )}
              >
                {cat === "all" ? "All" : cat}
              </Button>
            ))}
          </div>
        )}

        {/* Small count */}
        {!isLoading && (
          <div className="text-xs text-gray-500 mt-2">
            {filteredNodes} of {totalNodes} nodes
            {search && <span className="ml-1">• Searching</span>}
          </div>
        )}
      </div>

      {/* Apps list */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="text-gray-500 text-sm py-10 text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            Loading applications…
          </div>
        ) : filteredAppList.length === 0 ? (
          <div className="text-gray-500 text-sm py-10 text-center">
            <div className="text-gray-600 mb-2">No results found</div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSearchTerm("");
                setSelectedCategory("all");
              }}
              className="bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200"
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <Accordion type="single" collapsible className="space-y-2">
            {filteredAppList.map((app) => (
              <AccordionItem
                key={app.appId}
                value={app.appId}
                className="border border-gray-200 rounded-xl bg-white shadow-sm"
                data-testid={`app-card-${app.appId}`}
              >
                <AccordionTrigger className="px-3 py-2 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <BrandIcon appId={app.appId} appName={app.appName} iconName={app.iconName} />
                    <div className="flex flex-col text-left">
                      <span className="text-gray-900 font-medium">{app.appName}</span>
                      <span className="text-xs text-gray-500">{app.category}</span>
                      {(() => {
                        const lifecycle = app.lifecycle;
                        const releaseStatus = app.release?.status;
                        const lifecycleBadges = Array.isArray(lifecycle?.badges)
                          ? lifecycle.badges
                          : [];

                        const badgeContent = (() => {
                          if (releaseStatus === 'deprecated' || releaseStatus === 'sunset') {
                            const label = releaseStatus === 'sunset' ? 'Sunset' : 'Deprecated';
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge
                                    data-testid={`lifecycle-badge-${app.appId}`}
                                    className="text-[10px]"
                                    variant="destructive"
                                  >
                                    {label}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[220px] text-xs leading-relaxed">
                                  {label === 'Sunset'
                                    ? 'This connector is being sunset and will be removed soon.'
                                    : 'This connector is deprecated and may be removed in the future.'}
                                </TooltipContent>
                              </Tooltip>
                            );
                          }

                          if (lifecycleBadges.length > 0) {
                            const primary = lifecycleBadges[0];
                            const tone = primary?.tone ?? 'neutral';
                            const variant = tone === 'critical' ? 'destructive' : tone === 'warning' ? 'outline' : 'secondary';
                            const tooltip = (() => {
                              switch (primary?.id) {
                                case 'alpha':
                                  return 'Alpha connectors are experimental previews and may change without notice.';
                                case 'beta':
                                  return 'Beta connectors are near launch but may still receive minor updates or fixes.';
                                case 'deprecated':
                                  return 'This connector is deprecated and may be removed in the future.';
                                case 'sunset':
                                  return 'This connector is being sunset and will be removed soon.';
                                default:
                                  return undefined;
                              }
                            })();

                            const badgeNode = (
                              <Badge
                                data-testid={`lifecycle-badge-${app.appId}`}
                                className="text-[10px]"
                                variant={variant}
                              >
                                {primary?.label ?? primary?.id ?? 'Status'}
                              </Badge>
                            );

                            if (!tooltip) {
                              return badgeNode;
                            }

                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>{badgeNode}</TooltipTrigger>
                                <TooltipContent className="max-w-[220px] text-xs leading-relaxed">
                                  {tooltip}
                                </TooltipContent>
                              </Tooltip>
                            );
                          }

                          if (lifecycle?.alpha) {
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge
                                    data-testid={`lifecycle-badge-${app.appId}`}
                                    className="text-[10px]"
                                    variant="destructive"
                                  >
                                    Alpha
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[220px] text-xs leading-relaxed">
                                  Alpha connectors are experimental previews and may change without notice.
                                </TooltipContent>
                              </Tooltip>
                            );
                          }

                          if (lifecycle?.beta) {
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge
                                    data-testid={`lifecycle-badge-${app.appId}`}
                                    className="text-[10px]"
                                    variant="outline"
                                  >
                                    Beta
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-[220px] text-xs leading-relaxed">
                                  Beta connectors are near launch but may still receive minor updates or fixes.
                                </TooltipContent>
                              </Tooltip>
                            );
                          }

                          if (lifecycle?.stable === false) {
                            return null;
                          }

                          return null;
                        })();

                        if (!app.release?.semver && !badgeContent) {
                          return null;
                        }

                        return (
                          <div className="flex items-center gap-2 mt-1">
                            {app.release?.semver && (
                              <span className="text-[10px] font-mono text-slate-500">v{app.release.semver}</span>
                            )}
                            {badgeContent}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      {app.triggers.length > 0 && (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px] px-1.5 py-0.5">
                          {app.triggers.length} trigger{app.triggers.length !== 1 ? 's' : ''}
                        </Badge>
                      )}
                      {app.actions.length > 0 && (
                        <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px] px-1.5 py-0.5">
                          {app.actions.length} action{app.actions.length !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="px-3 pb-3">
                  {/* Nodes grid */}
                  <div className="grid grid-cols-1 gap-2">
                    {/* Triggers */}
                    {app.triggers.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          const initialParams = t.params || {};
                          onAddNode("trigger", {
                            label: t.name,
                            description: t.description,
                            kind: 'trigger',
                            app: app.appId,            // use canonical id (e.g., google-drive)
                            triggerId: t.id,           // expose op id explicitly
                            nodeType: t.nodeType,
                            parameters: initialParams,
                            params: initialParams,
                          });
                        }}
                        className="group text-left p-3 rounded-lg bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-all duration-200 hover:border-emerald-300"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.7)]" />
                          <div className="flex-1 min-w-0">
                            <div className="text-gray-900 text-sm font-medium truncate">{t.name}</div>
                            {t.description && <div className="text-xs text-gray-600 mt-0.5 line-clamp-2 overflow-hidden">{t.description}</div>}
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200 shrink-0">trigger</span>
                        </div>
                      </button>
                    ))}

                    {/* Actions / Transforms */}
                    {app.actions.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          const initialParams = a.params || {};
                          onAddNode(a.kind === "transform" ? "transform" : "action", {
                            label: a.name,
                            description: a.description,
                            kind: a.kind === 'transform' ? 'transform' : 'action',
                            app: app.appId,
                            actionId: a.id,
                            nodeType: a.nodeType,
                            parameters: initialParams,
                            params: initialParams,
                          });
                        }}
                        className="group text-left p-3 rounded-lg bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-all duration-200 hover:border-blue-300"
                      >
                        <div className="flex items-center gap-3">
                          <div className={clsx(
                            "w-2 h-2 rounded-full",
                            a.kind === "transform" 
                              ? "bg-violet-400 shadow-[0_0_10px_rgba(139,92,246,0.7)]" 
                              : "bg-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.7)]"
                          )} />
                          <div className="flex-1 min-w-0">
                            <div className="text-gray-900 text-sm font-medium truncate">{a.name}</div>
                            {a.description && <div className="text-xs text-gray-600 mt-0.5 line-clamp-2 overflow-hidden">{a.description}</div>}
                          </div>
                          <span className={clsx(
                            "text-[10px] px-2 py-0.5 rounded border shrink-0",
                            a.kind === "transform"
                              ? "bg-violet-100 text-violet-700 border-violet-200"
                              : "bg-blue-100 text-blue-700 border-blue-200"
                          )}>
                            {a.kind}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
      </div>
    </TooltipProvider>
  );
};

// Main Graph Editor Component
const GraphEditorContent = () => {
  const fallbackWorkflowIdRef = useRef<string>(`local-${Date.now()}`);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const {
    health: queueHealth,
    status: queueStatus,
    isLoading: isQueueHealthLoading,
    error: queueHealthError,
  } = useQueueHealth({ intervalMs: 30000 });
  const {
    environmentWarnings: workerEnvironmentWarnings,
    summary: workerSummary,
    isLoading: isWorkerStatusLoading,
  } = useWorkerHeartbeat({ intervalMs: 30000 });
  const queueReady = queueStatus === 'pass';
  const workersOnlineCount = workerSummary.healthyWorkers ?? 0;
  const workersAvailable =
    workersOnlineCount > 0 &&
    workerSummary.hasExecutionWorker &&
    workerSummary.schedulerHealthy &&
    workerSummary.timerHealthy;
  const workerIssues = useMemo(() => {
    if (workersAvailable) {
      return [] as string[];
    }
    if (workerEnvironmentWarnings.length > 0) {
      return workerEnvironmentWarnings.map((warning) => warning.message);
    }
    if (isWorkerStatusLoading) {
      return ['Checking worker and scheduler status…'];
    }
    return [WORKER_FLEET_GUIDANCE];
  }, [workersAvailable, workerEnvironmentWarnings, isWorkerStatusLoading]);
  const workerStatusMessage = useMemo(() => workerIssues.join(' '), [workerIssues]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [runBanner, setRunBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = useMemo(() => {
    return nodes.find((n: any) => String(n.id) === String(selectedNodeId)) as any;
  }, [nodes, selectedNodeId]);
  const lastExecution = selectedNode?.data?.lastExecution;
  const [labelValue, setLabelValue] = useState<string>('');
  const [descValue, setDescValue] = useState<string>('');
  const [credentialsDraft, setCredentialsDraft] = useState<string>('');
  // Node configuration modal state
  const [configOpen, setConfigOpen] = useState(false);
  const [configFunctions, setConfigFunctions] = useState<any[]>([]);
  const [configConnections, setConfigConnections] = useState<any[]>([]);
  const [configOAuthProviders, setConfigOAuthProviders] = useState<any[]>([]);
  const [configNodeData, setConfigNodeData] = useState<any | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const authFetch = useAuthStore((state) => state.authFetch);
  const token = useAuthStore((state) => state.token);
  const logout = useAuthStore((state) => state.logout);
  const queueGuidance = WORKER_FLEET_GUIDANCE;
  const queueStatusMessage = useMemo(() => {
    if (queueReady) {
      return queueHealth?.message || 'Worker and scheduler processes are connected to the queue.';
    }
    const detail = queueHealth?.message || queueHealthError || 'Execution queue is unavailable';
    const suffix = detail.endsWith('.') ? '' : '.';
    if (detail.includes(queueGuidance)) {
      return detail;
    }
    return `${detail}${suffix} ${queueGuidance}`.trim();
  }, [queueReady, queueHealth, queueHealthError, queueGuidance]);
  const runHealthTooltip = useMemo(() => {
    const parts = [] as string[];
    if (workerStatusMessage) {
      parts.push(workerStatusMessage);
    }
    if (queueStatusMessage) {
      parts.push(queueStatusMessage);
    }
    return parts.join(' ').trim();
  }, [workerStatusMessage, queueStatusMessage]);
  const isRunHealthLoading = isQueueHealthLoading || isWorkerStatusLoading;
  const runReady = queueReady && workersAvailable;
  const ensureWorkflowId = useCallback(
    async (
      payload?: NodeGraph,
    ): Promise<{ workflowId: string; payload?: NodeGraph } | null> => {
      const updateResolvedId = (resolvedId: string) => {
        fallbackWorkflowIdRef.current = resolvedId;
        setActiveWorkflowId((prev) => (prev === resolvedId ? prev : resolvedId));
        try {
          localStorage.setItem('lastWorkflowId', resolvedId);
        } catch (error) {
          console.warn('Unable to persist workflow id:', error);
        }
      };

      const getStoredIdentifier = (): string | undefined => {
        let stored: string | undefined;
        try {
          stored = localStorage.getItem('lastWorkflowId') ?? undefined;
        } catch (error) {
          console.warn('Unable to read workflow id from storage:', error);
        }
        return stored;
      };

      const payloadIdentifier = typeof payload?.id === 'string' ? payload.id : undefined;

      let workflowIdentifier =
        (isUuid(payloadIdentifier) ? payloadIdentifier : undefined) ??
        activeWorkflowId ??
        fallbackWorkflowIdRef.current ??
        getStoredIdentifier() ??
        `local-${Date.now()}`;

      if (isUuid(workflowIdentifier)) {
        updateResolvedId(workflowIdentifier);
        const ensuredPayload = payload
          ? { ...payload, id: workflowIdentifier }
          : undefined;
        return { workflowId: workflowIdentifier, payload: ensuredPayload };
      }

      const requestedIdentifier = workflowIdentifier;

      const body: Record<string, any> = {
        name: payload?.name ?? 'Untitled Workflow',
        requestedId: requestedIdentifier,
      };

      if (payload) {
        const graphForCreation: any = { ...payload };
        delete graphForCreation.id;
        body.graph = graphForCreation;
        if (payload.metadata !== undefined) {
          body.metadata = payload.metadata;
        }
      }

      let response: Response | null = null;
      try {
        response = await authFetch('/api/flows/save', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      } catch (error: any) {
        throw new Error(error?.message || 'Failed to initialize workflow identifier');
      }

      const result = (await response
        .json()
        .catch(() => ({}))) as Record<string, any>;

      if (!response.ok || !result?.success || typeof result.workflowId !== 'string') {
        const message =
          result?.error ||
          (response.status === 401
            ? 'Sign in to manage workflows before continuing.'
            : 'Failed to initialize workflow identifier');

        if (response.status === 401) {
          await logout(true);
        }

        throw new Error(message);
      }

      const resolvedId = result.workflowId;
      updateResolvedId(resolvedId);

      const ensuredPayload = payload
        ? { ...payload, id: resolvedId }
        : undefined;

      return { workflowId: resolvedId, payload: ensuredPayload };
    },
    [activeWorkflowId, authFetch, logout, setActiveWorkflowId],
  );
  const [catalog, setCatalog] = useState<any | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [refreshConnectorsFlag, setRefreshConnectorsFlag] = useState(false);
  const {
    data: connectorDefinitions,
    loading: connectorDefinitionsLoading,
    error: connectorDefinitionsError,
  } = useConnectorDefinitions(refreshConnectorsFlag);
  const [supportedApps, setSupportedApps] = useState<Set<string>>(new Set(['core', 'built_in', 'time']));
  const [saveState, setSaveState] = useState<'idle' | 'saving'>('idle');
  const [promotionState, setPromotionState] = useState<'idle' | 'checking' | 'publishing'>('idle');
  const [promotionDialogOpen, setPromotionDialogOpen] = useState(false);
  const [promotionWorkflowId, setPromotionWorkflowId] = useState<string | null>(null);
  const [promotionDiff, setPromotionDiff] = useState<WorkflowDiffSummary | null>(null);
  const [migrationPlan, setMigrationPlan] = useState({
    freezeActiveRuns: true,
    scheduleRollForward: true,
    scheduleBackfill: true,
    notes: '',
  });
  const [promotionError, setPromotionError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [workflowValidation, setWorkflowValidation] = useState<WorkflowValidationState>({
    status: 'idle',
    errors: [],
    blockingErrors: [],
    message: undefined,
    error: undefined,
  });
  const validationSignatureRef = useRef<string>('');
  const validationAbortRef = useRef<AbortController | null>(null);
  type ValidationJob = (context: { activeWorkflowId: string | null; fallbackWorkflowId: string | null }) => Promise<void>;
  const validationDebounceRef = useRef<DebouncedFunc<ValidationJob> | null>(null);
  const createValidationSignature = useCallback((errors: ValidationError[]): string => {
    return errors
      .map((error) => `${error.nodeId ?? 'global'}|${error.path}|${error.message}|${error.severity}`)
      .sort()
      .join(';');
  }, []);

  const updateNodeValidation = useCallback(
    (errors: ValidationError[], options: { focus?: boolean } = {}) => {
      const focus = options.focus ?? true;
      const errorMap = new Map<string, ValidationError[]>();
      let firstNodeId: string | null = null;

      errors.forEach((error) => {
        if (!isErrorSeverity((error as any)?.severity)) {
          return;
        }
        const nodeId = getNodeIdFromValidationError(error);
        if (!nodeId) {
          return;
        }
        if (!errorMap.has(nodeId)) {
          errorMap.set(nodeId, []);
          if (!firstNodeId) {
            firstNodeId = nodeId;
          }
        }
        errorMap.get(nodeId)!.push(error);
      });

      setNodes((nds) =>
        nds.map((node) => {
          const baseData = applyExecutionStateDefaults(node.data);
          const nodeErrors = errorMap.get(String(node.id)) ?? [];
          const nextData = { ...baseData } as Record<string, any>;
          if (nodeErrors.length > 0) {
            nextData.validationErrors = nodeErrors;
          } else {
            delete nextData.validationErrors;
          }

          const shouldFocus = focus && firstNodeId;
          const nextSelected = shouldFocus ? String(node.id) === firstNodeId : node.selected;

          return {
            ...node,
            data: nextData,
            selected: shouldFocus ? nextSelected : node.selected,
          } as Node;
        })
      );

      if (focus && firstNodeId) {
        setSelectedNodeId(firstNodeId);
      }
    },
    [setNodes, setSelectedNodeId]
  );

  const validateWorkflowGraph = useCallback(
    async (
      graphPayload: NodeGraph,
      signal?: AbortSignal
    ): Promise<WorkflowValidationResult> => {
      try {
        const response = await authFetch('/api/workflows/validate', {
          method: 'POST',
          body: JSON.stringify({
            graph: graphPayload,
            options: { preview: true },
          }),
          signal,
        });

        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json?.success) {
          const message = json?.error || 'Unable to validate workflow';
          return { valid: false, errors: [], warnings: [], message };
        }

        const validation = json.validation ?? {};
        const errors = Array.isArray(validation.errors) ? (validation.errors as ValidationError[]) : [];
        const warnings = Array.isArray(validation.warnings) ? (validation.warnings as ValidationError[]) : [];
        const blockingErrors = errors.filter((error) => isErrorSeverity((error as any)?.severity));

        return {
          valid: validation.valid !== false && blockingErrors.length === 0,
          errors,
          warnings,
        };
      } catch (error: any) {
        if (error?.name === 'AbortError') {
          throw error;
        }
        console.error('Failed to validate workflow graph:', error);
        return {
          valid: false,
          errors: [],
          warnings: [],
          message: error?.message || 'Unable to validate workflow',
        };
      }
    },
    [authFetch]
  );

  const handleRefreshConnectorMetadata = useCallback(() => {
    setRefreshConnectorsFlag((flag) => !flag);
  }, []);

  useEffect(() => {
    setLabelValue(selectedNode?.data?.label || '');
    setDescValue(selectedNode?.data?.description || '');
  }, [selectedNodeId, selectedNode?.data?.label, selectedNode?.data?.description]);

  useEffect(() => {
    if (!selectedNode) {
      setCredentialsDraft('');
      return;
    }
    try {
      const inlineCreds = (selectedNode.data?.credentials ?? selectedNode.data?.parameters?.credentials) as any;
      if (inlineCreds && typeof inlineCreds === 'object') {
        setCredentialsDraft(JSON.stringify(inlineCreds, null, 2));
      } else {
        setCredentialsDraft('');
      }
    } catch {
      setCredentialsDraft('');
    }
  }, [selectedNode]);

  const loadCatalog = useCallback(async () => {
    try {
      setCatalogLoading(true);
      const response = await fetch('/api/registry/catalog?implemented=true');
      if (!response.ok) {
        throw new Error(`Failed to load connector catalog (${response.status})`);
      }
      const json = await response.json();
      if (!json?.success) {
        throw new Error(json?.error || 'Failed to load connector catalog');
      }

      setCatalog(json.catalog || null);

      const allowed = new Set<string>(['core', 'built_in', 'time']);
      Object.entries<any>(json.catalog?.connectors || {}).forEach(([appId, def]) => {
        if (def?.hasImplementation) {
          allowed.add(appId);
        }
      });
      setSupportedApps(allowed);
    } catch (error) {
      console.error('Failed to load connector catalog:', error);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const nodeRequiresConnection = useCallback((node: any) => {
    if (!node) return false;
    const role = String(node.type || node?.data?.role || '').toLowerCase();
    if (role.includes('trigger') || role.includes('transform')) {
      return false;
    }
    const data: any = node.data || {};
    const params: any = data.parameters || data.params || {};
    const connectionId = data.connectionId || data.auth?.connectionId || params.connectionId;
    const hasInlineCredentials = Boolean(data.credentials || params.credentials);
    return !connectionId && !hasInlineCredentials;
  }, []);

  const nodeConfigurationErrors = useMemo(
    () => collectNodeConfigurationErrors(nodes as any[], { nodeRequiresConnection }),
    [nodes, nodeRequiresConnection]
  );

  const nodeBlockingErrors = useMemo(
    () => nodeConfigurationErrors.filter((error) => isErrorSeverity(error.severity)),
    [nodeConfigurationErrors]
  );

  const allowedApps = useMemo(() => {
    const set = new Set<string>(supportedApps);
    set.add('core');
    set.add('built_in');
    set.add('time');
    return set;
  }, [supportedApps]);

  const findUnsupportedNode = useCallback(() => {
    return nodes.find((node) => {
      const data: any = node.data || {};
      const candidates = [
        data.app,
        data.application,
        data.connectorId,
        data.appId,
        typeof data.nodeType === 'string' && data.nodeType.includes('.') ? data.nodeType.split('.')[1] : undefined,
        typeof node.type === 'string' && node.type.includes('.') ? node.type.split('.')[1] : undefined,
      ];

      const candidate = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
      if (!candidate) {
        if (typeof node.type === 'string' && node.type.startsWith('transform')) {
          return false;
        }
        return false;
      }

      const normalized = normalizeAppName(candidate);
      if (!normalized || allowedApps.has(normalized)) {
        return false;
      }

      if (typeof node.type === 'string' && (node.type.startsWith('transform') || node.type.startsWith('condition'))) {
        return false;
      }

      return true;
    });
  }, [nodes, allowedApps]);

  const ensureSupportedNodes = useCallback(() => {
    const unsupported = findUnsupportedNode();
    if (unsupported) {
      const data = unsupported.data || {};
      const appName = data.app || data.application || unsupported.type || unsupported.id;
      const message = `${appName} is not yet supported. Remove or replace this node before continuing.`;
      setRunBanner({ type: 'error', message });
      toast.error(message);
      setSelectedNodeId(String(unsupported.id));
      return false;
    }
    return true;
  }, [findUnsupportedNode, setRunBanner]);

  useEffect(() => {
    if (!catalogLoading) {
      ensureSupportedNodes();
    }
  }, [catalogLoading, ensureSupportedNodes]);
  const [showWelcomeModal, setShowWelcomeModal] = useState(true);
  const { project, getViewport, setViewport } = useReactFlow();
  const spec = useSpecStore((state) => state.spec);
  const specHydratedRef = useRef(false);

  const updateNodeExecution = useCallback((nodeId: string, updater: (data: any) => any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (String(node.id) !== String(nodeId)) {
          return node;
        }
        const baseData = applyExecutionStateDefaults(node.data);
        const updates = updater(baseData) || {};
        return {
          ...node,
          data: {
            ...baseData,
            ...updates
          }
        };
      })
    );
  }, [setNodes]);

  // Helper to normalize app name used by APIs
  const normalizeAppName = (raw?: string): string => {
    if (!raw) return '';
    const v = String(raw).toLowerCase();
    // common aliases
    if (v.includes('gmail')) return 'gmail';
    if (v.includes('sheet')) return 'google-sheets';
    if (v.includes('slack')) return 'slack';
    if (v.includes('notion')) return 'notion';
    if (v.includes('airtable')) return 'airtable';
    if (v.includes('shopify')) return 'shopify';
    return v;
  };

  const openNodeConfigModal = async (node: any) => {
    // Open immediately for snappy UX; load data in background
    const appName = normalizeAppName(node?.data?.app || node?.data?.application || '');
    const role = String(node?.type || '').startsWith('trigger') ? 'trigger' : 'action';
    const functionId = node?.data?.actionId || node?.data?.triggerId || node?.data?.function || node?.data?.operation;
    const params = node?.data?.parameters || node?.data?.params || {};
    let connectionId = node?.data?.connectionId || node?.data?.auth?.connectionId || params?.connectionId;

    if (!connectionId && appName) {
      const normalizedProvider = appName.toLowerCase();
      const healthyConnection = (configConnections || []).find((connection: any) => {
        if (!connection) return false;
        const provider = String(connection.provider || connection.app || '').toLowerCase();
        if (provider !== normalizedProvider) return false;
        const status = String(connection.status || '').toLowerCase();
        return !status || status === 'connected' || status === 'healthy' || status === 'active';
      });

      if (healthyConnection?.id) {
        connectionId = healthyConnection.id;
      }
    }

    setConfigNodeData({
      id: String(node.id),
      type: role,
      appName: appName || 'gmail',
      functionId: functionId,
      label: node?.data?.label || node?.id,
      parameters: params,
      connectionId: connectionId
    });
    setConfigOpen(true);

    try {
      setConfigLoading(true);
      // Fetch functions for app
      let funcs: any[] = [];
      if (appName) {
        try {
          const res = await fetch(`/api/functions/${encodeURIComponent(appName)}`);
          const j = await res.json();
          funcs = j?.data?.functions || j?.functions || [];
        } catch {}
      }
      setConfigFunctions(funcs);

      // Fetch user connections (optional, requires auth)
      try {
        if (!token) {
          setConfigConnections([]);
        } else {
          const res = await authFetch('/api/connections');
          const j = await res.json().catch(() => ({}));
          const list = j?.connections || [];
          setConfigConnections(Array.isArray(list) ? list : []);
        }
      } catch {
        setConfigConnections([]);
      }

      // Fetch OAuth providers (public)
      try {
        const res = token ? await authFetch('/api/oauth/providers') : await fetch('/api/oauth/providers');
        const j = await res.json().catch(() => ({}));
        const list = j?.data?.providers || j?.providers || [];
        setConfigOAuthProviders(Array.isArray(list) ? list : []);
      } catch {
        setConfigOAuthProviders([]);
      }
    } finally {
      setConfigLoading(false);
    }
  };

  const handleFixValidationError = useCallback(
    (nodeId: string) => {
      if (!nodeId) {
        return;
      }

      setSelectedNodeId(nodeId);
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          selected: String(node.id) === String(nodeId),
        }))
      );

      const targetNode = nodes.find((node) => String(node.id) === String(nodeId));
      if (targetNode) {
        void openNodeConfigModal(targetNode);
      }
    },
    [nodes, openNodeConfigModal, setNodes]
  );

  const handleConnectionCreated = useCallback(
    async (connectionId: string) => {
      if (!token) {
        return;
      }

      const targetNodeId = configNodeData?.id;

      try {
        const response = await authFetch('/api/connections');
        const json = await response.json().catch(() => ({}));
        const list = Array.isArray(json?.connections) ? json.connections : [];
        setConfigConnections(list);

        let connection = list.find((item: any) => item?.id === connectionId) ?? null;

        if (!connection) {
          try {
            const detailResponse = await authFetch(`/api/connections/${connectionId}`);
            const detailJson = await detailResponse.json().catch(() => ({}));
            const detailConnection = detailJson?.connection || detailJson?.data || null;

            if (detailConnection && typeof detailConnection === 'object') {
              connection = detailConnection;
              setConfigConnections((prev) => {
                const map = new Map(prev.map((item: any) => [item?.id, item] as const));
                map.set(connectionId, detailConnection);
                return Array.from(map.values());
              });
            }
          } catch {
            // Ignore detail fetch errors – we already refreshed the list.
          }
        }

        if (configOpen) {
          setConfigNodeData((prev) =>
            prev ? { ...prev, connectionId } : prev
          );

          if (connectionId && targetNodeId) {
            setNodes((existingNodes) =>
              existingNodes.map((node) => {
                if (String(node.id) !== String(targetNodeId)) {
                  return node;
                }

                const data: any = { ...(node.data || {}) };
                const params: any = { ...(data.parameters || data.params || {}) };

                params.connectionId = connectionId;
                data.parameters = params;
                data.params = params;
                data.connectionId = connectionId;
                data.auth = { ...(data.auth || {}), connectionId };

                if (connection && !data.connectionName) {
                  data.connectionName = connection.name;
                }

                return { ...node, data };
              })
            );
          }
        }

        return connection ?? undefined;
      } catch (error) {
        toast.error('Connection created, but failed to refresh the connection list.');
        throw error;
      }
    },
    [authFetch, configNodeData?.id, configOpen, setNodes, token]
  );

  const handleNodeConfigSave = (updated: any) => {
    // Persist selected function, connectionId, and parameters back into node data
    setNodes((nds) =>
      nds.map((n) => {
        if (String(n.id) !== String(updated.id)) return n;
        const baseData: any = { ...(n.data || {}) };
        const params: any = { ...(baseData.parameters || baseData.params || {}) };

        if (updated.functionId) {
          baseData.function = updated.functionId;
          baseData.operation = updated.functionId;
          // preserve original actionId/triggerId for display if present
          if ((updated.type || '').toLowerCase() === 'action') baseData.actionId = updated.functionId;
          if ((updated.type || '').toLowerCase() === 'trigger') baseData.triggerId = updated.functionId;
        }

        if (updated.parameters && typeof updated.parameters === 'object') {
          Object.assign(params, updated.parameters);
        }

        baseData.parameters = params;
        baseData.params = params;

        // Connection propagation
        const cid = updated.connectionId || params.connectionId;
        baseData.connectionId = cid || undefined;
        baseData.auth = { ...(baseData.auth || {}), connectionId: cid || undefined };
        params.connectionId = cid || undefined;

        // Label update
        if (updated.label) baseData.label = updated.label;

        return { ...n, data: baseData } as any;
      })
    );
    setConfigOpen(false);
    toast.success('Node configured');
  };

  const resetExecutionHighlights = useCallback(() => {
    setNodes((nds) =>
      nds.map((node) => {
        const baseData = applyExecutionStateDefaults(node.data);
        return {
          ...node,
          data: {
            ...baseData,
            executionStatus: 'idle',
            isRunning: false,
            isCompleted: false
          }
        };
      })
    );
  }, [setNodes]);

  const createGraphPayload = useCallback((workflowIdentifier: string) => {
    const metadata = (spec?.metadata && typeof spec.metadata === 'object') ? spec.metadata : undefined;
    return serializeGraphPayload({
      nodes,
      edges,
      workflowIdentifier,
      specName: spec?.name,
      specVersion: spec?.version,
      metadata,
    });
  }, [nodes, edges, spec]);

  const combinedValidationErrors = useMemo(() => {
    const seen = new Set<string>();
    const combined: ValidationError[] = [];
    [...nodeConfigurationErrors, ...workflowValidation.errors].forEach((error) => {
      const key = `${error.nodeId ?? 'global'}|${error.path}|${error.message}|${error.severity}`;
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(error);
      }
    });
    return combined;
  }, [nodeConfigurationErrors, workflowValidation.errors]);

  const WORKFLOW_VALIDATION_DEBOUNCE_MS = 600;

  useEffect(() => {
    const debounced = debounce<ValidationJob>(async ({ activeWorkflowId: contextActiveWorkflowId, fallbackWorkflowId }) => {
      const abortController = new AbortController();
      validationAbortRef.current?.abort();
      validationAbortRef.current = abortController;

      try {
        const provisionalId =
          contextActiveWorkflowId ?? fallbackWorkflowId ?? `local-${Date.now()}`;
        const draftPayload = createGraphPayload(provisionalId);

        const ensured = await ensureWorkflowId(draftPayload);
        if (abortController.signal.aborted) {
          return;
        }

        if (!ensured) {
          setWorkflowValidation({
            status: 'invalid',
            errors: [],
            blockingErrors: [],
            message: undefined,
            error: 'Unable to resolve workflow identifier for validation',
          });
          return;
        }

        const { workflowId: resolvedWorkflowId, payload: ensuredPayload } = ensured;
        const validationPayload = ensuredPayload ?? { ...draftPayload, id: resolvedWorkflowId };

        const result = await validateWorkflowGraph(validationPayload, abortController.signal);
        if (abortController.signal.aborted) {
          return;
        }

        const errors = Array.isArray(result.errors)
          ? (result.errors as ValidationError[])
          : [];
        const blockingErrors = errors.filter((error) =>
          isErrorSeverity((error as any)?.severity)
        );
        setWorkflowValidation({
          status: blockingErrors.length === 0 && result.valid ? 'valid' : 'invalid',
          errors,
          blockingErrors,
          message: result.message,
          error: undefined,
        });
      } catch (error: any) {
        if (abortController.signal.aborted || error?.name === 'AbortError') {
          return;
        }
        setWorkflowValidation({
          status: 'invalid',
          errors: [],
          blockingErrors: [],
          message: undefined,
          error: error?.message ?? 'Unable to validate workflow',
        });
      } finally {
        if (validationAbortRef.current === abortController) {
          validationAbortRef.current = null;
        }
      }
    }, WORKFLOW_VALIDATION_DEBOUNCE_MS);

    validationDebounceRef.current = debounced;

    return () => {
      debounced.cancel();
      validationDebounceRef.current = null;
    };
  }, [createGraphPayload, ensureWorkflowId, validateWorkflowGraph]);

  useEffect(() => {
    const debounced = validationDebounceRef.current;

    if (!debounced) {
      return;
    }

    if (nodes.length === 0) {
      debounced.cancel();
      validationAbortRef.current?.abort();
      validationAbortRef.current = null;
      setWorkflowValidation({
        status: 'valid',
        errors: [],
        blockingErrors: [],
        message: undefined,
        error: undefined,
      });
      const signature = createValidationSignature([]);
      validationSignatureRef.current = signature;
      updateNodeValidation([], { focus: false });
      return;
    }

    setWorkflowValidation((previous) => ({
      ...previous,
      status: 'validating',
      error: undefined,
    }));

    debounced({
      activeWorkflowId: activeWorkflowId ?? null,
      fallbackWorkflowId: fallbackWorkflowIdRef.current ?? null,
    });

    return () => {
      debounced.cancel();
      if (validationAbortRef.current) {
        validationAbortRef.current.abort();
        validationAbortRef.current = null;
      }
    };
  }, [
    nodes,
    edges,
    activeWorkflowId,
    createValidationSignature,
    updateNodeValidation,
  ]);

  useEffect(() => {
    const signature = createValidationSignature(combinedValidationErrors);
    if (validationSignatureRef.current !== signature) {
      validationSignatureRef.current = signature;
      updateNodeValidation(combinedValidationErrors, { focus: false });
    }
  }, [combinedValidationErrors, updateNodeValidation, createValidationSignature]);

  const combinedBlockingErrors = useMemo(() => {
    const seen = new Set<string>();
    const blocking: ValidationError[] = [];
    [...nodeBlockingErrors, ...workflowValidation.blockingErrors].forEach((error) => {
      const key = `${error.nodeId ?? 'global'}|${error.path}|${error.message}|${error.severity}`;
      if (!seen.has(key)) {
        seen.add(key);
        blocking.push(error);
      }
    });
    return blocking;
  }, [nodeBlockingErrors, workflowValidation.blockingErrors]);

  const graphHasNodes = nodes.length > 0;
  const hasBlockingErrors = combinedBlockingErrors.length > 0;
  const validationComplete = workflowValidation.status === 'valid';

  const canRun = useMemo(() => {
    if (!queueReady || !workersAvailable) {
      return false;
    }
    if (!graphHasNodes || hasBlockingErrors) {
      return false;
    }
    return validationComplete;
  }, [queueReady, workersAvailable, graphHasNodes, hasBlockingErrors, validationComplete]);

  const canValidate = useMemo(() => {
    if (!queueReady || !workersAvailable) {
      return false;
    }
    if (!graphHasNodes || hasBlockingErrors) {
      return false;
    }
    return true;
  }, [queueReady, workersAvailable, graphHasNodes, hasBlockingErrors]);

  const runDisabled = !canRun || isRunning || isValidating;
  const validateDisabled = !canValidate || isValidating || isRunning;

  const computeInitialRunData = useCallback(() => {
    const metadata = (spec?.metadata && typeof spec.metadata === 'object') ? (spec.metadata as Record<string, any>) : null;
    const candidates: Array<any> = [];

    if (metadata) {
      candidates.push(
        metadata.initialData,
        metadata.sampleData,
        metadata.previewSample,
        metadata.triggerSample,
        metadata.manualRunData,
      );
    }

    if (spec && typeof spec === 'object') {
      const specRecord = spec as Record<string, any>;
      candidates.push(specRecord.initialData, specRecord.sampleData);
    }

    for (const candidate of candidates) {
      if (candidate && typeof candidate === 'object') {
        return candidate;
      }
    }

    return {};
  }, [spec]);

  const onSaveWorkflow = useCallback(async (): Promise<string | null> => {
    if (nodes.length === 0) {
      toast.error('Add at least one node before saving');
      return null;
    }

    if (!ensureSupportedNodes()) {
      return null;
    }

    const provisionalId = activeWorkflowId ?? fallbackWorkflowIdRef.current ?? `local-${Date.now()}`;
    const draftPayload = createGraphPayload(provisionalId);

    setSaveState('saving');
    try {
      const ensured = await ensureWorkflowId(draftPayload);
      if (!ensured) {
        throw new Error('Unable to resolve workflow identifier');
      }

      const { workflowId: workflowIdentifier, payload: ensuredPayload } = ensured;
      const payload = ensuredPayload ?? { ...draftPayload, id: workflowIdentifier };

      const response = await authFetch('/api/flows/save', {
        method: 'POST',
        body: JSON.stringify({
          id: workflowIdentifier,
          name: payload.name,
          graph: payload,
          metadata: payload.metadata
        })
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        const message = result?.error || (response.status === 401 ? 'Sign in to save workflows' : 'Failed to save workflow');
        if (response.status === 401) {
          await logout(true);
        }
        throw new Error(message);
      }

      const savedId = result.workflowId || workflowIdentifier;
      setActiveWorkflowId(savedId);
      try {
        localStorage.setItem('lastWorkflowId', savedId);
      } catch (error) {
        console.warn('Unable to persist workflow id after save:', error);
      }
      toast.success('Workflow saved');
      return savedId;
    } catch (error: any) {
      toast.error(error?.message || 'Failed to save workflow');
      return null;
    } finally {
      setSaveState('idle');
    }
  }, [
    nodes,
    ensureSupportedNodes,
    activeWorkflowId,
    fallbackWorkflowIdRef,
    createGraphPayload,
    ensureWorkflowId,
    authFetch,
    logout,
    setActiveWorkflowId,
  ]);

  const prepareWorkflowForExecution = useCallback(async (): Promise<{ workflowId: string; payload: NodeGraph } | null> => {
    if (nodes.length === 0) {
      return null;
    }

    if (!ensureSupportedNodes()) {
      return null;
    }

    const missingConnectionNode = nodes.find((node) => nodeRequiresConnection(node));
    if (missingConnectionNode) {
      const missingLabel = missingConnectionNode.data?.label || missingConnectionNode.id;
      const message = `Connect an account for "${missingLabel}" before running`;
      setRunBanner({ type: 'error', message });
      toast.error(message);
      await openNodeConfigModal(missingConnectionNode);
      return null;
    }

    const firstNonConnectionError = nodeBlockingErrors.find(
      (error) => !error.path.includes('/metadata/connection')
    );
    if (firstNonConnectionError) {
      const message =
        firstNonConnectionError.message || 'Resolve configuration issues before running.';
      setRunBanner({ type: 'error', message });
      toast.error(message);
      updateNodeValidation(nodeConfigurationErrors, { focus: true });
      return null;
    }

    const provisionalId = activeWorkflowId ?? fallbackWorkflowIdRef.current ?? `local-${Date.now()}`;
    const draftPayload = createGraphPayload(provisionalId);

    const ensured = await ensureWorkflowId(draftPayload);
    if (!ensured) {
      return null;
    }

    const { workflowId: workflowIdentifier, payload: ensuredPayload } = ensured;
    const payload = ensuredPayload ?? { ...draftPayload, id: workflowIdentifier };

    setRunBanner(null);

    const validationAbortController = new AbortController();
    const validationResult = await validateWorkflowGraph(
      payload,
      validationAbortController.signal
    );
    const blockingErrors = validationResult.errors.filter((error) => isErrorSeverity((error as any)?.severity));

    if (!validationResult.valid || blockingErrors.length > 0) {
      updateNodeValidation(validationResult.errors, { focus: true });
      const detail =
        blockingErrors[0]?.message ??
        validationResult.message ??
        'Resolve validation issues before running.';
      const bannerMessage =
        blockingErrors.length > 0
          ? `Resolve validation issues before running: ${detail}`
          : detail;
      setRunBanner({ type: 'error', message: bannerMessage });
      toast.error(bannerMessage);
      return null;
    }

    updateNodeValidation([], { focus: false });

    return { workflowId: workflowIdentifier, payload };
  }, [
    nodes,
    ensureSupportedNodes,
    nodeRequiresConnection,
    nodeBlockingErrors,
    nodeConfigurationErrors,
    activeWorkflowId,
    fallbackWorkflowIdRef,
    createGraphPayload,
    ensureWorkflowId,
    validateWorkflowGraph,
    updateNodeValidation,
    setRunBanner,
    openNodeConfigModal,
  ]);

  // P1-8: Enhanced Graph Editor autoload robustness (scanner-safe version)
  useEffect(() => {
    const loadWorkflowFromStorage = async () => {
      // Keep ALL try/catch at the top level to avoid esbuild "Unexpected catch"
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const fromAIB = urlParams.get("from") === "ai-builder";
        const workflowIdParam = urlParams.get("workflowId") || urlParams.get("flowId");
        const autoLoad = urlParams.get("autoLoad") === "true";
        const storedWorkflowId = fromAIB ? (localStorage.getItem('lastWorkflowId') || undefined) : undefined;
        const workflowId = workflowIdParam || storedWorkflowId;

        if (workflowId) {
          setActiveWorkflowId(workflowId);
          try {
            localStorage.setItem('lastWorkflowId', workflowId);
          } catch (e) {
            console.warn('Unable to persist workflow id to localStorage', e);
          }
        } else {
          setActiveWorkflowId((prev) => prev ?? fallbackWorkflowIdRef.current);
        }

        // Helper to safely parse any JSON without throwing
        const safeParse = (raw: string | null) => {
          if (!raw) return null;
          try {
            return JSON.parse(raw);
          } catch (e) {
            console.warn("Failed to parse JSON from storage", e);
            return null;
          }
        };

        // 1) Try API load if workflowId present
        let loadedWorkflow: any = null;
        let loadSource: string | null = null;

        if (workflowId) {
          try {
            const apiRes = await fetch(`/api/workflows/${workflowId}`);
            if (apiRes.ok) {
              const apiJson = await apiRes.json();
              const candidate =
                apiJson?.workflow?.graph || apiJson?.graph || apiJson;
              if (candidate?.nodes?.length) {
                loadedWorkflow = candidate;
                loadSource = "api";
              }
            }
          } catch (e) {
            console.warn("⚠️ Failed to load workflow from API:", e);
          }
        }

        // 2) Fallback priority from localStorage
        if (!loadedWorkflow) {
          const sources = [
            { key: "lastCompile", condition: fromAIB || autoLoad },
            { key: "savedWorkflow", condition: Boolean(workflowId) },
            { key: "draftWorkflow", condition: true },
            { key: "backupWorkflow", condition: true },
          ];

          for (const source of sources) {
            if (!source.condition) continue;

            const storageKeys = workflowId
              ? Array.from(
                  new Set([
                    source.key,
                    `workflow_${workflowId}`,
                    `${source.key}_${workflowId}`,
                    `workflow_${workflowId}_${source.key}`,
                  ])
                )
              : [source.key];

            for (const storageKey of storageKeys) {
              const parsed = safeParse(localStorage.getItem(storageKey));
              const candidate =
                parsed?.workflow?.graph || parsed?.graph || parsed;

              if (candidate?.nodes?.length) {
                loadedWorkflow = candidate;
                loadSource = source.key;
                break;
              }
            }

            if (loadedWorkflow) {
              break;
            }
          }
        }

        // 3) If nothing found, leave the editor empty
        if (!loadedWorkflow) {
          console.log("📝 No saved workflow found, starting with empty canvas");
          setShowWelcomeModal(true);
          return;
        }

        // --- Normalize nodes to ReactFlow format (no try/catch inside map) ---
        const makeRFNode = (node: any, index: number) => {
          const normalized = normalizeWorkflowNode(node, {
            index,
            loadSource: loadSource ?? undefined,
          });

          return {
            id: normalized.id,
            type: normalized.role,
            position: normalized.position,
            data: applyExecutionStateDefaults(normalized.data),
          } as any;
        };

        const reactFlowNodes = Array.isArray(loadedWorkflow.nodes)
          ? loadedWorkflow.nodes.map(makeRFNode)
          : [];

        // --- Normalize edges (no nested try/catch) ---
        const reactFlowEdges = Array.isArray(loadedWorkflow.edges)
          ? loadedWorkflow.edges
              .map((edge: any) => {
                const source = edge.source ?? edge.from;
                const target = edge.target ?? edge.to;
                if (!source || !target) return null;

                // Only include edges that connect existing nodes
                const srcOk = reactFlowNodes.some((n) => n.id === source);
                const tgtOk = reactFlowNodes.some((n) => n.id === target);
                if (!srcOk || !tgtOk) return null;

                return {
                  id: edge.id || `edge_${source}_${target}`,
                  source,
                  target,
                  type: edge.type || "smoothstep",
                  animated: Boolean(edge.animated),
                  style: edge.style || {},
                  data: edge.data || {},
                };
              })
              .filter(Boolean)
          : [];

        console.log(
          `✅ Successfully loaded workflow (${loadSource}): ${reactFlowNodes.length} nodes, ${reactFlowEdges.length} edges`
        );

        setNodes(reactFlowNodes as any);
        setEdges(reactFlowEdges as any);
        setShowWelcomeModal(false);

        // Auto-select first node to reveal parameter panel immediately
        if ((reactFlowNodes as any).length > 0) {
          const firstNode = (reactFlowNodes as any)[0];
          setSelectedNodeId(String(firstNode.id));
          setNodes((prev: any) => prev.map((n: any) => ({ ...n, selected: n.id === firstNode.id })));
        }

        // Clean URL params if we autoloaded
        if (fromAIB || workflowIdParam) {
          const newUrl = window.location.pathname;
          window.history.replaceState({}, "", newUrl);
        }
      } catch (error) {
        console.error("❌ Critical error in workflow autoload:", error);
        console.warn("Workflow autoload failed, starting with empty canvas");
        // Leave the editor empty but usable
        setShowWelcomeModal(true);
      }
    };

    // Run the enhanced autoload
    loadWorkflowFromStorage();
  }, [setNodes, setEdges]);

  useEffect(() => {
    if (!spec || specHydratedRef.current) return;
    if (nodes.length > 0) {
      specHydratedRef.current = true;
      return;
    }

    try {
      const { nodes: specNodes, edges: specEdges } = specToReactFlow(spec);
      if (!specNodes.length) return;

      setNodes(specNodes.map((node: any) => ({
        ...node,
        data: applyExecutionStateDefaults(node.data)
      })) as any);
      setEdges(specEdges as any);
      setShowWelcomeModal(false);

      const firstNode = specNodes[0] as any;
      setSelectedNodeId(String(firstNode.id));
      setNodes((prev: any) => prev.map((n: any) => ({ ...n, selected: n.id === firstNode.id })));
      specHydratedRef.current = true;
    } catch (error) {
      console.warn('Failed to hydrate graph from spec store:', error);
    }
  }, [spec, nodes, setNodes, setEdges]);
  
  // Helper functions for node styling
  const getIconForApp = (app: string) => {
    const icons = {
      'gmail': '📧',
      'sheets': '📊',
      'core': '⚙️',
      'transform': '🔄'
    };
    return icons[app.toLowerCase()] || '🔧';
  };
  
  const getColorForApp = (app: string) => {
    const colors = {
      'gmail': '#EA4335',
      'sheets': '#34A853',
      'core': '#9AA0A6',
      'transform': '#FF6D01'
    };
    return colors[app.toLowerCase()] || '#9AA0A6';
  };

  // Auto-close welcome modal when nodes are added
  useEffect(() => {
    if (nodes.length > 0) {
      setShowWelcomeModal(false);
    }
  }, [nodes.length]);

  const loadWorkflowIntoGraph = (workflowData: any) => {
    // Handle both new AI format and old workflow format
    const isNewAIFormat = workflowData.nodes && workflowData.edges;
    
    if (!isNewAIFormat && !workflowData.workflow?.graph) return;
    
    const graphData = isNewAIFormat ? workflowData : workflowData.workflow.graph;
    const origin = workflowData?.workflow ? 'ai-builder' : workflowData?.loadSource ?? graphData?.loadSource ?? null;
    const newNodes: Node[] = (graphData.nodes || []).map((node: any, index: number) => {
      const normalized = normalizeWorkflowNode(node, { index, loadSource: origin ?? undefined });
      return {
        id: normalized.id,
        type: normalized.role,
        position: normalized.position,
        data: applyExecutionStateDefaults(normalized.data),
      } as Node;
    });

    const newEdges: Edge[] = [];
    
    // Convert edges/connections
    const connections = graphData.edges || graphData.connections || [];
    connections.forEach((edge: any) => {
      newEdges.push({
        id: edge.id || `edge-${edge.source}-${edge.target}`,
        source: edge.source || edge.from,
        target: edge.target || edge.to,
        type: 'animated',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' }
      });
    });
    
    setNodes(newNodes);
    setEdges(newEdges);
    
    // Show success message
    setTimeout(() => {
      const workflowName = graphData.name || workflowData.title || 'AI Workflow';
      alert(`✅ Loaded AI-generated workflow: "${workflowName}"\n\nNodes: ${newNodes.length}\nConnections: ${newEdges.length}`);
    }, 500);
  };
  
  const onConnect = useCallback((params: Connection) => {
    const edge = {
      ...params,
      type: 'animated',
      animated: true,
      style: { stroke: '#3b82f6', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
    };
    setEdges((eds) => addEdge(edge, eds));
  }, [setEdges]);
  
  const onAddNode = useCallback((nodeType: string, nodeData: any) => {
    const viewport = getViewport();
    const providedData =
      nodeData && typeof nodeData === 'object' ? (nodeData as Record<string, any>) : {};
    const { parameters: providedParameters, params: providedParams, ...rest } = providedData;
    const params =
      (providedParameters as Record<string, any> | undefined) ??
      (providedParams as Record<string, any> | undefined) ??
      {};
    const dataWithParams = syncNodeParameters(rest, params);
    const provisionalNode = {
      ...providedData,
      type: nodeType,
      data: dataWithParams,
      params,
      parameters: params,
    };
    const derivedMetadata = buildMetadataFromNode(provisionalNode);
    const normalizedData = applyExecutionStateDefaults({
      ...dataWithParams,
      metadata: { ...(dataWithParams?.metadata ?? {}), ...derivedMetadata },
      outputMetadata: { ...(dataWithParams?.outputMetadata ?? {}), ...derivedMetadata },
    });
    const newNode: Node = {
      id: `${nodeType}-${Date.now()}`,
      type: nodeType,
      position: {
        x: Math.random() * 300 + 100,
        y: Math.random() * 300 + 100
      },
      data: normalizedData,
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes, getViewport]);
  
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(String(node.id));
    setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === node.id })));
  }, [setNodes]);

  const onRunWorkflow = useCallback(async () => {
    if (!queueReady) {
      const message = queueStatusMessage;
      setRunBanner({ type: 'error', message });
      toast.error(message);
      return;
    }

    setIsRunning(true);

    try {
      const prepared = await prepareWorkflowForExecution();
      if (!prepared) {
        return;
      }

      const savedWorkflowId = await onSaveWorkflow();
      const workflowIdentifier = savedWorkflowId ?? prepared.workflowId;

      if (!workflowIdentifier) {
        const message = 'Save the workflow before running.';
        setRunBanner({ type: 'error', message });
        toast.error(message);
        return;
      }

      const initialData = computeInitialRunData();
      const response = await authFetch('/api/executions', {
        method: 'POST',
        body: JSON.stringify({
          workflowId: workflowIdentifier,
          triggerType: 'manual',
          initialData,
        }),
      });

      const result = (await response.json().catch(() => ({}))) as Record<string, any>;

      if (!response.ok || !result?.success || !result?.executionId) {
        let message: string;

        if (response.status === 401) {
          await logout(true);
          message = 'Sign in to run workflows.';
        } else if (response.status === 404) {
          message = 'Workflow not found. Save the workflow before running.';
        } else if (response.status === 503 || result?.error === 'QUEUE_UNAVAILABLE') {
          const queueTarget = result?.details?.target ? ` (${result.details.target})` : '';
          message =
            result?.message ||
            `Execution queue is unavailable${queueTarget}. Verify worker and Redis health before retrying.`;
        } else if (result?.error === 'EXECUTION_QUOTA_EXCEEDED') {
          message =
            result?.message ||
            'Execution quota exceeded. Wait for the current window to reset before trying again.';
        } else if (result?.error === 'CONNECTOR_CONCURRENCY_EXCEEDED') {
          message =
            result?.message ||
            'Connector concurrency limits were reached. Wait for in-flight runs to finish.';
        } else if (result?.error === 'USAGE_QUOTA_EXCEEDED') {
          const quotaType = result?.details?.quotaType
            ? String(result.details.quotaType).replace(/_/g, ' ').toLowerCase()
            : 'usage';
          message =
            result?.message ||
            `Your ${quotaType} quota has been reached. Adjust limits or try again later.`;
        } else {
          message =
            result?.message ||
            result?.error ||
            `Failed to enqueue workflow execution (status ${response.status}).`;
        }

        setRunBanner({ type: 'error', message });
        toast.error(message);
        return;
      }

      const successMessage = 'Workflow execution enqueued. Redirecting to run viewer…';
      setRunBanner({ type: 'success', message: successMessage });
      toast.success(successMessage);
      navigate(`/runs/${result.executionId}`);
    } catch (error: any) {
      const message = error?.message || 'Failed to enqueue workflow execution';
      setRunBanner({ type: 'error', message });
      toast.error(message);
    } finally {
      setIsRunning(false);
      setTimeout(() => {
        resetExecutionHighlights();
      }, 1200);
    }
  }, [
    queueReady,
    queueStatusMessage,
    prepareWorkflowForExecution,
    onSaveWorkflow,
    setRunBanner,
    computeInitialRunData,
    authFetch,
    logout,
    navigate,
    resetExecutionHighlights,
  ]);

  const onDryRunWorkflow = useCallback(async () => {
    if (validationDebounceRef.current) {
      await validationDebounceRef.current.flush();
    }

    setIsValidating(true);

    try {
      const prepared = await prepareWorkflowForExecution();
      if (!prepared) {
        return;
      }

      const { workflowId: workflowIdentifier, payload } = prepared;

      setNodes((nds) =>
      nds.map((node) => {
        const baseData = applyExecutionStateDefaults(node.data);
        return {
          ...node,
          data: {
            ...baseData,
            executionStatus: 'idle',
            isRunning: false,
            isCompleted: false,
            executionError: null,
          },
        };
      })
    );

      let summaryEvent: any = null;
      let encounteredError = false;

      const response = await authFetch(`/api/workflows/${workflowIdentifier}/execute`, {
        method: 'POST',
        body: JSON.stringify({ graph: payload }),
      });

      if (!response.ok) {
        let message = 'Failed to execute workflow';
        try {
          const text = await response.text();
          if (text) {
            message = `Execute failed: ${response.status} ${text}`;
          } else {
            const errorJson = await response.json();
            message = errorJson?.error || message;
          }
        } catch {}
        throw new Error(message);
      }

      if (!response.body) {
        throw new Error('Execution stream unavailable');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const processEvent = (line: string) => {
        if (!line) return;
        let event: any;
        try {
          event = JSON.parse(line);
        } catch (error) {
          console.warn('Failed to parse execution event', error, line);
          return;
        }

        switch (event.type) {
          case 'node-start':
            updateNodeExecution(event.nodeId, () => ({
              executionStatus: 'running',
              executionError: null,
              isRunning: true,
              isCompleted: false,
            }));
            break;
          case 'node-complete':
            updateNodeExecution(event.nodeId, () => ({
              executionStatus: 'success',
              executionError: null,
              isRunning: false,
              isCompleted: true,
              lastExecution: {
                status: 'success',
                summary: event.result?.summary || `Completed ${event.label || event.nodeId}`,
                result: event.result,
                logs: event.result?.logs || [],
                preview: event.result?.preview,
                finishedAt: event.result?.finishedAt || event.timestamp,
              },
            }));
            break;
          case 'node-error':
            encounteredError = true;
            updateNodeExecution(event.nodeId, () => ({
              executionStatus: 'error',
              isRunning: false,
              isCompleted: false,
              executionError: event.error,
              lastExecution: {
                status: 'error',
                error: event.error,
                finishedAt: event.timestamp,
              },
            }));
            break;
          case 'deployment':
            if (event.success === false) {
              encounteredError = true;
            }
            break;
          case 'summary':
            summaryEvent = event;
            encounteredError = !event.success;
            break;
          default:
            break;
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (line) processEvent(line);
          newlineIndex = buffer.indexOf('\n');
        }
      }

      const remaining = buffer.trim();
      if (remaining) {
        processEvent(remaining);
      }

      const finalSummary = summaryEvent ?? {
        success: !encounteredError,
        message: encounteredError
          ? 'Workflow run completed with errors'
          : 'Workflow run completed successfully',
      };

      const bannerType = finalSummary.success ? 'success' : 'error';
      const bannerMessage =
        finalSummary.message ||
        (finalSummary.success ? 'Workflow executed successfully' : 'Workflow execution failed');

      setRunBanner({ type: bannerType, message: bannerMessage });
      if (bannerType === 'success') {
        toast.success(bannerMessage);
      } else {
        toast.error(bannerMessage);
      }
    } catch (error: any) {
      const message = error?.message || 'Failed to execute workflow';
      setRunBanner({ type: 'error', message });
      toast.error(message);
    } finally {
      setIsValidating(false);
      setTimeout(() => {
        resetExecutionHighlights();
      }, 1200);
    }
  }, [
    prepareWorkflowForExecution,
    authFetch,
    updateNodeExecution,
    setNodes,
    setRunBanner,
    resetExecutionHighlights,
  ]);

  const handleExportWorkflow = useCallback(() => {
    if (!graphHasNodes) {
      toast.error('Add at least one node before exporting');
      return;
    }

    const workflowIdentifier = activeWorkflowId ?? fallbackWorkflowIdRef.current ?? `local-${Date.now()}`;
    const payload = createGraphPayload(workflowIdentifier);

    try {
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const baseName = typeof payload.name === 'string' && payload.name.trim().length > 0
        ? payload.name.trim()
        : 'workflow';
      const sanitizedBase = baseName
        .toLowerCase()
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '') || 'workflow';
      const filename = `${sanitizedBase}-${workflowIdentifier}.json`;

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 0);

      toast.success('Workflow exported');
    } catch (error: any) {
      console.error('Failed to export workflow', error);
      const message = typeof error?.message === 'string' && error.message.trim().length > 0
        ? `Failed to export workflow: ${error.message}`
        : 'Failed to export workflow';
      toast.error(message);
    }
  }, [
    graphHasNodes,
    activeWorkflowId,
    fallbackWorkflowIdRef,
    createGraphPayload,
  ]);

  const handlePromotionDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        if (promotionState === 'publishing') {
          return;
        }
        setPromotionDialogOpen(false);
        setPromotionError(null);
        setPromotionWorkflowId(null);
        setPromotionDiff(null);
        setMigrationPlan({
          freezeActiveRuns: true,
          scheduleRollForward: true,
          scheduleBackfill: true,
          notes: '',
        });
        return;
      }
      setPromotionDialogOpen(true);
    },
    [promotionState],
  );

  const handleOpenPromotionDialog = useCallback(async () => {
    if (promotionState !== 'idle') {
      return;
    }

    if (nodes.length === 0) {
      toast.error('Add at least one node before promoting');
      return;
    }

    setPromotionState('checking');
    setPromotionError(null);
    setPromotionDiff(null);

    const savedId = await onSaveWorkflow();
    const workflowIdentifier = savedId ?? activeWorkflowId ?? fallbackWorkflowIdRef.current ?? null;

    if (!workflowIdentifier) {
      setPromotionState('idle');
      toast.error('Unable to determine workflow id for promotion');
      return;
    }

    try {
      setPromotionWorkflowId(workflowIdentifier);
      const response = await authFetch(`/api/workflows/${workflowIdentifier}/diff/prod`);
      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        diff?: { summary?: WorkflowDiffSummary };
      };

      if (!response.ok || !data?.success) {
        if (response.status === 401) {
          await logout(true);
        }
        throw new Error(data?.error || 'Failed to load workflow diff');
      }

      const summary = data?.diff?.summary as WorkflowDiffSummary | undefined;
      if (!summary) {
        throw new Error('Diff summary unavailable');
      }

      setPromotionDiff(summary);
      setMigrationPlan({
        freezeActiveRuns: true,
        scheduleRollForward: true,
        scheduleBackfill: true,
        notes: '',
      });
      setPromotionDialogOpen(true);
    } catch (error: any) {
      const message = error?.message || 'Failed to load workflow diff';
      setPromotionError(message);
      toast.error(message);
    } finally {
      setPromotionState('idle');
    }
  }, [promotionState, nodes.length, onSaveWorkflow, activeWorkflowId, authFetch, logout]);

  const handleConfirmPromotion = useCallback(async () => {
    if (!promotionWorkflowId) {
      toast.error('Save the workflow before promoting');
      return;
    }

    setPromotionState('publishing');
    setPromotionError(null);

    try {
      const payload: Record<string, any> = { environment: 'production' };
      if (promotionDiff?.hasBreakingChanges) {
        const trimmedNotes = migrationPlan.notes.trim();
        payload.metadata = {
          migration: {
            freezeActiveRuns: migrationPlan.freezeActiveRuns,
            scheduleRollForward: migrationPlan.scheduleRollForward,
            scheduleBackfill: migrationPlan.scheduleBackfill,
            ...(trimmedNotes ? { notes: trimmedNotes } : {}),
          },
        };
      }

      const response = await authFetch(`/api/workflows/${promotionWorkflowId}/publish`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const result = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };

      if (!response.ok || !result?.success) {
        if (response.status === 401) {
          await logout(true);
        }
        throw new Error(result?.error || 'Failed to promote workflow');
      }

      toast.success('Workflow promoted to production');
      setPromotionDialogOpen(false);
      setPromotionWorkflowId(null);
      setPromotionDiff(null);
      setPromotionError(null);
    } catch (error: any) {
      const message = error?.message || 'Failed to promote workflow';
      setPromotionError(message);
      toast.error(message);
    } finally {
      setPromotionState('idle');
    }
  }, [promotionWorkflowId, promotionDiff, migrationPlan, authFetch, logout]);

  const promotionDescription = useMemo(() => {
    if (promotionState !== 'idle') {
      return 'Please wait';
    }
    if (!graphHasNodes) {
      return 'Add nodes to enable';
    }
    return undefined;
  }, [promotionState, graphHasNodes]);

  const saveAction = useMemo<EditorTopBarAction | undefined>(() => {
    if (!graphHasNodes) {
      return undefined;
    }

    return {
      id: 'save',
      label: saveState === 'saving' ? 'Saving…' : 'Save draft',
      onSelect: () => {
        void onSaveWorkflow();
      },
      icon: Save,
      disabled: saveState === 'saving',
    };
  }, [graphHasNodes, saveState, onSaveWorkflow]);

  const promoteAction = useMemo<EditorTopBarAction | undefined>(() => {
    if (!graphHasNodes) {
      return undefined;
    }

    return {
      id: 'promote',
      label:
        promotionState === 'idle'
          ? 'Promote to production'
          : promotionState === 'checking'
            ? 'Preparing…'
            : 'Promoting…',
      onSelect: handleOpenPromotionDialog,
      icon: Upload,
      disabled: promotionState !== 'idle' || !graphHasNodes,
      description: promotionDescription,
    };
  }, [
    graphHasNodes,
    promotionState,
    handleOpenPromotionDialog,
    promotionDescription,
  ]);

  const exportAction = useMemo<EditorTopBarAction | undefined>(() => {
    if (!graphHasNodes) {
      return undefined;
    }

    return {
      id: 'export',
      label: 'Export workflow JSON',
      onSelect: handleExportWorkflow,
      icon: Download,
    };
  }, [graphHasNodes, handleExportWorkflow]);

  const overflowActions = useMemo(() => {
    return [saveAction, promoteAction, exportAction].filter(
      (action): action is EditorTopBarAction => Boolean(action),
    );
  }, [saveAction, promoteAction, exportAction]);

  useEditorKeyboardShortcuts({
    onRun: onRunWorkflow,
    canRun,
    runDisabled,
    onValidate: onDryRunWorkflow,
    canValidate,
    validateDisabled,
  });

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <NodeSidebar
        onAddNode={onAddNode}
        catalog={catalog}
        loading={catalogLoading || connectorDefinitionsLoading}
        connectorDefinitions={connectorDefinitions}
      />
      
      {/* Main Graph Area */}
      <div className="flex-1 flex flex-col relative min-w-0">
        <EditorTopBar
          onRun={onRunWorkflow}
          onValidate={onDryRunWorkflow}
          canRun={canRun}
          canValidate={canValidate}
          isRunning={isRunning}
          isValidating={isValidating}
          workersOnline={workersOnlineCount}
          overflowActions={overflowActions}
        />

        {runBanner ? (
          <div className="px-3 pb-3">
            <Alert
              variant={runBanner.type === 'error' ? 'destructive' : 'default'}
              className={clsx(
                runBanner.type === 'error'
                  ? 'bg-red-500/10 border-red-500/40 text-red-50'
                  : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-50',
              )}
            >
              {runBanner.type === 'error' ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <AlertTitle>{runBanner.type === 'error' ? 'Workflow run failed' : 'Workflow run succeeded'}</AlertTitle>
              <AlertDescription>{runBanner.message}</AlertDescription>
            </Alert>
          </div>
        ) : null}

        <div className="flex-1 min-h-0">
          <ValidationFixContext.Provider value={handleFixValidationError}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            selectionOnDrag={false}
            multiSelectionKeyCode={null}
            panActivationKeyCode={null}
            onPaneClick={(e) => {
              const el = e.target as HTMLElement;
              // Don't clear selection if clicking inside the parameters panel or any input elements
              if (el && typeof el.closest === 'function') {
                if (el.closest('[data-inspector]') ||
                    el.closest('.nodrag') ||
                    el.closest('input') ||
                    el.closest('textarea') ||
                    el.closest('select') ||
                    el.closest('button') ||
                    el.closest('.nopan')) {
                  return;
                }
              }
              // Clear selection only when clicking the actual canvas
              setSelectedNodeId(null);
              setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
            }}
            fitView
            attributionPosition="bottom-left"
            className="bg-gray-100"
          >
            <Background
              color="#e2e8f0"
              gap={20}
              size={1}
              style={{ backgroundColor: '#f3f4f6' }}
            />
            <Controls
              className="bg-white border-gray-200 shadow-sm"
              style={{
                button: { backgroundColor: '#ffffff', borderColor: '#e5e7eb', color: '#374151' }
              }}
            />
            <MiniMap
              className="bg-white border border-gray-200 rounded-lg shadow-sm"
              nodeColor="#3b82f6"
              maskColor="rgba(248, 250, 252, 0.8)"
            />

          {/* Welcome Modal Popup */}
          {showWelcomeModal && nodes.length === 0 && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 transition-all duration-300 ease-out p-4">
              <div className="transform transition-all duration-500 ease-out scale-100 animate-in">
                <Card className="bg-gradient-to-br from-slate-800/95 to-slate-900/95 backdrop-blur-md border-2 border-slate-600/50 w-full max-w-md shadow-[0_20px_50px_rgba(0,0,0,0.5)] ring-1 ring-white/10 rounded-2xl relative">
                  {/* Close Button - Outside of CardContent */}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowWelcomeModal(false)}
                    className="absolute -top-2 -right-2 text-slate-400 hover:text-white hover:bg-slate-700 w-8 h-8 p-0 rounded-full transition-all duration-200 bg-slate-800 border border-slate-600 z-10"
                  >
                    <X className="w-4 h-4" />
                  </Button>

                  <CardContent className="p-6 text-center">

                    <div className="mb-4">
                      <div className="relative mb-3">
                        <Sparkles className="w-12 h-12 text-blue-400 mx-auto mb-2 animate-pulse" />
                        <div className="absolute inset-0 w-12 h-12 mx-auto bg-blue-400/20 rounded-full blur-lg"></div>
                      </div>
                      <h2 className="text-xl font-bold text-white mb-2">Welcome to Workflow Designer</h2>
                      <p className="text-slate-300 text-sm leading-relaxed">
                        Start building your automation by adding nodes from the sidebar.
                      </p>
                    </div>
                    
                    <div className="space-y-2 text-left mb-4">
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                        <div className="w-3 h-3 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                        <span className="text-slate-200 text-xs font-medium">Green nodes are triggers</span>
                      </div>
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                        <div className="w-3 h-3 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                        <span className="text-slate-200 text-xs font-medium">Blue nodes are actions</span>
                      </div>
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                        <div className="w-3 h-3 bg-purple-500 rounded-full shadow-[0_0_8px_rgba(168,85,247,0.5)]"></div>
                        <span className="text-slate-200 text-xs font-medium">Purple nodes transform data</span>
                      </div>
                    </div>

                    <Button
                      onClick={() => setShowWelcomeModal(false)}
                      className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-4 py-2 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 w-full"
                    >
                      Get Started
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
            </ReactFlow>
          </ValidationFixContext.Provider>
        </div>
      </div>
      
      {/* Node Properties Panel - Enterprise Design */}
      {selectedNode && (
        <div
          data-inspector
          className="workflow-inspector-panel w-96 bg-gradient-to-br from-slate-50 to-white border-l-2 border-slate-200 shadow-xl overflow-y-auto nopan"
          onPointerDown={(e) => { e.stopPropagation(); }}
          onPointerUp={(e) => { e.stopPropagation(); }}
          onMouseDown={(e) => { e.stopPropagation(); }}
          onMouseUp={(e) => { e.stopPropagation(); }}
          onClick={(e) => { e.stopPropagation(); }}
          onDoubleClick={(e) => { e.stopPropagation(); }}
          onPointerDownCapture={(e) => { e.stopPropagation(); const ne: any = (e as any).nativeEvent; if (ne?.stopImmediatePropagation) ne.stopImmediatePropagation(); }}
          onMouseDownCapture={(e) => { e.stopPropagation(); const ne: any = (e as any).nativeEvent; if (ne?.stopImmediatePropagation) ne.stopImmediatePropagation(); }}
          onClickCapture={(e) => { e.stopPropagation(); const ne: any = (e as any).nativeEvent; if (ne?.stopImmediatePropagation) ne.stopImmediatePropagation(); }}
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
          style={{ pointerEvents: 'auto' }}
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
                  <p className="text-xs text-blue-100 mt-0.5">{selectedNode?.type}</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setSelectedNodeId(null); setNodes((nds) => nds.map((n) => ({ ...n, selected: false }))); }}
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
                    <Activity className={clsx('w-4 h-4', lastExecution?.status === 'success' ? 'text-emerald-500' : lastExecution?.status === 'error' ? 'text-red-500' : 'text-blue-500')} />
                    <span className="text-sm font-semibold text-slate-700">Last execution</span>
                  </div>
                  <Badge className={clsx(
                    'text-xs',
                    lastExecution?.status === 'success'
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                      : lastExecution?.status === 'error'
                      ? 'bg-red-100 text-red-700 border-red-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  )}>
                    {lastExecution?.status === 'success' ? 'Success' : lastExecution?.status === 'error' ? 'Failed' : 'Completed'}
                  </Badge>
                </div>
                <div className="mt-3 space-y-2 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>{lastExecution?.finishedAt ? new Date(lastExecution.finishedAt).toLocaleString() : 'Just now'}</span>
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
                    setNodes((nds) => nds.map((n) => (n.id === selectedNode?.id ? { ...n, data: { ...n.data, label: next } } : n)));
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
                    setNodes((nds) => nds.map((n) => (n.id === selectedNode?.id ? { ...n, data: { ...n.data, description: next } } : n)));
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
                    value={String((selectedNode?.data as any)?.connectionId || '')}
                    onChange={(e) => {
                      const next = e.target.value;
                      setNodes((nds) => nds.map((n) => {
                        if (n.id !== selectedNode?.id) return n;
                        const baseData: any = { ...(n.data || {}) };
                        const params: any = { ...(baseData.parameters || baseData.params || {}) };
                        baseData.connectionId = next || undefined;
                        baseData.auth = { ...(baseData.auth || {}), connectionId: next || undefined };
                        params.connectionId = next || undefined;
                        return { ...n, data: { ...baseData, parameters: params, params } } as any;
                      }));
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
                  {selectedNode && nodeRequiresConnection(selectedNode) && (
                    <Alert className="bg-amber-50 border-amber-200 text-amber-900">
                      <AlertDescription className="flex flex-col gap-2">
                        This step needs a connected account. Use the button below to connect one—it’s the easiest option for non-technical users.
                        <Button
                          size="sm"
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!selectedNode) {
                              toast.error('Select a node to configure');
                              return;
                            }
                            // Ensure the node stays selected
                            setSelectedNodeId(String(selectedNode.id));
                            toast.message('Opening connection setup…');
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
                      if (!selectedNode) return;

                      if (!text) {
                        setNodes((nds) =>
                          nds.map((n) => {
                            if (n.id !== selectedNode.id) return n;
                            const baseData: any = { ...(n.data || {}) };
                            const params: any = { ...(baseData.parameters || baseData.params || {}) };
                            delete baseData.credentials;
                            if (params.credentials !== undefined) delete params.credentials;
                            return { ...n, data: { ...baseData, parameters: params, params } } as any;
                          })
                        );
                        setCredentialsDraft('');
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
                          })
                        );
                        setCredentialsDraft(JSON.stringify(parsed, null, 2));
                        toast.success('Inline credentials saved');
                      } catch (err) {
                        toast.error('Invalid JSON. Please enter valid credentials.');
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
                onRefreshConnectors={handleRefreshConnectorMetadata}
                isRefreshingConnectors={connectorDefinitionsLoading}
                metadataError={connectorDefinitionsError}
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
                    if (selectedNode) openNodeConfigModal(selectedNode);
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
                    if (selectedNode) {
                      const newNode = {
                        ...selectedNode,
                        id: `${selectedNode.type}-${Date.now()}`,
                        position: {
                          x: selectedNode.position.x + 50,
                          y: selectedNode.position.y + 50
                        },
                        data: {
                          ...selectedNode.data,
                          label: `${selectedNode.data.label} (Copy)`
                        }
                      };
                      setNodes((nds) => [...nds, newNode]);
                      setSelectedNodeId(newNode.id);
                    }
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
                    setNodes((nds) => nds.filter((n) => n.id !== selectedNode?.id));
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
      )}
      <Dialog open={promotionDialogOpen} onOpenChange={handlePromotionDialogOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Promote workflow to production</DialogTitle>
            <DialogDescription>
              Review the pending changes before deploying to the production environment.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {promotionDiff ? (
              <>
                {promotionDiff.hasChanges ? (
                  <div className="grid gap-2 text-sm text-slate-700">
                    {promotionDiff.addedNodes.length > 0 && (
                      <div>
                        <span className="font-semibold text-slate-900">Added nodes:</span>{' '}
                        <span>{promotionDiff.addedNodes.join(', ')}</span>
                      </div>
                    )}
                    {promotionDiff.removedNodes.length > 0 && (
                      <div>
                        <span className="font-semibold text-slate-900">Removed nodes:</span>{' '}
                        <span>{promotionDiff.removedNodes.join(', ')}</span>
                      </div>
                    )}
                    {promotionDiff.modifiedNodes.length > 0 && (
                      <div>
                        <span className="font-semibold text-slate-900">Modified nodes:</span>{' '}
                        <span>{promotionDiff.modifiedNodes.join(', ')}</span>
                      </div>
                    )}
                    {promotionDiff.addedEdges.length > 0 && (
                      <div>
                        <span className="font-semibold text-slate-900">Added edges:</span>{' '}
                        <span>{promotionDiff.addedEdges.join(', ')}</span>
                      </div>
                    )}
                    {promotionDiff.removedEdges.length > 0 && (
                      <div>
                        <span className="font-semibold text-slate-900">Removed edges:</span>{' '}
                        <span>{promotionDiff.removedEdges.join(', ')}</span>
                      </div>
                    )}
                    {promotionDiff.metadataChanged && (
                      <div className="italic text-slate-600">Workflow metadata will be updated.</div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No structural changes detected since the last deployment.
                  </p>
                )}

                {promotionDiff.hasBreakingChanges ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Breaking changes detected</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc pl-5 space-y-1 text-left">
                        {promotionDiff.breakingChanges.map((change, index) => (
                          <li key={`${change.nodeId}-${change.type}-${index}`}>
                            <span className="font-semibold">{change.nodeId}:</span> {change.description}
                          </li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="bg-emerald-50 border-emerald-200 text-emerald-800">
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>No breaking changes</AlertTitle>
                    <AlertDescription>
                      This promotion does not remove outputs or change downstream schemas.
                    </AlertDescription>
                  </Alert>
                )}

                {promotionDiff.hasBreakingChanges && (
                  <div className="space-y-4 rounded-lg border border-slate-200 p-4">
                    <h4 className="text-sm font-semibold text-slate-900">Migration plan</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <Label htmlFor="freeze-active-runs" className="text-sm font-medium text-slate-700">
                            Freeze active runs
                          </Label>
                          <p className="text-xs text-slate-500">
                            Pause in-flight executions before activating the new version.
                          </p>
                        </div>
                        <Switch
                          id="freeze-active-runs"
                          checked={migrationPlan.freezeActiveRuns}
                          onCheckedChange={(checked) =>
                            setMigrationPlan((plan) => ({ ...plan, freezeActiveRuns: checked }))
                          }
                          disabled={promotionState === 'publishing'}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <Label htmlFor="schedule-roll-forward" className="text-sm font-medium text-slate-700">
                            Schedule roll-forward jobs
                          </Label>
                          <p className="text-xs text-slate-500">
                            Automatically queue follow-up tasks to migrate future runs.
                          </p>
                        </div>
                        <Switch
                          id="schedule-roll-forward"
                          checked={migrationPlan.scheduleRollForward}
                          onCheckedChange={(checked) =>
                            setMigrationPlan((plan) => ({ ...plan, scheduleRollForward: checked }))
                          }
                          disabled={promotionState === 'publishing'}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <Label htmlFor="schedule-backfill" className="text-sm font-medium text-slate-700">
                            Schedule backfill jobs
                          </Label>
                          <p className="text-xs text-slate-500">
                            Ensure historical data stays consistent with the new schema.
                          </p>
                        </div>
                        <Switch
                          id="schedule-backfill"
                          checked={migrationPlan.scheduleBackfill}
                          onCheckedChange={(checked) =>
                            setMigrationPlan((plan) => ({ ...plan, scheduleBackfill: checked }))
                          }
                          disabled={promotionState === 'publishing'}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="migration-notes" className="text-sm font-medium text-slate-700">
                          Roll-forward and backfill notes
                        </Label>
                        <Textarea
                          id="migration-notes"
                          value={migrationPlan.notes}
                          onChange={(event) =>
                            setMigrationPlan((plan) => ({ ...plan, notes: event.target.value }))
                          }
                          placeholder="Document how you will freeze active runs, roll forward, and backfill data."
                          disabled={promotionState === 'publishing'}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Fetching latest diff…</p>
            )}

            {promotionError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{promotionError}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handlePromotionDialogOpenChange(false)}
              disabled={promotionState === 'publishing'}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmPromotion}
              disabled={promotionState === 'publishing' || !promotionWorkflowId}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {promotionState === 'publishing' ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Promoting…
                </>
              ) : (
                <>Promote to production</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Node Configuration Modal */}
      {configOpen && selectedNode && (
        <NodeConfigurationModal
          isOpen={configOpen}
          onClose={() => setConfigOpen(false)}
          nodeData={configNodeData || {
            id: String(selectedNode.id),
            type: String(selectedNode.type).startsWith('trigger') ? 'trigger' : 'action',
            appName: normalizeAppName(selectedNode?.data?.app || ''),
            functionId: selectedNode?.data?.actionId || selectedNode?.data?.triggerId || selectedNode?.data?.function || selectedNode?.data?.operation,
            label: selectedNode?.data?.label || String(selectedNode.id),
            parameters: selectedNode?.data?.parameters || selectedNode?.data?.params || {},
            connectionId: selectedNode?.data?.connectionId || selectedNode?.data?.auth?.connectionId || (selectedNode?.data?.parameters || {}).connectionId
          }}
          onSave={handleNodeConfigSave}
          availableFunctions={configFunctions}
          connections={configConnections}
          oauthProviders={configOAuthProviders}
          onConnectionCreated={handleConnectionCreated}
        />
      )}
    </div>
  );
};

// Main Component with Provider
export default function ProfessionalGraphEditor() {
  return (
    <ReactFlowProvider>
      <GraphEditorContent />
    </ReactFlowProvider>
  );
}
