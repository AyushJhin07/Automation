import { WorkflowGraph, WorkflowNode, WorkflowEdge } from '../../common/workflow-types';

// Use standard WorkflowNode interface from common/workflow-types.ts
export function answersToGraph(prompt: string, answers: Record<string, string>): WorkflowGraph {
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

function generateDriveBackupWorkflow(prompt: string, answers: Record<string, string>): WorkflowGraph {
  const source = answers.source || 'Google Drive folder';
  const destination = answers.destination || 'Dropbox folder';
  const frequency = parseFrequency(answers.frequency || 'daily');
  
  const nodes: WorkflowNode[] = [
    {
      id: 'trigger-1',
      type: 'trigger',
      app: 'drive',
      name: 'Monitor Drive Folder',
      op: 'drive.watch_folder',
      params: {
        folderId: extractFolderId(source),
        frequency: frequency,
        fileTypes: answers.fileTypes || 'all'
      }
    },
    {
      id: 'action-1',
      type: 'action',
      app: 'dropbox',
      name: 'Upload to Dropbox',
      op: 'dropbox.upload_file',
      params: {
        destination: destination,
        createFolder: true,
        overwrite: false
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

function generateCalendarNotificationWorkflow(prompt: string, answers: Record<string, string>): WorkflowGraph {
  const source = answers.source || 'Google Calendar';
  const destination = answers.destination || 'Slack channel';
  const frequency = parseFrequency(answers.trigger || 'daily');
  
  const nodes: WorkflowNode[] = [
    {
      id: 'trigger-1',
      type: 'trigger',
      app: 'calendar',
      name: 'Monitor Calendar Events',
      op: 'calendar.watch_events',
      params: {
        calendarId: 'primary',
        eventType: 'birthday',
        frequency: frequency
      }
    },
    {
      id: 'action-1',
      type: 'action',
      app: 'slack',
      name: 'Send Slack Message',
      op: 'slack.send_message',
      params: {
        channel: extractChannel(destination),
        message: answers.message || 'Happy Birthday! 🎉',
        asUser: true
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

function generateSlackAutomationWorkflow(prompt: string, answers: Record<string, string>): WorkflowGraph {
  const trigger = answers.trigger || 'message received';
  const action = answers.action || 'send notification';
  
  const nodes: WorkflowNode[] = [
    {
      id: 'trigger-1',
      type: 'trigger',
      app: 'slack',
      name: 'Slack Message Trigger',
      op: 'slack.message_received',
      params: {
        channel: answers.channel || '#general',
        keywords: answers.keywords || '',
        userFilter: answers.userFilter || ''
      }
    },
    {
      id: 'action-1',
      type: 'action',
      app: 'slack',
      name: 'Send Response',
      op: 'slack.send_message',
      params: {
        channel: answers.responseChannel || '#general',
        message: answers.responseMessage || 'Message received and processed!',
        threadReply: true
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
    meta: { prompt, answers, automationType: 'slack_automation', trigger, action },
  };
}

function generateGmailSheetsWorkflow(prompt: string, answers: Record<string, string>): WorkflowGraph {
  const emailFilter = answers.emailFilter || 'unread';
  const sheetName = answers.sheetName || 'Email Data';
  
  const nodes: WorkflowNode[] = [
    {
      id: 'trigger-1',
      type: 'trigger',
      app: 'gmail',
      name: 'New Email Detected',
      op: 'gmail.new_email',
      params: {
        query: emailFilter,
        frequency: 'realtime'
      }
    },
    {
      id: 'transform-1',
      type: 'transform',
      app: 'email',
      name: 'Extract Email Data',
      op: 'email.extract_data',
      params: {
        fields: answers.fields?.split(',') || ['subject', 'from', 'date', 'body'],
        includeAttachments: answers.includeAttachments === 'true'
      }
    },
    {
      id: 'action-1',
      type: 'action',
      app: 'sheets',
      name: 'Add to Google Sheet',
      op: 'sheets.append_row',
      params: {
        spreadsheetId: answers.spreadsheetId || 'YOUR_SPREADSHEET_ID',
        sheetName: sheetName,
        dataMapping: {
          subject: 'A',
          from: 'B', 
          date: 'C',
          body: 'D'
        }
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
    meta: { prompt, answers, automationType: 'gmail_sheets', emailFilter, sheetName },
  };
}

function generateGenericWorkflow(prompt: string, answers: Record<string, string>): WorkflowGraph {
  const nodes: WorkflowNode[] = [
    {
      id: 'trigger-1',
      type: 'trigger',
      app: 'time',
      name: 'Scheduled Trigger',
      op: 'time.schedule',
      params: {
        frequency: 'daily',
        time: '09:00'
      }
    },
    {
      id: 'action-1',
      type: 'action',
      app: 'system',
      name: 'Log Activity',
      op: 'system.log',
      params: {
        message: `Workflow executed: ${prompt}`,
        level: 'info'
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
    meta: { prompt, answers, automationType: 'generic' },
  };
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