import { connectionService } from './ConnectionService';
import { authService } from './AuthService';
import { simpleGraphValidator } from '../core/SimpleGraphValidator';

export interface ClarifyRequest {
  prompt: string;
  userId: string;
  context?: Record<string, any>;
}

export interface ClarifyResponse {
  success: boolean;
  questions: Question[];
  confidence: number;
  estimatedComplexity: number;
  tokensUsed?: number;
  cost?: number;
  error?: string;
}

export interface Question {
  id: string;
  text: string;
  type: 'text' | 'choice' | 'number';
  choices?: string[];
  required: boolean;
  category: 'trigger' | 'action' | 'data' | 'auth' | 'schedule';
  hint?: string;
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
  };
}

export interface PlanRequest {
  prompt: string;
  answers: Record<string, string>;
  userId: string;
  context?: Record<string, any>;
}

export interface PlanResponse {
  success: boolean;
  graph: any;
  rationale: string;
  confidence: number;
  estimatedComplexity: number;
  validation: any;
  tokensUsed?: number;
  cost?: number;
  error?: string;
}

export interface FixRequest {
  graph: any;
  errors: Array<{
    path: string;
    message: string;
    severity: 'error' | 'warning';
    code: string;
  }>;
  userId: string;
}

export interface FixResponse {
  success: boolean;
  graph: any;
  fixedErrors: string[];
  validation: any;
  tokensUsed?: number;
  cost?: number;
  error?: string;
}

export interface CodegenRequest {
  graph: any;
  userId: string;
  options?: {
    projectName?: string;
    includeLogging?: boolean;
    includeErrorHandling?: boolean;
  };
}

export interface CodegenResponse {
  success: boolean;
  files: Array<{
    name: string;
    content: string;
    type: string;
  }>;
  manifest: any;
  deploymentInstructions: string;
  estimatedSize: number;
  tokensUsed?: number;
  cost?: number;
  error?: string;
}

export class ProductionLLMOrchestrator {

  /**
   * Step 1: Clarify user intent and ask essential questions
   */
  public async clarifyIntent(request: ClarifyRequest): Promise<ClarifyResponse> {
    try {
      console.log(`🤔 Clarifying intent for user: ${request.userId}`);

      // Get user's LLM connection
      const connection = await this.getLLMConnection(request.userId);
      if (!connection) {
        return {
          success: false,
          questions: [],
          confidence: 0,
          estimatedComplexity: 0,
          error: 'No LLM connection configured. Please add an API key in settings.'
        };
      }

      // Check quota
      const quotaCheck = await authService.checkQuota(request.userId, 1, 500);
      if (!quotaCheck.hasQuota) {
        return {
          success: false,
          questions: [],
          confidence: 0,
          estimatedComplexity: 0,
          error: `Quota exceeded: ${quotaCheck.quotaExceeded}`
        };
      }

      const systemPrompt = this.getClarifySystemPrompt();
      const userPrompt = this.buildClarifyUserPrompt(request);

      // Call LLM with proper guardrails
      const llmResponse = await this.callLLMWithGuardrails(
        connection,
        systemPrompt,
        userPrompt,
        request.userId
      );

      if (!llmResponse.success) {
        return {
          success: false,
          questions: this.getFallbackQuestions(),
          confidence: 0.3,
          estimatedComplexity: 3,
          error: llmResponse.error
        };
      }

      // Parse and validate response
      const parsed = this.parseQuestionsResponse(llmResponse.response);
      
      return {
        success: true,
        questions: parsed.questions || this.getFallbackQuestions(),
        confidence: parsed.confidence || 0.7,
        estimatedComplexity: parsed.estimatedComplexity || 3,
        tokensUsed: llmResponse.tokensUsed,
        cost: llmResponse.cost
      };

    } catch (error) {
      console.error('❌ Clarify error:', error);
      return {
        success: false,
        questions: this.getFallbackQuestions(),
        confidence: 0.3,
        estimatedComplexity: 3,
        error: 'Failed to clarify intent'
      };
    }
  }

  /**
   * Step 2: Plan workflow and generate NodeGraph
   */
  public async planWorkflow(request: PlanRequest): Promise<PlanResponse> {
    try {
      console.log(`📋 Planning workflow for user: ${request.userId}`);

      const connection = await this.getLLMConnection(request.userId);
      if (!connection) {
        return {
          success: false,
          graph: null,
          rationale: '',
          confidence: 0,
          estimatedComplexity: 0,
          validation: { valid: false, errors: [], warnings: [] },
          error: 'No LLM connection configured'
        };
      }

      // Check quota (planning uses more tokens)
      const quotaCheck = await authService.checkQuota(request.userId, 1, 1500);
      if (!quotaCheck.hasQuota) {
        return {
          success: false,
          graph: null,
          rationale: '',
          confidence: 0,
          estimatedComplexity: 0,
          validation: { valid: false, errors: [], warnings: [] },
          error: `Quota exceeded: ${quotaCheck.quotaExceeded}`
        };
      }

      const systemPrompt = this.getPlanSystemPrompt();
      const userPrompt = this.buildPlanUserPrompt(request);

      const llmResponse = await this.callLLMWithGuardrails(
        connection,
        systemPrompt,
        userPrompt,
        request.userId
      );

      if (!llmResponse.success) {
        const fallbackGraph = this.createFallbackGraph(request.prompt);
        return {
          success: false,
          graph: fallbackGraph,
          rationale: 'Generated fallback workflow due to LLM error',
          confidence: 0.3,
          estimatedComplexity: 2,
          validation: simpleGraphValidator.validate(fallbackGraph),
          error: llmResponse.error
        };
      }

      // Parse and validate graph
      const parsed = this.parseGraphResponse(llmResponse.response);
      const graph = parsed.graph || this.createFallbackGraph(request.prompt);
      
      // Validate generated graph
      const validation = simpleGraphValidator.validate(graph);

      return {
        success: true,
        graph: graph,
        rationale: parsed.rationale || 'Generated workflow based on requirements',
        confidence: parsed.confidence || 0.8,
        estimatedComplexity: parsed.estimatedComplexity || 4,
        validation: validation,
        tokensUsed: llmResponse.tokensUsed,
        cost: llmResponse.cost
      };

    } catch (error) {
      console.error('❌ Plan error:', error);
      const fallbackGraph = this.createFallbackGraph(request.prompt);
      return {
        success: false,
        graph: fallbackGraph,
        rationale: 'Generated fallback workflow due to error',
        confidence: 0.3,
        estimatedComplexity: 2,
        validation: simpleGraphValidator.validate(fallbackGraph),
        error: 'Failed to plan workflow'
      };
    }
  }

  /**
   * Step 3: Fix workflow validation errors
   */
  public async fixWorkflow(request: FixRequest): Promise<FixResponse> {
    try {
      console.log(`🔧 Fixing workflow for user: ${request.userId}`);

      const connection = await this.getLLMConnection(request.userId);
      if (!connection) {
        return {
          success: false,
          graph: request.graph,
          fixedErrors: [],
          validation: { valid: false, errors: request.errors, warnings: [] },
          error: 'No LLM connection configured'
        };
      }

      const quotaCheck = await authService.checkQuota(request.userId, 1, 800);
      if (!quotaCheck.hasQuota) {
        return {
          success: false,
          graph: request.graph,
          fixedErrors: [],
          validation: { valid: false, errors: request.errors, warnings: [] },
          error: `Quota exceeded: ${quotaCheck.quotaExceeded}`
        };
      }

      const systemPrompt = this.getFixSystemPrompt();
      const userPrompt = this.buildFixUserPrompt(request);

      const llmResponse = await this.callLLMWithGuardrails(
        connection,
        systemPrompt,
        userPrompt,
        request.userId
      );

      if (!llmResponse.success) {
        return {
          success: false,
          graph: request.graph,
          fixedErrors: [],
          validation: { valid: false, errors: request.errors, warnings: [] },
          error: llmResponse.error
        };
      }

      const parsed = this.parseFixResponse(llmResponse.response);
      const fixedGraph = parsed.graph || request.graph;
      const validation = simpleGraphValidator.validate(fixedGraph);

      return {
        success: true,
        graph: fixedGraph,
        fixedErrors: parsed.fixedErrors || [],
        validation: validation,
        tokensUsed: llmResponse.tokensUsed,
        cost: llmResponse.cost
      };

    } catch (error) {
      console.error('❌ Fix error:', error);
      return {
        success: false,
        graph: request.graph,
        fixedErrors: [],
        validation: { valid: false, errors: request.errors, warnings: [] },
        error: 'Failed to fix workflow'
      };
    }
  }

  /**
   * Get user's LLM connection (tries multiple providers)
   */
  private async getLLMConnection(userId: string): Promise<any> {
    // Try providers in order of preference
    const providers = ['gemini', 'openai', 'claude'];
    
    for (const provider of providers) {
      const connection = await connectionService.getLLMConnection(userId, provider);
      if (connection) {
        return connection;
      }
    }
    
    return null;
  }

  /**
   * Call LLM with proper guardrails and error handling
   */
  private async callLLMWithGuardrails(
    connection: any,
    systemPrompt: string,
    userPrompt: string,
    userId: string
  ): Promise<{
    success: boolean;
    response?: string;
    tokensUsed?: number;
    cost?: number;
    error?: string;
  }> {
    try {
      // Sanitize prompts (remove potential injection attempts)
      const sanitizedUserPrompt = this.sanitizePrompt(userPrompt);
      
      let response: any;
      let tokensUsed = 0;
      let cost = 0;

      switch (connection.provider.toLowerCase()) {
        case 'gemini':
          response = await this.callGemini(connection.credentials, systemPrompt, sanitizedUserPrompt);
          tokensUsed = response.tokensUsed || 0;
          cost = tokensUsed * 0.000001; // Rough estimate
          break;
        case 'openai':
          response = await this.callOpenAI(connection.credentials, systemPrompt, sanitizedUserPrompt);
          tokensUsed = response.tokensUsed || 0;
          cost = tokensUsed * 0.000002; // Rough estimate
          break;
        case 'claude':
          response = await this.callClaude(connection.credentials, systemPrompt, sanitizedUserPrompt);
          tokensUsed = response.tokensUsed || 0;
          cost = tokensUsed * 0.000003; // Rough estimate
          break;
        default:
          throw new Error(`Unsupported LLM provider: ${connection.provider}`);
      }

      // Update usage metrics
      await authService.updateUsage(userId, 1, tokensUsed);

      return {
        success: true,
        response: response.content,
        tokensUsed,
        cost
      };

    } catch (error) {
      console.error('❌ LLM call error:', error);
      return {
        success: false,
        error: error.message || 'LLM call failed'
      };
    }
  }

  /**
   * System prompt for clarification
   */
  private getClarifySystemPrompt(): string {
    return `You are an expert Google Apps Script automation consultant. Your ONLY job is to ask essential clarifying questions.

CRITICAL RULES:
- Runtime: Google Apps Script ONLY (no external servers, no Node.js, no Python)
- External APIs: Use UrlFetchApp only
- Storage: Use PropertiesService for state/secrets
- OAuth: Use Apps Script OAuth2 library
- Ask MAXIMUM 5 questions
- Focus on: triggers, data sources, actions, authentication needs
- Return ONLY valid JSON format

Available Google Apps Script services:
- Gmail (send/read emails, search, labels)
- Google Sheets (read/write cells, create sheets, formulas)
- Google Drive (create/read files, folders, permissions)
- Calendar (create/read events, calendars)
- UrlFetchApp (HTTP requests to external APIs)
- PropertiesService (secure storage)
- Utilities (parsing, formatting, sleep)

Return JSON format:
{
  "questions": [
    {
      "id": "trigger_type",
      "text": "What should trigger this automation?",
      "type": "choice",
      "choices": ["Time schedule", "New email", "Webhook", "Sheet update"],
      "required": true,
      "category": "trigger",
      "hint": "This determines when your automation runs"
    }
  ],
  "confidence": 0.8,
  "estimatedComplexity": 3
}`;
  }

  /**
   * System prompt for planning
   */
  private getPlanSystemPrompt(): string {
    return `You are a Google Apps Script workflow architect. Generate ONLY Google Apps Script compatible workflows.

MANDATORY CONSTRAINTS:
- Runtime: Google Apps Script ONLY
- No external servers, databases, or runtimes
- Use UrlFetchApp for HTTP requests
- Use PropertiesService for storage/secrets
- Use Apps Script OAuth2 library for authentication
- Maximum execution time: 6 minutes
- Generate valid NodeGraph JSON

Available node types:
- trigger.time.cron: Time-based triggers
- trigger.webhook: HTTP webhook (doPost function)
- trigger.gmail.new_email: Email triggers
- trigger.sheets.row_added: New spreadsheet row
- action.gmail.send: Send emails
- action.gmail.read: Read emails
- action.sheets.append: Add spreadsheet rows
- action.sheets.read: Read spreadsheet data
- action.drive.create_file: Create Drive files
- action.http.request: HTTP requests via UrlFetchApp
- condition.if: Conditional logic
- transform.data_mapper: Data transformation
- utility.delay: Add delays (Utilities.sleep)
- utility.logger: Logging (Logger.log)

Return JSON format:
{
  "graph": {
    "id": "workflow_123",
    "name": "Email Logger",
    "description": "Logs emails to spreadsheet",
    "nodes": [
      {
        "id": "trigger1",
        "type": "trigger.gmail.new_email",
        "position": {"x": 100, "y": 100},
        "data": {
          "query": "is:unread",
          "maxResults": 10
        }
      }
    ],
    "edges": [
      {
        "id": "edge1",
        "source": "trigger1",
        "target": "action1"
      }
    ]
  },
  "rationale": "This workflow monitors Gmail and logs to Sheets",
  "confidence": 0.9,
  "estimatedComplexity": 4
}`;
  }

  /**
   * System prompt for fixing
   */
  private getFixSystemPrompt(): string {
    return `You are a Google Apps Script workflow debugger. Fix ONLY the specific errors listed while maintaining Google Apps Script compatibility.

RULES:
- Fix ONLY the listed validation errors
- Maintain Google Apps Script constraints
- Keep the original workflow intent
- Return corrected NodeGraph JSON

Return JSON format:
{
  "graph": { /* corrected NodeGraph */ },
  "fixedErrors": ["Fixed missing node ID", "Corrected invalid edge"]
}`;
  }

  // Helper methods for building prompts and parsing responses...
  private buildClarifyUserPrompt(request: ClarifyRequest): string {
    return `Analyze this automation request and ask clarifying questions:

USER REQUEST: "${request.prompt}"

CONTEXT: ${JSON.stringify(request.context || {}, null, 2)}

Ask only essential questions needed to build a Google Apps Script automation.`;
  }

  private buildPlanUserPrompt(request: PlanRequest): string {
    const answersText = Object.entries(request.answers)
      .map(([q, a]) => `Q: ${q}\nA: ${a}`)
      .join('\n\n');

    return `Generate a Google Apps Script NodeGraph for this automation:

ORIGINAL REQUEST: "${request.prompt}"

USER ANSWERS:
${answersText}

CONTEXT: ${JSON.stringify(request.context || {}, null, 2)}

Create a complete, working Google Apps Script automation.`;
  }

  private buildFixUserPrompt(request: FixRequest): string {
    const errorsText = request.errors
      .map(e => `- ${e.path}: ${e.message} (${e.severity})`)
      .join('\n');

    return `Fix these validation errors in the NodeGraph:

ERRORS TO FIX:
${errorsText}

CURRENT GRAPH:
${JSON.stringify(request.graph, null, 2)}

Return the corrected NodeGraph.`;
  }

  private sanitizePrompt(prompt: string): string {
    // Remove potential prompt injection attempts
    return prompt
      .replace(/ignore\s+previous\s+instructions/gi, '')
      .replace(/system\s*:/gi, '')
      .replace(/assistant\s*:/gi, '')
      .replace(/\[INST\]/gi, '')
      .replace(/\[\/INST\]/gi, '')
      .substring(0, 10000); // Limit length
  }

  private parseQuestionsResponse(response: string): any {
    try {
      return JSON.parse(response);
    } catch (error) {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e) {
          return {};
        }
      }
      return {};
    }
  }

  private parseGraphResponse(response: string): any {
    return this.parseQuestionsResponse(response);
  }

  private parseFixResponse(response: string): any {
    return this.parseQuestionsResponse(response);
  }

  private getFallbackQuestions(): Question[] {
    return [
      {
        id: 'trigger_type',
        text: 'What should trigger this automation?',
        type: 'choice',
        choices: ['Time schedule (daily/hourly)', 'New email received', 'Webhook/API call', 'Google Sheet update'],
        required: true,
        category: 'trigger',
        hint: 'This determines when your automation runs'
      },
      {
        id: 'main_action',
        text: 'What is the main action this automation should perform?',
        type: 'text',
        required: true,
        category: 'action',
        hint: 'Describe what you want the automation to do'
      },
      {
        id: 'data_source',
        text: 'What data will this automation work with?',
        type: 'text',
        required: false,
        category: 'data',
        hint: 'Email content, spreadsheet data, API responses, etc.'
      }
    ];
  }

  private createFallbackGraph(prompt: string): any {
    return {
      id: `fallback_${Date.now()}`,
      name: 'Basic Automation',
      description: `Generated from: ${prompt.substring(0, 100)}...`,
      nodes: [
        {
          id: 'trigger1',
          type: 'trigger.time.cron',
          position: { x: 100, y: 100 },
          data: {
            schedule: '@daily',
            timezone: 'America/New_York'
          }
        },
        {
          id: 'action1',
          type: 'action.gmail.send',
          position: { x: 300, y: 100 },
          data: {
            to: 'user@example.com',
            subject: 'Automation Report',
            body: 'Your automation completed successfully.'
          }
        }
      ],
      edges: [
        {
          id: 'edge1',
          source: 'trigger1',
          target: 'action1'
        }
      ]
    };
  }

  // LLM API calls (simplified - you'd implement full API calls)
  private async callGemini(credentials: any, systemPrompt: string, userPrompt: string): Promise<any> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${credentials.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
          }]
        })
      }
    );

    const data = await response.json();
    return {
      content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
      tokensUsed: data.usageMetadata?.totalTokenCount || 0
    };
  }

  private async callOpenAI(credentials: any, systemPrompt: string, userPrompt: string): Promise<any> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-2024-07-18',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 2000
      })
    });

    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      tokensUsed: data.usage?.total_tokens || 0
    };
  }

  private async callClaude(credentials: any, systemPrompt: string, userPrompt: string): Promise<any> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': credentials.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    const data = await response.json();
    return {
      content: data.content?.[0]?.text || '',
      tokensUsed: data.usage?.input_tokens + data.usage?.output_tokens || 0
    };
  }
}

export const productionLLMOrchestrator = new ProductionLLMOrchestrator();