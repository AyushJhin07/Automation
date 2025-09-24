import { WorkflowGraph, WorkflowNode, WorkflowEdge } from '../../common/workflow-types';
import { enrichWorkflowGraph } from './node-metadata';
import { normalizeAppId } from '../services/PromptBuilder.js';

type PlanTriggerHint = {
  app?: string | null;
  type?: string | null;
  operation?: string | null;
  description?: string | null;
  required_inputs?: string[] | null;
};

type PlanStepHint = {
  app?: string | null;
  operation?: string | null;
  description?: string | null;
  required_inputs?: string[] | null;
};

interface PlannerPlanHint {
  apps?: string[] | null;
  trigger?: PlanTriggerHint | null;
  steps?: PlanStepHint[] | null;
}

interface GraphGenerationOptions {
  allowedApps?: Set<string>;
  plan?: PlannerPlanHint | null;
}

// Use standard WorkflowNode interface from common/workflow-types.ts
export function answersToGraph(
  prompt: string,
  answers: Record<string, any>,
  options: GraphGenerationOptions = {}
): WorkflowGraph {
  console.log(`🤖 Generating workflow from user answers (NO PRESETS)`);
  console.log(`📝 User Prompt: "${prompt}"`);
  console.log(`📋 User Answers:`, answers);
  if (options.allowedApps) {
    console.log('✅ Allowed apps for graph generation:', Array.from(options.allowedApps));
  }

  // Generate workflow directly from user's actual requirements
  return generateWorkflowFromUserAnswers(prompt, answers, options);
}

function generateWorkflowFromUserAnswers(
  prompt: string,
  answers: Record<string, any>,
  options: GraphGenerationOptions
): WorkflowGraph {
  console.log('👤 Building workflow from user requirements only...');

  // Parse what the user actually wants
  const userRequirements = parseUserRequirements(prompt, answers, options);
  console.log('🎯 User Requirements:', userRequirements);
  
  // Build nodes in Graph Editor compatible format
  const nodes: any[] = [];
  const edges: any[] = [];
  
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
  
  const workflow: WorkflowGraph = {
    id: `wf-${Date.now()}`,
    name: userRequirements.workflowName,
    nodes,
    edges,
    meta: {
      automationType: 'user_driven',
      description: userRequirements.description,
      userPrompt: prompt,
      userAnswers: answers,
      planner: options.plan ? { apps: options.plan.apps, trigger: options.plan.trigger, steps: options.plan.steps } : undefined
    }
  };
  return enrichWorkflowGraph(workflow, { answers });
}

type TriggerRequirement = { app: string; label: string; operation: string; config: Record<string, any> };
type ActionRequirement = { app: string; label: string; operation: string; config: Record<string, any> };

function parseUserRequirements(
  prompt: string,
  answers: Record<string, any>,
  options: GraphGenerationOptions
): {
  trigger: TriggerRequirement | null;
  actions: ActionRequirement[];
  workflowName: string;
  description: string;
} {
  const allowedApps = options.allowedApps;
  const plan = options.plan;

  const isAppAllowed = (app: string | null | undefined): boolean => {
    if (!app) {
      return false;
    }
    if (!allowedApps || allowedApps.size === 0) {
      return true;
    }
    return allowedApps.has(normalizeAppId(app));
  };

  const logSkip = (app: string) => {
    console.log(`⛔ Skipping app "${app}" because it is not allowed in the current planner mode`);
  };

  const allText = `${prompt} ${Object.values(answers).join(' ')}`.toLowerCase();

  const actions: ActionRequirement[] = [];
  const addAction = (action: ActionRequirement) => {
    const normalizedApp = normalizeAppId(action.app);
    if (!isAppAllowed(normalizedApp)) {
      logSkip(normalizedApp);
      return;
    }

    const key = `${normalizedApp}::${action.operation || action.label}`;
    const existingIndex = actions.findIndex(existing => `${existing.app}::${existing.operation || existing.label}` === key);

    if (existingIndex >= 0) {
      const existing = actions[existingIndex];
      actions[existingIndex] = {
        ...existing,
        app: normalizedApp,
        label: existing.label || action.label,
        operation: existing.operation || action.operation,
        config: { ...action.config, ...existing.config }
      };
      return;
    }

    actions.push({
      ...action,
      app: normalizedApp
    });
  };

  let trigger: TriggerRequirement | null = null;
  const setTrigger = (candidate: TriggerRequirement) => {
    if (trigger) {
      return;
    }
    const normalizedApp = normalizeAppId(candidate.app);
    if (!isAppAllowed(normalizedApp)) {
      logSkip(normalizedApp);
      return;
    }
    trigger = { ...candidate, app: normalizedApp };
  };

  const triggerValue = answers.trigger;
  const triggerText = typeof triggerValue === 'string'
    ? triggerValue
    : triggerValue?.type || JSON.stringify(triggerValue || {});
  const lowerTriggerText = (triggerText || '').toLowerCase();

  if (
    lowerTriggerText.includes('time-based') ||
    lowerTriggerText.includes('every') ||
    lowerTriggerText.includes('time') ||
    (typeof triggerValue === 'object' && triggerValue?.type === 'time')
  ) {
    const frequency = typeof triggerValue === 'string'
      ? extractFrequencyFromAnswer(triggerValue)
      : (typeof triggerValue === 'object' && triggerValue?.frequency?.value) || 15;
    const unit = typeof triggerValue === 'object' && triggerValue?.frequency?.unit
      ? triggerValue.frequency.unit
      : 'minutes';

    setTrigger({
      app: 'time',
      label: 'Time-based Trigger',
      operation: 'schedule',
      config: {
        frequency,
        unit
      }
    });
  } else if (
    lowerTriggerText === 'on spreadsheet edit' ||
    lowerTriggerText.includes('spreadsheet') ||
    lowerTriggerText.includes('sheet edit')
  ) {
    setTrigger({
      app: 'sheets',
      label: 'Sheet Edit',
      operation: 'onEdit',
      config: {
        spreadsheetId: extractSheetIdFromUserAnswer(answers.sheetDetails || ''),
        sheetName: 'Sheet1'
      }
    });
  } else if (lowerTriggerText.includes('email') || allText.includes('email arrives')) {
    const userQuery = answers.search_query ||
      answers.gmail_search ||
      answers.email_criteria ||
      answers.filter_criteria ||
      answers.invoice_identification || '';

    setTrigger({
      app: 'gmail',
      label: 'Email Received',
      operation: 'email_received',
      config: {
        query: userQuery || buildGmailQueryFromUserWords(userQuery),
        frequency: 5
      }
    });
  }

  if (allText.includes('crm') || allText.includes('pipedrive') || allText.includes('deal') || answers.crm_action) {
    addAction({
      app: 'pipedrive',
      label: 'Create Pipedrive Deal',
      operation: 'create_deal',
      config: {
        title: answers.deal_title || '{{deal_title}}',
        value: answers.deal_value || '1000',
        currency: 'USD'
      }
    });
  }

  if (allText.includes('slack') || allText.includes('notification') || answers.slack_channel) {
    addAction({
      app: 'slack',
      label: 'Send Slack Notification',
      operation: 'send_message',
      config: {
        channel: answers.slack_channel || '#general',
        message: answers.notification_message || 'Automated notification from CRM workflow'
      }
    });
  }

  if (allText.includes('monitor') || allText.includes('gmail') || answers.invoice_identification || answers.gmail || answers.search_query) {
    const userQuery = answers.search_query ||
      (answers.gmail && answers.gmail.search_query) ||
      answers.gmail_search ||
      answers.email_criteria ||
      answers.filter_criteria ||
      answers.invoice_identification || '';

    const finalQuery = userQuery || buildGmailQueryFromUserWords(userQuery) || 'is:unread';

    console.log('📧 Gmail query mapping:', {
      userProvided: !!userQuery,
      finalQuery: finalQuery.substring(0, 50) + '...',
      source: userQuery ? 'user_input' : 'fallback'
    });

    addAction({
      app: 'gmail',
      label: 'Monitor Gmail for Invoices',
      operation: 'search_emails',
      config: {
        query: finalQuery,
        maxResults: 50,
        extractData: answers.data_extraction || 'invoice number, date, amount'
      }
    });
  }

  if (allText.includes('log') || allText.includes('sheet') || answers.sheet_destination || answers.sheets || answers.spreadsheet_url) {
    let spreadsheetId = '';
    let sheetName = 'Sheet1';
    let columns = 'Invoice Number, Date, Amount, Vendor';

    const sheetCfg = answers.sheets || {};
    const SHEET_URL_RE = /https?:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i;

    spreadsheetId =
      sheetCfg.sheet_id ||
      (sheetCfg.sheet_url?.match(SHEET_URL_RE)?.[1]) ||
      answers.spreadsheet_id ||
      (answers.spreadsheet_url?.match(SHEET_URL_RE)?.[1]) ||
      extractSheetIdFromUserAnswer(answers.sheet_destination || '') ||
      '';

    sheetName = sheetCfg.sheet_name || answers.sheet_name || 'Sheet1';

    if (Array.isArray(sheetCfg.columns)) {
      columns = sheetCfg.columns.join(', ');
    } else if (sheetCfg.columns) {
      columns = String(sheetCfg.columns);
    } else {
      columns = answers.columns || answers.data_extraction || columns;
    }

    console.log('📊 Sheets mapping applied:', {
      spreadsheetId: spreadsheetId ? '✅ EXTRACTED' : '❌ MISSING',
      sheetName,
      columnsType: typeof columns,
      columnsPreview: typeof columns === 'string' ? columns.substring(0, 50) + '...' : columns
    });

    addAction({
      app: 'sheets',
      label: 'Log Invoice Data',
      operation: 'append_row',
      config: {
        spreadsheetId,
        sheetName,
        columns
      }
    });
  }

  if (allText.includes('email will be sent') || answers.emailContent) {
    addAction({
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

  if (allText.includes('status will be updated') || allText.includes('update') || answers.statusValues) {
    addAction({
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

  if (allText.includes('reminder') || allText.includes('24 hours') || answers.reminderEmailContent) {
    addAction({
      app: 'time',
      label: 'Wait 24 Hours',
      operation: 'delay',
      config: {
        hours: 24
      }
    });

    addAction({
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

  const aligned = applyPlanHints(trigger, actions, plan, answers, isAppAllowed);

  return {
    trigger: aligned.trigger,
    actions: aligned.actions,
    workflowName: `User Request: ${prompt.substring(0, 40)}...`,
    description: `Generated from user request: ${prompt}`
  };
}

function applyPlanHints(
  trigger: TriggerRequirement | null,
  actions: ActionRequirement[],
  plan: PlannerPlanHint | null | undefined,
  answers: Record<string, any>,
  isAppAllowed: (app: string | null | undefined) => boolean
): { trigger: TriggerRequirement | null; actions: ActionRequirement[] } {
  if (!plan) {
    return { trigger, actions };
  }

  let nextTrigger = trigger;

  if (plan.trigger) {
    const planTriggerApp = plan.trigger.app || plan.trigger.type;
    if (isAppAllowed(planTriggerApp)) {
      const normalizedApp = normalizeAppId(planTriggerApp || '');
      const configFromPlan = buildConfigFromRequiredInputs(plan.trigger.required_inputs, answers);

      if (nextTrigger) {
        nextTrigger = {
          ...nextTrigger,
          app: normalizeAppId(nextTrigger.app),
          label: nextTrigger.label || plan.trigger.description || nextTrigger.operation,
          operation: nextTrigger.operation || plan.trigger.operation || plan.trigger.type || 'trigger',
          config: { ...configFromPlan, ...nextTrigger.config }
        };
      } else {
        nextTrigger = {
          app: normalizedApp,
          label: plan.trigger.description || plan.trigger.operation || 'Trigger',
          operation: plan.trigger.operation || plan.trigger.type || 'start',
          config: configFromPlan
        };
      }
    }
  }

  const actionMap = new Map<string, ActionRequirement>();
  actions.forEach(action => {
    const normalizedApp = normalizeAppId(action.app);
    const key = `${normalizedApp}::${action.operation || action.label}`;
    actionMap.set(key, { ...action, app: normalizedApp });
  });

  (plan.steps || []).forEach(step => {
    if (!step) {
      return;
    }

    const planApp = step.app || step.operation;
    if (!isAppAllowed(planApp)) {
      return;
    }

    const normalizedApp = normalizeAppId(planApp || '');
    const operation = step.operation || 'execute';
    const key = `${normalizedApp}::${operation}`;
    const configFromPlan = buildConfigFromRequiredInputs(step.required_inputs, answers);

    if (actionMap.has(key)) {
      const existing = actionMap.get(key)!;
      actionMap.set(key, {
        ...existing,
        label: existing.label || step.description || existing.operation || operation,
        config: { ...configFromPlan, ...existing.config }
      });
    } else {
      actionMap.set(key, {
        app: normalizedApp,
        label: step.description || `${normalizedApp} ${operation}`,
        operation,
        config: configFromPlan
      });
    }
  });

  return { trigger: nextTrigger, actions: Array.from(actionMap.values()) };
}

function buildConfigFromRequiredInputs(
  requiredInputs: string[] | null | undefined,
  answers: Record<string, any>
): Record<string, any> {
  if (!Array.isArray(requiredInputs) || requiredInputs.length === 0) {
    return {};
  }

  const config: Record<string, any> = {};
  for (const rawKey of requiredInputs) {
    if (typeof rawKey !== 'string' || rawKey.trim().length === 0) {
      continue;
    }

    const value = findAnswerValue(answers, rawKey);
    if (value !== undefined) {
      const sanitizedKey = rawKey.replace(/\s+/g, '_');
      config[sanitizedKey] = value;
    }
  }

  return config;
}

function findAnswerValue(source: Record<string, any>, targetKey: string): any {
  const normalizedTarget = normalizeKey(targetKey);
  const stack: any[] = [source];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') {
      continue;
    }

    if (Array.isArray(current)) {
      for (const item of current) {
        if (item && typeof item === 'object') {
          stack.push(item);
        }
      }
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      if (normalizeKey(key) === normalizedTarget) {
        return value;
      }

      if (value && typeof value === 'object') {
        stack.push(value);
      }
    }
  }

  return undefined;
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
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
  // CRITICAL FIX: Safe spreadsheet ID extraction with validation
  if (!sheetAnswer || typeof sheetAnswer !== 'string') {
    console.warn('⚠️ No spreadsheet answer provided');
    return '';
  }

  const match = sheetAnswer.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const spreadsheetId = match?.[1];
  
  if (!spreadsheetId) {
    console.warn('⚠️ Could not extract spreadsheet ID from:', sheetAnswer);
    return '';
  }
  
  // Validate ID format (Google Sheets IDs are typically 44 characters)
  if (spreadsheetId.length < 20 || !/^[a-zA-Z0-9-_]+$/.test(spreadsheetId)) {
    console.warn('⚠️ Invalid spreadsheet ID format:', spreadsheetId);
    return '';
  }
  
  console.log('✅ Extracted valid spreadsheet ID:', spreadsheetId);
  return spreadsheetId;
}

// CRITICAL FIX: Add comprehensive sheet URL validation
function validateSpreadsheetUrl(url: string): { isValid: boolean; id: string | null; error?: string } {
  if (!url || typeof url !== 'string') {
    return { isValid: false, id: null, error: 'Spreadsheet URL is required' };
  }

  // Check if it's a Google Sheets URL
  if (!url.includes('docs.google.com/spreadsheets/d/')) {
    return { isValid: false, id: null, error: 'Must be a valid Google Sheets URL (docs.google.com/spreadsheets/d/...)' };
  }

  // Extract spreadsheet ID
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match || !match[1]) {
    return { isValid: false, id: null, error: 'Could not extract spreadsheet ID from URL' };
  }

  const spreadsheetId = match[1];
  
  // Validate ID format
  if (spreadsheetId.length < 20 || !/^[a-zA-Z0-9-_]+$/.test(spreadsheetId)) {
    return { isValid: false, id: null, error: 'Invalid spreadsheet ID format' };
  }

  return { isValid: true, id: spreadsheetId };
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

export { validateSpreadsheetUrl };
