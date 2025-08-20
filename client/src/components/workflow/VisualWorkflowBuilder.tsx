import React, { useState, useCallback, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Mail, 
  FileSpreadsheet, 
  HardDrive, 
  FileText, 
  Calendar,
  Bot,
  GitBranch,
  Plus,
  Trash2,
  Download,
  Play,
  Settings,
  Zap,
  Link,
  MousePointer2,
  Target
} from 'lucide-react';
import { toast } from 'sonner';

interface WorkflowNode {
  id: string;
  type: 'trigger' | 'action' | 'condition' | 'ai';
  appType: string;
  functionType: string;
  position: { x: number; y: number };
  config: Record<string, any>;
  title: string;
}

interface WorkflowConnection {
  id: string;
  from: string;
  to: string;
  fromPort?: 'output' | 'true' | 'false';
  toPort?: 'input';
}

interface WorkflowBuilderProps {
  automationType: string;
  onSave: (workflow: { nodes: WorkflowNode[]; connections: WorkflowConnection[] }) => void;
}

const appConfigs = {
  gmail: {
    icon: Mail,
    name: 'Gmail',
    color: 'bg-red-500',
    functions: {
      triggers: [
        'New Email Received',
        'Email Matching Query',
        'Scheduled Email Check'
      ],
      actions: [
        'Search Emails',
        'Get Email Threads',
        'Read Latest Message',
        'Extract Email Fields',
        'Download Attachments',
        'Create Draft',
        'Send Email',
        'Mark as Read/Unread',
        'Add/Remove Labels',
        'Archive Email',
        'Move to Trash',
        'Auto-Reply',
        'Forward Email',
        'Parse Structured Data',
        'Batch Label Management'
      ]
    }
  },
  sheets: {
    icon: FileSpreadsheet,
    name: 'Google Sheets',
    color: 'bg-green-500',
    functions: {
      triggers: [
        'On Sheet Edit',
        'On Form Submit',
        'Scheduled Data Check'
      ],
      actions: [
        'Append Row',
        'Read Range',
        'Update Range',
        'Clear Range',
        'Create Sheet',
        'Delete Sheet',
        'Find Rows by Value',
        'Sort Data',
        'Get Last Row/Column',
        'Batch Update Ranges',
        'Upsert Rows',
        'Data Validation',
        'Create Filter',
        'Conditional Formatting',
        'Create Pivot Table',
        'Create Chart',
        'Import CSV'
      ]
    }
  },
  drive: {
    icon: HardDrive,
    name: 'Google Drive',
    color: 'bg-blue-500',
    functions: {
      triggers: [
        'File Added to Folder',
        'File Modified',
        'Scheduled File Check'
      ],
      actions: [
        'Create Folder',
        'Upload File',
        'Move File',
        'Copy File',
        'Rename File',
        'Delete File',
        'Search Files',
        'Get Share Link',
        'Export as PDF',
        'Set Permissions',
        'Change Owner',
        'List Revisions',
        'Create Shortcut',
        'Download File',
        'MIME Conversion'
      ]
    }
  },
  docs: {
    icon: FileText,
    name: 'Google Docs',
    color: 'bg-purple-500',
    functions: {
      triggers: [
        'Document Created',
        'Document Modified',
        'Scheduled Report Generation'
      ],
      actions: [
        'Create Document',
        'Open Document',
        'Insert Text',
        'Find & Replace',
        'Insert Table',
        'Insert Image',
        'Apply Styles',
        'Read Content',
        'Add Headers/Footers',
        'Insert Bookmarks',
        'Table of Contents',
        'Merge Documents',
        'Export as PDF',
        'Mail Merge',
        'Add Watermarks'
      ]
    }
  },
  calendar: {
    icon: Calendar,
    name: 'Google Calendar',
    color: 'bg-orange-500',
    functions: {
      triggers: [
        'Event Created',
        'Event Updated',
        'Event Starting Soon'
      ],
      actions: [
        'Create Event',
        'Update Event',
        'Delete Event',
        'List Events',
        'Find Free Time',
        'Send Invitations',
        'Set Reminders',
        'Create Recurring Event'
      ]
    }
  }
};

const conditionTypes = [
  'If Text Contains',
  'If Number Greater Than',
  'If Date Is After',
  'If Email From Sender',
  'If File Type Matches',
  'If Cell Value Equals',
  'Custom Condition'
];

const aiActionTypes = [
  'Extract Information',
  'Classify Content',
  'Generate Summary',
  'Sentiment Analysis',
  'Language Translation',
  'Content Generation',
  'Data Validation'
];

export const VisualWorkflowBuilder: React.FC<WorkflowBuilderProps> = ({ automationType, onSave }) => {
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [connections, setConnections] = useState<WorkflowConnection[]>([]);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [tempConnection, setTempConnection] = useState<{ from: string; mousePos: { x: number; y: number } } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleAddNode = useCallback((type: WorkflowNode['type'], appType?: string) => {
    const newNode: WorkflowNode = {
      id: `node-${Date.now()}`,
      type,
      appType: appType || '',
      functionType: '',
      position: { x: 100 + nodes.length * 200, y: 100 + (nodes.length % 3) * 120 },
      config: {},
      title: type === 'ai' ? 'AI Action' : type === 'condition' ? 'Condition' : `${appType || 'New'} ${type}`
    };

    setNodes(prev => [...prev, newNode]);
    setSelectedNode(newNode);
  }, [nodes.length]);

  const handleNodeDrag = useCallback((nodeId: string, position: { x: number; y: number }) => {
    setNodes(prev => prev.map(node => 
      node.id === nodeId ? { ...node, position } : node
    ));
  }, []);

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes(prev => prev.filter(node => node.id !== nodeId));
    setConnections(prev => prev.filter(conn => conn.from !== nodeId && conn.to !== nodeId));
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null);
    }
  }, [selectedNode]);

  const handleStartConnection = useCallback((nodeId: string, fromPort: string = 'output') => {
    setIsConnecting(true);
    setConnectingFrom(nodeId);
  }, []);

  const handleCompleteConnection = useCallback((toNodeId: string, toPort: string = 'input') => {
    if (connectingFrom && connectingFrom !== toNodeId) {
      const newConnection: WorkflowConnection = {
        id: `conn-${Date.now()}`,
        from: connectingFrom,
        to: toNodeId,
        fromPort: 'output',
        toPort: 'input'
      };
      setConnections(prev => [...prev, newConnection]);
      toast.success('Nodes connected successfully!');
    }
    setIsConnecting(false);
    setConnectingFrom(null);
    setTempConnection(null);
  }, [connectingFrom]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isConnecting && connectingFrom && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setTempConnection({
        from: connectingFrom,
        mousePos: { x: e.clientX - rect.left, y: e.clientY - rect.top }
      });
    }
  }, [isConnecting, connectingFrom]);

  const updateNodeConfig = useCallback((nodeId: string, key: string, value: any) => {
    setNodes(prev => prev.map(node => 
      node.id === nodeId 
        ? { ...node, config: { ...node.config, [key]: value } }
        : node
    ));
  }, []);

  const updateNodeFunction = useCallback((nodeId: string, functionType: string) => {
    setNodes(prev => prev.map(node => 
      node.id === nodeId 
        ? { ...node, functionType, title: `${node.appType} - ${functionType}` }
        : node
    ));
  }, []);

  const handleSaveWorkflow = useCallback(() => {
    if (nodes.length === 0) {
      toast.error('Please add at least one node to save the workflow');
      return;
    }

    const workflow = { nodes, connections };
    onSave(workflow);
    toast.success('Workflow saved successfully!');
  }, [nodes, connections, onSave]);

  const generateScript = useCallback(() => {
    if (nodes.length === 0) {
      toast.error('Please create a workflow first');
      return;
    }

    // Generate Google Apps Script based on the workflow
    let script = `// Auto-generated Google Apps Script\n// Workflow: ${automationType}\n\n`;
    
    nodes.forEach(node => {
      const app = appConfigs[node.appType as keyof typeof appConfigs];
      if (app) {
        script += `// ${node.title}\n`;
        script += `function ${node.id.replace('-', '_')}() {\n`;
        script += `  // ${node.functionType}\n`;
        script += `  // Configuration: ${JSON.stringify(node.config, null, 2)}\n`;
        script += `}\n\n`;
      }
    });

    script += `function main() {\n`;
    script += `  // Execute workflow\n`;
    nodes.forEach(node => {
      script += `  ${node.id.replace('-', '_')}();\n`;
    });
    script += `}\n`;

    // Create downloadable file
    const blob = new Blob([script], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${automationType.replace(/\s+/g, '_')}_workflow.gs`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Google Apps Script generated and downloaded!');
  }, [nodes, automationType]);

  const getNodeIcon = (node: WorkflowNode) => {
    if (node.type === 'ai') return Bot;
    if (node.type === 'condition') return GitBranch;
    const app = appConfigs[node.appType as keyof typeof appConfigs];
    return app?.icon || Target;
  };

  const getNodeColor = (node: WorkflowNode) => {
    if (node.type === 'ai') return 'bg-indigo-500';
    if (node.type === 'condition') return 'bg-yellow-500';
    const app = appConfigs[node.appType as keyof typeof appConfigs];
    return app?.color || 'bg-gray-500';
  };

  return (
    <div className="h-full flex">
      {/* Left Sidebar - Node Palette */}
      <div className="w-80 border-r bg-muted/30 p-4">
        <h3 className="font-semibold mb-4">Workflow Builder</h3>
        
        <Tabs defaultValue="apps" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="apps">Apps</TabsTrigger>
            <TabsTrigger value="logic">Logic</TabsTrigger>
            <TabsTrigger value="ai">AI</TabsTrigger>
          </TabsList>
          
          <TabsContent value="apps" className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Google Workspace</h4>
            {Object.entries(appConfigs).map(([key, app]) => {
              const Icon = app.icon;
              return (
                <div key={key} className="space-y-1">
                  <Button
                    variant="outline"
                    className="w-full justify-start h-auto p-3"
                    onClick={() => handleAddNode('trigger', key)}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    <div className="text-left">
                      <div className="font-medium">{app.name} Trigger</div>
                      <div className="text-xs text-muted-foreground">Start workflow</div>
                    </div>
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start h-auto p-3"
                    onClick={() => handleAddNode('action', key)}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    <div className="text-left">
                      <div className="font-medium">{app.name} Action</div>
                      <div className="text-xs text-muted-foreground">Perform action</div>
                    </div>
                  </Button>
                </div>
              );
            })}
          </TabsContent>
          
          <TabsContent value="logic" className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start h-auto p-3"
              onClick={() => handleAddNode('condition')}
            >
              <GitBranch className="mr-2 h-4 w-4" />
              <div className="text-left">
                <div className="font-medium">Condition</div>
                <div className="text-xs text-muted-foreground">Branch workflow</div>
              </div>
            </Button>
          </TabsContent>
          
          <TabsContent value="ai" className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start h-auto p-3"
              onClick={() => handleAddNode('ai')}
            >
              <Bot className="mr-2 h-4 w-4" />
              <div className="text-left">
                <div className="font-medium">AI Action</div>
                <div className="text-xs text-muted-foreground">Smart processing</div>
              </div>
            </Button>
          </TabsContent>
        </Tabs>

        <Separator className="my-4" />

        <div className="space-y-2">
          <Button onClick={handleSaveWorkflow} className="w-full">
            <Download className="mr-2 h-4 w-4" />
            Save Workflow
          </Button>
          <Button onClick={generateScript} variant="outline" className="w-full">
            <Play className="mr-2 h-4 w-4" />
            Generate Script
          </Button>
        </div>
      </div>

      {/* Main Canvas */}
      <div className="flex-1 flex">
        <div 
          ref={canvasRef}
          className="flex-1 relative bg-background overflow-auto"
          onMouseMove={handleMouseMove}
          onClick={() => {
            if (isConnecting) {
              setIsConnecting(false);
              setConnectingFrom(null);
              setTempConnection(null);
            }
          }}
        >
          {/* Grid Background */}
          <div 
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `
                linear-gradient(hsl(var(--border)) 1px, transparent 1px),
                linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)
              `,
              backgroundSize: '20px 20px'
            }}
          />

          {/* Connections */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="7"
                refX="9"
                refY="3.5"
                orient="auto"
              >
                <polygon
                  points="0 0, 10 3.5, 0 7"
                  fill="hsl(var(--primary))"
                />
              </marker>
            </defs>
            
            {connections.map(connection => {
              const fromNode = nodes.find(n => n.id === connection.from);
              const toNode = nodes.find(n => n.id === connection.to);
              
              if (!fromNode || !toNode) return null;
              
              const fromX = fromNode.position.x + 150;
              const fromY = fromNode.position.y + 40;
              const toX = toNode.position.x;
              const toY = toNode.position.y + 40;
              
              const midX = (fromX + toX) / 2;
              
              return (
                <path
                  key={connection.id}
                  d={`M ${fromX} ${fromY} C ${midX} ${fromY} ${midX} ${toY} ${toX} ${toY}`}
                  stroke="hsl(var(--primary))"
                  strokeWidth="2"
                  fill="none"
                  markerEnd="url(#arrowhead)"
                />
              );
            })}
            
            {/* Temporary connection while dragging */}
            {tempConnection && (() => {
              const fromNode = nodes.find(n => n.id === tempConnection.from);
              if (!fromNode) return null;
              
              const fromX = fromNode.position.x + 150;
              const fromY = fromNode.position.y + 40;
              const toX = tempConnection.mousePos.x;
              const toY = tempConnection.mousePos.y;
              const midX = (fromX + toX) / 2;
              
              return (
                <path
                  d={`M ${fromX} ${fromY} C ${midX} ${fromY} ${midX} ${toY} ${toX} ${toY}`}
                  stroke="hsl(var(--primary))"
                  strokeWidth="2"
                  strokeDasharray="5,5"
                  fill="none"
                  opacity="0.7"
                />
              );
            })()}
          </svg>

          {/* Nodes */}
          {nodes.map(node => {
            const Icon = getNodeIcon(node);
            const colorClass = getNodeColor(node);
            
            return (
              <div
                key={node.id}
                className={`absolute w-40 bg-card border rounded-lg shadow-sm cursor-move ${
                  selectedNode?.id === node.id ? 'ring-2 ring-primary' : ''
                }`}
                style={{
                  left: node.position.x,
                  top: node.position.y,
                  zIndex: selectedNode?.id === node.id ? 10 : 1
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setSelectedNode(node);
                  setIsDragging(true);
                  setDragOffset({
                    x: e.clientX - node.position.x,
                    y: e.clientY - node.position.y
                  });
                }}
                onMouseMove={(e) => {
                  if (isDragging) {
                    handleNodeDrag(node.id, {
                      x: e.clientX - dragOffset.x,
                      y: e.clientY - dragOffset.y
                    });
                  }
                }}
                onMouseUp={() => setIsDragging(false)}
              >
                {/* Node Header */}
                <div className={`${colorClass} text-white p-2 rounded-t-lg flex items-center justify-between`}>
                  <div className="flex items-center">
                    <Icon className="h-4 w-4 mr-2" />
                    <span className="text-xs font-medium truncate">{node.title}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-white hover:bg-white/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteNode(node.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>

                {/* Node Body */}
                <div className="p-2">
                  <div className="text-xs text-muted-foreground truncate">
                    {node.functionType || 'Configure function'}
                  </div>
                  {Object.keys(node.config).length > 0 && (
                    <Badge variant="secondary" className="mt-1 text-xs">
                      Configured
                    </Badge>
                  )}
                </div>

                {/* Connection Ports */}
                <div className="flex justify-between items-center p-2 pt-0">
                  {/* Input Port */}
                  <div
                    className={`w-3 h-3 rounded-full border-2 border-white cursor-pointer transition-colors ${
                      isConnecting && connectingFrom !== node.id
                        ? 'bg-green-500 hover:bg-green-600'
                        : 'bg-gray-400 hover:bg-gray-500'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isConnecting && connectingFrom !== node.id) {
                        handleCompleteConnection(node.id);
                      }
                    }}
                  />

                  {/* Output Port */}
                  <div
                    className={`w-3 h-3 rounded-full border-2 border-white cursor-pointer transition-colors ${
                      connectingFrom === node.id
                        ? 'bg-blue-500'
                        : 'bg-gray-400 hover:bg-gray-500'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isConnecting) {
                        handleStartConnection(node.id);
                      }
                    }}
                  />
                </div>
              </div>
            );
          })}

          {/* Connection Hint */}
          {isConnecting && (
            <div className="absolute top-4 left-4 bg-blue-500 text-white px-3 py-2 rounded-lg shadow-lg z-20">
              <div className="flex items-center gap-2">
                <Link className="h-4 w-4" />
                <span className="text-sm">Click on a green input port to connect</span>
              </div>
            </div>
          )}

          {/* Empty State */}
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <MousePointer2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 className="font-medium">Start Building Your Workflow</h3>
                <p className="text-sm">Add nodes from the left panel to begin</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar - Node Configuration */}
        {selectedNode && (
          <div className="w-80 border-l bg-muted/30 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Configure Node</h3>
              <Badge variant="outline">{selectedNode.type}</Badge>
            </div>

            <ScrollArea className="h-[calc(100vh-200px)]">
              <div className="space-y-4">
                {/* App Selection */}
                {(selectedNode.type === 'trigger' || selectedNode.type === 'action') && (
                  <div className="space-y-2">
                    <Label>Application</Label>
                    <Select
                      value={selectedNode.appType}
                      onValueChange={(value) => {
                        setNodes(prev => prev.map(node => 
                          node.id === selectedNode.id 
                            ? { ...node, appType: value, functionType: '', title: `${value} ${node.type}` }
                            : node
                        ));
                        setSelectedNode(prev => prev ? { ...prev, appType: value, functionType: '' } : null);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select application" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(appConfigs).map(([key, app]) => (
                          <SelectItem key={key} value={key}>
                            {app.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Function Selection */}
                {selectedNode.appType && appConfigs[selectedNode.appType as keyof typeof appConfigs] && (
                  <div className="space-y-2">
                    <Label>Function</Label>
                    <Select
                      value={selectedNode.functionType}
                      onValueChange={(value) => updateNodeFunction(selectedNode.id, value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select function" />
                      </SelectTrigger>
                      <SelectContent>
                        {appConfigs[selectedNode.appType as keyof typeof appConfigs].functions[
                          selectedNode.type === 'trigger' ? 'triggers' : 'actions'
                        ].map((func) => (
                          <SelectItem key={func} value={func}>
                            {func}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Condition Type Selection */}
                {selectedNode.type === 'condition' && (
                  <div className="space-y-2">
                    <Label>Condition Type</Label>
                    <Select
                      value={selectedNode.functionType}
                      onValueChange={(value) => updateNodeFunction(selectedNode.id, value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select condition" />
                      </SelectTrigger>
                      <SelectContent>
                        {conditionTypes.map((condition) => (
                          <SelectItem key={condition} value={condition}>
                            {condition}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* AI Action Type Selection */}
                {selectedNode.type === 'ai' && (
                  <div className="space-y-2">
                    <Label>AI Action</Label>
                    <Select
                      value={selectedNode.functionType}
                      onValueChange={(value) => updateNodeFunction(selectedNode.id, value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select AI action" />
                      </SelectTrigger>
                      <SelectContent>
                        {aiActionTypes.map((action) => (
                          <SelectItem key={action} value={action}>
                            {action}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Dynamic Configuration Fields */}
                {selectedNode.functionType && (
                  <div className="space-y-4">
                    <Separator />
                    <h4 className="font-medium">Configuration</h4>
                    
                    {/* Common configuration fields based on function type */}
                    {selectedNode.functionType.includes('Email') && (
                      <>
                        <div className="space-y-2">
                          <Label>Email Query</Label>
                          <Input
                            placeholder="is:unread from:sender@example.com"
                            value={selectedNode.config.query || ''}
                            onChange={(e) => updateNodeConfig(selectedNode.id, 'query', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Max Results</Label>
                          <Input
                            type="number"
                            placeholder="10"
                            value={selectedNode.config.maxResults || ''}
                            onChange={(e) => updateNodeConfig(selectedNode.id, 'maxResults', e.target.value)}
                          />
                        </div>
                      </>
                    )}

                    {selectedNode.functionType.includes('Sheet') && (
                      <>
                        <div className="space-y-2">
                          <Label>Spreadsheet ID</Label>
                          <Input
                            placeholder="1ABC...XYZ"
                            value={selectedNode.config.spreadsheetId || ''}
                            onChange={(e) => updateNodeConfig(selectedNode.id, 'spreadsheetId', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Range</Label>
                          <Input
                            placeholder="A1:Z1000"
                            value={selectedNode.config.range || ''}
                            onChange={(e) => updateNodeConfig(selectedNode.id, 'range', e.target.value)}
                          />
                        </div>
                      </>
                    )}

                    {selectedNode.type === 'condition' && (
                      <>
                        <div className="space-y-2">
                          <Label>Value to Check</Label>
                          <Input
                            placeholder="Enter value or variable"
                            value={selectedNode.config.checkValue || ''}
                            onChange={(e) => updateNodeConfig(selectedNode.id, 'checkValue', e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Comparison Value</Label>
                          <Input
                            placeholder="Value to compare against"
                            value={selectedNode.config.compareValue || ''}
                            onChange={(e) => updateNodeConfig(selectedNode.id, 'compareValue', e.target.value)}
                          />
                        </div>
                      </>
                    )}

                    {selectedNode.type === 'ai' && (
                      <div className="space-y-2">
                        <Label>AI Prompt</Label>
                        <Textarea
                          placeholder="Describe what you want the AI to do..."
                          value={selectedNode.config.prompt || ''}
                          onChange={(e) => updateNodeConfig(selectedNode.id, 'prompt', e.target.value)}
                          rows={4}
                        />
                      </div>
                    )}

                    {/* Additional generic fields */}
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea
                        placeholder="Add notes about this step..."
                        value={selectedNode.config.notes || ''}
                        onChange={(e) => updateNodeConfig(selectedNode.id, 'notes', e.target.value)}
                        rows={2}
                      />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
};