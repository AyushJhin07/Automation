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