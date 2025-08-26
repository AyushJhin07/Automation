// PROFESSIONAL N8N-STYLE GRAPH EDITOR
// Beautiful visual workflow builder with smooth animations

import React, { useState, useCallback, useRef, useEffect } from 'react';
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
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../ui/accordion';
import { AIParameterEditor } from './AIParameterEditor';
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
              {Object.entries(data.params || {}).map(([key, value]) => (
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
              {Object.entries(data.params || {}).map(([key, value]) => (
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
              {Object.entries(data.params || {}).map(([key, value]) => (
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
                        onClick={() => onAddNode("trigger", { 
                          label: t.name, 
                          description: t.description, 
                          app: app.appName, 
                          nodeType: t.nodeType, 
                          params: t.params || {} 
                        })}
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
                        onClick={() => onAddNode(a.kind === "transform" ? "transform" : "action", { 
                          label: a.name, 
                          description: a.description, 
                          app: app.appName, 
                          nodeType: a.nodeType, 
                          params: a.params || {} 
                        })}
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
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showWelcomeModal, setShowWelcomeModal] = useState(true);
  const { project, getViewport, setViewport } = useReactFlow();

  // Load AI-generated workflow if coming from AI Builder
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('from') === 'ai-builder') {
      const savedWorkflow = localStorage.getItem('ai_generated_workflow');
      if (savedWorkflow) {
        try {
          const workflowData = JSON.parse(savedWorkflow);
          loadWorkflowIntoGraph(workflowData);
          localStorage.removeItem('ai_generated_workflow'); // Clean up
          setShowWelcomeModal(false); // Hide welcome modal when loading AI workflow
        } catch (error) {
          console.error('Failed to load AI-generated workflow:', error);
        }
      }
    }
  }, []);

  // Auto-close welcome modal when nodes are added
  useEffect(() => {
    if (nodes.length > 0) {
      setShowWelcomeModal(false);
    }
  }, [nodes.length]);

  const loadWorkflowIntoGraph = (workflowData: any) => {
    if (!workflowData.workflow?.graph) return;
    
    const graph = workflowData.workflow.graph;
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    
    // Convert NodeGraph to ReactFlow nodes
    graph.nodes.forEach((node: any, index: number) => {
      const nodeType = node.type.startsWith('trigger.') ? 'trigger' :
                      node.type.startsWith('action.') ? 'action' : 'transform';
      
      newNodes.push({
        id: node.id,
        type: nodeType,
        position: node.position || { x: 100 + index * 250, y: 200 },
        data: {
          label: node.label,
          description: node.type,
          app: node.app || 'Unknown',
          params: node.params || {}
        }
      });
    });
    
    // Convert edges
    graph.edges.forEach((edge: any) => {
      newEdges.push({
        id: `edge-${edge.from}-${edge.to}`,
        source: edge.from,
        target: edge.to,
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
      alert(`✅ Loaded AI-generated workflow: "${graph.name}"\n\nNodes: ${newNodes.length}\nConnections: ${newEdges.length}`);
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
    const newNode: Node = {
      id: `${nodeType}-${Date.now()}`,
      type: nodeType,
      position: { 
        x: Math.random() * 300 + 100, 
        y: Math.random() * 300 + 100 
      },
      data: {
        ...nodeData,
        id: `${nodeType}-${Date.now()}`,
      },
    };
    setNodes((nds) => [...nds, newNode]);
  }, [setNodes, getViewport]);
  
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);
  
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
      
      {/* Node Properties Panel */}
      {selectedNode && (
        <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">Node Properties</h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedNode(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">Label</label>
              <Input
                value={selectedNode.data.label || ''}
                onChange={(e) => {
                  setNodes((nds) =>
                    nds.map((n) =>
                      n.id === selectedNode.id
                        ? { ...n, data: { ...n.data, label: e.target.value } }
                        : n
                    )
                  );
                }}
                className="bg-slate-800 border-slate-600 text-white"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">Description</label>
              <Textarea
                value={selectedNode.data.description || ''}
                onChange={(e) => {
                  setNodes((nds) =>
                    nds.map((n) =>
                      n.id === selectedNode.id
                        ? { ...n, data: { ...n.data, description: e.target.value } }
                        : n
                    )
                  );
                }}
                className="bg-slate-800 border-slate-600 text-white"
                rows={3}
              />
            </div>
            
            {/* Parameters - AI-as-a-Field */}
            <div>
              <label className="text-sm font-medium text-slate-300 mb-3 block flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Smart Parameters
                <Badge variant="outline" className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs">
                  AI-Powered
                </Badge>
              </label>
              <div className="space-y-4">
                {Object.entries(selectedNode.data.params || {}).map(([key, value]) => (
                  <AIParameterEditor
                    key={key}
                    paramName={key}
                    value={value}
                    onChange={(newValue) => {
                      setNodes((nds) =>
                        nds.map((n) =>
                          n.id === selectedNode.id
                            ? { 
                                ...n, 
                                data: { 
                                  ...n.data, 
                                  params: { 
                                    ...n.data.params, 
                                    [key]: newValue 
                                  } 
                                } 
                              }
                            : n
                        )
                      );
                    }}
                    availableNodes={nodes
                      .filter(n => n.id !== selectedNode.id) // Exclude current node
                      .map(n => ({ id: n.id, label: n.data.label || n.id }))
                    }
                  />
                ))}
                {Object.keys(selectedNode.data.params || {}).length === 0 && (
                  <div className="text-center py-4 text-slate-400 text-sm">
                    No parameters configured for this node
                  </div>
                )}
              </div>
            </div>
            
            {/* Actions */}
            <div className="pt-4 border-t border-slate-700">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
                  setSelectedNode(null);
                }}
                className="w-full bg-red-600/10 text-red-400 border-red-600/30 hover:bg-red-600/20"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Node
              </Button>
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