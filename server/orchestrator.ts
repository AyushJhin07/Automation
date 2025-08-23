// ORCHESTRATOR SERVICE - LLM Tool Integration for Workflow Planning
// Based on ChatGPT's architecture with structured LLM interactions

import { 
  NodeGraph, 
  ValidationError, 
  LLMTools, 
  ClarifyRequest, 
  ClarifyResponse,
  PlanRequest, 
  PlanResponse,
  FixRequest,
  FixResponse,
  Capabilities,
  Question
} from '../shared/nodeGraphSchema';
import { EnhancedNodeCatalog } from './enhancedNodeCatalog';
import { simpleGraphValidator } from './core/SimpleGraphValidator';
import { RealAIService } from './realAIService'; // Import for direct calls
import { getErrorMessage, createError } from './types/common';

export class WorkflowOrchestrator {
  private nodeCatalog: EnhancedNodeCatalog;

  constructor() {
    this.nodeCatalog = EnhancedNodeCatalog.getInstance();
  }

  // LLM Tools - Functions that the LLM can call
  private getLLMTools(): LLMTools {
    return {
      getNodeCatalog: () => this.nodeCatalog.getNodeCatalog(),
      validateGraph: (graph: NodeGraph) => simpleGraphValidator.validate(graph),
      searchApps: (query: string) => this.nodeCatalog.searchApps(query),
      getAppFunctions: (appName: string) => this.nodeCatalog.getAppFunctions(appName)
    };
  }

  // Get capabilities for LLM planning
  public getCapabilities(): Capabilities {
    const catalog = this.nodeCatalog.getNodeCatalog();
    const allNodes = { ...catalog.triggers, ...catalog.transforms, ...catalog.actions };
    
    const schemasByType: Record<string, any> = {};
    const scopesByType: Record<string, string[]> = {};
    
    Object.values(allNodes).forEach(node => {
      schemasByType[node.id] = node.paramsSchema;
      scopesByType[node.id] = node.requiredScopes;
    });

    return {
      nodes: Object.keys(allNodes),
      schemasByType,
      scopesByType
    };
  }

  // ✅ CLARIFY STEP - Ask questions to understand the user's intent
  public async clarifyIntent(request: ClarifyRequest): Promise<ClarifyResponse> {
    console.log('🔍 Clarifying user intent:', request.prompt);

    const systemPrompt = `You are an expert automation consultant. Your job is to understand the user's automation needs and determine if you need more information.

For the prompt: "${request.prompt}"

Analyze if you have enough information to build a complete automation workflow. Consider:
- What specific data/content needs to be processed?
- What triggers should start the automation?
- What specific actions should be taken?
- What apps/services are involved?
- Any timing, filtering, or conditional logic?

If you have enough info, respond with JSON:
{
  "action": "proceed_to_planning",
  "confidence": 0.9,
  "summary": "Clear automation request with sufficient details"
}

If you need more info, respond with JSON:
{
  "action": "ask_questions", 
  "questions": ["What specific information do you want to extract?", "How often should this run?"],
  "reasoning": "Need to clarify data extraction and timing requirements"
}

Only ask 1-2 essential questions. Be specific and practical.`;

    try {
      // Use direct service call instead of relative fetch to avoid 404 in server context
      const aiResponse = await this.callLLMDirectly(systemPrompt, request.apiKey, request.model);
      
      // Parse JSON response
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(aiResponse.replace(/```json\n?|\n?```/g, ''));
      } catch (parseError) {
        console.error('❌ Failed to parse clarify JSON response');
        throw new Error('Invalid JSON response from LLM during clarification');
      }

      if (parsedResponse.action === 'ask_questions') {
        return {
          needsMoreInfo: true,
          questions: parsedResponse.questions.map((q: string, index: number) => ({
            id: `clarify_${index}`,
            text: q,
            type: 'text' as const,
            required: true
          })),
          reasoning: parsedResponse.reasoning
        };
      } else {
        return {
          needsMoreInfo: false,
          summary: parsedResponse.summary,
          confidence: parsedResponse.confidence || 0.8
        };
      }

    } catch (error) {
      console.error('❌ Clarify step failed:', error);
      throw createError(`Clarification failed: ${getErrorMessage(error)}`, 'CLARIFICATION_FAILED');
    }
  }

  // Step 2: Plan the workflow graph
  public async planWorkflow(request: PlanRequest): Promise<PlanResponse> {
    console.log('📋 Planning workflow for:', request.prompt);

    const systemPrompt = this.buildPlannerPrompt();
    const capabilities = request.capabilities;
    
    let userPrompt = `User goal: "${request.prompt}"

Available node types: ${capabilities.nodes.join(', ')}

`;

    // Add answers if provided
    if (request.answers && Object.keys(request.answers).length > 0) {
      userPrompt += `User answers to clarifying questions:
${Object.entries(request.answers).map(([q, a]) => `Q: ${q}\nA: ${a}`).join('\n\n')}

`;
    }

    userPrompt += `Build a complete NodeGraph. Return JSON: { "graph": NodeGraph, "rationale": "explanation" }`;

    try {
      // Call LLM with planning prompt and tools
      const response = await this.callLLMWithTools(systemPrompt, userPrompt);
      
      if (response.graph) {
        // Validate the generated graph
        const validationResult = simpleGraphValidator.validate(response.graph);
        const errors = validationResult.errors;
        
        if (errors.filter((e: ValidationError) => e.severity === 'error').length > 0) {
          // Try to fix errors automatically
          const fixedGraph = await this.fixWorkflow({
            graph: response.graph,
            errors: errors
          });
          
          return {
            graph: fixedGraph.graph,
            rationale: response.rationale + ' (Auto-fixed validation errors)'
          };
        }

        return {
          graph: response.graph,
          rationale: response.rationale || 'Workflow planned successfully'
        };
      }

      throw new Error('LLM did not return a valid graph');

    } catch (error) {
      console.error('Planning error:', error);
      
      // Fallback: create basic workflow
      return {
        graph: this.createFallbackWorkflow(request.prompt),
        rationale: 'Created basic workflow (LLM planning failed)'
      };
    }
  }

  // Step 3: Fix workflow validation errors
  public async fixWorkflow(request: FixRequest): Promise<FixResponse> {
    console.log('🔧 Fixing workflow errors:', request.errors.length);

    const systemPrompt = `You are a workflow fixer. Given a NodeGraph with validation errors, return a corrected version.

RULES:
- Fix ONLY the specific errors listed
- Maintain the original workflow intent
- Use only valid node types from the catalog
- Return JSON: { "graph": NodeGraph }`;

    const userPrompt = `Fix these errors in the workflow:

Errors:
${request.errors.map(e => `- ${e.path}: ${e.message} (${e.severity})`).join('\n')}

Current graph:
${JSON.stringify(request.graph, null, 2)}

Return the fixed graph as JSON.`;

    try {
      const response = await this.callLLMWithTools(systemPrompt, userPrompt);
      
      if (response.graph) {
        return { graph: response.graph };
      }

      throw new Error('LLM did not return a fixed graph');

    } catch (error) {
      console.error('Fix error:', error);
      
      // Fallback: basic error fixing
      return {
        graph: this.basicErrorFix(request.graph, request.errors)
      };
    }
  }

  // LLM Integration with Tools - Fixed to use direct service calls
  private async callLLMWithTools(systemPrompt: string, userPrompt: string, userId: string = 'system'): Promise<any> {
    try {
      // Use environment variables for orchestrator calls (system-level)
      const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.CLAUDE_API_KEY;
      const model = process.env.GEMINI_API_KEY ? 'gemini' : (process.env.OPENAI_API_KEY ? 'openai' : 'claude');
      
      if (!apiKey) {
        throw new Error('No LLM API key available for orchestrator');
      }
      
      // Use the existing callLLMDirectly method to avoid HTTP calls
      const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
      const response = await this.callLLMDirectly(fullPrompt, apiKey, model);
      
      try {
        // Try to parse JSON response
        return JSON.parse(response);
      } catch (error) {
        // If not valid JSON, extract JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        
        // Fallback to simple response
        return { text: response };
      }
      
    } catch (error) {
      console.error('❌ LLM Tools call failed:', error);
      throw createError(`LLM orchestrator call failed: ${getErrorMessage(error)}`, 'LLM_CALL_FAILED');
    }
  }

  // Helper method to call LLM services directly (avoiding relative fetch in server)
  private async callLLMDirectly(prompt: string, apiKey: string, model: string): Promise<string> {
    const request = {
      prompt,
      model: model as 'gemini' | 'claude' | 'openai',
      apiKey
    };

    let response;
    switch (model) {
      case 'gemini':
        response = await RealAIService.callRealGemini(request);
        break;
      case 'claude':
        response = await RealAIService.callRealClaude(request);
        break;
      case 'openai':
        response = await RealAIService.callRealOpenAI(request);
        break;
      default:
        throw new Error(`Unsupported model: ${model}`);
    }

    return response.response;
  }

  // Prompt Templates (from ChatGPT spec)
  private buildPlannerPrompt(): string {
    return `You are an automation planner that converts a user prompt into a JSON DAG called NodeGraph.

HARD CONSTRAINTS:
- All runtime code MUST be Google Apps Script (GAS). Do not propose or emit any non-GAS runtimes.
- Use ONLY node types listed in the provided Node Catalog. If something is missing, select the closest node and add a short "note" on that node.
- Output ONLY valid JSON conforming to the NodeGraph schema. No prose, no code fences.
- Prefer event triggers where available; otherwise produce a time-based trigger with safe polling.
- Transforms must be pure (no side effects). Side effects only in action.* nodes.
- Reference upstream data using handlebars-like placeholders: {{nodeId.field}}, arrays like {{nodeId.items[0].name}}.

You have tools:
- getNodeCatalog() → returns node types, param schemas, and required Apps Script OAuth scopes.
- validateGraph(graph) → returns a list of ValidationError.

Workflow:
1) Parse the user's goal.
2) If key params are unknown (IDs, URLs, sheet names, auth needs), produce a minimal graph plus a question list.
3) Build a complete NodeGraph, infer union OAuth scopes.
4) Call validateGraph; if errors, fix and re-validate.

Return JSON: { "graph": NodeGraph, "rationale": "one short string" }`;
  }

  private buildClarifierPrompt(): string {
    return `You are a workflow clarifier. Ask specific questions to understand automation requirements.

Focus on:
- Resource IDs (spreadsheet IDs, calendar IDs, etc.)
- Authentication and permissions needed
- Trigger conditions and frequency
- Data transformation requirements
- Output formats and destinations

Ask 3-7 concise, specific questions. Return JSON: { "questions": Question[], "guessedGraph?": NodeGraph }`;
  }

  // Fallback Functions
  private generateBasicQuestions(prompt: string): Question[] {
    const questions: Question[] = [];
    
    // Analyze prompt for common question patterns
    if (prompt.toLowerCase().includes('sheet')) {
      questions.push({
        id: 'spreadsheet_id',
        text: 'What is your Google Sheets spreadsheet ID or URL?',
        kind: 'missingParam',
        choices: []
      });
    }

    if (prompt.toLowerCase().includes('email')) {
      questions.push({
        id: 'email_criteria',
        text: 'What email criteria should trigger this automation? (e.g., from specific sender, with certain subject)',
        kind: 'missingParam',
        choices: []
      });
    }

    if (prompt.toLowerCase().includes('schedule') || prompt.toLowerCase().includes('time')) {
      questions.push({
        id: 'schedule_frequency',
        text: 'How often should this automation run?',
        kind: 'disambiguation',
        choices: ['Every 15 minutes', 'Every hour', 'Daily', 'Weekly']
      });
    }

    // Default questions if none match
    if (questions.length === 0) {
      questions.push({
        id: 'automation_details',
        text: 'Can you provide more specific details about what data you want to process and where it should go?',
        kind: 'missingParam',
        choices: []
      });
    }

    return questions;
  }

  private createFallbackWorkflow(prompt: string): NodeGraph {
    // Create a basic workflow structure
    const workflowId = `workflow_${Date.now()}`;
    
    return {
      id: workflowId,
      name: `Automation: ${prompt.substring(0, 50)}...`,
      version: 1,
      nodes: [
        {
          id: 'trigger_1',
          type: 'trigger.time.cron',
          label: 'Schedule Trigger',
          params: { everyMinutes: 15 },
          outputs: ['trigger_data']
        },
        {
          id: 'action_1',
          type: 'action.http.request',
          label: 'HTTP Request',
          params: {
            method: 'GET',
            url: 'https://api.example.com/data'
          },
          inputs: ['trigger_data']
        }
      ],
      edges: [
        { from: 'trigger_1', to: 'action_1' }
      ],
      scopes: [
        'https://www.googleapis.com/auth/script.scriptapp',
        'https://www.googleapis.com/auth/script.external_request'
      ],
      secrets: [],
      metadata: {
        createdAt: new Date().toISOString(),
        complexity: 'Simple',
        estimatedValue: '$500/month time savings'
      }
    };
  }

  private basicErrorFix(graph: NodeGraph, errors: ValidationError[]): NodeGraph {
    // Basic error fixing logic
    const fixedGraph = { ...graph };
    
    errors.forEach(error => {
      if (error.severity === 'error') {
        // Try to fix common errors
        if (getErrorMessage(error).includes('missing required parameter')) {
          // Add default values for missing parameters
          const nodeId = error.nodeId;
          const node = fixedGraph.nodes.find(n => n.id === nodeId);
          if (node) {
            // Add basic default parameters
            node.params = { ...node.params, placeholder: 'default_value' };
          }
        }
      }
    });
    
    return fixedGraph;
  }
}