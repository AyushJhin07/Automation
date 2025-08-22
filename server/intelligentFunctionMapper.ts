// Intelligent Function Mapper for AI Workflow Builder
// Selects the right functions for each app based on automation context

interface FunctionMapping {
  appName: string;
  selectedFunction: string;
  reason: string;
  parameters: Record<string, any>;
  confidence: number;
}

interface AutomationContext {
  intent: string;
  triggerApp: string;
  actionApps: string[];
  dataFlow: string[];
  prompt: string;
}

// Comprehensive function database for each app
const APP_FUNCTIONS = {
  'Gmail': {
    // Core Email Functions
    'send_email': {
      name: 'Send Email',
      description: 'Send email with to, cc, bcc, HTML/text, attachments',
      useCase: ['send notification', 'send alert', 'send confirmation', 'notify team', 'send report'],
      parameters: ['to', 'subject', 'body', 'cc', 'bcc', 'attachments']
    },
    'send_html_email': {
      name: 'Send HTML Email',
      description: 'Send rich HTML formatted emails',
      useCase: ['send formatted report', 'send newsletter', 'send rich content'],
      parameters: ['to', 'subject', 'htmlBody', 'cc', 'bcc']
    },
    'reply_to_email': {
      name: 'Reply to Email',
      description: 'Reply to a specific email thread',
      useCase: ['auto reply', 'respond to customer', 'acknowledge receipt'],
      parameters: ['messageId', 'body', 'replyAll']
    },
    'search_emails': {
      name: 'Search Emails',
      description: 'Search emails by query, date range, from, or subject',
      useCase: ['find emails', 'track emails', 'monitor inbox', 'get emails from'],
      parameters: ['query', 'maxResults', 'dateRange']
    },
    'read_latest_message': {
      name: 'Read Latest Message',
      description: 'Read latest message in each thread',
      useCase: ['get latest email', 'check new messages', 'read inbox'],
      parameters: ['labelName', 'includeSpam']
    },
    'get_email_by_id': {
      name: 'Get Email by ID',
      description: 'Retrieve specific email by message ID',
      useCase: ['get specific email', 'retrieve message details'],
      parameters: ['messageId', 'format']
    },
    'mark_as_read': {
      name: 'Mark as Read',
      description: 'Mark emails as read',
      useCase: ['mark processed', 'mark as read', 'update status'],
      parameters: ['messageIds']
    },
    'add_label': {
      name: 'Add Label',
      description: 'Add label to emails',
      useCase: ['categorize email', 'tag email', 'organize emails'],
      parameters: ['messageIds', 'labelName']
    },
    'remove_label': {
      name: 'Remove Label',
      description: 'Remove label from emails',
      useCase: ['uncategorize', 'remove tag', 'clean up labels'],
      parameters: ['messageIds', 'labelName']
    },
    'create_filter': {
      name: 'Create Email Filter',
      description: 'Create automatic email filter rules',
      useCase: ['auto organize', 'filter emails', 'auto label'],
      parameters: ['criteria', 'action', 'labelName']
    },
    'get_attachments': {
      name: 'Get Email Attachments',
      description: 'Extract attachments from emails',
      useCase: ['download attachments', 'save files', 'process attachments'],
      parameters: ['messageId', 'saveToFolder']
    },
    'send_with_attachment': {
      name: 'Send Email with Attachment',
      description: 'Send email with file attachments',
      useCase: ['send report file', 'send document', 'attach file'],
      parameters: ['to', 'subject', 'body', 'attachmentUrls']
    }
  },

  'Google Sheets': {
    'append_row': {
      name: 'Append Row',
      description: 'Append new rows to a sheet',
      useCase: ['add data', 'log entry', 'track information', 'store data'],
      parameters: ['spreadsheetId', 'range', 'values']
    },
    'read_range': {
      name: 'Read Range',
      description: 'Read data from a specific range',
      useCase: ['get data', 'read information', 'fetch records', 'retrieve data'],
      parameters: ['spreadsheetId', 'range']
    },
    'update_range': {
      name: 'Update Range',
      description: 'Update values in a specific range',
      useCase: ['update data', 'modify values', 'change information'],
      parameters: ['spreadsheetId', 'range', 'values']
    },
    'find_rows': {
      name: 'Find Rows by Value',
      description: 'Find rows by matching value in column',
      useCase: ['search data', 'find records', 'lookup information'],
      parameters: ['spreadsheetId', 'searchValue', 'searchColumn']
    },
    'create_sheet': {
      name: 'Create Sheet',
      description: 'Create new sheet tab',
      useCase: ['create new sheet', 'add worksheet', 'organize data'],
      parameters: ['spreadsheetId', 'sheetName']
    },
    'delete_rows': {
      name: 'Delete Rows',
      description: 'Delete specific rows from sheet',
      useCase: ['remove data', 'clean up records', 'delete entries'],
      parameters: ['spreadsheetId', 'startRow', 'endRow']
    },
    'sort_range': {
      name: 'Sort Range',
      description: 'Sort data in a range by column',
      useCase: ['organize data', 'sort records', 'arrange information'],
      parameters: ['spreadsheetId', 'range', 'sortColumn', 'ascending']
    },
    'create_chart': {
      name: 'Create Chart',
      description: 'Create charts from sheet data',
      useCase: ['visualize data', 'create report', 'generate chart'],
      parameters: ['spreadsheetId', 'dataRange', 'chartType']
    },
    'format_cells': {
      name: 'Format Cells',
      description: 'Apply formatting to cell ranges',
      useCase: ['format data', 'style cells', 'highlight information'],
      parameters: ['spreadsheetId', 'range', 'format']
    },
    'create_pivot_table': {
      name: 'Create Pivot Table',
      description: 'Create pivot table from data',
      useCase: ['analyze data', 'summarize information', 'create report'],
      parameters: ['spreadsheetId', 'sourceRange', 'pivotConfig']
    }
  },

  'Google Drive': {
    'upload_file': {
      name: 'Upload File',
      description: 'Upload file to Google Drive',
      useCase: ['save file', 'upload document', 'store file'],
      parameters: ['fileName', 'content', 'folderId', 'mimeType']
    },
    'create_folder': {
      name: 'Create Folder',
      description: 'Create new folder in Drive',
      useCase: ['organize files', 'create directory', 'new folder'],
      parameters: ['folderName', 'parentFolderId']
    },
    'list_files': {
      name: 'List Files',
      description: 'List files in folder or by search',
      useCase: ['find files', 'get file list', 'search documents'],
      parameters: ['folderId', 'searchQuery', 'maxResults']
    },
    'move_file': {
      name: 'Move File',
      description: 'Move file to different folder',
      useCase: ['organize file', 'relocate document', 'file management'],
      parameters: ['fileId', 'newFolderId']
    },
    'copy_file': {
      name: 'Copy File',
      description: 'Create copy of existing file',
      useCase: ['duplicate file', 'backup document', 'create copy'],
      parameters: ['fileId', 'newName', 'folderId']
    },
    'delete_file': {
      name: 'Delete File',
      description: 'Delete file from Drive',
      useCase: ['remove file', 'clean up', 'delete document'],
      parameters: ['fileId']
    },
    'share_file': {
      name: 'Share File',
      description: 'Share file with users or make public',
      useCase: ['share document', 'give access', 'collaborate'],
      parameters: ['fileId', 'email', 'role', 'type']
    },
    'get_file_content': {
      name: 'Get File Content',
      description: 'Read content from text files',
      useCase: ['read file', 'get content', 'extract text'],
      parameters: ['fileId', 'mimeType']
    }
  },

  'Google Calendar': {
    'create_event': {
      name: 'Create Event',
      description: 'Create new calendar event',
      useCase: ['schedule meeting', 'create appointment', 'add event'],
      parameters: ['title', 'startTime', 'endTime', 'description', 'attendees']
    },
    'update_event': {
      name: 'Update Event',
      description: 'Update existing calendar event',
      useCase: ['modify meeting', 'change appointment', 'update event'],
      parameters: ['eventId', 'title', 'startTime', 'endTime', 'description']
    },
    'delete_event': {
      name: 'Delete Event',
      description: 'Delete calendar event',
      useCase: ['cancel meeting', 'remove appointment', 'delete event'],
      parameters: ['eventId']
    },
    'find_events': {
      name: 'Find Events',
      description: 'Search for events by criteria',
      useCase: ['find meetings', 'search calendar', 'get events'],
      parameters: ['timeMin', 'timeMax', 'query', 'maxResults']
    },
    'create_recurring_event': {
      name: 'Create Recurring Event',
      description: 'Create repeating calendar event',
      useCase: ['schedule recurring meeting', 'weekly appointment'],
      parameters: ['title', 'startTime', 'endTime', 'recurrence', 'attendees']
    }
  }
};

export class IntelligentFunctionMapper {
  public static selectBestFunction(appName: string, automationContext: AutomationContext): FunctionMapping {
    const appFunctions = APP_FUNCTIONS[appName as keyof typeof APP_FUNCTIONS];
    
    if (!appFunctions) {
      return {
        appName,
        selectedFunction: 'process_data',
        reason: 'App not in function database',
        parameters: {},
        confidence: 0.3
      };
    }

    const prompt = automationContext.prompt.toLowerCase();
    const intent = automationContext.intent;
    
    // Score each function based on context
    const functionScores: Array<{
      functionId: string;
      function: any;
      score: number;
      reason: string;
    }> = [];

    Object.entries(appFunctions).forEach(([functionId, func]) => {
      let score = 0;
      let reasons: string[] = [];

      // Check use case matches
      func.useCase.forEach(useCase => {
        if (prompt.includes(useCase.toLowerCase())) {
          score += 10;
          reasons.push(`matches "${useCase}"`);
        }
      });

      // Intent-based scoring
      if (intent === 'email_tracking' && appName === 'Gmail') {
        if (functionId.includes('search') || functionId.includes('read')) {
          score += 15;
          reasons.push('email tracking intent');
        }
      }

      if (intent === 'lead_followup' && appName === 'Gmail') {
        if (functionId.includes('send') || functionId.includes('reply')) {
          score += 15;
          reasons.push('lead followup intent');
        }
      }

      if (intent === 'reporting_automation' && appName === 'Google Sheets') {
        if (functionId.includes('read') || functionId.includes('create_chart')) {
          score += 15;
          reasons.push('reporting intent');
        }
      }

      // Data flow context
      const isFirstInFlow = automationContext.triggerApp === appName;
      const isLastInFlow = automationContext.actionApps[automationContext.actionApps.length - 1] === appName;

      if (isFirstInFlow && (functionId.includes('search') || functionId.includes('read') || functionId.includes('get'))) {
        score += 12;
        reasons.push('trigger app - should read/search');
      }

      if (isLastInFlow && (functionId.includes('send') || functionId.includes('create') || functionId.includes('append'))) {
        score += 12;
        reasons.push('action app - should create/send');
      }

      // Keyword matching in prompt
      if (prompt.includes('send') && functionId.includes('send')) {
        score += 8;
        reasons.push('send action detected');
      }
      if (prompt.includes('create') && functionId.includes('create')) {
        score += 8;
        reasons.push('create action detected');
      }
      if (prompt.includes('update') && functionId.includes('update')) {
        score += 8;
        reasons.push('update action detected');
      }
      if (prompt.includes('read') && functionId.includes('read')) {
        score += 8;
        reasons.push('read action detected');
      }
      if (prompt.includes('search') && functionId.includes('search')) {
        score += 8;
        reasons.push('search action detected');
      }

      functionScores.push({
        functionId,
        function: func,
        score,
        reason: reasons.join(', ') || 'default scoring'
      });
    });

    // Sort by score and select best function
    functionScores.sort((a, b) => b.score - a.score);
    const bestFunction = functionScores[0];

    if (!bestFunction || bestFunction.score === 0) {
      // Fallback to default function based on app
      const defaultFunction = this.getDefaultFunction(appName, automationContext);
      return defaultFunction;
    }

    // Generate intelligent parameters
    const parameters = this.generateIntelligentParameters(
      appName, 
      bestFunction.functionId, 
      automationContext
    );

    return {
      appName,
      selectedFunction: bestFunction.functionId,
      reason: bestFunction.reason,
      parameters,
      confidence: Math.min(0.95, bestFunction.score / 20) // Normalize to 0-0.95
    };
  }

  private static getDefaultFunction(appName: string, context: AutomationContext): FunctionMapping {
    const defaults: Record<string, string> = {
      'Gmail': context.triggerApp === 'Gmail' ? 'search_emails' : 'send_email',
      'Google Sheets': context.triggerApp === 'Google Sheets' ? 'read_range' : 'append_row',
      'Google Drive': 'upload_file',
      'Google Calendar': 'create_event',
      'Salesforce': 'create_lead',
      'HubSpot': 'create_contact',
      'Slack': 'send_message',
      'Asana': 'create_task',
      'Trello': 'create_card'
    };

    return {
      appName,
      selectedFunction: defaults[appName] || 'process_data',
      reason: 'default function for app type',
      parameters: {},
      confidence: 0.6
    };
  }

  private static generateIntelligentParameters(
    appName: string, 
    functionId: string, 
    context: AutomationContext
  ): Record<string, any> {
    const prompt = context.prompt.toLowerCase();
    
    // Gmail parameters
    if (appName === 'Gmail') {
      if (functionId === 'search_emails') {
        let query = 'is:unread';
        
        if (prompt.includes('customer')) query += ' label:customers';
        if (prompt.includes('lead')) query += ' label:leads';
        if (prompt.includes('support')) query += ' label:support';
        if (prompt.includes('important')) query += ' is:important';
        
        return {
          query,
          maxResults: 50,
          dateRange: prompt.includes('recent') ? 'newer_than:7d' : ''
        };
      }
      
      if (functionId === 'send_email') {
        return {
          to: 'extracted_from_previous_step',
          subject: 'Auto-generated based on workflow',
          body: 'Generated from automation context',
          cc: '',
          bcc: ''
        };
      }
    }

    // Google Sheets parameters
    if (appName === 'Google Sheets') {
      if (functionId === 'append_row') {
        const columns = [];
        if (prompt.includes('email')) columns.push('Email');
        if (prompt.includes('name')) columns.push('Name');
        if (prompt.includes('company')) columns.push('Company');
        if (prompt.includes('date')) columns.push('Date');
        if (prompt.includes('status')) columns.push('Status');
        
        return {
          spreadsheetId: 'auto-create-or-specify',
          range: 'A:Z',
          values: `Data from ${context.triggerApp}: ${columns.join(', ')}`
        };
      }
      
      if (functionId === 'read_range') {
        return {
          spreadsheetId: 'user-specified',
          range: prompt.includes('all') ? 'A:Z' : 'A1:G100'
        };
      }
    }

    // Google Calendar parameters
    if (appName === 'Google Calendar') {
      if (functionId === 'create_event') {
        let title = 'Auto-generated Event';
        let duration = 30;
        
        if (prompt.includes('meeting')) title = 'Automated Meeting';
        if (prompt.includes('follow')) title = 'Follow-up Meeting';
        if (prompt.includes('reminder')) title = 'Reminder';
        if (prompt.includes('hour')) duration = 60;
        
        return {
          title,
          startTime: 'calculated_from_context',
          endTime: `start_time + ${duration} minutes`,
          description: 'Generated by automation workflow',
          attendees: 'extracted_from_previous_step'
        };
      }
    }

    // Default parameters
    return {};
  }

  public static analyzeWorkflowContext(prompt: string, detectedApps: string[]): AutomationContext {
    const lowerPrompt = prompt.toLowerCase();
    
    // Determine intent
    let intent = 'custom_automation';
    if (lowerPrompt.includes('track') && lowerPrompt.includes('email')) intent = 'email_tracking';
    if (lowerPrompt.includes('follow') && lowerPrompt.includes('lead')) intent = 'lead_followup';
    if (lowerPrompt.includes('report') || lowerPrompt.includes('dashboard')) intent = 'reporting_automation';
    if (lowerPrompt.includes('notify') || lowerPrompt.includes('alert')) intent = 'notification_automation';
    if (lowerPrompt.includes('sync') || lowerPrompt.includes('update')) intent = 'data_sync_automation';

    // Determine trigger app (usually first mentioned or data source)
    let triggerApp = detectedApps[0] || 'Gmail';
    if (lowerPrompt.includes('when') || lowerPrompt.includes('if')) {
      // Look for trigger keywords
      for (const app of detectedApps) {
        if (lowerPrompt.includes(`when ${app.toLowerCase()}`) || lowerPrompt.includes(`if ${app.toLowerCase()}`)) {
          triggerApp = app;
          break;
        }
      }
    }

    // Determine action apps (usually everything except trigger)
    const actionApps = detectedApps.filter(app => app !== triggerApp);
    if (actionApps.length === 0) actionApps.push(detectedApps[1] || 'Google Sheets');

    // Determine data flow
    const dataFlow = [triggerApp, ...actionApps];

    return {
      intent,
      triggerApp,
      actionApps,
      dataFlow,
      prompt
    };
  }

  public static generateWorkflowWithIntelligentFunctions(
    prompt: string, 
    detectedApps: string[]
  ): Array<FunctionMapping> {
    const context = this.analyzeWorkflowContext(prompt, detectedApps);
    
    return detectedApps.map(appName => 
      this.selectBestFunction(appName, context)
    );
  }
}

// Example usage and testing
export function testIntelligentMapping() {
  const testCases = [
    {
      prompt: "Track customer emails and add them to a Google Sheet",
      apps: ['Gmail', 'Google Sheets'],
      expected: {
        'Gmail': 'search_emails',
        'Google Sheets': 'append_row'
      }
    },
    {
      prompt: "Send follow-up emails to leads who haven't responded",
      apps: ['Gmail', 'Google Sheets'],
      expected: {
        'Gmail': 'send_email',
        'Google Sheets': 'read_range'
      }
    },
    {
      prompt: "Create calendar events from form submissions",
      apps: ['Google Forms', 'Google Calendar'],
      expected: {
        'Google Forms': 'get_responses',
        'Google Calendar': 'create_event'
      }
    }
  ];

  console.log('Testing Intelligent Function Mapping:');
  testCases.forEach((testCase, index) => {
    console.log(`\nTest ${index + 1}: "${testCase.prompt}"`);
    const mappings = IntelligentFunctionMapper.generateWorkflowWithIntelligentFunctions(
      testCase.prompt, 
      testCase.apps
    );
    
    mappings.forEach(mapping => {
      console.log(`  ${mapping.appName}: ${mapping.selectedFunction} (${mapping.confidence.toFixed(2)} confidence)`);
      console.log(`    Reason: ${mapping.reason}`);
    });
  });
}