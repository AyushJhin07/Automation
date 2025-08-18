import React, { useState, useCallback, useRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Connection,
  EdgeChange,
  NodeChange,
  ReactFlowProvider,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Mail,
  FileSpreadsheet,
  FolderCog,
  FileText,
  Calendar,
  Plus,
  Play,
  Save,
  Download,
} from 'lucide-react';

// Define Google Apps and their actions
const googleApps = {
  gmail: {
    name: 'Gmail',
    icon: Mail,
    color: 'from-red-500 to-pink-500',
    actions: {
      mvp: [
        'Search emails',
        'Get threads by label', 
        'Read latest message',
        'Extract fields',
        'Download attachments',
        'Create draft',
        'Send email',
        'Mark as read/unread',
        'Add/remove labels',
        'Archive/move to trash'
      ],
      advanced: [
        'Heuristic spam filter',
        'Auto-reply template',
        'Forward with filters',
        'Deduplicate by message-ID',
        'Parse structured data',
        'Thread statistics',
        'Batch label management',
        'Gmail → Webhook notify'
      ]
    }
  },
  sheets: {
    name: 'Google Sheets',
    icon: FileSpreadsheet,
    color: 'from-green-500 to-emerald-500',
    actions: {
      mvp: [
        'Append row(s)',
        'Read range',
        'Update range',
        'Clear range/sheet',
        'Create/rename/delete sheet',
        'Find row(s) by value',
        'Basic sort',
        'Get last row/column'
      ],
      advanced: [
        'Batch get/update ranges',
        'Upsert rows',
        'Data validation',
        'Filter/Filter views',
        'Conditional formatting',
        'Protected ranges',
        'Pivot tables',
        'Charts',
        'Import CSV'
      ]
    }
  },
  drive: {
    name: 'Google Drive',
    icon: FolderCog,
    color: 'from-blue-500 to-cyan-500',
    actions: {
      mvp: [
        'Create folder',
        'Upload file',
        'Move file to folder',
        'Copy file',
        'Rename file/folder',
        'Delete/trash/restore',
        'Search files/folders',
        'Get share link',
        'Export as PDF'
      ],
      advanced: [
        'Set permissions',
        'Change owner',
        'List/restore revisions',
        'Create shortcut',
        'Download file content',
        'MIME conversions',
        'Cleanup rules'
      ]
    }
  },
  docs: {
    name: 'Google Docs',
    icon: FileText,
    color: 'from-purple-500 to-indigo-500',
    actions: {
      mvp: [
        'Create document',
        'Open doc by ID',
        'Insert/append text',
        'Find & replace text',
        'Insert table',
        'Insert image',
        'Apply headings/styles',
        'Read full text content'
      ],
      advanced: [
        'Headers/footers',
        'Bookmarks/links',
        'Table of contents',
        'Style ranges',
        'Merge multiple docs',
        'Export as PDF/Docx',
        'Mail-merge engine',
        'Watermarks'
      ]
    }
  }
};

// Custom Node Component
const AppNode = ({ data, selected }: { data: any; selected: boolean }) => {
  const app = googleApps[data.appType as keyof typeof googleApps];
  const Icon = app.icon;

  return (
    <div
      className={`relative bg-white rounded-lg border-2 shadow-lg min-w-[250px] ${
        selected ? 'border-blue-500 shadow-xl' : 'border-gray-200'
      }`}
    >
      <Handle type="target" position={Position.Left} className="w-3 h-3 !bg-gray-400" />
      
      <div className={`bg-gradient-to-r ${app.color} p-3 rounded-t-lg text-white`}>
        <div className="flex items-center gap-2">
          <Icon className="size-5" />
          <span className="font-semibold">{app.name}</span>
        </div>
      </div>
      
      <div className="p-3">
        <div className="mb-2">
          <Select value={data.selectedAction} onValueChange={data.onActionChange}>
            <SelectTrigger className="w-full text-sm">
              <SelectValue placeholder="Select action..." />
            </SelectTrigger>
            <SelectContent>
              <div className="px-2 py-1">
                <div className="text-xs font-semibold text-gray-500 mb-1">MVP Actions</div>
                {app.actions.mvp.map((action) => (
                  <SelectItem key={action} value={action} className="text-sm">
                    {action}
                  </SelectItem>
                ))}
              </div>
              <div className="px-2 py-1 border-t">
                <div className="text-xs font-semibold text-gray-500 mb-1">Advanced Actions</div>
                {app.actions.advanced.map((action) => (
                  <SelectItem key={action} value={action} className="text-sm">
                    {action}
                  </SelectItem>
                ))}
              </div>
            </SelectContent>
          </Select>
        </div>
        
        {data.selectedAction && (
          <Badge variant="secondary" className="text-xs">
            {data.selectedAction}
          </Badge>
        )}
      </div>

      <Handle type="source" position={Position.Right} className="w-3 h-3 !bg-gray-400" />
    </div>
  );
};

// Node types for ReactFlow
const nodeTypes = {
  appNode: AppNode,
};

interface WorkflowGraphBuilderProps {
  onWorkflowSave?: (workflow: any) => void;
  onWorkflowTest?: (workflow: any) => void;
}

const WorkflowGraphBuilderInner: React.FC<WorkflowGraphBuilderProps> = ({
  onWorkflowSave,
  onWorkflowTest
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedApp, setSelectedApp] = useState<string>('');
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const nodeIdRef = useRef(1);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const addNode = useCallback((appType: string) => {
    const newNode: Node = {
      id: `${appType}-${nodeIdRef.current++}`,
      type: 'appNode',
      position: {
        x: Math.random() * 400,
        y: Math.random() * 300,
      },
      data: {
        appType,
        selectedAction: '',
        onActionChange: (action: string) => {
          setNodes((nds) =>
            nds.map((node) =>
              node.id === newNode.id
                ? { ...node, data: { ...node.data, selectedAction: action } }
                : node
            )
          );
        },
      },
    };

    setNodes((nds) => nds.concat(newNode));
  }, [setNodes]);

  const generateWorkflowCode = useCallback(() => {
    const workflow = {
      nodes: nodes.map(node => ({
        id: node.id,
        app: node.data.appType,
        action: node.data.selectedAction,
        position: node.position
      })),
      connections: edges.map(edge => ({
        from: edge.source,
        to: edge.target
      }))
    };

    // Generate Google Apps Script code
    let code = `// Generated Google Apps Script Workflow
// Generated on ${new Date().toISOString()}

function executeWorkflow() {
  Logger.log("Starting workflow execution...");
  
  try {
`;

    // Add function calls for each node
    nodes.forEach(node => {
      if (node.data.selectedAction) {
        const functionName = `execute_${node.data.appType}_${node.id.replace('-', '_')}`;
        code += `    ${functionName}();\n`;
      }
    });

    code += `    
    Logger.log("Workflow completed successfully");
  } catch (error) {
    Logger.log("Workflow failed: " + error.toString());
    throw error;
  }
}

`;

    // Generate individual functions for each node
    nodes.forEach(node => {
      if (node.data.selectedAction) {
        const app = googleApps[node.data.appType as keyof typeof googleApps];
        const functionName = `execute_${node.data.appType}_${node.id.replace('-', '_')}`;
        
        code += `function ${functionName}() {
  // ${app.name}: ${node.data.selectedAction}
  Logger.log("Executing ${app.name} - ${node.data.selectedAction}");
  
  // TODO: Implement ${node.data.selectedAction} logic here
  // This is where you would add the specific Apps Script code for this action
  
  return {
    success: true,
    data: null,
    message: "${node.data.selectedAction} completed"
  };
}

`;
      }
    });

    return { workflow, code };
  }, [nodes, edges]);

  const handleSaveWorkflow = () => {
    const { workflow, code } = generateWorkflowCode();
    onWorkflowSave?.(workflow);
    
    // Download the generated code
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workflow.gs';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleTestWorkflow = () => {
    const { workflow } = generateWorkflowCode();
    onWorkflowTest?.(workflow);
    alert('Workflow test initiated! Check the console for execution details.');
  };

  return (
    <div className="h-[600px] bg-gray-50 rounded-lg border">
      <div className="p-4 border-b bg-white">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Visual Workflow Builder</h3>
          <div className="flex gap-2">
            <Button onClick={handleTestWorkflow} variant="outline" size="sm">
              <Play className="size-4 mr-1" />
              Test
            </Button>
            <Button onClick={handleSaveWorkflow} size="sm">
              <Download className="size-4 mr-1" />
              Export Code
            </Button>
          </div>
        </div>
        
        <div className="flex gap-2 flex-wrap">
          {Object.entries(googleApps).map(([key, app]) => {
            const Icon = app.icon;
            return (
              <Button
                key={key}
                onClick={() => addNode(key)}
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
              >
                <Icon className="size-4" />
                {app.name}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="h-[500px]" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          attributionPosition="bottom-left"
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
    </div>
  );
};

export const WorkflowGraphBuilder: React.FC<WorkflowGraphBuilderProps> = (props) => {
  return (
    <ReactFlowProvider>
      <WorkflowGraphBuilderInner {...props} />
    </ReactFlowProvider>
  );
};

export default WorkflowGraphBuilder;