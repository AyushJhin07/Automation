import { WorkflowGraph, WorkflowNode, WorkflowEdge } from '../../common/workflow-types';

// Extended types to match your visual graph editor
export interface VisualWorkflowNode extends WorkflowNode {
  position: { x: number; y: number };
  data: {
    label: string;
    description: string;
    app: string;
    icon: string;
    color: string;
    params: Record<string, any>;
    connectorId: string;
    actionId: string;
  };
}

export interface VisualWorkflowGraph extends Omit<WorkflowGraph, 'nodes'> {
  nodes: VisualWorkflowNode[];
}

export function answersToGraph(prompt: string, answers: Record<string, string>): VisualWorkflowGraph {
  console.log(`🔥 NEW FUNCTION CALLED! Prompt: "${prompt}"`);
  console.log(`🔥 Answers:`, answers);
  
  // ---- Intelligently detect automation type from prompt ----
  const automationType = detectAutomationType(prompt, answers);
  
  console.log(`🧠 Detected automation type: ${automationType} for prompt: "${prompt}"`);
  
  // ---- Generate workflow based on detected type ----
  switch (automationType) {
    case 'drive_backup':
      return generateDriveBackupWorkflow(prompt, answers);
    case 'calendar_notifications':
      return generateCalendarNotificationWorkflow(prompt, answers);
    case 'slack_automation':
      return generateSlackAutomationWorkflow(prompt, answers);
    case 'gmail_sheets':
      return generateGmailSheetsWorkflow(prompt, answers);
    default:
      return generateGenericWorkflow(prompt, answers);
  }
}

function detectAutomationType(prompt: string, answers: Record<string, string>): string {
  const p = prompt.toLowerCase();
  const allAnswers = Object.values(answers).join(' ').toLowerCase();
  
  // Drive/File operations
  if (p.includes('drive') && (p.includes('backup') || p.includes('dropbox'))) {
    return 'drive_backup';
  }
  
  // Calendar operations  
  if (p.includes('birthday') || p.includes('calendar') || allAnswers.includes('calendar')) {
    return 'calendar_notifications';
  }
  
  // Slack operations
  if (p.includes('slack') || allAnswers.includes('slack')) {
    return 'slack_automation';
  }
  
  // Gmail to Sheets (default for email workflows)
  if (p.includes('gmail') || p.includes('email') || p.includes('sheet')) {
    return 'gmail_sheets';
  }
  
  return 'generic';
}

function generateDriveBackupWorkflow(prompt: string, answers: Record<string, string>): VisualWorkflowGraph {
  const source = answers.source || 'Google Drive folder';
  const destination = answers.destination || 'Dropbox folder';
  const frequency = parseFrequency(answers.frequency || 'daily');
  
  const nodes: VisualWorkflowNode[] = [
    {
      id: 'trigger-1',
      type: 'trigger',
      app: 'google-drive',
      name: 'Drive Monitor',
      op: 'watch_folder',
      params: {
        folderId: extractFolderId(source),
        frequency: frequency,
        fileTypes: answers.fileTypes || 'all'
      },
      position: { x: 100, y: 200 },
      data: {
        label: 'Monitor Drive',
        description: `Watch ${source} for changes`,
        app: 'google-drive',
        icon: 'drive',
        color: '#4285F4',
        params: { folderId: extractFolderId(source), frequency },
        connectorId: 'google-drive',
        actionId: 'watch_folder'
      }
    },
    {
      id: 'action-1',
      type: 'action',
      app: 'dropbox',
      name: 'Backup to Dropbox',
      op: 'upload_file',
      params: {
        destination: destination,
        createFolder: true,
        overwrite: false
      },
      position: { x: 400, y: 200 },
      data: {
        label: 'Upload to Dropbox',
        description: `Backup files to ${destination}`,
        app: 'dropbox',
        icon: 'dropbox',
        color: '#0061FF',
        params: { destination, createFolder: true },
        connectorId: 'dropbox',
        actionId: 'upload_file'
      }
    }
  ];

  const edges: WorkflowEdge[] = [
    { id: 'edge-1', from: 'trigger-1', to: 'action-1' }
  ];

  return {
    id: `wf-${Date.now()}`,
    nodes,
    edges,
    meta: { prompt, answers, automationType: 'drive_backup', source, destination, frequency },
  };
}

function generateCalendarNotificationWorkflow(prompt: string, answers: Record<string, string>): VisualWorkflowGraph {
  const source = answers.source || 'Google Calendar';
  const destination = answers.destination || 'Slack channel';
  const frequency = parseFrequency(answers.trigger || 'daily');
  
  const nodes: VisualWorkflowNode[] = [
    {
      id: 'trigger-1',
      type: 'trigger',
      app: 'google-calendar',
      name: 'Calendar Monitor',
      op: 'watch_events',
      params: {
        calendarId: 'primary',
        eventType: 'birthday',
        frequency: frequency
      },
      position: { x: 100, y: 200 },
      data: {
        label: 'Monitor Calendar',
        description: `Watch ${source} for birthday events`,
        app: 'google-calendar',
        icon: 'calendar',
        color: '#EA4335',
        params: { calendarId: 'primary', eventType: 'birthday' },
        connectorId: 'google-calendar',
        actionId: 'watch_events'
      }
    },
    {
      id: 'action-1',
      type: 'action',
      app: 'slack-enhanced',
      name: 'Send Slack Message',
      op: 'send_message',
      params: {
        channel: extractChannel(destination),
        message: answers.message || 'Happy Birthday! 🎉',
        asUser: true
      },
      position: { x: 400, y: 200 },
      data: {
        label: 'Send to Slack',
        description: `Send birthday wishes to ${destination}`,
        app: 'slack-enhanced',
        icon: 'slack',
        color: '#4A154B',
        params: { channel: extractChannel(destination), message: answers.message },
        connectorId: 'slack-enhanced',
        actionId: 'send_message'
      }
    }
  ];

  const edges: WorkflowEdge[] = [
    { id: 'edge-1', from: 'trigger-1', to: 'action-1' }
  ];

  return {
    id: `wf-${Date.now()}`,
    nodes,
    edges,
    meta: { prompt, answers, automationType: 'calendar_notifications', source, destination, frequency },
  };
}

function generateSlackAutomationWorkflow(prompt: string, answers: Record<string, string>): VisualWorkflowGraph {
  // Similar structure for Slack-specific workflows
  return generateCalendarNotificationWorkflow(prompt, answers);
}

function generateGmailSheetsWorkflow(prompt: string, answers: Record<string, string>): VisualWorkflowGraph {
  // Original Gmail to Sheets logic
  const filter = answers.filter || '';
  const fields = (answers.fields || '').toLowerCase();
  const dest = answers.destination || '';
  const freqTxt = answers.frequency || '';

  const keywords = extractQuoted(filter);             
  const { spreadsheetId, sheetName } = parseSheet(dest);
  const everyMin = parseFrequency(freqTxt);           

  const nodes: VisualWorkflowNode[] = [
    {
      id: 'trigger-1',
      type: 'trigger',
      app: 'gmail-enhanced',
      name: 'Gmail Trigger',
      op: 'search_emails',
      params: {
        query: buildQuery(keywords),
        frequency: everyMin,
        labelIds: [],
        maxResults: 50
      },
      position: { x: 100, y: 200 },
      data: {
        label: 'Gmail Search',
        description: `Monitor Gmail for emails matching: ${buildQuery(keywords)}`,
        app: 'gmail-enhanced',
        icon: 'gmail',
        color: '#EA4335',
        params: { query: buildQuery(keywords), frequency: everyMin },
        connectorId: 'gmail-enhanced',
        actionId: 'search_emails'
      }
    },
    {
      id: 'transform-1',
      type: 'transform',
      app: 'core',
      name: 'Extract Email Data',
      op: 'extract_fields',
      params: {
        fields: ['subject', 'from', 'date', ...(fields.includes('body') ? ['body'] : [])],
        format: 'structured'
      },
      position: { x: 400, y: 200 },
      data: {
        label: 'Extract Fields',
        description: `Extract: ${['subject', 'from', 'date', ...(fields.includes('body') ? ['body'] : [])].join(', ')}`,
        app: 'core',
        icon: 'filter',
        color: '#8B5CF6',
        params: { fields: ['subject', 'from', 'date', ...(fields.includes('body') ? ['body'] : [])] },
        connectorId: 'core',
        actionId: 'extract_fields'
      }
    },
    {
      id: 'action-1',
      type: 'action',
      app: 'google-sheets-enhanced',
      name: 'Add to Sheet',
      op: 'append_row',
      params: { 
        spreadsheetId, 
        sheet: sheetName,
        values: [],
        valueInputOption: 'RAW'
      },
      position: { x: 700, y: 200 },
      data: {
        label: 'Append to Sheet',
        description: `Add data to ${sheetName} in spreadsheet`,
        app: 'google-sheets-enhanced',
        icon: 'table',
        color: '#34A853',
        params: { spreadsheetId, sheet: sheetName },
        connectorId: 'google-sheets-enhanced',
        actionId: 'append_row'
      }
    }
  ];

  const edges: WorkflowEdge[] = [
    { id: 'edge-1', from: 'trigger-1', to: 'transform-1' },
    { id: 'edge-2', from: 'transform-1', to: 'action-1' }
  ];

  return {
    id: `wf-${Date.now()}`,
    nodes,
    edges,
    meta: { prompt, answers, automationType: 'gmail_sheets', keywords, spreadsheetId, sheetName, everyMin },
  };
}

function generateGenericWorkflow(prompt: string, answers: Record<string, string>): VisualWorkflowGraph {
  // Fallback to Gmail-Sheets pattern
  return generateGmailSheetsWorkflow(prompt, answers);
}

// Helper functions
function extractQuoted(s: string): string[] {
  const m = s.match(/"([^"]+)"/g);
  return m ? m.map(x => x.replace(/"/g, '').trim()).filter(Boolean) : [];
}

function buildQuery(keywords: string[]): string {
  if (!keywords.length) return 'in:inbox is:unread';
  const or = keywords.map(k => `"${k}"`).join(' OR ');
  return `in:inbox is:unread subject:(${or})`;
}

export function parseSheet(s: string): { spreadsheetId: string; sheetName: string } {
  const id = (s.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/) || [])[1] || '';
  const sheet = ((s.split(',').pop() || '').trim()) || 'Sheet1';
  return { spreadsheetId: id, sheetName: sheet };
}

function parseFrequency(s: string): number {
  const m = s.match(/(\d+)\s*min/i);
  if (!m) return 5;
  return Math.max(1, Math.min(60, parseInt(m[1], 10)));
}

function extractFolderId(path: string): string {
  const match = path.match(/folders\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : '';
}

function extractChannel(destination: string): string {
  const match = destination.match(/#([a-zA-Z0-9-_]+)/);
  return match ? match[1] : 'general';
}