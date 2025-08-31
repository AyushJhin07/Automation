import { WorkflowGraph, WorkflowNode, WorkflowEdge } from '../../common/workflow-types';

// Use standard WorkflowNode interface from common/workflow-types.ts
export function answersToGraph(prompt: string, answers: Record<string, string>): WorkflowGraph {
  console.log(`🤖 Generating workflow from user answers (NO PRESETS)`);
  console.log(`📝 User Prompt: "${prompt}"`);
  console.log(`📋 User Answers:`, answers);
  
  // Generate workflow directly from user's actual requirements
  return generateWorkflowFromUserAnswers(prompt, answers);
}

function generateWorkflowFromUserAnswers(prompt: string, answers: Record<string, string>): WorkflowGraph {
  console.log('👤 Building workflow from user requirements only...');
  
  // Parse what the user actually wants
  const userRequirements = parseUserRequirements(prompt, answers);
  console.log('🎯 User Requirements:', userRequirements);
  
  // Build nodes in Graph Editor compatible format
  const nodes: any[] = [];
  const edges: any[] = [];
  let nodeIndex = 0;
  
  // Build nodes compatible with both Graph Editor and compiler
  if (userRequirements.trigger) {
    nodes.push({
      id: 'trigger-1',
      type: 'trigger',
      app: userRequirements.trigger.app,
      name: userRequirements.trigger.label,
      op: `${userRequirements.trigger.app}.${userRequirements.trigger.operation}`,
      params: userRequirements.trigger.config,
      // Also include Graph Editor format
      position: { x: 80, y: 60 },
      data: {
        label: userRequirements.trigger.label,
        operation: userRequirements.trigger.operation,
        config: userRequirements.trigger.config
      }
    });
  }
  
  userRequirements.actions.forEach((action, index) => {
    const actionId = `action-${index + 1}`;
    nodes.push({
      id: actionId,
      type: 'action',
      app: action.app,
      name: action.label,
      op: `${action.app}.${action.operation}`,
      params: action.config,
      // Also include Graph Editor format
      position: { x: 80 + ((index + 1) * 280), y: 60 },
      data: {
        label: action.label,
        operation: action.operation,
        config: action.config
      }
    });
  });
  
  // Build edges connecting the nodes
  if (nodes.length > 1) {
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({
        id: `edge-${i + 1}`,
        source: nodes[i].id,
        target: nodes[i + 1].id,
        from: nodes[i].id, // Also include Graph Editor format
        to: nodes[i + 1].id
      });
    }
  }
  
  return {
    id: `wf-${Date.now()}`,
    name: userRequirements.workflowName,
    nodes,
    edges,
    meta: {
      automationType: 'user_driven',
      description: userRequirements.description,
      userPrompt: prompt,
      userAnswers: answers
    }
  };
}

function parseUserRequirements(prompt: string, answers: Record<string, string>): {
  trigger: {app: string, label: string, operation: string, config: any} | null,
  actions: Array<{app: string, label: string, operation: string, config: any}>,
  workflowName: string,
  description: string
} {
  const allText = `${prompt} ${Object.values(answers).join(' ')}`.toLowerCase();
  
  // Parse trigger from user's actual words
  let trigger = null;
  
  // Check for spreadsheet triggers
  if (answers.trigger === 'On spreadsheet edit' || answers.trigger?.toLowerCase().includes('spreadsheet') || answers.trigger?.toLowerCase().includes('sheet edit')) {
    trigger = {
      app: 'sheets',
      label: 'Sheet Edit',
      operation: 'onEdit',
      config: {
        spreadsheetId: extractSheetIdFromUserAnswer(answers.sheetDetails || ''),
        sheetName: 'Sheet1'
      }
    };
  }
  // Check for email triggers
  else if (answers.trigger?.toLowerCase().includes('email') || allText.includes('email arrives')) {
    const filterCriteria = answers.filter_criteria || '';
    trigger = {
      app: 'gmail',
      label: 'Email Received',
      operation: 'email_received',
      config: {
        query: buildGmailQueryFromUserWords(filterCriteria),
        frequency: 5
      }
    };
  }
  
  // Parse actions from user's actual requests
  const actions: Array<{app: string, label: string, operation: string, config: any}> = [];
  
  // Parse what user actually wants to do
  
  // Check if user wants to send emails (not auto-reply)
  if (allText.includes('email will be sent') || answers.emailContent) {
    actions.push({
      app: 'gmail',
      label: 'Send Email to Candidate',
      operation: 'sendEmail',
      config: {
        to: '{{candidate_email}}',
        subject: extractSubjectFromContent(answers.emailContent || 'Interview Invitation'),
        body: extractBodyFromContent(answers.emailContent || 'Hello {{candidate_name}}, you are selected for the interview')
      }
    });
  }
  
  // Check if user wants to update status
  if (allText.includes('status will be updated') || allText.includes('update') || answers.statusValues) {
    actions.push({
      app: 'sheets',
      label: 'Update Status',
      operation: 'updateCell',
      config: {
        spreadsheetId: extractSheetIdFromUserAnswer(answers.sheetDetails || ''),
        sheetName: 'Sheet1',
        range: '{{row}}!C:C',
        value: 'EMAIL_SENT'
      }
    });
  }
  
  // Check if user wants reminder functionality
  if (allText.includes('reminder') || allText.includes('24 hours') || answers.reminderEmailContent) {
    // Add delay trigger
    actions.push({
      app: 'time',
      label: 'Wait 24 Hours',
      operation: 'delay',
      config: {
        hours: 24
      }
    });
    
    // Add reminder email
    actions.push({
      app: 'gmail',
      label: 'Send Reminder',
      operation: 'sendEmail',
      config: {
        to: '{{candidate_email}}',
        subject: extractSubjectFromContent(answers.reminderEmailContent || 'Reminder'),
        body: extractBodyFromContent(answers.reminderEmailContent || 'Gentle reminder')
      }
    });
  }
  
  return {
    trigger,
    actions,
    workflowName: `User Request: ${prompt.substring(0, 40)}...`,
    description: `Generated from user request: ${prompt}`
  };
}

function buildGmailQueryFromUserWords(criteria: string): string {
  if (!criteria) return 'is:unread';
  
  const lowerCriteria = criteria.toLowerCase();
  if (lowerCriteria.includes('subject')) {
    // Extract exact words user mentioned
    const wordMatch = criteria.match(/(?:words?|include)[:\s]*([^.]+)/i);
    if (wordMatch && wordMatch[1]) {
      const userWords = wordMatch[1].split(/[,\s]+/).map(w => w.trim()).filter(w => w.length > 1);
      return `is:unread subject:(${userWords.map(w => `"${w}"`).join(' OR ')})`;
    }
  }
  
  return 'is:unread';
}

function extractSheetIdFromUserAnswer(sheetAnswer: string): string {
  const match = sheetAnswer.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : '';
}

function extractSubjectFromContent(content: string): string {
  const match = content.match(/Subject:\s*(.+)/i);
  return match ? match[1].trim() : content.split('\n')[0] || 'Automated Email';
}

function extractBodyFromContent(content: string): string {
  const match = content.match(/Body:\s*(.+)/i);
  if (match) return match[1].trim();
  
  // If no "Body:" prefix, take everything after first line
  const lines = content.split('\n');
  return lines.length > 1 ? lines.slice(1).join('\n').trim() : content;
}

function detectAutomationType(prompt: string, answers: Record<string, string>): string {
  const p = prompt.toLowerCase();
  const allAnswers = Object.values(answers).join(' ').toLowerCase();
  const combined = `${p} ${allAnswers}`;
  
  console.log(`🔍 Automation detection - Prompt: "${p}"`);
  console.log(`🔍 Automation detection - Answers: "${allAnswers}"`);
  console.log(`🔍 Automation detection - Combined: "${combined}"`);
  
  // Analyze trigger and destination patterns more intelligently
  
  // Email responder workflows (auto-reply systems) - CHECK FIRST
  if ((combined.includes('email') && (combined.includes('responder') || combined.includes('reply') || combined.includes('respond'))) ||
      (combined.includes('gmail') && (combined.includes('reply') || combined.includes('respond') || combined.includes('auto'))) ||
      (combined.includes('automatic') && combined.includes('email') && (combined.includes('reply') || combined.includes('response')))) {
    console.log(`✅ Detected: email_responder`);
    return 'email_responder';
  }
  
  // E-commerce workflows (Shopify, orders, products, payments) - CHECK SECOND
  if (combined.includes('shopify') || combined.includes('ecommerce') || 
      combined.includes('stripe') || combined.includes('paypal') || combined.includes('square') ||
      combined.includes('woocommerce') || combined.includes('bigcommerce') || combined.includes('magento') ||
      (combined.includes('product') && combined.includes('order')) ||
      (combined.includes('customer') && (combined.includes('store') || combined.includes('shop'))) ||
      (combined.includes('payment') && (combined.includes('process') || combined.includes('receive'))) ||
      (combined.includes('buy') && combined.includes('product')) ||
      (combined.includes('checkout') || combined.includes('purchase'))) {
    console.log(`✅ Detected: ecommerce_automation`);
    return 'ecommerce_automation';
  }
  
  // CRM workflows (Salesforce, HubSpot, Pipedrive, Zoho CRM, Dynamics 365, contacts, leads) - CHECK SECOND  
  if (combined.includes('salesforce') || combined.includes('hubspot') || 
      combined.includes('pipedrive') || combined.includes('zoho') || combined.includes('dynamics') ||
      combined.includes('crm') || 
      (combined.includes('lead') && (combined.includes('create') || combined.includes('contact'))) ||
      (combined.includes('customer') && combined.includes('deal')) ||
      (combined.includes('deal') && (combined.includes('create') || combined.includes('pipeline'))) ||
      (combined.includes('contact') && (combined.includes('manage') || combined.includes('track')))) {
    console.log(`✅ Detected: crm_automation`);
    return 'crm_automation';
  }
  
  // Drive/File backup operations
  if ((combined.includes('drive') || combined.includes('file')) && 
      (combined.includes('backup') || combined.includes('dropbox') || combined.includes('upload'))) {
    return 'drive_backup';
  }
  
  // Calendar operations (birthdays, events, reminders)
  if (combined.includes('birthday') || combined.includes('calendar') || 
      combined.includes('event') || combined.includes('reminder') ||
      combined.includes('schedule') && combined.includes('notification')) {
    return 'calendar_notifications';
  }
  
  // Communication workflows (Slack, Teams, Twilio, notifications)
  if (combined.includes('slack') || combined.includes('teams') || combined.includes('twilio') ||
      combined.includes('zoom') || combined.includes('webex') || combined.includes('ringcentral') ||
      combined.includes('chat') || combined.includes('sms') || combined.includes('notification') ||
      (combined.includes('send') && (combined.includes('message') || combined.includes('text'))) ||
      (combined.includes('notify') && combined.includes('team'))) {
    return 'communication_automation';
  }
  
  // Gmail to Sheets (email processing)
  if ((combined.includes('gmail') || combined.includes('email')) && 
      (combined.includes('sheet') || combined.includes('spreadsheet') || combined.includes('extract'))) {
    return 'gmail_sheets';
  }
  
  // Form processing
  if (combined.includes('form') && (combined.includes('submit') || combined.includes('response'))) {
    return 'form_processing';
  }
  
  // DevOps/CI/CD workflows (Jenkins, GitHub, Docker, Kubernetes, etc.)
  if (combined.includes('jenkins') || combined.includes('github') || combined.includes('docker') ||
      combined.includes('kubernetes') || combined.includes('terraform') || combined.includes('ansible') ||
      combined.includes('ci/cd') || combined.includes('pipeline') || combined.includes('devops') ||
      combined.includes('build') || combined.includes('deploy') || combined.includes('container') ||
      combined.includes('infrastructure') || combined.includes('prometheus') || combined.includes('grafana') ||
      combined.includes('vault') || combined.includes('helm') || combined.includes('argocd') ||
      combined.includes('cloudformation') || combined.includes('codepipeline') || combined.includes('azure-devops')) {
    console.log(`✅ Detected: devops_automation`);
    return 'devops_automation';
  }
  
  // Project management workflows
  if (combined.includes('jira') || combined.includes('trello') || combined.includes('asana') ||
      combined.includes('task') && combined.includes('project')) {
    return 'project_management';
  }
  
  // Email marketing workflows
  if (combined.includes('mailchimp') || combined.includes('email') && combined.includes('marketing')) {
    return 'email_marketing';
  }
  
  // Email responder workflows (auto-reply systems) - REMOVED (moved to top)
  
  // Pure email workflows (Gmail to Sheets)
  if (combined.includes('gmail') || combined.includes('email') || combined.includes('inbox')) {
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

// This function is replaced by generateCommunicationWorkflow
// Keeping for backward compatibility but redirecting to the new one
function generateSlackAutomationWorkflow(prompt: string, answers: Record<string, string>): WorkflowGraph {
  return generateCommunicationWorkflow(prompt, { ...answers, platform: 'slack' });
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

function generateDevOpsWorkflow(prompt: string, answers: Record<string, string>): WorkflowGraph {
  const combined = `${prompt} ${Object.values(answers).join(' ')}`.toLowerCase();
  
  // Detect DevOps platform preferences (use existing implemented apps)
  let sourceApp = 'jenkins';  // Use Jenkins as source since it's implemented
  let cicdApp = 'jenkins';
  let deployApp = 'docker-hub';
  
  // CI/CD detection  
  if (combined.includes('azure-devops') || combined.includes('azure devops')) cicdApp = 'azure-devops';
  if (combined.includes('aws-codepipeline') || combined.includes('codepipeline')) cicdApp = 'aws-codepipeline';
  if (combined.includes('jenkins')) cicdApp = 'jenkins';
  
  // Deployment detection
  if (combined.includes('docker')) deployApp = 'docker-hub';
  if (combined.includes('kubernetes')) deployApp = 'kubernetes';
  if (combined.includes('terraform')) deployApp = 'terraform-cloud';
  if (combined.includes('helm')) deployApp = 'helm';
  
  const nodes: WorkflowNode[] = [
    {
      id: 'trigger-1',
      type: 'trigger',
      app: cicdApp,
      name: `Build Trigger in ${cicdApp.charAt(0).toUpperCase() + cicdApp.slice(1)}`,
      op: `${cicdApp}.build_started`,
      params: {
        repository: answers.repository || 'main-repo',
        branch: answers.branch || 'main',
        event_type: 'push'
      }
    },
    {
      id: 'action-1', 
      type: 'action',
      app: deployApp,
      name: `Deploy with ${deployApp.charAt(0).toUpperCase() + deployApp.slice(1)}`,
      op: `${deployApp}.deploy`,
      params: {
        environment: answers.environment || 'production',
        replicas: answers.replicas || 3,
        image_tag: answers.image_tag || 'latest'
      }
    }
  ];
  
  const edges: WorkflowEdge[] = [
    {
      id: 'edge-1',
      source: 'trigger-1',
      target: 'action-1'
    }
  ];
  
  return {
    id: `wf-${Date.now()}`,
    name: `DevOps Pipeline: ${cicdApp} → ${deployApp}`,
    nodes,
    edges,
    meta: {
      automationType: 'devops_automation',
      sourceApp,
      cicdApp,
      deployApp,
      description: `Automated DevOps pipeline with ${sourceApp}, ${cicdApp}, and ${deployApp}`
    }
  };
}

function generateEmailResponderWorkflow(prompt: string, answers: Record<string, string>): WorkflowGraph {
  console.log('📧 Generating Email Responder Workflow');
  
  // Extract sheet information
  const sheetInfo = parseSheet(answers.sheet_id || answers.spreadsheet_id || '');
  const filterCriteria = answers.filter_criteria || 'is:unread';
  const responseTemplate = answers.response_template || 'Thank you for your email. We will get back to you soon.';
  
  // Build Gmail search query from filter criteria
  let gmailQuery = 'is:unread';
  if (filterCriteria.toLowerCase().includes('subject')) {
    // Extract keywords from filter criteria
    const keywords = extractQuoted(filterCriteria) || ['Query', 'Doubt', 'Help'];
    gmailQuery = buildQuery(keywords);
  }
  
  const nodes: WorkflowNode[] = [
    {
      id: 'trigger-1',
      type: 'trigger',
      app: 'gmail',
      name: 'New Email Received',
      op: 'gmail.email_received',
      params: {
        query: gmailQuery,
        labels: ['inbox'],
        frequency: 5 // Check every 5 minutes
      }
    },
    {
      id: 'action-1',
      type: 'action',
      app: 'gmail',
      name: 'Send Auto Reply',
      op: 'gmail.send_reply',
      params: {
        responseTemplate: responseTemplate,
        replyToOriginal: true,
        markAsReplied: true
      }
    },
    {
      id: 'action-2',
      type: 'action',
      app: 'sheets',
      name: 'Log Email Data',
      op: 'sheets.append_row',
      params: {
        spreadsheetId: sheetInfo.spreadsheetId,
        sheetName: sheetInfo.sheetName,
        columns: answers.sheet_columns || 'Sender, Subject, Body, Response Sent, Timestamp'
      }
    }
  ];

  const edges: WorkflowEdge[] = [
    { id: 'edge-1', from: 'trigger-1', to: 'action-1' },
    { id: 'edge-2', from: 'action-1', to: 'action-2' }
  ];

  return {
    id: `wf-${Date.now()}`,
    name: 'Gmail Auto Responder with Logging',
    nodes,
    edges,
    meta: { 
      prompt, 
      answers, 
      automationType: 'email_responder',
      gmailQuery,
      responseTemplate,
      sheetInfo,
      description: 'Automated email responder that replies to specific emails and logs all interactions to Google Sheets'
    }
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

// New workflow generators for better automation types

function generateEcommerceWorkflow(prompt: string, answers: Record<string, string>): WorkflowGraph {
  const combined = `${prompt.toLowerCase()} ${Object.values(answers).join(' ').toLowerCase()}`;
  
  // Detect e-commerce platform 
  let ecommerceApp = 'shopify'; // default
  if (combined.includes('stripe')) ecommerceApp = 'stripe';
  else if (combined.includes('paypal')) ecommerceApp = 'paypal';
  else if (combined.includes('square')) ecommerceApp = 'square';
  else if (combined.includes('woocommerce')) ecommerceApp = 'woocommerce';
  else if (combined.includes('bigcommerce')) ecommerceApp = 'bigcommerce';
  else if (combined.includes('magento')) ecommerceApp = 'magento';
  
  // Detect trigger and action based on platform
  let triggerOp, triggerName, triggerParams;
  let actionApp, actionOp, actionName, actionParams;
  
  if (['stripe', 'paypal', 'square'].includes(ecommerceApp)) {
    // Payment platforms
    triggerOp = 'payment_success';
    triggerName = 'Payment Successful';
    triggerParams = {
      amount_min: answers.amount_min || 0,
      currency: answers.currency || 'USD'
    };
    
    // Action: typically log to sheets or send notification
    if (combined.includes('sheet') || combined.includes('spreadsheet')) {
      actionApp = 'google-sheets-enhanced';
      actionOp = 'append_row';
      actionName = 'Log Payment';
      actionParams = {
        spreadsheetId: answers.spreadsheet_id || 'payment_tracker',
        sheetName: answers.sheet_name || 'payments',
        values: ['{{amount}}', '{{currency}}', '{{customer_email}}', '{{date}}']
      };
    } else {
      actionApp = 'mailchimp';
      actionOp = 'add_subscriber';
      actionName = 'Add to Mailing List';
      actionParams = {
        listId: answers.list_id || 'customers',
        segment: answers.segment || 'paying_customers'
      };
    }
  } else {
    // E-commerce platforms (WooCommerce, BigCommerce, Magento)
    triggerOp = 'order_created';
    triggerName = 'Order Created';
    triggerParams = {
      status: answers.order_status || 'processing',
      min_amount: answers.min_amount || 0
    };
    
    // Action: typically send notification or update
    if (combined.includes('sms') || combined.includes('twilio')) {
      actionApp = 'twilio';
      actionOp = 'send_sms';
      actionName = 'Send Order SMS';
      actionParams = {
        to: answers.phone_number || '{{customer_phone}}',
        message: answers.message || answers.message_template || 'Your order has been confirmed!'
      };
    } else {
      actionApp = ecommerceApp;
      actionOp = 'update_inventory';
      actionName = 'Update Inventory';
      actionParams = {
        location_id: answers.location_id || 'primary',
        adjustment_type: 'decrease'
      };
    }
  }
  
  console.log(`🛍️ E-commerce Workflow: ${ecommerceApp} → ${actionApp} (${actionOp})`);
  
  const nodes: WorkflowNode[] = [
    {
      id: 'trigger-1',
      type: 'trigger',
      app: ecommerceApp,
      name: triggerName,
      op: `${ecommerceApp}.${triggerOp}`,
      params: triggerParams
    },
    {
      id: 'action-1',
      type: 'action',
      app: actionApp,
      name: actionName,
      op: `${actionApp}.${actionOp}`,
      params: actionParams
    }
  ];

  const edges: WorkflowEdge[] = [
    { id: 'edge-1', from: 'trigger-1', to: 'action-1' }
  ];

  return {
    id: `wf-${Date.now()}`,
    nodes,
    edges,
    meta: { prompt, answers, automationType: 'ecommerce_automation', ecommerceApp, actionApp, operation: actionOp },
  };
}

function generateCRMWorkflow(prompt: string, answers: Record<string, string>): WorkflowGraph {
  const combined = `${prompt.toLowerCase()} ${Object.values(answers).join(' ').toLowerCase()}`;
  
  // Detect CRM platform from prompt and answers
  let crmApp = 'salesforce'; // default
  if (combined.includes('pipedrive')) crmApp = 'pipedrive';
  else if (combined.includes('hubspot')) crmApp = 'hubspot';
  else if (combined.includes('zoho')) crmApp = 'zoho-crm';
  else if (combined.includes('dynamics')) crmApp = 'dynamics365';
  
  // Detect trigger source
  let triggerApp = 'forms';
  let triggerOp = 'form_submit';
  let triggerName = 'Form Submission';
  
  if (combined.includes('google forms')) {
    triggerApp = 'google-forms';
    triggerOp = 'google-forms.form_response';
    triggerName = 'Google Forms Response';
  } else if (combined.includes('web form') || combined.includes('contact form')) {
    triggerApp = 'forms';
    triggerOp = 'forms.form_submit';
    triggerName = 'Form Submission';
  }
  
  // Detect CRM action
  let crmAction = 'create_lead';
  let crmActionName = 'Create Lead';
  
  if (combined.includes('create deal') || combined.includes('deal')) {
    crmAction = 'create_deal';
    crmActionName = 'Create Deal';
  } else if (combined.includes('create contact') || combined.includes('contact')) {
    crmAction = 'create_contact';
    crmActionName = 'Create Contact';
  } else if (combined.includes('create opportunity')) {
    crmAction = 'create_opportunity';
    crmActionName = 'Create Opportunity';
  }
  
  console.log(`🎯 CRM Workflow: ${triggerApp} → ${crmApp} (${crmAction})`);
  
  const nodes: WorkflowNode[] = [
    {
      id: 'trigger-1',
      type: 'trigger',
      app: triggerApp,
      name: triggerName,
      op: `${triggerApp}.${triggerOp.split('.').pop()}`,
      params: {
        formId: answers.formId || answers.form_id || 'contact_form',
        fields: answers.fields?.split(',') || ['name', 'email', 'company']
      }
    },
    {
      id: 'action-1',
      type: 'action',
      app: crmApp,
      name: crmActionName,
      op: `${crmApp}.${crmAction}`,
      params: {
        leadSource: answers.lead_source || 'Website Form',
        status: answers.status || answers.deal_stage || 'New',
        pipeline: answers.pipeline || 'Sales',
        stage: answers.stage || answers.deal_stage || 'qualified'
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
    meta: { prompt, answers, automationType: 'crm_automation', triggerApp, crmApp, action: crmAction },
  };
}

function generateCommunicationWorkflow(prompt: string, answers: Record<string, string>): WorkflowGraph {
  const combined = `${prompt.toLowerCase()} ${Object.values(answers).join(' ').toLowerCase()}`;
  
  // Detect communication platform (destination)
  let commApp = 'slack'; // default
  if (combined.includes('teams')) commApp = 'microsoft-teams';
  else if (combined.includes('twilio') || combined.includes('sms')) commApp = 'twilio';
  else if (combined.includes('zoom')) commApp = 'zoom-enhanced';
  else if (combined.includes('webex')) commApp = 'webex';
  else if (combined.includes('ringcentral')) commApp = 'ringcentral';
  else if (combined.includes('slack')) commApp = 'slack';
  
  // Detect trigger source
  let triggerApp = 'gmail';
  let triggerOp = 'email_received';
  let triggerName = 'Email Received';
  let triggerParams: any = {
    query: answers.email_filter || 'is:important',
    labels: answers.labels?.split(',') || ['important']
  };
  
  // Check for CRM triggers
  if (combined.includes('pipedrive')) {
    triggerApp = 'pipedrive';
    triggerOp = 'deal_updated';
    triggerName = 'Deal Updated';
    triggerParams = {
      stage: answers.deal_stage || 'qualified',
      pipeline: answers.pipeline || 'Sales'
    };
  } else if (combined.includes('salesforce')) {
    triggerApp = 'salesforce';
    triggerOp = 'record_updated';
    triggerName = 'Record Updated';
    triggerParams = {
      objectType: 'Lead',
      fields: ['Status', 'Email']
    };
  } else if (combined.includes('hubspot')) {
    triggerApp = 'hubspot';
    triggerOp = 'contact_updated';
    triggerName = 'Contact Updated';
    triggerParams = {
      properties: ['email', 'lifecyclestage']
    };
  } else if (combined.includes('form')) {
    triggerApp = 'forms';
    triggerOp = 'form_submit';
    triggerName = 'Form Submission';
    triggerParams = {
      formId: answers.formId || 'contact_form',
      fields: answers.fields?.split(',') || ['name', 'email', 'company']
    };
  }
  
  // Detect communication action
  let commAction = 'send_message';
  let commActionName = 'Send Notification';
  let commParams: any = {
    channel: answers.channel || answers.slack_channel || '#notifications',
    message: answers.message || 'Notification from automation'
  };
  
  if (commApp === 'twilio') {
    commAction = 'send_sms';
    commActionName = 'Send SMS';
    commParams = {
      to: answers.phone_number || answers.to_number,
      message: answers.message || 'SMS notification from automation'
    };
  } else if (commApp === 'microsoft-teams') {
    commAction = 'send_message';
    commActionName = 'Send Teams Message';
    commParams = {
      channelId: answers.teams_channel || answers.channel_id,
      message: answers.message || 'Teams notification from automation'
    };
  }
  
  console.log(`📱 Communication Workflow: ${triggerApp} → ${commApp} (${commAction})`);
  
  const nodes: WorkflowNode[] = [
    {
      id: 'trigger-1',
      type: 'trigger',
      app: triggerApp,
      name: triggerName,
      op: `${triggerApp}.${triggerOp}`,
      params: triggerParams
    },
    {
      id: 'action-1',
      type: 'action',
      app: commApp,
      name: commActionName,
      op: `${commApp}.${commAction}`,
      params: commParams
    }
  ];

  const edges: WorkflowEdge[] = [
    { id: 'edge-1', from: 'trigger-1', to: 'action-1' }
  ];

  return {
    id: `wf-${Date.now()}`,
    nodes,
    edges,
    meta: { prompt, answers, automationType: 'communication_automation', triggerApp, commApp, action: commAction },
  };
}

function generateFormProcessingWorkflow(prompt: string, answers: Record<string, string>): WorkflowGraph {
  const formType = answers.form_type || 'google_forms';
  const destination = answers.destination || 'sheets';
  
  const nodes: WorkflowNode[] = [
    {
      id: 'trigger-1',
      type: 'trigger',
      app: 'forms',
      name: 'Form Submitted',
      op: 'forms.form_submit',
      params: {
        formId: answers.formId || 'contact_form',
        responseFields: answers.fields?.split(',') || ['all']
      }
    },
    {
      id: 'transform-1',
      type: 'transform',
      app: 'data',
      name: 'Process Form Data',
      op: 'data.transform',
      params: {
        mappings: answers.field_mappings || {},
        validation: answers.validation || 'basic'
      }
    },
    {
      id: 'action-1',
      type: 'action',
      app: destination,
      name: 'Store Data',
      op: `${destination}.store_data`,
      params: {
        destination: answers.storage_destination || 'default',
        format: 'structured'
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
    meta: { prompt, answers, automationType: 'form_processing', formType, destination },
  };
}

function generateProjectManagementWorkflow(prompt: string, answers: Record<string, string>): WorkflowGraph {
  const platform = answers.platform || 'jira';
  const triggerType = answers.trigger_type || 'issue_created';
  
  const nodes: WorkflowNode[] = [
    {
      id: 'trigger-1',
      type: 'trigger',
      app: platform,
      name: 'Issue Created',
      op: `${platform}.issue_created`,
      params: {
        project: answers.project || 'default',
        issueType: answers.issue_type || 'all'
      }
    },
    {
      id: 'action-1',
      type: 'action',
      app: 'slack',
      name: 'Notify Team',
      op: 'slack.send_message',
      params: {
        channel: answers.notification_channel || '#dev-team',
        message: 'New issue created: {{issue.summary}}'
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
    meta: { prompt, answers, automationType: 'project_management', platform, triggerType },
  };
}

function generateEmailMarketingWorkflow(prompt: string, answers: Record<string, string>): WorkflowGraph {
  const platform = answers.platform || 'mailchimp';
  const trigger = answers.trigger || 'contact_added';
  
  const nodes: WorkflowNode[] = [
    {
      id: 'trigger-1',
      type: 'trigger',
      app: 'forms',
      name: 'Contact Form Submit',
      op: 'forms.contact_submit',
      params: {
        formId: answers.formId || 'newsletter_signup',
        fields: ['email', 'name', 'preferences']
      }
    },
    {
      id: 'action-1',
      type: 'action',
      app: platform,
      name: 'Add to Email List',
      op: `${platform}.add_subscriber`,
      params: {
        listId: answers.list_id || 'newsletter',
        tags: answers.tags?.split(',') || ['website_signup'],
        sendWelcomeEmail: true
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
    meta: { prompt, answers, automationType: 'email_marketing', platform, trigger },
  };
}