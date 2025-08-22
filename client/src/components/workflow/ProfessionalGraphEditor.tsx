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
  X
} from 'lucide-react';
import { NodeGraph, GraphNode, VisualNode } from '../../../shared/nodeGraphSchema';

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
  
  const nodeTemplates = [
    // Time Triggers
    { 
      type: 'trigger', 
      category: 'triggers',
      label: 'Every 15 Minutes', 
      description: 'Run every 15 minutes',
      icon: Clock,
      data: { app: 'Google Apps Script', params: { everyMinutes: 15 } }
    },
    { 
      type: 'trigger', 
      category: 'triggers',
      label: 'Every Hour', 
      description: 'Run every hour',
      icon: Clock,
      data: { app: 'Google Apps Script', params: { everyHours: 1 } }
    },
    { 
      type: 'trigger', 
      category: 'triggers',
      label: 'Daily at 9 AM', 
      description: 'Run daily at 9 AM',
      icon: Clock,
      data: { app: 'Google Apps Script', params: { everyHours: 24, startHour: 9 } }
    },
    
    // Gmail Triggers
    { 
      type: 'trigger', 
      category: 'triggers',
      label: 'New Gmail Email', 
      description: 'New email received',
      icon: Mail,
      data: { app: 'Gmail', params: { query: 'is:unread' } }
    },
    { 
      type: 'trigger', 
      category: 'triggers',
      label: 'Gmail with Attachment', 
      description: 'Email with attachment',
      icon: Mail,
      data: { app: 'Gmail', params: { query: 'has:attachment' } }
    },
    { 
      type: 'trigger', 
      category: 'triggers',
      label: 'Gmail from Sender', 
      description: 'Email from specific sender',
      icon: Mail,
      data: { app: 'Gmail', params: { query: 'from:example@domain.com' } }
    },
    
    // Sheets Triggers
    { 
      type: 'trigger', 
      category: 'triggers',
      label: 'New Sheets Row', 
      description: 'New row added to sheet',
      icon: Sheet,
      data: { app: 'Google Sheets', params: { spreadsheetId: '', sheetName: 'Sheet1' } }
    },
    { 
      type: 'trigger', 
      category: 'triggers',
      label: 'Sheets Cell Changed', 
      description: 'Specific cell updated',
      icon: Sheet,
      data: { app: 'Google Sheets', params: { spreadsheetId: '', range: 'A1:Z1000' } }
    },
    
    // Gmail Actions
    { 
      type: 'action', 
      category: 'actions',
      label: 'Send Email', 
      description: 'Send Gmail message',
      icon: Mail,
      data: { app: 'Gmail', params: { to: '', subject: '', bodyText: '' } }
    },
    { 
      type: 'action', 
      category: 'actions',
      label: 'Reply to Email', 
      description: 'Reply to Gmail thread',
      icon: Mail,
      data: { app: 'Gmail', params: { threadId: '', message: '' } }
    },
    { 
      type: 'action', 
      category: 'actions',
      label: 'Forward Email', 
      description: 'Forward Gmail message',
      icon: Mail,
      data: { app: 'Gmail', params: { messageId: '', to: '', note: '' } }
    },
    { 
      type: 'action', 
      category: 'actions',
      label: 'Set Auto Reply', 
      description: 'Set Gmail auto-reply',
      icon: Mail,
      data: { app: 'Gmail', params: { message: '', startDate: '', endDate: '' } }
    },
    { 
      type: 'action', 
      category: 'actions',
      label: 'Add Gmail Label', 
      description: 'Add label to email',
      icon: Mail,
      data: { app: 'Gmail', params: { messageId: '', labelName: '' } }
    },
    
    // Google Sheets Actions
    { 
      type: 'action', 
      category: 'actions',
      label: 'Add Row', 
      description: 'Append row to sheet',
      icon: Sheet,
      data: { app: 'Google Sheets', params: { spreadsheetId: '', sheetName: 'Sheet1', values: [] } }
    },
    { 
      type: 'action', 
      category: 'actions',
      label: 'Update Cell', 
      description: 'Update specific cell',
      icon: Sheet,
      data: { app: 'Google Sheets', params: { spreadsheetId: '', range: 'A1', value: '' } }
    },
    { 
      type: 'action', 
      category: 'actions',
      label: 'Clear Range', 
      description: 'Clear sheet range',
      icon: Sheet,
      data: { app: 'Google Sheets', params: { spreadsheetId: '', range: 'A1:Z100' } }
    },
    { 
      type: 'action', 
      category: 'actions',
      label: 'Create Sheet', 
      description: 'Create new sheet',
      icon: Sheet,
      data: { app: 'Google Sheets', params: { spreadsheetId: '', sheetName: 'New Sheet' } }
    },
    { 
      type: 'action', 
      category: 'actions',
      label: 'Sort Data', 
      description: 'Sort sheet data',
      icon: Sheet,
      data: { app: 'Google Sheets', params: { spreadsheetId: '', range: 'A1:Z100', column: 1 } }
    },
    
    // Calendar Actions
    { 
      type: 'action', 
      category: 'actions',
      label: 'Create Event', 
      description: 'Create calendar event',
      icon: Calendar,
      data: { app: 'Google Calendar', params: { title: '', start: '', end: '', description: '' } }
    },
    { 
      type: 'action', 
      category: 'actions',
      label: 'Update Event', 
      description: 'Update existing event',
      icon: Calendar,
      data: { app: 'Google Calendar', params: { eventId: '', title: '', start: '', end: '' } }
    },
    { 
      type: 'action', 
      category: 'actions',
      label: 'Delete Event', 
      description: 'Delete calendar event',
      icon: Calendar,
      data: { app: 'Google Calendar', params: { eventId: '' } }
    },
    { 
      type: 'action', 
      category: 'actions',
      label: 'Find Free Time', 
      description: 'Find available time slots',
      icon: Calendar,
      data: { app: 'Google Calendar', params: { startDate: '', endDate: '', duration: 60 } }
    },
    
    // External Apps
    { 
      type: 'action', 
      category: 'actions',
      label: 'Send Slack Message', 
      description: 'Post to Slack channel',
      icon: MessageSquare,
      data: { app: 'Slack', params: { channel: '', message: '' } }
    },
    { 
      type: 'action', 
      category: 'actions',
      label: 'Create Salesforce Lead', 
      description: 'Create lead in Salesforce',
      icon: Database,
      data: { app: 'Salesforce', params: { firstName: '', lastName: '', email: '', company: '' } }
    },
    { 
      type: 'action', 
      category: 'actions',
      label: 'HTTP Request', 
      description: 'Call external API',
      icon: Globe,
      data: { app: 'Built-in', params: { method: 'GET', url: '', headers: {} } }
    },
    
    // Transform Nodes
    { 
      type: 'transform', 
      category: 'transforms',
      label: 'Filter Data', 
      description: 'Filter items by condition',
      icon: Filter,
      data: { app: 'Built-in', params: { expression: 'item.value > 0' } }
    },
    { 
      type: 'transform', 
      category: 'transforms',
      label: 'Format Text', 
      description: 'Template interpolation',
      icon: Code,
      data: { app: 'Built-in', params: { template: 'Hello {{name}}!' } }
    },
    { 
      type: 'transform', 
      category: 'transforms',
      label: 'Extract Email', 
      description: 'Extract email from text',
      icon: Code,
      data: { app: 'Built-in', params: { source: 'text', pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}' } }
    },
    { 
      type: 'transform', 
      category: 'transforms',
      label: 'Split Text', 
      description: 'Split text by delimiter',
      icon: Code,
      data: { app: 'Built-in', params: { source: 'text', delimiter: ',' } }
    },
    { 
      type: 'transform', 
      category: 'transforms',
      label: 'Date Format', 
      description: 'Format date/time',
      icon: Clock,
      data: { app: 'Built-in', params: { source: 'date', format: 'YYYY-MM-DD' } }
    },
  ];
  
  const filteredNodes = nodeTemplates.filter(node => {
    const matchesSearch = node.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         node.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || node.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });
  
  return (
    <div className="w-80 bg-slate-900 border-r border-slate-700 h-full overflow-y-auto">
      <div className="p-4">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-blue-400" />
          Add Nodes
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
          {['all', 'triggers', 'actions', 'transforms'].map(category => (
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
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </Button>
          ))}
        </div>
        
        {/* Node Templates */}
        <div className="space-y-2">
          {filteredNodes.map((template, index) => {
            const IconComponent = template.icon;
            return (
              <div
                key={index}
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