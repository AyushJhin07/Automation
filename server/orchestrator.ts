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
import { GraphValidator } from './graphValidator';

export class WorkflowOrchestrator {
  private nodeCatalog: EnhancedNodeCatalog;
  private validator: GraphValidator;

  constructor() {
    this.nodeCatalog = EnhancedNodeCatalog.getInstance();
    this.validator = new GraphValidator();
  }

  // LLM Tools - Functions that the LLM can call
  private getLLMTools(): LLMTools {
    return {
      getNodeCatalog: () => this.nodeCatalog.getNodeCatalog(),
      validateGraph: (graph: NodeGraph) => this.validator.validateGraph(graph),
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

  // Step 1: Clarify user intent and ask questions
  public async clarifyIntent(request: ClarifyRequest): Promise<ClarifyResponse> {
    console.log('🤔 Clarifying user intent:', request.prompt);

    const systemPrompt = this.buildClarifierPrompt();
    const userPrompt = `User goal: "${request.prompt}"

Ask 3-7 concise questions to fill REQUIRED parameters for candidate nodes:
- Resource IDs, tab names, API endpoints, auth scopes
- Trigger type, volume, filters, dedupe keys  
- Webhook path secrets or verification

Return JSON: { "questions": Question[], "guessedGraph?": NodeGraph }`;

    try {
      // Call LLM with clarifier prompt
      const response = await this.callLLMWithTools(systemPrompt, userPrompt);
      
      if (response.questions && response.questions.length > 0) {
        return {
          questions: response.questions,
          guessedGraph: response.guessedGraph
        };
      }

      // If no questions needed, return empty questions
      return {
        questions: [],
        guessedGraph: response.guessedGraph
      };

    } catch (error) {
      console.error('Clarification error:', error);
      
      // Fallback: generate basic questions
      return {
        questions: this.generateBasicQuestions(request.prompt),
        guessedGraph: undefined
      };
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
        const errors = this.validator.validateGraph(response.graph);
        
        if (errors.filter(e => e.severity === 'error').length > 0) {
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

  // LLM Integration with Tools
  private async callLLMWithTools(systemPrompt: string, userPrompt: string): Promise<any> {
    // This will integrate with your existing conversational AI system
    const response = await fetch('/api/ai/conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        model: 'gemini-pro', // Default to Gemini for structured tasks
        userId: 'workflow-orchestrator',
        tools: this.getLLMTools() // Provide tools to LLM
      })
    });

    if (!response.ok) {
      throw new Error('LLM API call failed');
    }

    const result = await response.json();
    
    try {
      // Try to parse JSON response
      return JSON.parse(result.response);
    } catch (error) {
      // If not valid JSON, extract JSON from response
      const jsonMatch = result.response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      throw new Error('LLM response is not valid JSON');
    }
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
        if (error.message.includes('missing required parameter')) {
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