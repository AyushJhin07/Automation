import { Router } from 'express';
import { answersToGraph } from '../workflow/answers-to-graph';
import { compileToAppsScript } from '../workflow/compile-to-appsscript';
import { healthMonitoringService } from '../services/HealthMonitoringService';
import { convertToNodeGraph } from '../workflow/graph-format-converter';
import { mapAnswersToBackendFormat, validateTriggerConfig } from '../utils/answer-field-mapper.js';
import { WorkflowStoreService } from '../workflow/workflow-store.js';
import { AnswerNormalizerService } from '../services/AnswerNormalizerService.js';

const SHEET_URL_RE = /https?:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i;

export const workflowBuildRouter = Router();

/**
 * POST /api/workflow/build
 * body: { prompt: string, answers: object }
 * returns: CompileResult { files, graph, stats, workflowId }
 */
workflowBuildRouter.post('/build', async (req, res) => {
  const startTime = Date.now();
  const requestId = generateRequestId();
  
  try {
    console.log(`🚀 /api/workflow/build called! RequestID: ${requestId}`);
    
    // Validate input
    const { prompt = '', answers: rawAnswers = {} } = req.body || {};
    
    if (!prompt || typeof prompt !== 'string') {
      logWorkflowEvent('VALIDATION_ERROR', requestId, { error: 'Invalid prompt', prompt });
      return res.status(400).json({ 
        success: false, 
        error: 'Prompt is required and must be a string',
        code: 'INVALID_PROMPT',
        requestId
      });
    }
    
    if (typeof rawAnswers !== 'object' || rawAnswers === null) {
      logWorkflowEvent('VALIDATION_ERROR', requestId, { error: 'Invalid answers', answers: rawAnswers });
      return res.status(400).json({ 
        success: false, 
        error: 'Answers must be an object',
        code: 'INVALID_ANSWERS',
        requestId
      });
    }
    
    // CRITICAL FIX: ChatGPT's LLM-powered normalization BEFORE validation
    const { questions, timezone } = req.body;
    const { normalized, __issues } = await (async () => {
      try {
        // Try LLM normalization first
        const result = await AnswerNormalizerService
          .normalizeAnswersLLM(questions || [], rawAnswers, timezone || 'UTC');
        return result;
      } catch (error) {
        console.error('❌ LLM normalization failed, using fallback:', error);
        // Fallback to deterministic normalization
        return { normalized: mapAnswersToBackendFormat(rawAnswers), __issues: [] };
      }
    })();

    // Use normalized answers as single source of truth
    const answers = normalized;
    
    console.log('🔄 CHATGPT LLM NORMALIZATION APPLIED:', {
      originalFields: Object.keys(rawAnswers),
      normalizedFields: Object.keys(answers),
      triggerMapped: !!answers.trigger,
      spreadsheetMapped: !!(answers.spreadsheet_url || answers.sheets?.sheet_id),
      issues: __issues || [],
      requestId
    });

    console.log(`📝 Prompt (${requestId}):`, prompt);
    console.log(`📋 Raw Answers (${requestId}):`, rawAnswers);
    console.log(`🎯 Normalized Answers (${requestId}):`, answers);
    
    // Log workflow generation start
    logWorkflowEvent('WORKFLOW_GENERATION_START', requestId, { 
      prompt: prompt.substring(0, 100) + '...', 
      answerCount: Object.keys(answers).length 
    });
    
    // ChatGPT Fix: Plan before validate (context-aware validation)
    let plannedApps: string[] = [];
    try {
      const { AutomationPlannerService } = await import('../services/AutomationPlannerService.js');
      const plan = await AutomationPlannerService.planAutomation(prompt, answers);
      plannedApps = plan.apps || [];
      console.log('🎯 Planned apps for validation context:', plannedApps);
    } catch (error) {
      console.warn('⚠️ Could not get automation plan for validation context:', error.message);
      // Fallback: detect from prompt text
      plannedApps = this.detectAppsFromPrompt(prompt);
    }

    // P0 CRITICAL: Context-aware validation (don't require sheets if not planned)
    const validationErrors = validateRequiredInputs(prompt, answers, plannedApps);
    if (validationErrors.length > 0) {
      logWorkflowEvent('VALIDATION_FAILED', requestId, { 
        errors: validationErrors,
        prompt: prompt.substring(0, 100) + '...',
        plannedApps
      });
      return res.status(400).json({
        success: false,
        error: 'Missing required inputs',
        code: 'VALIDATION_FAILED',
        details: validationErrors,
        requestId
      });
    }
    
    // Generate graph with error handling
    const graphStartTime = Date.now();
    const graph = answersToGraph(prompt, answers);
    const graphGenerationTime = Date.now() - graphStartTime;
    
    if (!graph || !graph.nodes || graph.nodes.length === 0) {
      logWorkflowEvent('GRAPH_GENERATION_FAILED', requestId, { 
        error: 'Empty or invalid graph',
        generationTime: graphGenerationTime 
      });
      return res.status(400).json({
        success: false,
        error: 'Failed to generate valid workflow graph',
        code: 'GRAPH_GENERATION_FAILED',
        requestId
      });
    }
    
    logWorkflowEvent('GRAPH_GENERATION_SUCCESS', requestId, {
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges?.length || 0,
      automationType: graph.meta?.automationType,
      generationTime: graphGenerationTime
    });
    
    console.log(`📊 Generated graph (${requestId}):`, JSON.stringify(graph, null, 2));
    
    // P0 CRITICAL: Check for unsupported operations before compilation  
    const supportedApps = [
      'gmail', 'sheets', 'time', 'slack', 'salesforce', 'hubspot', 'stripe', 'shopify',
      // BATCH 1: CRM
      'pipedrive', 'zoho-crm', 'dynamics365',
      // BATCH 2: Communication  
      'microsoft-teams', 'twilio', 'zoom',
      // BATCH 3: E-commerce
      'woocommerce', 'bigcommerce', 'magento',
      // BATCH 4: Project Management
      'jira', 'asana', 'trello',
      // BATCH 5: Marketing
      'mailchimp', 'klaviyo', 'sendgrid',
      // BATCH 6: Productivity
      'notion', 'airtable',
      // BATCH 7: Finance & Accounting
      'quickbooks', 'xero',
      // BATCH 8: Developer Tools
      'github',
      // BATCH 9: Forms & Surveys
      'typeform', 'surveymonkey',
      // BATCH 10: Calendar & Scheduling
      'calendly',
      // PHASE 1: Storage & Cloud
      'dropbox', 'google-drive', 'box',
      // PHASE 2: Analytics & Data
      'google-analytics', 'mixpanel', 'amplitude',
      // PHASE 3: HR & Recruitment
      'bamboohr', 'greenhouse',
      // PHASE 4: Customer Support
      'zendesk', 'freshdesk',
      // PHASE 5: DevOps & Development
      'jenkins', 'docker-hub', 'kubernetes',
      // PHASE 6: Security & Monitoring
      'datadog', 'new-relic',
      // PHASE 7: Document Management
      'docusign', 'google-docs', 'google-slides',
      // PHASE 8: Additional Essential Business Apps
      'monday', 'clickup', 'basecamp', 'toggl', 'webflow',
      // Microsoft Office Suite
      'outlook', 'microsoft-todo', 'onedrive',
      // Additional Popular Apps
      'intercom', 'discord',
      // PHASE 9: E-commerce & Payment
      'paypal', 'square', 'etsy', 'amazon', 'ebay',
      // PHASE 10: Social Media & Content
      'facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'tiktok',
      // PHASE 11: Finance & Accounting
      'wave', 'freshbooks', 'sage', 'zoho-books',
      // PHASE 12: Database & Backend
      'mysql', 'postgresql', 'mongodb', 'redis',
      // PHASE 13: Specialized Industry
      'salesforce-commerce', 'servicenow', 'workday', 'oracle',
      // PHASE 14: Final Batch
      'telegram', 'whatsapp', 'skype', 'zapier', 'ifttt', 'aws-s3', 'google-cloud-storage',
      'constant-contact', 'activecampaign', 'convertkit',
      // FINAL PUSH: Remaining Critical Apps
      'microsoft-excel', 'microsoft-word', 'microsoft-powerpoint',
      'adobe-sign', 'pandadoc', 'hellosign', 'eversign', 'signrequest', 'adobe-acrobat',
      'google-ads', 'facebook-ads', 'ringcentral', 'vonage', 'bitbucket', 'gitlab',
      // FINAL 30 APPS: Complete remaining applications for 100% coverage
      'buffer', 'hootsuite', 'sprout-social', 'later', 'canva', 'figma', 'adobe-creative',
      'sketch', 'invision', 'miro', 'lucidchart', 'draw-io', 'creately', 'vimeo', 'wistia',
      'loom', 'screencast-o-matic', 'camtasia', 'animoto', 'powtoon', 'prezi', 'slideshare',
      'speakerdeck', 'flipboard', 'pinterest', 'reddit', 'medium', 'substack', 'ghost', 'wordpress',
      // APP #149: Final application for 100% coverage
      'drupal'
    ];
    const unsupportedNodes = graph.nodes.filter((node: any) => {
      const app = node.app || node.type?.split('.')[1];
      return app && !supportedApps.includes(app);
    });
    
    if (unsupportedNodes.length > 0) {
      logWorkflowEvent('UNSUPPORTED_OPERATIONS', requestId, {
        unsupportedNodes: unsupportedNodes.map((n: any) => ({
          id: n.id,
          app: n.app || n.type?.split('.')[1],
          operation: n.data?.operation || n.op
        }))
      });
      
      return res.status(400).json({
        success: false,
        error: 'Workflow contains unsupported operations',
        code: 'UNSUPPORTED_OPERATIONS',
        details: {
          message: 'Some apps in your workflow are not yet fully implemented',
          unsupportedApps: [...new Set(unsupportedNodes.map((n: any) => n.app || n.type?.split('.')[1]))],
          supportedApps: supportedApps,
          suggestion: 'Please use only supported apps or contact support for implementation timeline'
        },
        requestId
      });
    }
    
    // Compile with validation
    const compileStartTime = Date.now();
    const compiled = compileToAppsScript(graph);
    const compilationTime = Date.now() - compileStartTime;
    
    if (!compiled || !compiled.files || compiled.files.length === 0) {
      logWorkflowEvent('COMPILATION_FAILED', requestId, { 
        error: 'Compilation returned empty result',
        compilationTime 
      });
      return res.status(400).json({
        success: false,
        error: 'Failed to compile workflow to Apps Script',
        code: 'COMPILATION_FAILED',
        requestId
      });
    }
    
    // Calculate total processing time
    const totalTime = Date.now() - startTime;
    
    // Convert graph format for Graph Editor compatibility
    const nodeGraph = convertToNodeGraph(graph);
    
    // ChatGPT's fix: Generate workflowId for Graph Editor handoff
    const workflowId = `wf-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    
    // Add enterprise metadata
    const response = {
      success: true,
      workflowId, // ChatGPT's fix: Include workflowId for Graph Editor navigation
      ...compiled,
      graph: nodeGraph, // Use converted format instead of original
      metadata: {
        generatedAt: new Date().toISOString(),
        automationType: graph.meta?.automationType || 'generic',
        promptHash: hashString(prompt),
        complexity: graph.nodes.length > 5 ? 'complex' : graph.nodes.length > 2 ? 'medium' : 'simple',
        estimatedExecutionTime: estimateExecutionTime(graph),
        requiredScopes: extractRequiredScopes(graph),
        apiCallsEstimate: estimateApiCalls(graph),
        processingTime: {
          total: totalTime,
          graphGeneration: graphGenerationTime,
          compilation: compilationTime
        },
        requestId
      }
    };
    
    // Log successful completion
    logWorkflowEvent('WORKFLOW_BUILD_SUCCESS', requestId, {
      nodeCount: graph.nodes.length,
      automationType: graph.meta?.automationType,
      complexity: response.metadata.complexity,
      totalTime,
      codeSize: compiled.files.reduce((sum, f) => sum + f.content.length, 0)
    });
    
    // CRITICAL FIX: Store workflow for Graph Editor handoff
    WorkflowStoreService.store(workflowId, nodeGraph);
    
    // Record performance metrics
    healthMonitoringService.recordApiRequest(totalTime, false);
    
    res.json(response);
    
  } catch (e: any) {
    const totalTime = Date.now() - startTime;
    
    console.error(`❌ Build error (${requestId}):`, e);
    
    // Log the error
    logWorkflowEvent('WORKFLOW_BUILD_ERROR', requestId, {
      error: e?.message || 'Unknown error',
      code: e?.code || 'BUILD_ERROR',
      stack: e?.stack,
      totalTime
    });
    
    // Record failed request
    healthMonitoringService.recordApiRequest(totalTime, true);
    
    // Enhanced error response for enterprise
    const errorResponse = {
      success: false,
      error: e?.message || 'Internal server error',
      code: e?.code || 'BUILD_ERROR',
      timestamp: new Date().toISOString(),
      requestId,
      stack: process.env.NODE_ENV === 'development' ? e?.stack : undefined
    };
    
    res.status(500).json(errorResponse);
  }
});

// Enterprise logging function
function logWorkflowEvent(event: string, requestId: string, data: any = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    event,
    requestId,
    ...data
  };
  
  console.log(`📋 [${event}] ${requestId}:`, JSON.stringify(logEntry, null, 2));
  
  // In production, you'd send this to a proper logging service
  // healthMonitoringService.logEvent(logEntry);
}

// CRITICAL FIX: Local sheet URL validation function
function validateSpreadsheetUrlLocal(url: string): { isValid: boolean; id: string | null; error?: string } {
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

// ChatGPT Fix: Detect apps from prompt as fallback
function detectAppsFromPrompt(prompt: string): string[] {
  const apps: string[] = [];
  const text = prompt.toLowerCase();
  
  if (text.includes('gmail') || text.includes('email')) apps.push('gmail');
  if (text.includes('sheets') || text.includes('spreadsheet')) apps.push('sheets');
  if (text.includes('slack')) apps.push('slack');
  if (text.includes('salesforce')) apps.push('salesforce');
  if (text.includes('hubspot')) apps.push('hubspot');
  
  return apps;
}

// Helper functions for enterprise metadata
function validateRequiredInputs(prompt: string, answers: Record<string, string>, plannedApps: string[] = []): string[] {
  const errors: string[] = [];
  const allText = `${prompt} ${Object.values(answers).join(' ')}`.toLowerCase();
  
  // ChatGPT Fix: Context-aware sheet validation (only if sheets is planned)
  const needsSheets = plannedApps.includes('sheets') || allText.includes('sheet') || allText.includes('spreadsheet');
  
  if (needsSheets) {
    const hasSheet =
      answers?.sheets?.sheet_id ||
      answers?.spreadsheet_id   ||
      (answers?.spreadsheet_url && SHEET_URL_RE.test(answers.spreadsheet_url)) ||
      (answers?.spreadsheet_destination && SHEET_URL_RE.test(answers.spreadsheet_destination));

    if (!hasSheet) {
      errors.push('Valid Google Sheets URL is required. Include the full URL or paste it in the "spreadsheet destination" answer.');
    }
  }
  
  // Check for email operations without proper configuration
  if (allText.includes('email') || allText.includes('gmail')) {
    if (answers.emailContent && !answers.emailContent.includes('Subject:')) {
      errors.push('Email content should include both Subject and Body. Format: "Subject: Your Subject\\nBody: Your Message"');
    }
  }
  
  // Check for incomplete trigger configuration
  if (!answers.trigger) {
    errors.push('Trigger configuration is required. Please specify when the automation should run.');
  }
  
  return errors;
}

function hashString(str: string): string {
  return str.split('').reduce((hash, char) => {
    const charCode = char.charCodeAt(0);
    hash = ((hash << 5) - hash) + charCode;
    return hash & hash; // Convert to 32-bit integer
  }, 0).toString(16);
}

function estimateExecutionTime(graph: any): string {
  const nodeCount = graph.nodes?.length || 0;
  const hasExternalApis = graph.nodes?.some((n: any) => 
    n.app !== 'gmail' && n.app !== 'sheets' && n.app !== 'calendar' && n.app !== 'drive'
  ) || false;
  
  const baseTime = nodeCount * 2; // 2 seconds per node
  const apiTime = hasExternalApis ? nodeCount * 3 : 0; // 3 additional seconds for external API calls
  
  return `${baseTime + apiTime}s estimated`;
}

function extractRequiredScopes(graph: any): string[] {
  const scopes = new Set<string>();
  graph.nodes?.forEach((node: any) => {
    if (node.app === 'gmail') scopes.add('https://www.googleapis.com/auth/gmail.modify');
    if (node.app === 'sheets') scopes.add('https://www.googleapis.com/auth/spreadsheets');
    if (node.app === 'calendar') scopes.add('https://www.googleapis.com/auth/calendar');
    if (node.app === 'drive') scopes.add('https://www.googleapis.com/auth/drive');
    if (node.app === 'forms') scopes.add('https://www.googleapis.com/auth/forms');
    // External APIs always need external request scope
    if (!['gmail', 'sheets', 'calendar', 'drive', 'forms'].includes(node.app)) {
      scopes.add('https://www.googleapis.com/auth/script.external_request');
    }
  });
  return Array.from(scopes);
}

function estimateApiCalls(graph: any): number {
  return graph.nodes?.length || 0;
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}