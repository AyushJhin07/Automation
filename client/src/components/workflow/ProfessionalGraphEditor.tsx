// PROFESSIONAL N8N-STYLE GRAPH EDITOR
// Beautiful visual workflow builder with smooth animations

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
import { Textarea } from '../ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import SmartParametersPanel, { syncNodeParameters } from './SmartParametersPanel';
import { buildMetadataFromNode } from './metadata';
import { normalizeWorkflowNode } from './graphSync';
import { applyExecutionStateDefaults, sanitizeExecutionState, serializeGraphPayload } from './graphPayload';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../ui/accordion';
import { AIParameterEditor } from './AIParameterEditor';
import { useSpecStore } from '../../state/specStore';
import { specToReactFlow } from '../../graph/transform';
import { 
  Plus,
  Play,
  Save,
  Download,
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
  Brain,
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
  Link
} from 'lucide-react';
import { NodeGraph, GraphNode, VisualNode } from '../../../shared/nodeGraphSchema';
import clsx from 'clsx';
import { toast } from 'sonner';
import { NodeConfigurationModal } from './NodeConfigurationModal';

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
const appIconsMap: Record<string, any> = {
  // Built-in
  'built_in': AppWindow,
  
  // Google Workspace
  'gmail': Mail,
  'gmail-enhanced': Mail,
  'google-admin': Shield,
  'google-calendar': Calendar,
  'google-chat': MessageSquare,
  'google-contacts': Users,
  'google-docs': FileText,
  'google-drive': Folder,
  'google-forms': FileText,
  'google-meet': Video,
  'google-sheets': Sheet,
  'google-sheets-enhanced': Sheet,
  'google-slides': FileText,
  
  // Microsoft
  'excel-online': Sheet,
  'microsoft-teams': Video,
  'microsoft-todo': Settings,
  'onedrive': Folder,
  'outlook': Mail,
  'sharepoint': Folder,
  
  // Communication
  'slack': MessageSquare,
  'slack-enhanced': MessageSquare,
  'webex': Video,
  'ringcentral': Phone,
  'twilio': Phone,
  'intercom': MessageSquare,
  
  // CRM & Sales
  'salesforce': Database,
  'salesforce-enhanced': Database,
  'hubspot': Database,
  'hubspot-enhanced': Database,
  'pipedrive': Database,
  'dynamics365': Database,
  'zoho-crm': Database,
  
  // E-commerce & Payments
  'shopify': Database,
  'shopify-enhanced': ShoppingCart,
  'bigcommerce': ShoppingCart,
  'magento': ShoppingCart,
  'woocommerce': ShoppingCart,
  'paypal': CreditCard,
  'square': CreditCard,
  'stripe-enhanced': CreditCard,
  'adyen': CreditCard,
  'ramp': CreditCard,
  'brex': CreditCard,
  'razorpay': CreditCard,
  
  // Project Management & Productivity
  'jira': Settings,
  'jira-service-management': Settings,
  'confluence': FileText,
  'basecamp': Box,
  'clickup': Settings,
  'linear': Settings,
  'monday-enhanced': Settings,
  'notion': FileText,
  'notion-enhanced': FileText,
  'smartsheet': Sheet,
  'trello-enhanced': Settings,
  'workfront': Settings,
  
  // Development & DevOps
  'github': Settings,
  'github-enhanced': Settings,
  'gitlab': Settings,
  'jenkins': Settings,
  'circleci': Settings,
  'bitbucket': Settings,
  
  // Data & Analytics
  'bigquery': Database,
  'databricks': BarChart,
  'snowflake': Database,
  'tableau': BarChart,
  'looker': BarChart,
  'powerbi': BarChart,
  'powerbi-enhanced': BarChart,
  
  // HR & Recruitment
  'workday': Users,
  'bamboohr': Users,
  'greenhouse': Users,
  'lever': Users,
  'successfactors': Users,
  'adp': DollarSign,
  
  // Finance & Accounting
  'quickbooks': DollarSign,
  'xero': Calculator,
  'zoho-books': Calculator,
  'netsuite': Database,
  'sageintacct': Calculator,
  'concur': DollarSign,
  'expensify': DollarSign,
  
  // Marketing & Email
  'marketo': BarChart,
  'pardot': BarChart,
  'iterable': Mail,
  'braze': Mail,
  'mailchimp': Mail,
  'mailchimp-enhanced': Mail,
  'klaviyo': Mail,
  'sendgrid': Mail,
  
  // Monitoring & Security
  'sentry': AlertTriangle,
  'newrelic': Activity,
  'datadog': Activity,
  'okta': Shield,
  'pagerduty': AlertTriangle,
  'opsgenie': AlertTriangle,
  'victorops': AlertTriangle,
  
  // File Storage & Docs
  'dropbox': Folder,
  'dropbox-enhanced': Folder,
  'box': Folder,
  'egnyte': Folder,
  'coda': FileText,
  'guru': BookOpen,
  'slab': BookOpen,
  
  // E-signature
  'docusign': FileText,
  'adobesign': FileText,
  'hellosign': FileText,
  
  // Scheduling
  'calendly': Calendar,
  'caldotcom': Calendar,
  
  // Surveys & Forms
  'typeform': FileText,
  'jotform': FileText,
  'qualtrics': BarChart,
  'surveymonkey': BarChart,
  
  // Enhanced & Miscellaneous
  'airtable-enhanced': Database,
  'asana-enhanced': Settings,
  'servicenow': Settings,
  'freshdesk': Users,
  'zendesk': Users,
  'coupa': DollarSign,
  'navan': MapPin,
  'sap-ariba': Database,
  'zoom-enhanced': Video,
  
  'default': Zap
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


const getAppIcon = (appName: string) => {
  return appIconsMap[appName.toLowerCase()] || appIconsMap.default;
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

// Custom Node Components
const TriggerNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const status = (data?.executionStatus ?? 'idle') as ExecutionStatus;
  const statusLabel = STATUS_LABELS[status];
  const ringClass = STATUS_RING[status];
  const indicatorClass = STATUS_INDICATOR[status];

  return (
    <div
      className={clsx(
        'relative bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg border-2 transition-all duration-300 ease-out',
        selected ? 'border-white shadow-xl scale-105' : 'border-green-400/30',
        'hover:shadow-2xl hover:scale-102 min-w-[200px] max-w-[280px]',
        ringClass
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

const ActionNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const status = (data?.executionStatus ?? 'idle') as ExecutionStatus;
  const ringClass = STATUS_RING[status];
  const indicatorClass = STATUS_INDICATOR[status];
  const statusLabel = STATUS_LABELS[status];

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
        ringClass
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

const TransformNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const status = (data?.executionStatus ?? 'idle') as ExecutionStatus;
  const ringClass = STATUS_RING[status];
  const indicatorClass = STATUS_INDICATOR[status];
  const statusLabel = STATUS_LABELS[status];

  return (
    <div
      className={clsx(
        'relative bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl shadow-lg border-2 transition-all duration-300 ease-out',
        selected ? 'border-white shadow-xl scale-105' : 'border-purple-400/30',
        'hover:shadow-2xl hover:scale-102 min-w-[200px] max-w-[280px]',
        ringClass
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
const BrandIcon: React.FC<{ appId: string; appName: string; appIcons: Record<string, any> }> = ({ appId, appName, appIcons }) => {
  const Icon = appIcons[appId] || appIcons.default;

  return (
    <div className="group relative">
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
        {Icon && <Icon className="absolute w-5 h-5 text-white/90" />}
      </div>
    </div>
  );
};

// Sidebar Component (REPLACEMENT)
const NodeSidebar = ({ onAddNode }: { onAddNode: (nodeType: string, nodeData: any) => void }) => {
  // Search & filters
  const [searchTerm, setSearchTerm] = useState(() => {
    return localStorage.getItem('sidebar_search') || "";
  });
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [loading, setLoading] = useState(true);

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
    icon?: any;                            // lucide fallback
    actions: NodeTpl[];
    triggers: NodeTpl[];
  };

  const [apps, setApps] = useState<Record<string, AppGroup>>({});
  const [categories, setCategories] = useState<string[]>([]);

  // Persist user preferences
  useEffect(() => {
    localStorage.setItem('sidebar_search', searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    localStorage.setItem('sidebar_category', selectedCategory);
  }, [selectedCategory]);

  useEffect(() => {
    void loadFromRegistry();
  }, []);

  const loadFromRegistry = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/registry/catalog");
      const json = await res.json();

      const nextApps: Record<string, AppGroup> = {};
      const catSet = new Set<string>();

      // 1) Built-in utilities (time triggers etc.) – keep as its own "Built-in" app
      const builtInId = "built_in";
      nextApps[builtInId] = {
        appId: builtInId,
        appName: "Built-in",
        category: "Built-in",
        icon: appIconsMap[builtInId],
        actions: [
          {
            id: "action-http-request",
            kind: "action",
            name: "HTTP Request",
            description: "Call external API",
            nodeType: "action.http.request",
            params: { method: "GET", url: "", headers: {} },
          },
          {
            id: "transform-format-text",
            kind: "transform",
            name: "Format Text",
            description: "Template interpolation",
            nodeType: "transform.format.text",
          },
          {
            id: "transform-filter-data",
            kind: "transform",
            name: "Filter Data",
            description: "Filter items by condition",
            nodeType: "transform.filter.data",
          },
        ],
        triggers: [
          {
            id: "trigger-every-15-min",
            kind: "trigger",
            name: "Every 15 Minutes",
            description: "Run every 15 minutes",
            nodeType: "trigger.time.every15",
            params: { everyMinutes: 15 },
          },
          {
            id: "trigger-every-hour",
            kind: "trigger",
            name: "Every Hour",
            description: "Run every hour",
            nodeType: "trigger.time.hourly",
            params: { everyMinutes: 60 },
          },
          {
            id: "trigger-daily-9am",
            kind: "trigger",
            name: "Daily at 9 AM",
            description: "Run daily at 9 AM",
            nodeType: "trigger.time.daily9",
            params: { atHour: 9 },
          },
        ],
      };
      catSet.add("Built-in");

      // 2) Real connectors from registry
      if (json?.success && json?.catalog?.connectors) {
        for (const [appId, def] of Object.entries<any>(json.catalog.connectors)) {
          const appName = def.name || appId;
          const category = def.category || "Business Apps";
          catSet.add(category);

          const Icon = appIconsMap[appId] || appIconsMap.default;

          const actions: NodeTpl[] = (def.actions || []).map((a: any) => ({
            id: `action-${appId}-${a.id}`,
            kind: "action",
            name: a.name,
            description: a.description || "",
            nodeType: `action.${appId}.${a.id}`,
            params: a.parameters || {},
          }));

          const triggers: NodeTpl[] = (def.triggers || []).map((t: any) => ({
            id: `trigger-${appId}-${t.id}`,
            kind: "trigger",
            name: t.name,
            description: t.description || "",
            nodeType: `trigger.${appId}.${t.id}`,
            params: t.parameters || {},
          }));

          nextApps[appId] = {
            appId,
            appName,
            category,
            icon: Icon,
            actions,
            triggers,
          };
        }
      }

      setApps(nextApps);
      setCategories(["all", ...Array.from(catSet).sort()]);
      console.log(`🎊 Loaded ${Object.keys(nextApps).length} applications from registry`);
    } catch (e) {
      console.error("Failed to load catalog:", e);
    } finally {
      setLoading(false);
    }
  };

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
        {!loading && (
          <div className="text-xs text-gray-500 mt-2">
            {filteredNodes} of {totalNodes} nodes
            {search && <span className="ml-1">• Searching</span>}
          </div>
        )}
      </div>

      {/* Apps list */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
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
              <AccordionItem key={app.appId} value={app.appId} className="border border-gray-200 rounded-xl bg-white shadow-sm">
                <AccordionTrigger className="px-3 py-2 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <BrandIcon appId={app.appId} appName={app.appName} appIcons={appIconsMap} />
                    <div className="flex flex-col text-left">
                      <span className="text-gray-900 font-medium">{app.appName}</span>
                      <span className="text-xs text-gray-500">{app.category}</span>
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
  );
};

// Main Graph Editor Component
const GraphEditorContent = () => {
  const fallbackWorkflowIdRef = useRef<string>(`local-${Date.now()}`);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isRunning, setIsRunning] = useState(false);
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
    const connectionId = node?.data?.connectionId || node?.data?.auth?.connectionId || params?.connectionId;

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
        const token = localStorage.getItem('token');
        const headers: Record<string, string> = {};
        if (token && token !== 'null' && token !== 'undefined') {
          headers['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch('/api/connections', {
          headers: Object.keys(headers).length > 0 ? headers : undefined
        });
        const j = await res.json().catch(() => ({}));
        const list = j?.connections || [];
        setConfigConnections(Array.isArray(list) ? list : []);
      } catch {
        setConfigConnections([]);
      }

      // Fetch OAuth providers (public)
      try {
        const res = await fetch('/api/oauth/providers');
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
    if (nodes.length === 0) {
      return;
    }

    const missingConnectionNode = nodes.find((node) => nodeRequiresConnection(node));
    if (missingConnectionNode) {
      const missingLabel = missingConnectionNode.data?.label || missingConnectionNode.id;
      const message = `Connect an account for "${missingLabel}" before running`;
      setRunBanner({ type: 'error', message });
      toast.error(message);
      await openNodeConfigModal(missingConnectionNode);
      return;
    }

    const workflowIdentifier = activeWorkflowId ?? fallbackWorkflowIdRef.current ?? `local-${Date.now()}`;
    if (!activeWorkflowId || activeWorkflowId !== workflowIdentifier) {
      setActiveWorkflowId(workflowIdentifier);
    }

    try {
      localStorage.setItem('lastWorkflowId', workflowIdentifier);
    } catch (error) {
      console.warn('Unable to persist workflow id:', error);
    }

    const payload = createGraphPayload(workflowIdentifier);

    setRunBanner(null);
    setIsRunning(true);

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
            executionError: null
          }
        };
      })
    );

    let summaryEvent: any = null;
    let encounteredError = false;

    try {
      const response = await fetch(`/api/workflows/${workflowIdentifier}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph: payload })
      });

      if (!response.ok) {
        let message = 'Failed to execute workflow';
        try {
          const errorJson = await response.json();
          message = errorJson?.error || message;
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
              isCompleted: false
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
                finishedAt: event.result?.finishedAt || event.timestamp
              }
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
                finishedAt: event.timestamp
              }
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
        message: encounteredError ? 'Workflow run completed with errors' : 'Workflow run completed successfully'
      };

      const bannerType = finalSummary.success ? 'success' : 'error';
      const bannerMessage = finalSummary.message || (finalSummary.success ? 'Workflow executed successfully' : 'Workflow execution failed');

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
      encounteredError = true;
    } finally {
      setIsRunning(false);
      setTimeout(() => {
        resetExecutionHighlights();
      }, 1200);
    }
  }, [nodes, activeWorkflowId, createGraphPayload, updateNodeExecution, resetExecutionHighlights, setNodes, setActiveWorkflowId]);
  
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <NodeSidebar onAddNode={onAddNode} />
      
      {/* Main Graph Area */}
      <div className="flex-1 relative">
        {/* Top Toolbar */}
        <div className="absolute top-4 left-4 right-4 z-10">
          <Card className="bg-slate-800/90 backdrop-blur-sm border-slate-700">
            <CardContent className="p-3">
              {runBanner && (
                <Alert
                  variant={runBanner.type === 'error' ? 'destructive' : 'default'}
                  className={clsx(
                    'mb-3',
                    runBanner.type === 'error'
                      ? 'bg-red-500/10 border-red-500/40 text-red-50'
                      : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-50'
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
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h1 className="text-white font-bold text-lg flex items-center gap-2">
                    <Brain className="w-5 h-5 text-blue-400" />
                    Workflow Designer
                  </h1>
                  <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                    {nodes.length} nodes
                  </Badge>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    onClick={onRunWorkflow}
                    disabled={isRunning || nodes.length === 0}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isRunning ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Run Workflow
                      </>
                    )}
                  </Button>
                  
                  <Button variant="outline" className="bg-slate-700 text-white border-slate-600 hover:bg-slate-600">
                    <Save className="w-4 h-4 mr-2" />
                    Save
                  </Button>
                  
                  <Button variant="outline" className="bg-slate-700 text-white border-slate-600 hover:bg-slate-600">
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* ReactFlow */}
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
      </div>
      
      {/* Node Properties Panel - Enterprise Design */}
      {selectedNode && (
        <div
          data-inspector
          className="w-96 bg-gradient-to-br from-slate-50 to-white border-l-2 border-slate-200 shadow-xl overflow-y-auto nopan"
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
              <SmartParametersPanel />
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
