import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { 
  Mail, 
  FileSpreadsheet, 
  FolderCog, 
  FileText, 
  Calendar,
  Plus,
  Trash2,
  Download,
  Code,
  Zap,
  Link,
  Move,
  Settings,
  Play,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  Info
} from "lucide-react";

// Professional Graph Types
interface GraphNode {
  id: string;
  type: 'gmail' | 'sheets' | 'drive' | 'docs' | 'calendar';
  position: { x: number; y: number };
  config: any;
  isSelected: boolean;
  isDragging: boolean;
}

interface GraphConnection {
  id: string;
  from: string;
  to: string;
  fromPort: 'output';
  toPort: 'input';
  isSelected: boolean;
}

interface GraphState {
  nodes: GraphNode[];
  connections: GraphConnection[];
  selectedNode: string | null;
  selectedConnection: string | null;
  isConnecting: boolean;
  connectingFrom: string | null;
  dragOffset: { x: number; y: number } | null;
  canvasOffset: { x: number; y: number };
  zoom: number;
}

// Professional Google Apps Configuration with Colors
const GOOGLE_APPS_CONFIG = {
  gmail: {
    name: 'Gmail',
    icon: Mail,
    color: '#EA4335',
    bgColor: '#FCE8E6',
    borderColor: '#EA4335',
    gradient: 'linear-gradient(135deg, #FCE8E6 0%, #FADBD8 100%)',
    actions: {
      'search-emails': {
        name: 'Search Emails',
        description: 'Search emails by query, date range, or filters',
        config: {
          query: { type: 'text', label: 'Search Query', placeholder: 'from:example@email.com subject:important' },
          dateRange: { type: 'select', label: 'Date Range', options: ['all', 'today', 'week', 'month', 'custom'] },
          maxResults: { type: 'number', label: 'Max Results', defaultValue: 10 }
        }
      },
      'send-email': {
        name: 'Send Email',
        description: 'Send email with specified content',
        config: {
          to: { type: 'text', label: 'To', placeholder: 'recipient@example.com' },
          subject: { type: 'text', label: 'Subject', placeholder: 'Email subject' },
          body: { type: 'textarea', label: 'Body', placeholder: 'Email body content' },
          htmlBody: { type: 'textarea', label: 'HTML Body (optional)', placeholder: '<p>HTML content</p>' }
        }
      },
      'extract-data': {
        name: 'Extract Data',
        description: 'Extract specific fields from emails',
        config: {
          fields: { type: 'textarea', label: 'Fields to Extract', placeholder: 'from, subject, date, body, attachments' },
          outputFormat: { type: 'select', label: 'Output Format', options: ['json', 'array', 'object'] }
        }
      },
      'add-labels': {
        name: 'Add Labels',
        description: 'Add labels to emails or threads',
        config: {
          labels: { type: 'textarea', label: 'Labels', placeholder: 'Processed, Important, Follow-up' },
          applyTo: { type: 'select', label: 'Apply To', options: ['thread', 'message'] }
        }
      }
    }
  },
  sheets: {
    name: 'Google Sheets',
    icon: FileSpreadsheet,
    color: '#0F9D58',
    bgColor: '#E6F4EA',
    borderColor: '#0F9D58',
    gradient: 'linear-gradient(135deg, #E6F4EA 0%, #D4EDDA 100%)',
    actions: {
      'append-row': {
        name: 'Append Row',
        description: 'Add new row to spreadsheet',
        config: {
          sheetId: { type: 'text', label: 'Sheet ID', placeholder: 'Enter Google Sheet ID' },
          sheetName: { type: 'text', label: 'Sheet Name', placeholder: 'Sheet1' },
          data: { type: 'textarea', label: 'Row Data (JSON)', placeholder: '["value1", "value2", "value3"]' }
        }
      },
      'read-range': {
        name: 'Read Range',
        description: 'Read data from specific range',
        config: {
          sheetId: { type: 'text', label: 'Sheet ID', placeholder: 'Enter Google Sheet ID' },
          range: { type: 'text', label: 'Range', placeholder: 'A1:D10 or Sheet1!A1:D10' }
        }
      },
      'update-range': {
        name: 'Update Range',
        description: 'Update values in specific range',
        config: {
          sheetId: { type: 'text', label: 'Sheet ID', placeholder: 'Enter Google Sheet ID' },
          range: { type: 'text', label: 'Range', placeholder: 'A1:D10' },
          values: { type: 'textarea', label: 'Values (JSON)', placeholder: '[["row1"], ["row2"]]' }
        }
      },
      'find-rows': {
        name: 'Find Rows',
        description: 'Find rows matching criteria',
        config: {
          sheetId: { type: 'text', label: 'Sheet ID', placeholder: 'Enter Google Sheet ID' },
          searchColumn: { type: 'text', label: 'Search Column', placeholder: 'A or column name' },
          searchValue: { type: 'text', label: 'Search Value', placeholder: 'Value to find' }
        }
      }
    }
  },
  drive: {
    name: 'Google Drive',
    icon: FolderCog,
    color: '#4285F4',
    bgColor: '#E8F0FE',
    borderColor: '#4285F4',
    gradient: 'linear-gradient(135deg, #E8F0FE 0%, #D1ECF1 100%)',
    actions: {
      'create-folder': {
        name: 'Create Folder',
        description: 'Create new folder in Drive',
        config: {
          folderName: { type: 'text', label: 'Folder Name', placeholder: 'New Folder' },
          parentFolder: { type: 'text', label: 'Parent Folder ID (optional)', placeholder: 'Parent folder ID' }
        }
      },
      'upload-file': {
        name: 'Upload File',
        description: 'Upload file to Drive',
        config: {
          fileName: { type: 'text', label: 'File Name', placeholder: 'document.pdf' },
          fileContent: { type: 'textarea', label: 'File Content (Base64)', placeholder: 'Base64 encoded content' },
          folderId: { type: 'text', label: 'Folder ID', placeholder: 'Target folder ID' }
        }
      },
      'move-file': {
        name: 'Move File',
        description: 'Move file to different folder',
        config: {
          fileId: { type: 'text', label: 'File ID', placeholder: 'File ID to move' },
          targetFolderId: { type: 'text', label: 'Target Folder ID', placeholder: 'Destination folder ID' }
        }
      },
      'search-files': {
        name: 'Search Files',
        description: 'Search files by criteria',
        config: {
          query: { type: 'text', label: 'Search Query', placeholder: 'name contains "report" and mimeType contains "pdf"' },
          maxResults: { type: 'number', label: 'Max Results', defaultValue: 10 }
        }
      }
    }
  },
  docs: {
    name: 'Google Docs',
    icon: FileText,
    color: '#9C27B0',
    bgColor: '#F3E5F5',
    borderColor: '#9C27B0',
    gradient: 'linear-gradient(135deg, #F3E5F5 0%, #E1BEE7 100%)',
    actions: {
      'create-document': {
        name: 'Create Document',
        description: 'Create new Google Doc',
        config: {
          title: { type: 'text', label: 'Document Title', placeholder: 'New Document' },
          templateId: { type: 'text', label: 'Template ID (optional)', placeholder: 'Template document ID' }
        }
      },
      'insert-text': {
        name: 'Insert Text',
        description: 'Insert text into document',
        config: {
          documentId: { type: 'text', label: 'Document ID', placeholder: 'Google Doc ID' },
          text: { type: 'textarea', label: 'Text Content', placeholder: 'Text to insert' },
          position: { type: 'select', label: 'Position', options: ['start', 'end', 'specific'] }
        }
      },
      'replace-text': {
        name: 'Replace Text',
        description: 'Find and replace text in document',
        config: {
          documentId: { type: 'text', label: 'Document ID', placeholder: 'Google Doc ID' },
          findText: { type: 'text', label: 'Find Text', placeholder: 'Text to find' },
          replaceText: { type: 'text', label: 'Replace With', placeholder: 'Replacement text' }
        }
      },
      'insert-table': {
        name: 'Insert Table',
        description: 'Insert table with data',
        config: {
          documentId: { type: 'text', label: 'Document ID', placeholder: 'Google Doc ID' },
          rows: { type: 'number', label: 'Number of Rows', defaultValue: 3 },
          columns: { type: 'number', label: 'Number of Columns', defaultValue: 3 },
          data: { type: 'textarea', label: 'Table Data (JSON)', placeholder: '[["cell1", "cell2"], ["cell3", "cell4"]]' }
        }
      }
    }
  },
  calendar: {
    name: 'Google Calendar',
    icon: Calendar,
    color: '#FF9800',
    bgColor: '#FFF3E0',
    borderColor: '#FF9800',
    gradient: 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)',
    actions: {
      'create-event': {
        name: 'Create Event',
        description: 'Create calendar event',
        config: {
          summary: { type: 'text', label: 'Event Title', placeholder: 'Meeting with Client' },
          startTime: { type: 'text', label: 'Start Time', placeholder: '2024-03-15T10:00:00' },
          endTime: { type: 'text', label: 'End Time', placeholder: '2024-03-15T11:00:00' },
          attendees: { type: 'textarea', label: 'Attendees', placeholder: 'user1@example.com, user2@example.com' }
        }
      },
      'find-events': {
        name: 'Find Events',
        description: 'Search for calendar events',
        config: {
          query: { type: 'text', label: 'Search Query', placeholder: 'meeting' },
          startDate: { type: 'text', label: 'Start Date', placeholder: '2024-03-01' },
          endDate: { type: 'text', label: 'End Date', placeholder: '2024-03-31' }
        }
      },
      'update-event': {
        name: 'Update Event',
        description: 'Update existing event',
        config: {
          eventId: { type: 'text', label: 'Event ID', placeholder: 'Event ID to update' },
          updates: { type: 'textarea', label: 'Updates (JSON)', placeholder: '{"summary": "New Title"}' }
        }
      },
      'add-attendees': {
        name: 'Add Attendees',
        description: 'Add attendees to event',
        config: {
          eventId: { type: 'text', label: 'Event ID', placeholder: 'Event ID' },
          attendees: { type: 'textarea', label: 'New Attendees', placeholder: 'newuser@example.com' }
        }
      }
    }
  }
};

export default function ProfessionalGraphCustomizer({ 
  scriptId, 
  scriptTitle, 
  onDownload 
}: { 
  scriptId: string; 
  scriptTitle: string; 
  onDownload: (code: string, config: any) => void; 
}) {
  const [graphState, setGraphState] = useState<GraphState>({
    nodes: [],
    connections: [],
    selectedNode: null,
    selectedConnection: null,
    isConnecting: false,
    connectingFrom: null,
    dragOffset: null,
    canvasOffset: { x: 0, y: 0 },
    zoom: 1
  });
  const [selectedApp, setSelectedApp] = useState<string>('');
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [nodeConfig, setNodeConfig] = useState<any>({});
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const canvasRef = useRef<HTMLDivElement>(null);

  // Calculate professional node position with proper spacing
  const calculateNodePosition = useCallback((index: number) => {
    const baseX = 200;
    const baseY = 150;
    const spacingX = 350;
    const spacingY = 250;
    
    const row = Math.floor(index / 2);
    const col = index % 2;
    
    return {
      x: baseX + col * spacingX,
      y: baseY + row * spacingY
    };
  }, []);

  // Add new node to the graph
  const addNode = useCallback((appType: string, action: string) => {
    const position = calculateNodePosition(graphState.nodes.length);
    const newNode: GraphNode = {
      id: `${appType}-${Date.now()}`,
      type: appType as any,
      position,
      config: { action, ...nodeConfig },
      isSelected: false,
      isDragging: false
    };

    setGraphState(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode],
      selectedNode: newNode.id
    }));

    // Reset form
    setSelectedApp('');
    setSelectedAction('');
    setNodeConfig({});
  }, [graphState.nodes.length, nodeConfig, calculateNodePosition]);

  // Remove node from graph
  const removeNode = useCallback((nodeId: string) => {
    setGraphState(prev => ({
      ...prev,
      nodes: prev.nodes.filter(node => node.id !== nodeId),
      connections: prev.connections.filter(conn => conn.from !== nodeId && conn.to !== nodeId),
      selectedNode: prev.selectedNode === nodeId ? null : prev.selectedNode
    }));
  }, []);

  // Start connecting nodes
  const startConnection = useCallback((nodeId: string) => {
    setGraphState(prev => ({
      ...prev,
      isConnecting: true,
      connectingFrom: nodeId
    }));
  }, []);

  // Complete connection
  const completeConnection = useCallback((toNodeId: string) => {
    if (graphState.connectingFrom && graphState.connectingFrom !== toNodeId) {
      const newConnection: GraphConnection = {
        id: `conn-${Date.now()}`,
        from: graphState.connectingFrom,
        to: toNodeId,
        fromPort: 'output',
        toPort: 'input',
        isSelected: false
      };

      setGraphState(prev => ({
        ...prev,
        connections: [...prev.connections, newConnection],
        isConnecting: false,
        connectingFrom: null
      }));
    }
  }, [graphState.connectingFrom]);

  // Handle mouse down on node (start dragging)
  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = graphState.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    setGraphState(prev => ({
      ...prev,
      selectedNode: nodeId,
      dragOffset: {
        x: e.clientX - rect.left - node.position.x,
        y: e.clientY - rect.top - node.position.y
      }
    }));
  }, [graphState.nodes]);

  // Handle mouse move (dragging)
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!graphState.dragOffset || !graphState.selectedNode) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const newX = e.clientX - rect.left - graphState.dragOffset.x;
    const newY = e.clientY - rect.top - graphState.dragOffset.y;

    setGraphState(prev => ({
      ...prev,
      nodes: prev.nodes.map(node => 
        node.id === prev.selectedNode 
          ? { ...node, position: { x: newX, y: newY } }
          : node
      )
    }));
  }, [graphState.dragOffset, graphState.selectedNode]);

  // Handle mouse up (stop dragging)
  const handleMouseUp = useCallback(() => {
    setGraphState(prev => ({
      ...prev,
      dragOffset: null
    }));
  }, []);

  // Generate Apps Script code
  const generateCode = useCallback(() => {
    let code = `// Generated by Professional Graph Customizer
// Script: ${scriptTitle}

function main() {
  try {
    executeWorkflow();
  } catch (error) {
    console.error('Workflow execution failed:', error);
    throw error;
  }
}

function executeWorkflow() {
`;

    // Generate code for each node in order
    graphState.nodes.forEach((node, index) => {
      const appConfig = GOOGLE_APPS_CONFIG[node.type];
      const actionConfig = appConfig.actions[node.config.action];
      
      if (actionConfig) {
        code += `  // ${appConfig.name} - ${actionConfig.name}\n`;
        code += `  const ${node.id} = ${generateNodeCode(node)};\n`;
        
        if (index < graphState.nodes.length - 1) {
          code += `  \n`;
        }
      }
    });

    code += `}

${generateHelperFunctions()}
`;

    setGeneratedCode(code);
    return code;
  }, [graphState.nodes, scriptTitle]);

  // Generate code for a specific node
  const generateNodeCode = (node: GraphNode): string => {
    const appConfig = GOOGLE_APPS_CONFIG[node.type];
    const actionConfig = appConfig.actions[node.config.action];
    
    if (!actionConfig) return 'null';

    switch (node.type) {
      case 'gmail':
        return generateGmailCode(node.config);
      case 'sheets':
        return generateSheetsCode(node.config);
      case 'drive':
        return generateDriveCode(node.config);
      case 'docs':
        return generateDocsCode(node.config);
      case 'calendar':
        return generateCalendarCode(node.config);
      default:
        return 'null';
    }
  };

  // Generate Gmail code
  const generateGmailCode = (config: any): string => {
    switch (config.action) {
      case 'search-emails':
        return `GmailApp.search('${config.query || 'is:unread'}').slice(0, ${config.maxResults || 10})`;
      case 'send-email':
        return `GmailApp.sendEmail('${config.to}', '${config.subject}', '${config.body}')`;
      case 'extract-data':
        return `extractEmailData(GmailApp.search('is:unread').slice(0, 5))`;
      case 'add-labels':
        return `addLabelsToThreads(GmailApp.search('is:unread'), ['${config.labels}'])`;
      default:
        return 'null';
    }
  };

  // Generate Sheets code
  const generateSheetsCode = (config: any): string => {
    switch (config.action) {
      case 'append-row':
        return `SpreadsheetApp.openById('${config.sheetId}').getSheetByName('${config.sheetName}').appendRow(${config.data || '[]'})`;
      case 'read-range':
        return `SpreadsheetApp.openById('${config.sheetId}').getRange('${config.range}').getValues()`;
      case 'update-range':
        return `SpreadsheetApp.openById('${config.sheetId}').getRange('${config.range}').setValues(${config.values || '[]'})`;
      case 'find-rows':
        return `findRowsInSheet('${config.sheetId}', '${config.searchColumn}', '${config.searchValue}')`;
      default:
        return 'null';
    }
  };

  // Generate Drive code
  const generateDriveCode = (config: any): string => {
    switch (config.action) {
      case 'create-folder':
        return `DriveApp.createFolder('${config.folderName}')`;
      case 'upload-file':
        return `DriveApp.createFile(Utilities.newBlob('${config.fileContent}', '${config.fileName}'))`;
      case 'move-file':
        return `DriveApp.getFileById('${config.fileId}').moveTo(DriveApp.getFolderById('${config.targetFolderId}'))`;
      case 'search-files':
        return `DriveApp.searchFiles('${config.query}')`;
      default:
        return 'null';
    }
  };

  // Generate Docs code
  const generateDocsCode = (config: any): string => {
    switch (config.action) {
      case 'create-document':
        return `DocumentApp.create('${config.title}')`;
      case 'insert-text':
        return `DocumentApp.openById('${config.documentId}').getBody().appendParagraph('${config.text}')`;
      case 'replace-text':
        return `replaceTextInDocument('${config.documentId}', '${config.findText}', '${config.replaceText}')`;
      case 'insert-table':
        return `insertTableInDocument('${config.documentId}', ${config.rows}, ${config.columns})`;
      default:
        return 'null';
    }
  };

  // Generate Calendar code
  const generateCalendarCode = (config: any): string => {
    switch (config.action) {
      case 'create-event':
        return `CalendarApp.getDefaultCalendar().createEvent('${config.summary}', new Date('${config.startTime}'), new Date('${config.endTime}'))`;
      case 'find-events':
        return `CalendarApp.getDefaultCalendar().getEvents(new Date('${config.startDate}'), new Date('${config.endDate}'))`;
      case 'update-event':
        return `CalendarApp.getDefaultCalendar().getEventById('${config.eventId}').setTitle('Updated Title')`;
      case 'add-attendees':
        return `CalendarApp.getDefaultCalendar().getEventById('${config.eventId}').addGuest('${config.attendees}')`;
      default:
        return 'null';
    }
  };

  // Generate helper functions
  const generateHelperFunctions = (): string => {
    return `
// Gmail Helper Functions
function extractEmailData(threads) {
  return threads.map(thread => {
    const message = thread.getMessages()[0];
    return {
      from: message.getFrom(),
      subject: message.getSubject(),
      date: message.getDate(),
      body: message.getPlainBody(),
      attachments: message.getAttachments()
    };
  });
}

function addLabelsToThreads(threads, labelNames) {
  labelNames.forEach(labelName => {
    const label = GmailApp.getUserLabelByName(labelName) || GmailApp.createLabel(labelName);
    threads.forEach(thread => thread.addLabel(label));
  });
}

// Sheets Helper Functions
function findRowsInSheet(sheetId, column, value) {
  const sheet = SpreadsheetApp.openById(sheetId).getActiveSheet();
  const data = sheet.getDataRange().getValues();
  return data.filter(row => row[column.charCodeAt(0) - 65] === value);
}

// Docs Helper Functions
function replaceTextInDocument(docId, findText, replaceText) {
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();
  body.replaceText(findText, replaceText);
}

function insertTableInDocument(docId, rows, cols) {
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();
  return body.insertTable(rows, cols);
}

// General Helper Functions
function logStep(stepName, data) {
  console.log(\`[Step: \${stepName}]\`, data);
}

function validateInput(input, fieldName) {
  if (!input || input.trim() === '') {
    throw new Error(\`\${fieldName} is required\`);
  }
  return input.trim();
}
`;
  };

  // Handle download
  const handleDownload = () => {
    const code = generateCode();
    onDownload(code, { nodes: graphState.nodes, connections: graphState.connections });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Professional Graph Customizer</h2>
          <p className="text-muted-foreground">Build your automation workflow with drag-and-drop nodes</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={generateCode} variant="outline">
            <Code className="size-4 mr-2" />
            Generate Code
          </Button>
          <Button onClick={handleDownload} disabled={graphState.nodes.length === 0}>
            <Download className="size-4 mr-2" />
            Download Script
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Node Palette */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="size-5" />
              Add Nodes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* App Selection */}
            <div>
              <Label>Select Google App</Label>
              <Select value={selectedApp} onValueChange={setSelectedApp}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an app..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(GOOGLE_APPS_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <config.icon className="size-4" style={{ color: config.color }} />
                        {config.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Action Selection */}
            {selectedApp && (
              <div>
                <Label>Select Action</Label>
                <Select value={selectedAction} onValueChange={setSelectedAction}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an action..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(GOOGLE_APPS_CONFIG[selectedApp].actions).map(([key, action]) => (
                      <SelectItem key={key} value={key}>
                        <div className="space-y-1">
                          <div className="font-medium">{action.name}</div>
                          <div className="text-xs text-muted-foreground">{action.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Action Configuration */}
            {selectedApp && selectedAction && (
              <div className="space-y-4">
                <Label>Configuration</Label>
                {Object.entries(GOOGLE_APPS_CONFIG[selectedApp].actions[selectedAction].config).map(([key, config]) => (
                  <div key={key}>
                    <Label>{config.label}</Label>
                    {config.type === 'text' && (
                      <Input
                        placeholder={config.placeholder}
                        value={nodeConfig[key] || ''}
                        onChange={(e) => setNodeConfig(prev => ({ ...prev, [key]: e.target.value }))}
                      />
                    )}
                    {config.type === 'textarea' && (
                      <Textarea
                        placeholder={config.placeholder}
                        value={nodeConfig[key] || ''}
                        onChange={(e) => setNodeConfig(prev => ({ ...prev, [key]: e.target.value }))}
                      />
                    )}
                    {config.type === 'select' && (
                      <Select value={nodeConfig[key] || ''} onValueChange={(value) => setNodeConfig(prev => ({ ...prev, [key]: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder={config.placeholder} />
                        </SelectTrigger>
                        <SelectContent>
                          {config.options.map((option: string) => (
                            <SelectItem key={option} value={option}>{option}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {config.type === 'number' && (
                      <Input
                        type="number"
                        placeholder={config.placeholder}
                        defaultValue={config.defaultValue}
                        value={nodeConfig[key] || config.defaultValue}
                        onChange={(e) => setNodeConfig(prev => ({ ...prev, [key]: e.target.value }))}
                      />
                    )}
                  </div>
                ))}
                <Button 
                  onClick={() => addNode(selectedApp, selectedAction)}
                  className="w-full"
                >
                  <Plus className="size-4 mr-2" />
                  Add Node
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Professional Graph Canvas */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Workflow Graph</CardTitle>
          </CardHeader>
          <CardContent>
            <div 
              ref={canvasRef}
              className="min-h-[600px] border-2 border-dashed border-gray-300 rounded-lg p-4 relative bg-gray-50 overflow-hidden"
              style={{
                backgroundImage: `
                  radial-gradient(circle at 25px 25px, #e5e7eb 2px, transparent 0),
                  radial-gradient(circle at 75px 75px, #e5e7eb 2px, transparent 0)
                `,
                backgroundSize: '100px 100px'
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {graphState.nodes.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <Zap className="size-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">Add nodes from the palette to build your workflow</p>
                    <p className="text-sm">Drag nodes to position them and connect them to create data flow</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Render Connections */}
                  <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
                    {graphState.connections.map((connection) => {
                      const fromNode = graphState.nodes.find(n => n.id === connection.from);
                      const toNode = graphState.nodes.find(n => n.id === connection.to);
                      
                      if (!fromNode || !toNode) return null;

                      const fromX = fromNode.position.x + 200; // Right side of node
                      const fromY = fromNode.position.y + 50;  // Middle of node
                      const toX = toNode.position.x;           // Left side of node
                      const toY = toNode.position.y + 50;      // Middle of node

                      return (
                        <g key={connection.id}>
                          <line
                            x1={fromX}
                            y1={fromY}
                            x2={toX}
                            y2={toY}
                            stroke={connection.isSelected ? "#3b82f6" : "#6b7280"}
                            strokeWidth={connection.isSelected ? "3" : "2"}
                            markerEnd="url(#arrowhead)"
                            className="transition-all duration-200"
                          />
                        </g>
                      );
                    })}
                    
                    {/* Arrow marker definition */}
                    <defs>
                      <marker
                        id="arrowhead"
                        markerWidth="10"
                        markerHeight="7"
                        refX="9"
                        refY="3.5"
                        orient="auto"
                      >
                        <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
                      </marker>
                    </defs>
                  </svg>

                  {/* Render Nodes */}
                  {graphState.nodes.map((node) => {
                    const appConfig = GOOGLE_APPS_CONFIG[node.type];
                    const actionConfig = appConfig.actions[node.config.action];
                    
                    return (
                      <div
                        key={node.id}
                        className={`absolute cursor-move transition-all duration-200 ${
                          node.isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''
                        }`}
                        style={{ 
                          left: node.position.x, 
                          top: node.position.y,
                          zIndex: node.isSelected ? 10 : 2
                        }}
                        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setGraphState(prev => ({
                            ...prev,
                            selectedNode: node.id,
                            nodes: prev.nodes.map(n => ({ ...n, isSelected: n.id === node.id }))
                          }));
                        }}
                      >
                        {/* Node Body */}
                        <div 
                          className="w-48 rounded-lg border-2 shadow-lg transition-all duration-200 hover:shadow-xl"
                          style={{
                            background: appConfig.gradient,
                            borderColor: node.isSelected ? '#3b82f6' : appConfig.borderColor
                          }}
                        >
                          {/* Node Header */}
                          <div className="p-3 border-b border-gray-200">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <appConfig.icon className="size-5" style={{ color: appConfig.color }} />
                                <span className="font-semibold text-sm" style={{ color: appConfig.color }}>
                                  {appConfig.name}
                                </span>
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startConnection(node.id);
                                  }}
                                  title="Connect"
                                >
                                  <Link className="size-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeNode(node.id);
                                  }}
                                  title="Delete"
                                >
                                  <Trash2 className="size-3" />
                                </Button>
                              </div>
                            </div>
                            <div className="text-xs text-gray-600 mt-1">
                              {actionConfig?.name}
                            </div>
                          </div>

                          {/* Node Content */}
                          <div className="p-3">
                            <div className="space-y-2">
                              {Object.entries(node.config).filter(([key]) => key !== 'action').map(([key, value]) => (
                                <div key={key} className="text-xs">
                                  <span className="font-medium text-gray-700">{key}:</span>
                                  <div className="text-gray-600 truncate" title={String(value)}>
                                    {String(value)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Connection Ports */}
                          <div className="flex justify-between px-2 pb-2">
                            <div className="w-3 h-3 rounded-full bg-gray-400 border-2 border-white shadow-sm" title="Input Port" />
                            <div className="w-3 h-3 rounded-full bg-gray-400 border-2 border-white shadow-sm" title="Output Port" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Generated Code Preview */}
      {generatedCode && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="size-5" />
              Generated Apps Script Code
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-sm">
              <code>{generatedCode}</code>
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}