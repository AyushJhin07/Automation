import { Router } from 'express';
import { answersToGraph } from '../workflow/answers-to-graph';
import { compileToAppsScript } from '../workflow/compile-to-appsscript';
import { healthMonitoringService } from '../services/HealthMonitoringService';
import { convertToNodeGraph } from '../workflow/graph-format-converter';

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
    const { prompt = '', answers = {} } = req.body || {};
    
    if (!prompt || typeof prompt !== 'string') {
      logWorkflowEvent('VALIDATION_ERROR', requestId, { error: 'Invalid prompt', prompt });
      return res.status(400).json({ 
        success: false, 
        error: 'Prompt is required and must be a string',
        code: 'INVALID_PROMPT',
        requestId
      });
    }
    
    if (typeof answers !== 'object' || answers === null) {
      logWorkflowEvent('VALIDATION_ERROR', requestId, { error: 'Invalid answers', answers });
      return res.status(400).json({ 
        success: false, 
        error: 'Answers must be an object',
        code: 'INVALID_ANSWERS',
        requestId
      });
    }
    
    console.log(`📝 Prompt (${requestId}):`, prompt);
    console.log(`📋 Answers (${requestId}):`, answers);
    
    // Log workflow generation start
    logWorkflowEvent('WORKFLOW_GENERATION_START', requestId, { 
      prompt: prompt.substring(0, 100) + '...', 
      answerCount: Object.keys(answers).length 
    });
    
    // P0 CRITICAL: Validate required inputs before generation
    const validationErrors = validateRequiredInputs(prompt, answers);
    if (validationErrors.length > 0) {
      logWorkflowEvent('VALIDATION_FAILED', requestId, { 
        errors: validationErrors,
        prompt: prompt.substring(0, 100) + '...'
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
      'intercom', 'discord'
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
    
    // Add enterprise metadata
    const response = {
      success: true,
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

// Helper functions for enterprise metadata
function validateRequiredInputs(prompt: string, answers: Record<string, string>): string[] {
  const errors: string[] = [];
  const allText = `${prompt} ${Object.values(answers).join(' ')}`.toLowerCase();
  
  // Check for spreadsheet operations without valid ID
  if (allText.includes('sheet') || allText.includes('spreadsheet')) {
    const sheetAnswers = Object.values(answers).filter(a => 
      a.includes('spreadsheets/d/') || a.toLowerCase().includes('sheet')
    );
    
    const hasValidSheetId = sheetAnswers.some(a => 
      a.match(/spreadsheets\/d\/[a-zA-Z0-9-_]+/)
    );
    
    if (!hasValidSheetId) {
      errors.push('Spreadsheet URL is required but not provided. Please provide a valid Google Sheets URL.');
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