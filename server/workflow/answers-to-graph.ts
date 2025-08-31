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
      type: `trigger.${userRequirements.trigger.app}`,
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
      type: `action.${action.app}`,
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
  
  // Check for time-based triggers
  if (answers.trigger?.toLowerCase().includes('time-based') || answers.trigger?.toLowerCase().includes('every')) {
    const frequency = extractFrequencyFromAnswer(answers.trigger);
    trigger = {
      app: 'time',
      label: 'Time-based Trigger',
      operation: 'schedule',
      config: {
        frequency: frequency,
        unit: 'minutes'
      }
    };
  }
  // Check for spreadsheet triggers
  else if (answers.trigger === 'On spreadsheet edit' || answers.trigger?.toLowerCase().includes('spreadsheet') || answers.trigger?.toLowerCase().includes('sheet edit')) {
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
    const filterCriteria = answers.filter_criteria || answers.invoice_identification || '';
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
  
  // Check if user wants Gmail monitoring (for invoices, etc.)
  if (allText.includes('monitor') || allText.includes('gmail') || answers.invoice_identification) {
    const filterCriteria = answers.invoice_identification || '';
    actions.push({
      app: 'gmail',
      label: 'Monitor Gmail for Invoices',
      operation: 'search_emails',
      config: {
        query: buildGmailQueryFromUserWords(filterCriteria),
        maxResults: 50,
        extractData: answers.data_extraction || 'invoice number, date, amount'
      }
    });
  }
  
  // Check if user wants to log to sheets
  if (allText.includes('log') || allText.includes('sheet') || answers.sheet_destination) {
    actions.push({
      app: 'sheets',
      label: 'Log Invoice Data',
      operation: 'append_row',
      config: {
        spreadsheetId: extractSheetIdFromUserAnswer(answers.sheet_destination || ''),
        sheetName: 'Sheet1',
        columns: answers.data_extraction || 'Invoice Number, Date, Amount, Vendor'
      }
    });
  }
  
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
        spreadsheetId: extractSheetIdFromUserAnswer(answers.sheetDetails || answers.sheet_destination || ''),
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

function extractFrequencyFromAnswer(triggerAnswer: string): number {
  // Extract frequency from user's answer like "every 15 mins"
  const match = triggerAnswer.match(/(\d+)\s*(min|hour|day)/i);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    
    // Convert to minutes
    if (unit.startsWith('hour')) return value * 60;
    if (unit.startsWith('day')) return value * 60 * 24;
    return value; // already minutes
  }
  
  return 15; // Default to 15 minutes
}

// P0-2B: REMOVE ALL LEGACY PRESET FUNCTIONS (causing schema inconsistencies)
// These functions used flat types ('trigger', 'action') instead of proper format
// They are no longer called by the user-driven system

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

