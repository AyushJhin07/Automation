import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  EdgeTypes,
  ReactFlowProvider,
  ReactFlowInstance,
  MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Mail, 
  FileSpreadsheet, 
  FolderOpen, 
  FileText, 
  Calendar, 
  FileBarChart,
  Play,
  Download,
  Code,
  Plus,
  Settings,
  Timer,
  Zap
} from 'lucide-react';
import { GoogleAppsNode } from '@/components/automation/nodes/GoogleAppsNode';
import { TriggerNode } from '@/components/automation/nodes/TriggerNode';
import { ActionNode } from '@/components/automation/nodes/ActionNode';
import { GoogleAppsScriptGenerator } from '@/components/automation/GoogleAppsScriptGenerator';

const nodeTypes: NodeTypes = {
  googleApp: GoogleAppsNode,
  trigger: TriggerNode,
  action: ActionNode,
};

const edgeTypes: EdgeTypes = {};

export interface AppFunction {
  id: string;
  name: string;
  description: string;
  category: 'MVP' | 'Advanced';
  parameters: {
    name: string;
    type: 'text' | 'select' | 'textarea' | 'number' | 'boolean';
    required: boolean;
    options?: string[];
    defaultValue?: any;
    description: string;
  }[];
}

export interface GoogleApp {
  id: string;
  name: string;
  icon: React.ComponentType<any>;
  color: string;
  functions: AppFunction[];
  scopes: string[];
}

const googleApps: GoogleApp[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    icon: Mail,
    color: '#EA4335',
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send'
    ],
    functions: [
      {
        id: 'search_emails',
        name: 'Search Emails',
        description: 'Search emails by query, date range, from, or subject',
        category: 'MVP',
        parameters: [
          { name: 'query', type: 'text', required: true, description: 'Gmail search query', defaultValue: 'is:unread' },
          { name: 'maxResults', type: 'number', required: false, description: 'Maximum number of results', defaultValue: 10 }
        ]
      },
      {
        id: 'send_email',
        name: 'Send Email',
        description: 'Send email with to, cc, bcc, HTML/text, attachments',
        category: 'MVP',
        parameters: [
          { name: 'to', type: 'text', required: true, description: 'Recipient email addresses' },
          { name: 'subject', type: 'text', required: true, description: 'Email subject' },
          { name: 'body', type: 'textarea', required: true, description: 'Email body content' },
          { name: 'cc', type: 'text', required: false, description: 'CC recipients' },
          { name: 'bcc', type: 'text', required: false, description: 'BCC recipients' }
        ]
      },
      {
        id: 'read_latest_message',
        name: 'Read Latest Message',
        description: 'Read latest message in each thread',
        category: 'MVP',
        parameters: [
          { name: 'labelName', type: 'text', required: false, description: 'Label to filter by', defaultValue: 'INBOX' }
        ]
      },
      {
        id: 'extract_fields',
        name: 'Extract Fields',
        description: 'Extract date, from, subject, snippet, body from emails',
        category: 'MVP',
        parameters: [
          { name: 'fields', type: 'select', required: true, options: ['date', 'from', 'subject', 'snippet', 'body'], description: 'Fields to extract' }
        ]
      },
      {
        id: 'download_attachments',
        name: 'Download Attachments',
        description: 'Download email attachments to Drive',
        category: 'MVP',
        parameters: [
          { name: 'folderId', type: 'text', required: true, description: 'Drive folder ID for attachments' }
        ]
      },
      {
        id: 'add_label',
        name: 'Add/Remove Labels',
        description: 'Add or remove labels from emails',
        category: 'MVP',
        parameters: [
          { name: 'labelName', type: 'text', required: true, description: 'Label name to add/remove' },
          { name: 'action', type: 'select', required: true, options: ['add', 'remove'], description: 'Add or remove label' }
        ]
      },
      {
        id: 'auto_reply',
        name: 'Auto-Reply Template',
        description: 'Send auto-reply with placeholders',
        category: 'Advanced',
        parameters: [
          { name: 'template', type: 'textarea', required: true, description: 'Reply template with placeholders' },
          { name: 'conditions', type: 'text', required: false, description: 'Conditions for auto-reply' }
        ]
      },
      {
        id: 'parse_structured_data',
        name: 'Parse Structured Data',
        description: 'Parse structured data using regex to JSON for Sheets',
        category: 'Advanced',
        parameters: [
          { name: 'regex', type: 'text', required: true, description: 'Regex pattern for data extraction' },
          { name: 'outputFormat', type: 'select', required: true, options: ['JSON', 'CSV'], description: 'Output format' }
        ]
      }
    ]
  },
  {
    id: 'sheets',
    name: 'Google Sheets',
    icon: FileSpreadsheet,
    color: '#34A853',
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/spreadsheets.readonly'
    ],
    functions: [
      {
        id: 'append_row',
        name: 'Append Row',
        description: 'Append new rows to a sheet',
        category: 'MVP',
        parameters: [
          { name: 'spreadsheetId', type: 'text', required: true, description: 'Spreadsheet ID' },
          { name: 'range', type: 'text', required: true, description: 'Sheet range (e.g., A1:D1)', defaultValue: 'A:D' },
          { name: 'values', type: 'textarea', required: true, description: 'Values to append (comma-separated)' }
        ]
      },
      {
        id: 'read_range',
        name: 'Read Range',
        description: 'Read data from a specific range',
        category: 'MVP',
        parameters: [
          { name: 'spreadsheetId', type: 'text', required: true, description: 'Spreadsheet ID' },
          { name: 'range', type: 'text', required: true, description: 'Range to read (e.g., A1:D10)' }
        ]
      },
      {
        id: 'update_range',
        name: 'Update Range',
        description: 'Update values in a specific range',
        category: 'MVP',
        parameters: [
          { name: 'spreadsheetId', type: 'text', required: true, description: 'Spreadsheet ID' },
          { name: 'range', type: 'text', required: true, description: 'Range to update' },
          { name: 'values', type: 'textarea', required: true, description: 'New values' }
        ]
      },
      {
        id: 'find_rows',
        name: 'Find Rows by Value',
        description: 'Find rows by matching value in column',
        category: 'MVP',
        parameters: [
          { name: 'spreadsheetId', type: 'text', required: true, description: 'Spreadsheet ID' },
          { name: 'searchValue', type: 'text', required: true, description: 'Value to search for' },
          { name: 'searchColumn', type: 'text', required: true, description: 'Column to search in (e.g., A)' }
        ]
      },
      {
        id: 'create_sheet',
        name: 'Create Sheet',
        description: 'Create new sheet tab',
        category: 'MVP',
        parameters: [
          { name: 'spreadsheetId', type: 'text', required: true, description: 'Spreadsheet ID' },
          { name: 'sheetName', type: 'text', required: true, description: 'Name for new sheet' }
        ]
      },
      {
        id: 'upsert_rows',
        name: 'Upsert Rows',
        description: 'Insert or update rows based on key column',
        category: 'Advanced',
        parameters: [
          { name: 'spreadsheetId', type: 'text', required: true, description: 'Spreadsheet ID' },
          { name: 'keyColumn', type: 'text', required: true, description: 'Key column for matching' },
          { name: 'data', type: 'textarea', required: true, description: 'Data to upsert' }
        ]
      },
      {
        id: 'conditional_formatting',
        name: 'Conditional Formatting',
        description: 'Apply conditional formatting rules',
        category: 'Advanced',
        parameters: [
          { name: 'spreadsheetId', type: 'text', required: true, description: 'Spreadsheet ID' },
          { name: 'range', type: 'text', required: true, description: 'Range to format' },
          { name: 'condition', type: 'text', required: true, description: 'Formatting condition' }
        ]
      }
    ]
  },
  {
    id: 'drive',
    name: 'Google Drive',
    icon: FolderOpen,
    color: '#4285F4',
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.readonly'
    ],
    functions: [
      {
        id: 'create_folder',
        name: 'Create Folder',
        description: 'Create a new folder in Drive',
        category: 'MVP',
        parameters: [
          { name: 'folderName', type: 'text', required: true, description: 'Name for the new folder' },
          { name: 'parentFolderId', type: 'text', required: false, description: 'Parent folder ID (optional)' }
        ]
      },
      {
        id: 'upload_file',
        name: 'Upload File',
        description: 'Upload file to Drive',
        category: 'MVP',
        parameters: [
          { name: 'fileName', type: 'text', required: true, description: 'Name for uploaded file' },
          { name: 'folderId', type: 'text', required: false, description: 'Destination folder ID' },
          { name: 'mimeType', type: 'text', required: false, description: 'File MIME type' }
        ]
      },
      {
        id: 'search_files',
        name: 'Search Files',
        description: 'Search files by name, type, owner, or date',
        category: 'MVP',
        parameters: [
          { name: 'query', type: 'text', required: true, description: 'Search query' },
          { name: 'mimeType', type: 'text', required: false, description: 'File type filter' }
        ]
      },
      {
        id: 'export_as_pdf',
        name: 'Export as PDF',
        description: 'Export Google Docs/Sheets/Slides as PDF',
        category: 'MVP',
        parameters: [
          { name: 'fileId', type: 'text', required: true, description: 'File ID to export' },
          { name: 'exportName', type: 'text', required: false, description: 'Name for exported PDF' }
        ]
      },
      {
        id: 'set_permissions',
        name: 'Set Permissions',
        description: 'Add/remove viewer/editor permissions',
        category: 'Advanced',
        parameters: [
          { name: 'fileId', type: 'text', required: true, description: 'File ID' },
          { name: 'email', type: 'text', required: true, description: 'User email' },
          { name: 'role', type: 'select', required: true, options: ['viewer', 'editor'], description: 'Permission role' }
        ]
      }
    ]
  },
  {
    id: 'docs',
    name: 'Google Docs',
    icon: FileText,
    color: '#4285F4',
    scopes: [
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/documents.readonly'
    ],
    functions: [
      {
        id: 'create_document',
        name: 'Create Document',
        description: 'Create new document from template or blank',
        category: 'MVP',
        parameters: [
          { name: 'title', type: 'text', required: true, description: 'Document title' },
          { name: 'templateId', type: 'text', required: false, description: 'Template document ID (optional)' }
        ]
      },
      {
        id: 'find_replace',
        name: 'Find & Replace',
        description: 'Replace placeholders with actual values',
        category: 'MVP',
        parameters: [
          { name: 'documentId', type: 'text', required: true, description: 'Document ID' },
          { name: 'findText', type: 'text', required: true, description: 'Text to find' },
          { name: 'replaceText', type: 'text', required: true, description: 'Replacement text' }
        ]
      },
      {
        id: 'insert_text',
        name: 'Insert Text',
        description: 'Insert or append text (plain or styled)',
        category: 'MVP',
        parameters: [
          { name: 'documentId', type: 'text', required: true, description: 'Document ID' },
          { name: 'text', type: 'textarea', required: true, description: 'Text to insert' },
          { name: 'index', type: 'number', required: false, description: 'Insert position (optional)' }
        ]
      },
      {
        id: 'insert_table',
        name: 'Insert Table',
        description: 'Insert table with specified rows and columns',
        category: 'MVP',
        parameters: [
          { name: 'documentId', type: 'text', required: true, description: 'Document ID' },
          { name: 'rows', type: 'number', required: true, description: 'Number of rows', defaultValue: 3 },
          { name: 'columns', type: 'number', required: true, description: 'Number of columns', defaultValue: 3 }
        ]
      }
    ]
  },
  {
    id: 'calendar',
    name: 'Google Calendar',
    icon: Calendar,
    color: '#4285F4',
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ],
    functions: [
      {
        id: 'create_event',
        name: 'Create Event',
        description: 'Create calendar event with details',
        category: 'MVP',
        parameters: [
          { name: 'title', type: 'text', required: true, description: 'Event title' },
          { name: 'startTime', type: 'text', required: true, description: 'Start time (ISO format)' },
          { name: 'endTime', type: 'text', required: true, description: 'End time (ISO format)' },
          { name: 'description', type: 'textarea', required: false, description: 'Event description' }
        ]
      },
      {
        id: 'get_events',
        name: 'Get Events',
        description: 'Retrieve calendar events by date range',
        category: 'MVP',
        parameters: [
          { name: 'startDate', type: 'text', required: true, description: 'Start date (YYYY-MM-DD)' },
          { name: 'endDate', type: 'text', required: true, description: 'End date (YYYY-MM-DD)' }
        ]
      }
    ]
  }
];

const triggerTypes = [
  {
    id: 'time_based',
    name: 'Time-based Trigger',
    description: 'Run automation on schedule',
    icon: Timer,
    parameters: [
      { name: 'frequency', type: 'select', required: true, options: ['everyMinute', 'everyHour', 'everyDay', 'everyWeek'], description: 'Trigger frequency' }
    ]
  },
  {
    id: 'form_submit',
    name: 'Form Submit',
    description: 'Trigger when form is submitted',
    icon: FileBarChart,
    parameters: [
      { name: 'formId', type: 'text', required: true, description: 'Google Form ID' }
    ]
  },
  {
    id: 'email_received',
    name: 'Email Received',
    description: 'Trigger when email is received (polling)',
    icon: Mail,
    parameters: [
      { name: 'searchQuery', type: 'text', required: true, description: 'Gmail search query for trigger', defaultValue: 'is:unread' }
    ]
  }
];

export interface AutomationBuilderProps {
  automationId: string;
  onScriptGenerated: (script: string) => void;
}

export function AutomationBuilder({ automationId, onScriptGenerated }: AutomationBuilderProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [selectedApp, setSelectedApp] = useState<GoogleApp | null>(null);
  const [selectedTrigger, setSelectedTrigger] = useState<any>(null);
  const [generatedScript, setGeneratedScript] = useState<string>('');
  const [activeTab, setActiveTab] = useState('builder');
  
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  const onConnect = useCallback(
    (params: Connection) => {
      const edge = {
        ...params,
        type: 'smoothstep',
        markerEnd: {
          type: MarkerType.ArrowClosed,
        },
        style: {
          strokeWidth: 2,
          stroke: '#6366f1',
        },
      };
      setEdges((eds) => addEdge(edge, eds));
    },
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowInstance || !reactFlowWrapper.current) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const type = event.dataTransfer.getData('application/reactflow');
      const appData = event.dataTransfer.getData('application/json');

      if (!type) return;

      const position = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: appData ? JSON.parse(appData) : {},
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes]
  );

  const generateScript = useCallback(() => {
    const generator = new GoogleAppsScriptGenerator();
    const script = generator.generateScript(nodes, edges);
    setGeneratedScript(script);
    onScriptGenerated(script);
    setActiveTab('code');
  }, [nodes, edges, onScriptGenerated]);

  const downloadScript = useCallback(() => {
    if (!generatedScript) return;
    
    const blob = new Blob([generatedScript], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${automationId}-automation.js`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [generatedScript, automationId]);

  return (
    <div className="h-[800px] w-full border border-gray-200 rounded-xl overflow-hidden bg-white">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
        <div className="flex items-center justify-between p-4 border-b bg-gray-50">
          <TabsList>
            <TabsTrigger value="builder" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Builder
            </TabsTrigger>
            <TabsTrigger value="code" className="flex items-center gap-2">
              <Code className="w-4 h-4" />
              Generated Code
            </TabsTrigger>
          </TabsList>
          
          <div className="flex gap-2">
            <Button onClick={generateScript} className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Generate Script
            </Button>
            {generatedScript && (
              <Button onClick={downloadScript} variant="outline" className="flex items-center gap-2">
                <Download className="w-4 h-4" />
                Download
              </Button>
            )}
          </div>
        </div>

        <TabsContent value="builder" className="h-full p-0 m-0">
          <div className="flex h-full">
            {/* Sidebar */}
            <div className="w-80 border-r bg-gray-50 overflow-y-auto">
              <div className="p-4">
                <h3 className="font-semibold mb-4">Triggers</h3>
                <div className="space-y-2 mb-6">
                  {triggerTypes.map((trigger) => (
                    <div
                      key={trigger.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData('application/reactflow', 'trigger');
                        event.dataTransfer.setData('application/json', JSON.stringify(trigger));
                      }}
                      className="p-3 bg-white border border-gray-200 rounded-lg cursor-grab hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <trigger.icon className="w-5 h-5 text-blue-600" />
                        <div>
                          <div className="font-medium text-sm">{trigger.name}</div>
                          <div className="text-xs text-gray-500">{trigger.description}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <h3 className="font-semibold mb-4">Google Apps</h3>
                <div className="space-y-2">
                  {googleApps.map((app) => (
                    <div
                      key={app.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData('application/reactflow', 'googleApp');
                        event.dataTransfer.setData('application/json', JSON.stringify(app));
                      }}
                      className="p-3 bg-white border border-gray-200 rounded-lg cursor-grab hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <app.icon className="w-5 h-5" style={{ color: app.color }} />
                        <div>
                          <div className="font-medium text-sm">{app.name}</div>
                          <div className="text-xs text-gray-500">{app.functions.length} functions</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Main Canvas */}
            <div className="flex-1" ref={reactFlowWrapper}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onInit={setReactFlowInstance}
                onDrop={onDrop}
                onDragOver={onDragOver}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
                className="bg-gray-50"
              >
                <Background />
                <Controls />
              </ReactFlow>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="code" className="h-full p-4 m-0">
          <div className="h-full bg-gray-900 rounded-lg p-4 overflow-y-auto">
            <pre className="text-green-400 text-sm font-mono whitespace-pre-wrap">
              {generatedScript || '// Generate script to see the code here...'}
            </pre>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AutomationBuilderWrapper(props: AutomationBuilderProps) {
  return (
    <ReactFlowProvider>
      <AutomationBuilder {...props} />
    </ReactFlowProvider>
  );
}