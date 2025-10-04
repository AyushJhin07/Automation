import React, { useState, useCallback, useRef, useMemo } from 'react';
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
import GoogleAppsNode from '@/components/automation/nodes/GoogleAppsNode';
import TriggerNode from '@/components/automation/nodes/TriggerNode';
import ActionNode from '@/components/automation/nodes/ActionNode';
import { GoogleAppsScriptGenerator } from '@/components/automation/GoogleAppsScriptGenerator';
import { useConnectorDefinitions } from '@/hooks/useConnectorDefinitions';
import type { ConnectorDefinitionSummary, ConnectorActionSummary } from '@/services/connectorDefinitionsService';
import { GoogleApp, AppFunction, AutomationBuilderProps } from './types';

const nodeTypes: NodeTypes = {
  googleApp: GoogleAppsNode,
  trigger: TriggerNode,
  action: ActionNode,
};

const edgeTypes: EdgeTypes = {};

const CONNECTOR_ICON_MAP: Record<string, React.ComponentType<any>> = {
  gmail: Mail,
  sheets: FileSpreadsheet,
  drive: FolderOpen,
  docs: FileText,
  calendar: Calendar,
};

const STATIC_GOOGLE_APPS: GoogleApp[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    icon: Mail,
    color: '#EA4335',
    scopes: [],
    functions: [],
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

const STATIC_NON_GMAIL_APPS = STATIC_GOOGLE_APPS.filter(app => app.id !== 'gmail');

const sanitizeOptionValues = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry : entry != null ? String(entry) : ''))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
};

const inferParameterType = (schema: any): AppFunction['parameters'][number]['type'] => {
  if (!schema || typeof schema !== 'object') {
    return 'text';
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return 'select';
  }

  const rawType = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  switch (rawType) {
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
    case 'object':
      return 'textarea';
    default:
      break;
  }

  if (typeof schema.format === 'string') {
    const lowered = schema.format.toLowerCase();
    if (lowered.includes('html') || lowered.includes('markdown')) {
      return 'textarea';
    }
  }

  if (typeof schema.contentMediaType === 'string') {
    return 'textarea';
  }

  return 'text';
};

const convertParametersFromSchema = (schema: any): AppFunction['parameters'] => {
  if (!schema || typeof schema !== 'object') {
    return [];
  }

  const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
  const required = Array.isArray(schema.required)
    ? schema.required.map((entry: any) => String(entry))
    : [];

  const parameters: AppFunction['parameters'] = [];

  for (const [name, definition] of Object.entries(properties)) {
    const parameterType = inferParameterType(definition);
    const options = parameterType === 'select' ? sanitizeOptionValues((definition as any)?.enum) : undefined;
    parameters.push({
      name,
      type: parameterType,
      required: required.includes(name),
      options,
      defaultValue: (definition as any)?.default,
      description: typeof (definition as any)?.description === 'string' ? (definition as any).description : '',
    });
  }

  return parameters;
};

const buildAppFunctionFromAction = (action: ConnectorActionSummary): AppFunction | null => {
  if (!action || typeof action !== 'object') {
    return null;
  }

  if (!action.id || action.id === 'test_connection') {
    return null;
  }

  const parameters = convertParametersFromSchema(action.params);

  return {
    id: action.id,
    name: action.name || action.id,
    description: action.description || '',
    category: action.id === 'send_email' ? 'Core' : undefined,
    parameters,
  };
};

const collectConnectorScopes = (definition: ConnectorDefinitionSummary): string[] => {
  const scopes = new Set<string>();
  const add = (value: unknown) => {
    if (!Array.isArray(value)) return;
    value.forEach((entry) => {
      if (typeof entry === 'string' && entry.trim().length > 0) {
        scopes.add(entry.trim());
      }
    });
  };

  add(definition.scopes);
  const authConfig = definition.authentication?.config as Record<string, any> | undefined;
  if (authConfig) {
    add(authConfig.scopes);
  }

  return Array.from(scopes);
};

const buildGoogleAppFromDefinition = (definition: ConnectorDefinitionSummary | null | undefined): GoogleApp | null => {
  if (!definition) {
    return null;
  }

  const functions = (definition.actions ?? [])
    .map(buildAppFunctionFromAction)
    .filter((fn): fn is AppFunction => Boolean(fn));

  if (functions.length === 0) {
    return null;
  }

  functions.sort((a, b) => {
    if (a.id === 'send_email' && b.id !== 'send_email') return -1;
    if (b.id === 'send_email' && a.id !== 'send_email') return 1;
    return a.name.localeCompare(b.name);
  });

  const scopes = collectConnectorScopes(definition);
  const icon = CONNECTOR_ICON_MAP[definition.id] ?? Mail;

  return {
    id: definition.id ?? 'gmail',
    name: definition.name ?? 'Gmail',
    icon,
    color: definition.color ?? '#EA4335',
    scopes,
    functions,
  };
};

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

export function AutomationBuilder({ automationId, onScriptGenerated }: AutomationBuilderProps) {
  const {
    data: connectorDefinitions,
    loading: connectorDefinitionsLoading,
    error: connectorDefinitionsError,
  } = useConnectorDefinitions();
  const gmailDefinition = connectorDefinitions?.gmail ?? connectorDefinitions?.['gmail-enhanced'];
  const gmailApp = useMemo(() => buildGoogleAppFromDefinition(gmailDefinition), [gmailDefinition]);
  const googleApps = useMemo(
    () => (gmailApp ? [gmailApp, ...STATIC_NON_GMAIL_APPS] : STATIC_NON_GMAIL_APPS),
    [gmailApp]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
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
      const appId = event.dataTransfer.getData('application/json');

      if (!type) return;

      const position = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      let nodeData = {};
      
      // For googleApp type, find the original app data to preserve React components
      if (type === 'googleApp' && appId) {
        const parsedData = JSON.parse(appId);
        const originalApp = googleApps.find(app => app.id === parsedData.id);
        nodeData = originalApp || parsedData;
      } else if (type === 'trigger' && appId) {
        const parsedData = JSON.parse(appId);
        const originalTrigger = triggerTypes.find(trigger => trigger.id === parsedData.id);
        nodeData = originalTrigger || parsedData;
      } else if (appId) {
        nodeData = JSON.parse(appId);
      }

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: nodeData,
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, setNodes, googleApps]
  );

  const generateScript = useCallback(async () => {
    try {
      // Use backend API for script generation
      const response = await fetch('/api/automation/generate-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nodes, edges }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate script');
      }
      
      const result = await response.json();
      
      if (result.success) {
        setGeneratedScript(result.script);
        onScriptGenerated(result.script);
        setActiveTab('code');
      } else {
        console.error('Script generation failed:', result.error);
        // Fallback to client-side generation
        const generator = new GoogleAppsScriptGenerator();
        const script = generator.generateScript(nodes, edges);
        setGeneratedScript(script);
        onScriptGenerated(script);
        setActiveTab('code');
      }
    } catch (error) {
      console.error('Error generating script:', error);
      // Fallback to client-side generation
      const generator = new GoogleAppsScriptGenerator();
      const script = generator.generateScript(nodes, edges);
      setGeneratedScript(script);
      onScriptGenerated(script);
      setActiveTab('code');
    }
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
                {connectorDefinitionsLoading && !gmailApp && (
                  <div className="text-xs text-muted-foreground mb-2">
                    Loading Gmail connector metadata…
                  </div>
                )}
                {connectorDefinitionsError && (
                  <div className="text-xs text-red-500 mb-2">
                    {connectorDefinitionsError.message ||
                      'Failed to load Gmail metadata. Gmail actions may be unavailable.'}
                  </div>
                )}
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