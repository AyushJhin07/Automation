/**
 * LLMChainExecutor - Multi-step LLM chains for complex reasoning
 * Supports sequential chains, parallel chains, and conditional branching
 */

import { llmRegistry, LLMMessage, LLMResult } from './LLMProvider';
import { resolveParamValue, ParameterContext } from '../core/ParameterResolver';

export interface ChainStep {
  id: string;
  name: string;
  type: 'llm' | 'condition' | 'parallel' | 'tool';
  provider?: string;
  model?: string;
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  jsonSchema?: any;
  conditions?: ConditionalBranch[];
  parallelSteps?: ChainStep[];
  toolName?: string;
  dependencies?: string[]; // IDs of steps this depends on
  retryCount?: number;
  timeout?: number;
}

export interface ConditionalBranch {
  condition: string; // JavaScript expression
  nextStepId: string;
}

export interface ChainDefinition {
  id: string;
  name: string;
  description?: string;
  steps: ChainStep[];
  initialContext?: Record<string, any>;
  maxExecutionTime?: number;
}

export interface ChainExecutionResult {
  success: boolean;
  results: Record<string, any>;
  executionPath: string[];
  totalTokens: number;
  totalCost: number;
  executionTime: number;
  error?: string;
}

export interface ChainContext {
  stepResults: Record<string, any>;
  initialData: Record<string, any>;
  metadata: {
    executionId: string;
    startTime: number;
    userId?: string;
    workflowId: string;
  };
}

export class LLMChainExecutor {
  /**
   * Execute a complete LLM chain
   */
  async executeChain(
    chain: ChainDefinition,
    initialData: Record<string, any> = {},
    paramContext: ParameterContext
  ): Promise<ChainExecutionResult> {
    const startTime = Date.now();
    
    const context: ChainContext = {
      stepResults: {},
      initialData: { ...chain.initialContext, ...initialData },
      metadata: {
        executionId: `chain_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        startTime,
        userId: paramContext.userId,
        workflowId: paramContext.workflowId
      }
    };

    console.log(`🔗 Starting LLM chain: ${chain.name}`);

    try {
      // Build dependency graph
      const dependencyGraph = this.buildDependencyGraph(chain.steps);
      
      // Execute steps in topological order
      const executionPath: string[] = [];
      let totalTokens = 0;
      let totalCost = 0;

      for (const stepId of dependencyGraph) {
        const step = chain.steps.find(s => s.id === stepId);
        if (!step) continue;

        console.log(`🔗 Executing chain step: ${step.name}`);
        
        const result = await this.executeStep(step, context, paramContext);
        context.stepResults[stepId] = result;
        executionPath.push(stepId);

        // Track usage
        if (result.usage) {
          totalTokens += (result.usage.promptTokens || 0) + (result.usage.completionTokens || 0);
          totalCost += result.usage.costUSD || 0;
        }

        // Check timeout
        if (chain.maxExecutionTime && Date.now() - startTime > chain.maxExecutionTime) {
          throw new Error('Chain execution timeout exceeded');
        }
      }

      const executionTime = Date.now() - startTime;
      console.log(`✅ Chain completed in ${executionTime}ms`);

      return {
        success: true,
        results: context.stepResults,
        executionPath,
        totalTokens,
        totalCost,
        executionTime
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`❌ Chain execution failed:`, error);

      return {
        success: false,
        results: context.stepResults,
        executionPath: [],
        totalTokens: 0,
        totalCost: 0,
        executionTime,
        error: error.message
      };
    }
  }

  /**
   * Execute a single chain step
   */
  private async executeStep(
    step: ChainStep,
    context: ChainContext,
    paramContext: ParameterContext
  ): Promise<any> {
    const maxRetries = step.retryCount || 0;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`🔄 Retrying step ${step.name} (attempt ${attempt + 1})`);
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }

        return await this.executeStepAttempt(step, context, paramContext);
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  /**
   * Execute a single attempt of a step
   */
  private async executeStepAttempt(
    step: ChainStep,
    context: ChainContext,
    paramContext: ParameterContext
  ): Promise<any> {
    switch (step.type) {
      case 'llm':
        return await this.executeLLMStep(step, context, paramContext);
      case 'condition':
        return await this.executeConditionalStep(step, context);
      case 'parallel':
        return await this.executeParallelStep(step, context, paramContext);
      case 'tool':
        return await this.executeToolStep(step, context);
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  /**
   * Execute an LLM step
   */
  private async executeLLMStep(
    step: ChainStep,
    context: ChainContext,
    paramContext: ParameterContext
  ): Promise<any> {
    if (!step.provider || !step.model) {
      throw new Error('Provider and model required for LLM step');
    }

    // Resolve prompt with context interpolation
    const resolvedPrompt = await this.interpolateWithContext(step.prompt, context, paramContext);
    const resolvedSystem = step.system ? 
      await this.interpolateWithContext(step.system, context, paramContext) : undefined;

    // Build messages
    const messages: LLMMessage[] = [];
    if (resolvedSystem) {
      messages.push({ role: 'system', content: resolvedSystem });
    }
    messages.push({ role: 'user', content: resolvedPrompt });

    // Execute LLM call
    const provider = llmRegistry.get(step.provider);
    const result = await provider.generate({
      model: step.model as any,
      messages,
      temperature: step.temperature ?? 0.2,
      maxTokens: step.maxTokens ?? 1024,
      responseFormat: step.jsonSchema ? { type: 'json_object', schema: step.jsonSchema } : 'text'
    });

    // Parse result
    if (step.jsonSchema) {
      return {
        json: result.json || this.tryParseJSON(result.text),
        text: result.text,
        usage: result.usage
      };
    } else {
      return {
        text: result.text,
        usage: result.usage
      };
    }
  }

  /**
   * Execute a conditional step
   */
  private async executeConditionalStep(step: ChainStep, context: ChainContext): Promise<any> {
    if (!step.conditions || step.conditions.length === 0) {
      throw new Error('Conditions required for conditional step');
    }

    for (const branch of step.conditions) {
      if (this.evaluateCondition(branch.condition, context)) {
        return {
          nextStepId: branch.nextStepId,
          conditionMet: branch.condition
        };
      }
    }

    throw new Error('No condition matched in conditional step');
  }

  /**
   * Execute parallel steps
   */
  private async executeParallelStep(
    step: ChainStep,
    context: ChainContext,
    paramContext: ParameterContext
  ): Promise<any> {
    if (!step.parallelSteps || step.parallelSteps.length === 0) {
      throw new Error('Parallel steps required for parallel step');
    }

    const promises = step.parallelSteps.map(parallelStep =>
      this.executeStepAttempt(parallelStep, context, paramContext)
    );

    const results = await Promise.all(promises);
    
    return {
      parallelResults: results,
      stepIds: step.parallelSteps.map(s => s.id)
    };
  }

  /**
   * Execute a tool step
   */
  private async executeToolStep(step: ChainStep, context: ChainContext): Promise<any> {
    if (!step.toolName) {
      throw new Error('Tool name required for tool step');
    }

    // Import tool executor
    const { toolExecutor, toolRegistry } = await import('./AdvancedToolExecutor');
    
    const tool = toolRegistry.get(step.toolName);
    if (!tool) {
      throw new Error(`Tool '${step.toolName}' not found`);
    }

    // Parse arguments from prompt (assumes JSON format)
    const resolvedPrompt = await this.interpolateWithContext(step.prompt, context);
    const args = this.tryParseJSON(resolvedPrompt);
    if (!args) {
      throw new Error('Tool step prompt must contain valid JSON arguments');
    }

    // Execute tool
    const result = await tool.handler(args, {
      userId: context.metadata.userId,
      workflowId: context.metadata.workflowId,
      nodeId: step.id,
      executionId: context.metadata.executionId,
      permissions: ['basic'] // TODO: Get actual permissions
    });

    return result;
  }

  /**
   * Build dependency graph for step execution order
   */
  private buildDependencyGraph(steps: ChainStep[]): string[] {
    const graph = new Map<string, string[]>();
    const visited = new Set<string>();
    const result: string[] = [];

    // Build adjacency list
    for (const step of steps) {
      graph.set(step.id, step.dependencies || []);
    }

    // Topological sort using DFS
    const visit = (stepId: string) => {
      if (visited.has(stepId)) return;
      visited.add(stepId);

      const dependencies = graph.get(stepId) || [];
      for (const dep of dependencies) {
        visit(dep);
      }

      result.push(stepId);
    };

    for (const step of steps) {
      visit(step.id);
    }

    return result;
  }

  /**
   * Interpolate template with chain context
   */
  private async interpolateWithContext(
    template: string,
    context: ChainContext,
    paramContext?: ParameterContext
  ): Promise<string> {
    let interpolated = template;

    // Replace step references: {{step:stepId.field}}
    interpolated = interpolated.replace(/\{\{step:([^.}]+)\.([^}]+)\}\}/g, (_, stepId, field) => {
      const stepResult = context.stepResults[stepId];
      if (!stepResult) return '[step not found]';
      
      const value = field.split('.').reduce((obj, key) => 
        obj && obj[key] !== undefined ? obj[key] : undefined, stepResult
      );
      
      return this.formatValueForPrompt(value);
    });

    // Replace step references: {{step:stepId}}
    interpolated = interpolated.replace(/\{\{step:([^}]+)\}\}/g, (_, stepId) => {
      const stepResult = context.stepResults[stepId];
      return this.formatValueForPrompt(stepResult);
    });

    // Replace initial data references: {{data.field}}
    interpolated = interpolated.replace(/\{\{data\.([^}]+)\}\}/g, (_, field) => {
      const value = field.split('.').reduce((obj, key) => 
        obj && obj[key] !== undefined ? obj[key] : undefined, context.initialData
      );
      
      return this.formatValueForPrompt(value);
    });

    // Replace metadata references: {{meta.field}}
    interpolated = interpolated.replace(/\{\{meta\.([^}]+)\}\}/g, (_, field) => {
      const value = context.metadata[field as keyof typeof context.metadata];
      return this.formatValueForPrompt(value);
    });

    return interpolated;
  }

  /**
   * Evaluate a condition expression
   */
  private evaluateCondition(condition: string, context: ChainContext): boolean {
    try {
      // Create a safe evaluation context
      const evalContext = {
        step: context.stepResults,
        data: context.initialData,
        meta: context.metadata
      };

      // Simple expression evaluation (in production, use a proper expression evaluator)
      const safeCondition = condition.replace(/[^a-zA-Z0-9._\s><=!&|()]/g, '');
      return Function('context', `with(context) { return ${safeCondition}; }`)(evalContext);
    } catch (error) {
      console.warn('Condition evaluation failed:', error);
      return false;
    }
  }

  /**
   * Format value for prompt inclusion
   */
  private formatValueForPrompt(value: any): string {
    if (value == null) return '[null]';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return '[object]';
      }
    }
    return String(value);
  }

  /**
   * Try to parse JSON safely
   */
  private tryParseJSON(text?: string): any {
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }
}

// Predefined chain templates
export const CHAIN_TEMPLATES: Record<string, ChainDefinition> = {
  analyze_and_summarize: {
    id: 'analyze_and_summarize',
    name: 'Analyze and Summarize',
    description: 'Analyze data and create a summary with insights',
    steps: [
      {
        id: 'analyze',
        name: 'Analyze Data',
        type: 'llm',
        provider: 'openai',
        model: 'openai:gpt-4o-mini',
        prompt: 'Analyze this data and identify key patterns and insights:\n\n{{data.content}}',
        temperature: 0.3,
        maxTokens: 1024
      },
      {
        id: 'summarize',
        name: 'Create Summary',
        type: 'llm',
        provider: 'openai',
        model: 'openai:gpt-4o-mini',
        prompt: 'Based on this analysis, create a concise executive summary:\n\n{{step:analyze.text}}',
        temperature: 0.2,
        maxTokens: 512,
        dependencies: ['analyze']
      }
    ]
  },

  sentiment_and_response: {
    id: 'sentiment_and_response',
    name: 'Sentiment Analysis and Response',
    description: 'Analyze sentiment and generate appropriate response',
    steps: [
      {
        id: 'sentiment',
        name: 'Analyze Sentiment',
        type: 'llm',
        provider: 'openai',
        model: 'openai:gpt-4o-mini',
        prompt: 'Analyze the sentiment of this text. Return only: positive, negative, or neutral.\n\nText: {{data.message}}',
        temperature: 0.1,
        maxTokens: 10
      },
      {
        id: 'response',
        name: 'Generate Response',
        type: 'llm',
        provider: 'openai',
        model: 'openai:gpt-4o-mini',
        prompt: 'Generate an appropriate response to this {{step:sentiment.text}} message:\n\nOriginal: {{data.message}}',
        temperature: 0.7,
        maxTokens: 256,
        dependencies: ['sentiment']
      }
    ]
  },

  extract_classify_route: {
    id: 'extract_classify_route',
    name: 'Extract, Classify, and Route',
    description: 'Extract data, classify it, and determine routing',
    steps: [
      {
        id: 'extract',
        name: 'Extract Key Information',
        type: 'llm',
        provider: 'openai',
        model: 'openai:gpt-4o-mini',
        prompt: 'Extract key information from this content:\n\n{{data.content}}',
        jsonSchema: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            priority: { type: 'string', enum: ['low', 'medium', 'high'] },
            entities: { type: 'array', items: { type: 'string' } }
          }
        },
        temperature: 0.2
      },
      {
        id: 'route',
        name: 'Determine Route',
        type: 'condition',
        prompt: 'step.extract.json.priority === "high"',
        conditions: [
          { condition: 'step.extract.json.priority === "high"', nextStepId: 'urgent_handler' },
          { condition: 'step.extract.json.priority === "medium"', nextStepId: 'normal_handler' },
          { condition: 'step.extract.json.priority === "low"', nextStepId: 'queue_handler' }
        ],
        dependencies: ['extract']
      }
    ]
  }
};

export const llmChainExecutor = new LLMChainExecutor();