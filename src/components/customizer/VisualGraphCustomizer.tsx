import React, { useState, useCallback, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Settings,
  Play,
  Download,
  Code,
  ArrowRight,
  Zap,
  CheckCircle,
  AlertCircle,
  Info
} from "lucide-react";

// Types for the visual graph system
interface GraphNode {
  id: string;
  type: 'gmail' | 'sheets' | 'drive' | 'docs' | 'calendar';
  position: { x: number; y: number };
  config: any;
  connections: string[];
}

interface GraphConnection {
  id: string;
  from: string;
  to: string;
  fromPort: string;
  toPort: string;
}

interface GraphState {
  nodes: GraphNode[];
  connections: GraphConnection[];
  selectedNode: string | null;
}

// Google Apps configuration options
const GOOGLE_APPS_CONFIG = {
  gmail: {
    name: 'Gmail',
    icon: Mail,
    color: 'bg-red-500',
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
      'read-thread': {
        name: 'Read Thread',
        description: 'Read messages in a specific thread',
        config: {
          threadId: { type: 'text', label: 'Thread ID', placeholder: 'Enter thread ID' }
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
      'add-labels': {
        name: 'Add Labels',
        description: 'Add labels to emails or threads',
        config: {
          labels: { type: 'textarea', label: 'Labels', placeholder: 'Processed, Important, Follow-up' },
          applyTo: { type: 'select', label: 'Apply To', options: ['thread', 'message'] }
        }
      },
      'download-attachments': {
        name: 'Download Attachments',
        description: 'Download attachments to Google Drive',
        config: {
          targetFolder: { type: 'text', label: 'Target Folder ID', placeholder: 'Drive folder ID' },
          renameFiles: { type: 'select', label: 'Rename Files', options: ['original', 'with-date', 'custom'] }
        }
      }
    }
  },
  sheets: {
    name: 'Google Sheets',
    icon: FileSpreadsheet,
    color: 'bg-green-500',
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
      },
      'create-sheet': {
        name: 'Create Sheet',
        description: 'Create new sheet tab',
        config: {
          sheetId: { type: 'text', label: 'Sheet ID', placeholder: 'Enter Google Sheet ID' },
          sheetName: { type: 'text', label: 'New Sheet Name', placeholder: 'NewSheet' }
        }
      },
      'apply-formatting': {
        name: 'Apply Formatting',
        description: 'Apply conditional formatting or styles',
        config: {
          sheetId: { type: 'text', label: 'Sheet ID', placeholder: 'Enter Google Sheet ID' },
          range: { type: 'text', label: 'Range', placeholder: 'A1:D10' },
          formatType: { type: 'select', label: 'Format Type', options: ['conditional', 'number', 'date', 'currency'] }
        }
      }
    }
  },
  drive: {
    name: 'Google Drive',
    icon: FolderCog,
    color: 'bg-blue-500',
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
      },
      'set-permissions': {
        name: 'Set Permissions',
        description: 'Set file/folder permissions',
        config: {
          fileId: { type: 'text', label: 'File/Folder ID', placeholder: 'File or folder ID' },
          email: { type: 'text', label: 'Email', placeholder: 'user@example.com' },
          role: { type: 'select', label: 'Role', options: ['reader', 'writer', 'owner'] }
        }
      },
      'export-as-pdf': {
        name: 'Export as PDF',
        description: 'Export Google Doc/Sheet as PDF',
        config: {
          fileId: { type: 'text', label: 'File ID', placeholder: 'Google Doc/Sheet ID' },
          targetFolderId: { type: 'text', label: 'Target Folder ID', placeholder: 'Folder to save PDF' }
        }
      }
    }
  },
  docs: {
    name: 'Google Docs',
    icon: FileText,
    color: 'bg-purple-500',
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
      },
      'apply-styles': {
        name: 'Apply Styles',
        description: 'Apply text styles and formatting',
        config: {
          documentId: { type: 'text', label: 'Document ID', placeholder: 'Google Doc ID' },
          styleType: { type: 'select', label: 'Style Type', options: ['heading', 'paragraph', 'character'] },
          styleName: { type: 'text', label: 'Style Name', placeholder: 'Heading 1, Normal, etc.' }
        }
      },
      'export-pdf': {
        name: 'Export as PDF',
        description: 'Export document as PDF',
        config: {
          documentId: { type: 'text', label: 'Document ID', placeholder: 'Google Doc ID' },
          targetFolderId: { type: 'text', label: 'Target Folder ID', placeholder: 'Folder to save PDF' }
        }
      }
    }
  },
  calendar: {
    name: 'Google Calendar',
    icon: Calendar,
    color: 'bg-orange-500',
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
      'delete-event': {
        name: 'Delete Event',
        description: 'Delete calendar event',
        config: {
          eventId: { type: 'text', label: 'Event ID', placeholder: 'Event ID to delete' }
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

export default function VisualGraphCustomizer({ 
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
    selectedNode: null
  });
  const [selectedApp, setSelectedApp] = useState<string>('');
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [nodeConfig, setNodeConfig] = useState<any>({});
  const [generatedCode, setGeneratedCode] = useState<string>('');

  // Add new node to the graph
  const addNode = useCallback((appType: string, action: string) => {
    const newNode: GraphNode = {
      id: `${appType}-${Date.now()}`,
      type: appType as any,
      position: { x: 100 + graphState.nodes.length * 200, y: 100 },
      config: { action, ...nodeConfig },
      connections: []
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
  }, [graphState.nodes.length, nodeConfig]);

  // Remove node from graph
  const removeNode = useCallback((nodeId: string) => {
    setGraphState(prev => ({
      ...prev,
      nodes: prev.nodes.filter(node => node.id !== nodeId),
      connections: prev.connections.filter(conn => conn.from !== nodeId && conn.to !== nodeId),
      selectedNode: prev.selectedNode === nodeId ? null : prev.selectedNode
    }));
  }, []);

  // Connect two nodes
  const connectNodes = useCallback((fromNodeId: string, toNodeId: string) => {
    const newConnection: GraphConnection = {
      id: `conn-${Date.now()}`,
      from: fromNodeId,
      to: toNodeId,
      fromPort: 'output',
      toPort: 'input'
    };

    setGraphState(prev => ({
      ...prev,
      connections: [...prev.connections, newConnection]
    }));
  }, []);

  // Generate Apps Script code from the graph
  const generateCode = useCallback(() => {
    let code = `// Generated by Visual Graph Customizer
// Script: ${scriptTitle}

function main() {
  try {
    // Execute workflow
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

// Helper functions
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

  // Generate Gmail Apps Script code
  const generateGmailCode = (config: any): string => {
    switch (config.action) {
      case 'search-emails':
        return `GmailApp.search('${config.query || 'is:unread'}').slice(0, ${config.maxResults || 10})`;
      case 'read-thread':
        return `GmailApp.getThreadById('${config.threadId}').getMessages()`;
      case 'extract-data':
        return `extractEmailData(GmailApp.search('is:unread').slice(0, 5))`;
      case 'send-email':
        return `GmailApp.sendEmail('${config.to}', '${config.subject}', '${config.body}')`;
      case 'add-labels':
        return `addLabelsToThreads(GmailApp.search('is:unread'), ['${config.labels}'])`;
      case 'download-attachments':
        return `downloadAttachmentsToDrive(GmailApp.search('has:attachment'), '${config.targetFolder}')`;
      default:
        return 'null';
    }
  };

  // Generate Sheets Apps Script code
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
      case 'create-sheet':
        return `SpreadsheetApp.openById('${config.sheetId}').insertSheet('${config.sheetName}')`;
      case 'apply-formatting':
        return `applyConditionalFormatting('${config.sheetId}', '${config.range}', '${config.formatType}')`;
      default:
        return 'null';
    }
  };

  // Generate Drive Apps Script code
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
      case 'set-permissions':
        return `DriveApp.getFileById('${config.fileId}').addEditor('${config.email}')`;
      case 'export-as-pdf':
        return `exportAsPdf('${config.fileId}', '${config.targetFolderId}')`;
      default:
        return 'null';
    }
  };

  // Generate Docs Apps Script code
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
      case 'apply-styles':
        return `applyStyleToDocument('${config.documentId}', '${config.styleType}', '${config.styleName}')`;
      case 'export-pdf':
        return `exportDocumentAsPdf('${config.documentId}', '${config.targetFolderId}')`;
      default:
        return 'null';
    }
  };

  // Generate Calendar Apps Script code
  const generateCalendarCode = (config: any): string => {
    switch (config.action) {
      case 'create-event':
        return `CalendarApp.getDefaultCalendar().createEvent('${config.summary}', new Date('${config.startTime}'), new Date('${config.endTime}'))`;
      case 'find-events':
        return `CalendarApp.getDefaultCalendar().getEvents(new Date('${config.startDate}'), new Date('${config.endDate}'))`;
      case 'update-event':
        return `CalendarApp.getDefaultCalendar().getEventById('${config.eventId}').setTitle('Updated Title')`;
      case 'delete-event':
        return `CalendarApp.getDefaultCalendar().getEventById('${config.eventId}').deleteEvent()`;
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

function downloadAttachmentsToDrive(threads, folderId) {
  const folder = DriveApp.getFolderById(folderId);
  threads.forEach(thread => {
    thread.getMessages().forEach(message => {
      message.getAttachments().forEach(attachment => {
        folder.createFile(attachment);
      });
    });
  });
}

// Sheets Helper Functions
function findRowsInSheet(sheetId, column, value) {
  const sheet = SpreadsheetApp.openById(sheetId).getActiveSheet();
  const data = sheet.getDataRange().getValues();
  return data.filter(row => row[column.charCodeAt(0) - 65] === value);
}

function applyConditionalFormatting(sheetId, range, formatType) {
  const sheet = SpreadsheetApp.openById(sheetId).getActiveSheet();
  const rule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('')
    .setBackground('#ff0000')
    .setRanges([sheet.getRange(range)])
    .build();
  sheet.setConditionalFormatRules([rule]);
}

// Drive Helper Functions
function exportAsPdf(fileId, folderId) {
  const file = DriveApp.getFileById(fileId);
  const folder = DriveApp.getFolderById(folderId);
  const pdf = file.getBlob().setName(file.getName() + '.pdf');
  return folder.createFile(pdf);
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

function applyStyleToDocument(docId, styleType, styleName) {
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();
  body.setHeadingAttributes(DocumentApp.ParagraphHeading.HEADING1);
}

function exportDocumentAsPdf(docId, folderId) {
  const doc = DocumentApp.openById(docId);
  const folder = DriveApp.getFolderById(folderId);
  const pdf = doc.getBlob().setName(doc.getName() + '.pdf');
  return folder.createFile(pdf);
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
          <h2 className="text-2xl font-bold">Visual Graph Customizer</h2>
          <p className="text-muted-foreground">Build your automation workflow visually</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                        <config.icon className="size-4" />
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

        {/* Graph Canvas */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Workflow Graph</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="min-h-[400px] border-2 border-dashed border-gray-300 rounded-lg p-4 relative">
              {graphState.nodes.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <Zap className="size-12 mx-auto mb-4 opacity-50" />
                    <p>Add nodes from the palette to build your workflow</p>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  {/* Render Nodes */}
                  {graphState.nodes.map((node) => {
                    const appConfig = GOOGLE_APPS_CONFIG[node.type];
                    const actionConfig = appConfig.actions[node.config.action];
                    return (
                      <div
                        key={node.id}
                        className={`absolute p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          graphState.selectedNode === node.id 
                            ? 'border-primary bg-primary/5' 
                            : 'border-gray-300 bg-white hover:border-gray-400'
                        }`}
                        style={{ left: node.position.x, top: node.position.y }}
                        onClick={() => setGraphState(prev => ({ ...prev, selectedNode: node.id }))}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`size-4 rounded ${appConfig.color}`} />
                          <span className="font-semibold text-sm">{appConfig.name}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeNode(node.id);
                            }}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                        <div className="text-xs text-muted-foreground mb-2">
                          {actionConfig?.name}
                        </div>
                        <div className="text-xs bg-gray-100 p-2 rounded">
                          {Object.entries(node.config).filter(([key]) => key !== 'action').map(([key, value]) => (
                            <div key={key} className="truncate">
                              <span className="font-medium">{key}:</span> {String(value)}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {/* Render Connections */}
                  {graphState.connections.map((connection) => (
                    <svg
                      key={connection.id}
                      className="absolute inset-0 pointer-events-none"
                      style={{ zIndex: -1 }}
                    >
                      <line
                        x1={graphState.nodes.find(n => n.id === connection.from)?.position.x || 0}
                        y1={graphState.nodes.find(n => n.id === connection.from)?.position.y || 0}
                        x2={graphState.nodes.find(n => n.id === connection.to)?.position.x || 0}
                        y2={graphState.nodes.find(n => n.id === connection.to)?.position.y || 0}
                        stroke="#3b82f6"
                        strokeWidth="2"
                        markerEnd="url(#arrowhead)"
                      />
                    </svg>
                  ))}

                  {/* Arrow marker definition */}
                  <svg width="0" height="0">
                    <defs>
                      <marker
                        id="arrowhead"
                        markerWidth="10"
                        markerHeight="7"
                        refX="9"
                        refY="3.5"
                        orient="auto"
                      >
                        <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
                      </marker>
                    </defs>
                  </svg>
                </div>
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