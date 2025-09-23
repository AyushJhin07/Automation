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
import SmartParametersPanel, { syncNodeParameters } from './SmartParametersPanel';
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
  Calculator
} from 'lucide-react';
import { NodeGraph, GraphNode, VisualNode } from '../../../shared/nodeGraphSchema';
import clsx from 'clsx';

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

type WorkflowMetadata = {
  columns?: string[];
  sample?: Record<string, any> | any[];
  schema?: Record<string, any>;
  derivedFrom?: string[];
};

const canonicalizeMetadataKey = (value: unknown): string => {
  if (value == null) return '';
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const mergeMetadataValues = (
  ...sources: Array<WorkflowMetadata | null | undefined>
): WorkflowMetadata => {
  const columns = new Set<string>();
  const derivedFrom = new Set<string>();
  let sampleObject: Record<string, any> | null = null;
  let sampleArray: any[] | null = null;
  let scalarSample: any;
  let schema: Record<string, any> = {};
  let hasSchema = false;

  sources.forEach((source) => {
    if (!source) return;
    source.columns?.forEach((col) => {
      if (typeof col === 'string' && col.trim()) columns.add(col);
    });
    source.derivedFrom?.forEach((item) => {
      if (item) derivedFrom.add(item);
    });
    const sample = source.sample;
    if (Array.isArray(sample)) {
      if (!sampleArray) sampleArray = sample;
    } else if (sample && typeof sample === 'object') {
      sampleObject = { ...(sampleObject ?? {}), ...sample };
    } else if (sample !== undefined && scalarSample === undefined) {
      scalarSample = sample;
    }
    if (source.schema) {
      schema = { ...schema, ...source.schema };
      hasSchema = true;
    }
  });

  const result: WorkflowMetadata = {};
  if (columns.size) result.columns = Array.from(columns);
  if (derivedFrom.size) result.derivedFrom = Array.from(derivedFrom);
  if (sampleArray) result.sample = sampleArray;
  else if (sampleObject) result.sample = sampleObject;
  else if (scalarSample !== undefined) result.sample = scalarSample;
  if (hasSchema) result.schema = schema;
  return result;
};

const collectColumnsFromAny = (source: unknown): string[] => {
  if (!source) return [];
  const result = new Set<string>();
  const visit = (value: unknown, depth = 0) => {
    if (value == null || depth > 2) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, depth + 1));
      return;
    }
    if (typeof value === 'string') {
      value
        .split(/[\n,|,]/)
        .map((v) => v.trim())
        .filter(Boolean)
        .forEach((v) => result.add(v));
      return;
    }
    if (typeof value === 'object') {
      Object.entries(value as Record<string, any>).forEach(([key, val]) => {
        const lower = key.toLowerCase();
        if (
          ['columns', 'headers', 'fields', 'fieldnames', 'selectedcolumns', 'columnnames'].some((token) =>
            lower.includes(token)
          )
        ) {
          visit(val, depth + 1);
        } else if (depth === 0 && val && typeof val === 'object' && !Array.isArray(val)) {
          Object.keys(val as Record<string, any>).forEach((k) => {
            if (k) result.add(k);
          });
        }
      });
    }
  };
  visit(source);
  return Array.from(result);
};

const lookupValueInSource = (source: unknown, key: string, depth = 0): any => {
  if (!source || depth > 3) return undefined;
  if (Array.isArray(source)) {
    for (const entry of source) {
      const val = lookupValueInSource(entry, key, depth + 1);
      if (val !== undefined) return val;
    }
    return undefined;
  }
  if (typeof source !== 'object') return undefined;
  for (const [entryKey, entryValue] of Object.entries(source as Record<string, any>)) {
    const normalized = canonicalizeMetadataKey(entryKey).replace(/-/g, '_');
    if (normalized === key || normalized.replace(/_/g, '') === key.replace(/_/g, '')) {
      return entryValue;
    }
    if (entryValue && typeof entryValue === 'object') {
      const nested = lookupValueInSource(entryValue, key, depth + 1);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
};

const inferValueType = (value: any): string => {
  if (value === null || value === undefined) return 'string';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (!Number.isNaN(numeric) && value.trim() !== '') return 'number';
  }
  return 'string';
};

const buildMetadataFromNode = (node: any): WorkflowMetadata => {
  const merged = mergeMetadataValues(
    node?.metadata,
    node?.data?.metadata,
    node?.data?.outputMetadata,
    node?.outputMetadata
  );

  const params =
    node?.data?.config ?? node?.data?.parameters ?? node?.params ?? node?.config ?? node?.data?.params ?? {};

  const configColumns = collectColumnsFromAny(params);
  const schemaColumns = merged.schema ? Object.keys(merged.schema) : [];
  const combinedColumns = Array.from(
    new Set([...(merged.columns || []), ...configColumns, ...schemaColumns])
  ).filter((col): col is string => typeof col === 'string' && col.trim().length > 0);

  let metadata = mergeMetadataValues(merged, {
    columns: combinedColumns.length ? combinedColumns : undefined,
  });

  const columns = metadata.columns || [];

  let sample = metadata.sample;
  if (
    columns.length > 0 &&
    (!sample || (typeof sample === 'object' && !Array.isArray(sample) && Object.keys(sample as Record<string, any>).length === 0))
  ) {
    const generated: Record<string, any> = {};
    const valuesArray = Array.isArray(params?.values) ? params.values : null;
    columns.forEach((column, index) => {
      const normalized = canonicalizeMetadataKey(column).replace(/-/g, '_');
      const fromParams = lookupValueInSource(params, normalized);
      if (fromParams !== undefined && fromParams !== null && fromParams !== '') {
        generated[column] = fromParams;
        return;
      }
      if (valuesArray && index < valuesArray.length) {
        generated[column] = valuesArray[index];
        return;
      }
      if (merged.sample && typeof merged.sample === 'object' && !Array.isArray(merged.sample) && column in merged.sample) {
        generated[column] = (merged.sample as Record<string, any>)[column];
        return;
      }
      generated[column] = `{{${normalized}}}`;
    });
    sample = generated;
  }

  if (sample) {
    metadata = mergeMetadataValues(metadata, { sample });
  }

  let schema = metadata.schema;
  if ((!schema || Object.keys(schema).length === 0) && columns.length > 0) {
    const generatedSchema: Record<string, any> = {};
    const sampleObj =
      sample && typeof sample === 'object' && !Array.isArray(sample) ? (sample as Record<string, any>) : undefined;
    columns.forEach((column) => {
      const example = sampleObj?.[column];
      generatedSchema[column] = {
        type: inferValueType(example),
        example,
      };
      if (schema && schema[column]) {
        generatedSchema[column] = { ...schema[column], ...generatedSchema[column] };
      }
    });
    schema = generatedSchema;
  }

  if (schema && Object.keys(schema).length > 0) {
    metadata = mergeMetadataValues(metadata, { schema });
  }

  return metadata;
};

// Custom Node Components
const TriggerNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div 
      className={`
        relative bg-gradient-to-br from-green-500 to-emerald-600 
        rounded-xl shadow-lg border-2 transition-all duration-300 ease-out
        ${selected ? 'border-white shadow-xl scale-105' : 'border-green-400/30'}
        hover:shadow-2xl hover:scale-102 min-w-[200px] max-w-[280px]
      `}
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
            <div className="w-2 h-2 bg-green-300 rounded-full animate-pulse"></div>
            <span className="text-green-100">Active</span>
          </div>
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
  
  const getIcon = () => {
    if (data.app === 'Gmail') return <Mail className="w-4 h-4 text-white" />;
    if (data.app === 'Google Sheets') return <Sheet className="w-4 h-4 text-white" />;
    if (data.app === 'Google Calendar') return <Calendar className="w-4 h-4 text-white" />;
    return <Zap className="w-4 h-4 text-white" />;
  };
  
  return (
    <div 
      className={`
        relative bg-gradient-to-br from-blue-500 to-indigo-600 
        rounded-xl shadow-lg border-2 transition-all duration-300 ease-out
        ${selected ? 'border-white shadow-xl scale-105' : 'border-blue-400/30'}
        hover:shadow-2xl hover:scale-102 min-w-[200px] max-w-[280px]
      `}
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
  
  return (
    <div 
      className={`
        relative bg-gradient-to-br from-purple-500 to-violet-600 
        rounded-xl shadow-lg border-2 transition-all duration-300 ease-out
        ${selected ? 'border-white shadow-xl scale-105' : 'border-purple-400/30'}
        hover:shadow-2xl hover:scale-102 min-w-[200px] max-w-[280px]
      `}
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
          
          {/* Processing indicator */}
          <div className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 bg-purple-300 rounded-full animate-bounce"></div>
            <span className="text-purple-100">Processing</span>
          </div>
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
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = useMemo(() => {
    return nodes.find((n: any) => String(n.id) === String(selectedNodeId)) as any;
  }, [nodes, selectedNodeId]);
  const [labelValue, setLabelValue] = useState<string>('');
  const [descValue, setDescValue] = useState<string>('');

  useEffect(() => {
    setLabelValue(selectedNode?.data?.label || '');
    setDescValue(selectedNode?.data?.description || '');
  }, [selectedNodeId, selectedNode?.data?.label, selectedNode?.data?.description]);
  const [showWelcomeModal, setShowWelcomeModal] = useState(true);

  const stopInspectorEvent = useCallback((event: React.SyntheticEvent<Element>) => {
    event.stopPropagation();
    const nativeEvent = event.nativeEvent as Event & { stopImmediatePropagation?: () => void };
    nativeEvent.stopImmediatePropagation?.();
  }, []);
  const { project, getViewport, setViewport } = useReactFlow();
  const spec = useSpecStore((state) => state.spec);
  const specHydratedRef = useRef(false);

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
          const app =
            (node.app ||
              node.data?.app ||
              node.type?.split?.(".")?.[1] ||
              "core") + "";
          const operation =
            (node.operation ||
              node.data?.function ||
              node.data?.actionId ||
              "noop") + "";

          const metadata = buildMetadataFromNode(node);

          const params =
            node.data?.parameters ??
            node.parameters ??
            node.data?.params ??
            node.params ??
            node.data?.config ??
            node.config ??
            {};

          const baseData = {
            label:
              node.data?.label ||
              node.label ||
              `${app}:${operation}`.toUpperCase(),
            description:
              node.data?.description || node.description || "Action node",
            app,
            function: operation,
            nodeType: "action.core",
            icon: node.data?.icon || "🔧",
            color:
              node.data?.color ||
              (app.toLowerCase() === "gmail"
                ? "#EA4335"
                : app.toLowerCase() === "sheets"
                ? "#34A853"
                : app.toLowerCase() === "transform"
                ? "#FF6D01"
                : "#9AA0A6"),
            connectorId: node.data?.connectorId || app,
            actionId: operation,
            metadata,
            isValid: true,
            loadSource,
          };

          return {
            id: `${node.id || `node_${index}`}`,
            type: "action.core",
            position: {
              x: node.position?.x ?? 100 + (index % 6) * 260,
              y: node.position?.y ?? 120 + Math.floor(index / 6) * 180,
            },
            data: syncNodeParameters(baseData, params),
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

      setNodes(specNodes as any);
      setEdges(specEdges as any);
      setShowWelcomeModal(false);

      const firstNode = specNodes[0] as any;
      setSelectedNode(firstNode);
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
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    
    // Convert to ReactFlow nodes
    graphData.nodes.forEach((node: any, index: number) => {
      const nodeType = node.function?.includes('search') || node.function?.includes('monitor') ? 'trigger' :
                      node.function?.includes('append') || node.function?.includes('create') || node.function?.includes('update') ? 'action' : 
                      'transform';
      
      const existingData = (node.data && typeof node.data === 'object') ? node.data : {};
      const params =
        existingData.parameters ??
        node.parameters ??
        existingData.params ??
        node.params ??
        {};

      const baseData = {
        ...existingData,
        label: existingData.label || node.function || node.app || 'Unknown',
        description: existingData.description || node.type || node.app,
        app: existingData.app || node.app || 'Unknown',
      };

      newNodes.push({
        id: node.id,
        type: nodeType,
        position: node.position || { x: 100 + index * 250, y: 200 },
        data: syncNodeParameters(baseData, params),
      });
    });
    
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
    const normalizedData = syncNodeParameters(rest, params);
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
    setIsRunning(true);
    
    // Simulate workflow execution with visual feedback
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      
      // Highlight current node
      setNodes((nds) => 
        nds.map((n) => ({
          ...n,
          data: {
            ...n.data,
            isRunning: n.id === node.id,
            isCompleted: nodes.slice(0, i).some(prev => prev.id === n.id)
          }
        }))
      );
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Mark all nodes as completed
    setNodes((nds) => 
      nds.map((n) => ({
        ...n,
        data: { ...n.data, isRunning: false, isCompleted: true }
      }))
    );
    
    setIsRunning(false);
    
    // Reset after 3 seconds
    setTimeout(() => {
      setNodes((nds) => 
        nds.map((n) => ({
          ...n,
          data: { ...n.data, isCompleted: false }
        }))
      );
    }, 3000);
  }, [nodes, setNodes]);
  
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
          onPointerDown={stopInspectorEvent}
          onPointerUp={stopInspectorEvent}
          onMouseDown={stopInspectorEvent}
          onMouseUp={stopInspectorEvent}
          onClick={stopInspectorEvent}
          onDoubleClick={stopInspectorEvent}
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
                      setNodes((nds) =>
                        nds.map((node) => ({ ...node, selected: false })).concat([{ ...newNode, selected: true }])
                      );
                      setSelectedNodeId(newNode.id);
                    }
                  }}
                  onMouseDown={stopInspectorEvent}
                  onPointerDown={stopInspectorEvent}
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
                    if (selectedNode) {
                      setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
                      setEdges((eds) =>
                        eds.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id)
                      );
                    }
                    setSelectedNodeId(null);
                  }}
                  onMouseDown={stopInspectorEvent}
                  onPointerDown={stopInspectorEvent}
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
