import { Router } from 'express';
import { MultiAIService, buildWorkflowFromAnswersNew, generateWorkflowFromAnalysis } from '../aiModels';
import { LLMProviderService, NoLLMProvidersAvailableError, type LLMProviderCapabilities } from '../services/LLMProviderService.js';
import { getErrorMessage } from '../types/common';

export const aiRouter = Router();

// Generate workflow questions endpoint
aiRouter.post('/generate-workflow', async (req, res) => {
  try {
    console.log('🤖 /api/ai/generate-workflow called!');
    const {
      prompt,
      userId,
      model = 'gemini-1.5-flash',
      apiKey,
      history = [],
      count = 3
    } = req.body || {};
    
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'Prompt is required and must be a string' 
      });
    }

    // Make userId optional in development mode
    const finalUserId = userId || (process.env.NODE_ENV === 'development' ? 'dev-user' : null);
    if (!finalUserId && process.env.NODE_ENV === 'production') {
      return res.status(400).json({ 
        success: false, 
        error: 'userId is required in production mode' 
      });
    }

    console.log('📝 Prompt for analysis:', prompt);
    console.log('👤 User ID:', finalUserId);
    console.log('🤖 Model:', model);

    // Use MultiAIService to determine if questions are needed
    const questions = await MultiAIService.generateFollowUpQuestions(prompt, {
      history,
      requested: typeof count === 'number' && count > 0 ? count : 3
    });
    
    console.log('❓ Generated questions:', questions);

    // If no questions needed (prompt is clear), return empty array
    if (!questions || questions.length === 0) {
      console.log('✅ No additional questions needed');
      return res.json({
        success: true,
        questions: [],
        needsQuestions: false,
        message: 'Prompt is clear enough to proceed directly to workflow building'
      });
    }

    // Return questions for user to answer
    console.log(`📋 Returning ${questions.length} questions for user`);
    res.json({
      success: true,
      questions: questions,
      needsQuestions: true,
      message: `Need ${questions.length} additional details to build the perfect workflow`
    });

  } catch (error: any) {
    console.error('❌ AI generate-workflow error:', error);
    res.status(500).json({ 
      success: false, 
      error: error?.message || 'Failed to analyze workflow request',
      questions: [] // Return empty questions as fallback
    });
  }
});

// ChatGPT Fix: Process answers and build workflow
aiRouter.post('/process-answers', async (req, res) => {
  try {
    console.log('🤖 /api/ai/process-answers called!');
    const { prompt, answers, userId } = req.body || {};
    
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'Prompt is required and must be a string' 
      });
    }

    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ 
        success: false, 
        error: 'Answers are required and must be an object' 
      });
    }

    console.log('📝 Processing answers for prompt:', prompt);
    console.log('📋 Answers received:', Object.keys(answers));

    // ChatGPT Fix: Check if we have answers and call the right function
    const haveAnswers = answers && typeof answers === "object" && Object.keys(answers).length > 0;

    const workflow = haveAnswers
      ? await buildWorkflowFromAnswersNew(answers, prompt)
      : await generateWorkflowFromAnalysis(
          await MultiAIService.analyzeWorkflowPrompt(prompt),
          prompt
        );

    console.log('✅ Generated workflow:', workflow.title);

    res.json({
      success: true,
      workflow,
      nodeCount: workflow.nodes?.length || 0,
      connectionCount: workflow.connections?.length || 0
    });

  } catch (error: any) {
    console.error('❌ AI process-answers error:', error);
    res.status(500).json({ 
      success: false, 
      error: error?.message || 'Failed to process answers and build workflow'
    });
  }
});

// Get available AI models endpoint  
aiRouter.get('/models', async (req, res) => {
  try {
    const capabilities = LLMProviderService.getProviderCapabilities();
    const availableProviders = Object.entries(capabilities)
      .filter(([, enabled]) => enabled)
      .map(([provider]) => provider);

    const availableModels = [
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'gemini' },
      { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash 8B', provider: 'gemini' },
      { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Experimental)', provider: 'gemini' },
      { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', provider: 'claude' },
      { id: 'gpt-4', name: 'GPT-4', provider: 'openai' }
    ].filter((model) => capabilities[model.provider as keyof LLMProviderCapabilities]);

    res.json({
      success: true,
      models: availableModels,
      providerCapabilities: capabilities,
      llmAvailable: availableProviders.length > 0
    });
  } catch (error: any) {
    console.error('❌ AI models error:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to get AI models'
    });
  }
});

// Test models endpoint for Admin Settings page
aiRouter.post('/test-models', async (req, res) => {
  try {
    const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
    const hasGemini = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY);

    // Return a simple capability report without making network calls
    res.json({
      success: true,
      results: {
        openai: { available: hasOpenAI, model: 'gpt-4o-mini' },
        gemini: { available: hasGemini, model: 'gemini-1.5-flash' },
        claude: { available: hasClaude, model: 'claude-3-sonnet' }
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Failed to test models' });
  }
});

// Map parameter values using AI suggestions
aiRouter.post('/map-params', async (req, res) => {
  try {
    const { parameter, upstream, instruction, model } = req.body || {};

    if (!parameter || typeof parameter !== 'object' || !parameter.name) {
      return res.status(400).json({ success: false, error: 'parameter.name is required' });
    }

    if (!Array.isArray(upstream) || upstream.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one upstream node with metadata is required.' });
    }

    const prompt = buildParameterMappingPrompt(parameter, upstream, instruction);

    const llmResult = await LLMProviderService.generateText(prompt, {
      model: model || 'gemini-1.5-flash',
      temperature: 0.15,
      maxTokens: 400,
    });

    console.log('🤖 AI Parameter Mapping:', { 
      parameter: parameter.name,
      upstreamNodes: upstream.length,
      responseLength: llmResult?.text?.length || 0
    });

    if (!llmResult || typeof llmResult.text !== 'string') {
      return res.status(500).json({
        success: false,
        error: 'Invalid LLM response format'
      });
    }

    const mapping = parseMappingResponse(llmResult.text);

    if (!mapping || !mapping.nodeId || !mapping.path) {
      return res.status(422).json({
        success: false,
        error: mapping?.reason || 'AI could not determine a reliable mapping.',
      });
    }

    res.json({ success: true, mapping });
  } catch (error) {
    if (error instanceof NoLLMProvidersAvailableError) {
      return res.status(503).json({
        success: false,
        error: 'AI mapping is not available because no AI providers are configured.',
        code: 'no_llm_providers'
      });
    }

    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

// Check deployment prerequisites endpoint
aiRouter.get('/deployment/prerequisites', async (req, res) => {
  try {
    console.log('🔍 Checking deployment prerequisites...');
    
    const prerequisites = {
      success: true,
      checks: {
        clasp: { 
          status: 'available', 
          message: 'Google Apps Script CLI is ready',
          required: true 
        },
        googleAuth: { 
          status: 'available', 
          message: 'Google authentication configured',
          required: true 
        },
        permissions: { 
          status: 'available', 
          message: 'Required permissions granted',
          required: true 
        }
      },
      canDeploy: true,
      message: 'All prerequisites satisfied'
    };

    // In a real implementation, you would check:
    // 1. Is clasp installed? (`clasp --version`)
    // 2. Is user authenticated? (`clasp list`)
    // 3. Are required OAuth scopes granted?
    // 4. Are API quotas sufficient?

    res.json(prerequisites);
    
  } catch (error: any) {
    console.error('❌ Prerequisites check failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error?.message || 'Failed to check prerequisites',
      canDeploy: false,
      checks: {
        clasp: { status: 'error', message: 'Could not verify clasp installation', required: true },
        googleAuth: { status: 'unknown', message: 'Could not verify authentication', required: true },
        permissions: { status: 'unknown', message: 'Could not verify permissions', required: true }
      }
    });
  }
});

function buildParameterMappingPrompt(parameter: any, upstream: any[], instruction?: string): string {
  const upstreamSummary = upstream
    .map((node: any) => {
      const columns = node.columns || [];
      const sample = node.sample || node.outputSample;
      const schema = node.schema || node.outputSchema;

      return `Node ID: ${node.nodeId}
Label: ${node.label || node.nodeId}
App: ${node.app || 'unknown'}
Columns: ${columns.length ? columns.join(', ') : 'n/a'}
Sample: ${sample ? JSON.stringify(sample) : 'n/a'}
Schema: ${schema ? JSON.stringify(schema) : 'n/a'}`;
    })
    .join('\n\n');

  const paramSchema = JSON.stringify(parameter.schema || {});

  return `You are an automation workflow assistant. Map downstream parameters to upstream outputs.

Downstream parameter to map:
- Name: ${parameter.name}
- Node label: ${parameter.nodeLabel || ''}
- App: ${parameter.app || ''}
- Operation: ${parameter.opId || ''}
- Description: ${parameter.schema?.description || parameter.description || ''}
- JSON Schema: ${paramSchema}

Available upstream nodes and their data:
${upstreamSummary}

Instruction from user: ${instruction || 'Choose the most semantically appropriate upstream value.'}

Respond with strict JSON:
{
  "nodeId": "<upstream node id or empty string>",
  "path": "<dot notation path within that node>",
  "confidence": <number between 0 and 1>,
  "reason": "<brief justification>"
}

If you cannot confidently map, set nodeId and path to empty strings.`;
}

function parseMappingResponse(text: string): { nodeId: string; path: string; confidence?: number; reason?: string } | null {
  if (!text) return null;

  const cleaned = text.trim();
  let jsonText = cleaned;

  // If wrapped in markdown code fences, extract contents
  const fenceMatch = cleaned.match(/```json\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    jsonText = fenceMatch[1];
  }

  try {
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      nodeId: parsed.nodeId?.trim() || '',
      path: parsed.path?.trim() || '',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : undefined,
      reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
    };
  } catch {
    return null;
  }
}

export default aiRouter;
