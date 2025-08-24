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
  Activity
} from 'lucide-react';
import { NodeGraph, GraphNode, VisualNode } from '../../../shared/nodeGraphSchema';

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

// Icon mapping for different applications
const getAppIcon = (appName: string) => {
  const iconMap: Record<string, any> = {
    'gmail': Mail,
    'google-sheets': Sheet,
    'google-calendar': Calendar,
    'google-drive': Database,
    'google-docs': FileText,
    'google-slides': FileText,
    'slack': MessageSquare,
    'salesforce': Database,
    'shopify': Database,
    'hubspot': Database,
    'jira': Settings,
    'confluence': FileText,
    'okta': Shield,
    'workday': Users,
    'adp': DollarSign,
    'greenhouse': Users,
    'servicenow': Settings,
    'pagerduty': AlertTriangle,
    'snowflake': Database,
    'tableau': BarChart,
    'basecamp': Box,
    'microsoft-todo': Settings,
    'quickbooks': DollarSign,
    'lever': Users,
    'bigquery': Database,
    'databricks': BarChart,
    'sentry': AlertTriangle,
    'newrelic': Activity,
    // Add more mappings as needed
  };
  
  return iconMap[appName.toLowerCase()] || Zap;
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

// Sidebar Component
const NodeSidebar = ({ onAddNode }: { onAddNode: (nodeType: string, nodeData: any) => void }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [nodeTemplates, setNodeTemplates] = useState<NodeTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);

  // Load node templates from ConnectorRegistry
  useEffect(() => {
    loadNodeTemplates();
  }, []);

  const loadNodeTemplates = async () => {
    try {
      setLoading(true);
      
      // Fetch connector catalog from registry
      const response = await fetch('/api/registry/catalog');
      const result = await response.json();
      
      if (result.success && result.catalog) {
        const templates: NodeTemplate[] = [];
        const categorySet = new Set<string>();
        
        // Add basic time triggers and built-in transforms first
        const basicTemplates: NodeTemplate[] = [
          {
            id: 'trigger-every-15-minutes',
            type: 'trigger',
            category: 'Time Triggers',
            label: 'Every 15 Minutes',
            description: 'Run every 15 minutes',
            icon: Clock,
            app: 'Google Apps Script',
            data: { app: 'Google Apps Script', params: { everyMinutes: 15 } }
          },
          {
            id: 'trigger-every-hour',
            type: 'trigger',
            category: 'Time Triggers',
            label: 'Every Hour',
            description: 'Run every hour',
            icon: Clock,
            app: 'Google Apps Script',
            data: { app: 'Google Apps Script', params: { everyHours: 1 } }
          },
          {
            id: 'trigger-daily-at-9am',
            type: 'trigger',
            category: 'Time Triggers',
            label: 'Daily at 9 AM',
            description: 'Run daily at 9 AM',
            icon: Clock,
            app: 'Google Apps Script',
            data: { app: 'Google Apps Script', params: { everyHours: 24, startHour: 9 } }
          },
          {
            id: 'action-http-request',
            type: 'action',
            category: 'Built-in',
            label: 'HTTP Request',
            description: 'Call external API',
            icon: Globe,
            app: 'Built-in',
            data: { app: 'Built-in', params: { method: 'GET', url: '', headers: {} } }
          },
          {
            id: 'transform-filter-data',
            type: 'transform',
            category: 'Data Processing',
            label: 'Filter Data',
            description: 'Filter items by condition',
            icon: Filter,
            app: 'Built-in',
            data: { app: 'Built-in', params: { expression: 'item.value > 0' } }
          },
          {
            id: 'transform-format-text',
            type: 'transform',
            category: 'Data Processing',
            label: 'Format Text',
            description: 'Template interpolation',
            icon: Code,
            app: 'Built-in',
            data: { app: 'Built-in', params: { template: 'Hello {{name}}!' } }
          }
        ];
        
        templates.push(...basicTemplates);
        basicTemplates.forEach(t => categorySet.add(t.category));
        
        // Process connectors from registry
        Object.entries(result.catalog.connectors).forEach(([appId, connector]: [string, any]) => {
          const appIcon = getAppIcon(appId);
          const appColor = getAppColor(connector.category);
          
          // Add triggers
          connector.triggers?.forEach((trigger: any) => {
            templates.push({
              id: `trigger-${appId}-${trigger.id}`,
              type: 'trigger',
              category: connector.category,
              label: trigger.name,
              description: trigger.description,
              icon: appIcon,
              app: connector.name,
              color: appColor,
              data: { 
                app: connector.name, 
                nodeType: `trigger.${appId}.${trigger.id}`,
                params: trigger.parameters || {} 
              }
            });
          });
          
          // Add actions
          connector.actions?.forEach((action: any) => {
            templates.push({
              id: `action-${appId}-${action.id}`,
              type: 'action',
              category: connector.category,
              label: action.name,
              description: action.description,
              icon: appIcon,
              app: connector.name,
              color: appColor,
              data: { 
                app: connector.name, 
                nodeType: `action.${appId}.${action.id}`,
                params: action.parameters || {} 
              }
            });
          });
          
          categorySet.add(connector.category);
        });
        
        setNodeTemplates(templates);
        setCategories(Array.from(categorySet).sort());
        console.log(`🎊 Loaded ${templates.length} node templates from ${Object.keys(result.catalog.connectors).length} connectors`);
      } else {
        console.error('Failed to load node catalog:', result.error);
        // Fallback to basic templates
        setNodeTemplates(basicTemplates);
      }
    } catch (error) {
      console.error('Error loading node templates:', error);
      // Fallback to minimal templates
      setNodeTemplates([
        {
          id: 'action-http-request',
          type: 'action',
          category: 'Built-in',
          label: 'HTTP Request',
          description: 'Call external API',
          icon: Globe,
          app: 'Built-in',
          data: { app: 'Built-in', params: { method: 'GET', url: '', headers: {} } }
        }
      ]);
    } finally {
      setLoading(false);
    }
  };
  
  const filteredNodes = nodeTemplates.filter(node => {
    const matchesSearch = node.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         node.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         node.app.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || node.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });
  
  const allCategories = ['all', ...categories];
  
  return (
    <div className="w-80 bg-slate-900 border-r border-slate-700 h-full overflow-y-auto">
      <div className="p-4">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-blue-400" />
          Add Nodes
          {loading && <div className="ml-2 w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>}
        </h2>
        
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search nodes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-slate-800 border-slate-600 text-white"
          />
        </div>
        
        {/* Categories */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {allCategories.map(category => (
            <Button
              key={category}
              size="sm"
              variant={selectedCategory === category ? 'default' : 'outline'}
              onClick={() => setSelectedCategory(category)}
              className={`text-xs ${
                selectedCategory === category 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700'
              }`}
            >
              {category === 'all' ? 'All' : category}
            </Button>
          ))}
        </div>
        
        {/* Node Count */}
        {!loading && (
          <div className="text-xs text-slate-400 mb-3">
            {filteredNodes.length} of {nodeTemplates.length} nodes
          </div>
        )}
        
        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-slate-400 text-sm">Loading applications...</p>
            </div>
          </div>
        )}
        
        {/* Node Templates */}
        {!loading && (
          <div className="space-y-2">
            {filteredNodes.map((template, index) => {
            const IconComponent = template.icon;
            return (
              <div
                key={template.id}
                onClick={() => onAddNode(template.type, { 
                  ...template.data, 
                  label: template.label, 
                  description: template.description 
                })}
                className="p-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg cursor-pointer transition-all duration-200 hover:border-blue-500 group"
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${
                    template.type === 'trigger' ? 'bg-green-500/20 text-green-400' :
                    template.type === 'action' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-purple-500/20 text-purple-400'
                  }`}>
                    <IconComponent className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-medium text-sm group-hover:text-blue-300 transition-colors">
                      {template.label}
                    </h3>
                    <p className="text-slate-400 text-xs mt-1">{template.description}</p>
                    <Badge 
                      variant="secondary" 
                      className="mt-2 text-xs bg-slate-700 text-slate-300 border-slate-600"
                    >
                      {template.type}
                    </Badge>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
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
        } catch (error) {
          console.error('Failed to load AI-generated workflow:', error);
        }
      }
    }
  }, []);

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
    <div className="flex h-screen bg-slate-900">
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
          className="bg-slate-900"
        >
          <Background 
            color="#475569" 
            gap={20} 
            size={1}
            style={{ backgroundColor: '#0f172a' }}
          />
          <Controls 
            className="bg-slate-800 border-slate-700"
            style={{ 
              button: { backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9' }
            }}
          />
          <MiniMap 
            className="bg-slate-800 border border-slate-700 rounded-lg"
            nodeColor="#3b82f6"
            maskColor="rgba(15, 23, 42, 0.8)"
          />
          
          {/* Welcome message when empty */}
          {nodes.length === 0 && (
            <Panel position="center">
              <Card className="bg-slate-800/90 backdrop-blur-sm border-slate-700 max-w-md">
                <CardContent className="p-6 text-center">
                  <div className="mb-4">
                    <Sparkles className="w-12 h-12 text-blue-400 mx-auto mb-3" />
                    <h2 className="text-xl font-bold text-white mb-2">Welcome to Workflow Designer</h2>
                    <p className="text-slate-400 text-sm">
                      Start building your automation by adding nodes from the sidebar.
                      Connect them together to create powerful workflows!
                    </p>
                  </div>
                  
                  <div className="space-y-2 text-left text-sm text-slate-300">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <span>Green nodes are triggers (start your workflow)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      <span>Blue nodes are actions (do something)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                      <span>Purple nodes transform data</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Panel>
          )}
        </ReactFlow>
      </div>
      
      {/* Node Properties Panel */}
      {selectedNode && (
        <div className="w-80 bg-slate-900 border-l border-slate-700 p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white">Node Properties</h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedNode(null)}
              className="text-slate-400 hover:text-white"
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
            
            {/* Parameters */}
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">Parameters</label>
              <div className="space-y-2">
                {Object.entries(selectedNode.data.params || {}).map(([key, value]) => (
                  <div key={key}>
                    <label className="text-xs text-slate-400 mb-1 block">{key}</label>
                    <Input
                      value={String(value)}
                      onChange={(e) => {
                        setNodes((nds) =>
                          nds.map((n) =>
                            n.id === selectedNode.id
                              ? { 
                                  ...n, 
                                  data: { 
                                    ...n.data, 
                                    params: { 
                                      ...n.data.params, 
                                      [key]: e.target.value 
                                    } 
                                  } 
                                }
                              : n
                          )
                        );
                      }}
                      className="bg-slate-800 border-slate-600 text-white text-sm"
                    />
                  </div>
                ))}
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