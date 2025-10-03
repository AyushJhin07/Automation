import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { llmRegistry, LLMMessage, LLMTool, type LLMToolCall } from '../../llm/LLMProvider';
import { fetchAndSummarizeURLs, formatNodeDataForContext, isUrlSafe } from './rag';
import { moderateInput, scrubPII, validatePrompt } from './safety';
import { llmValidationAndRepair } from '../../llm/LLMValidationAndRepair';
import { llmBudgetAndCache } from '../../llm/LLMBudgetAndCache';
import { retryManager } from '../../core/RetryManager';

const toolOutputAjv = new Ajv({ allErrors: true, strict: false });
addFormats(toolOutputAjv);

const toolSchemaValidators = new Map<string, ValidateFunction>();
const MAX_TOOL_CALL_REPAIR_ATTEMPTS = 2;

/**
 * Execute LLM Generate action
 * Generates text based on a prompt with optional RAG context
 */
export async function runLLMGenerate(params: any, ctx: any) {
  const { provider, model, system, prompt, temperature, maxTokens, rag } = params;
  
  // Validate inputs
  const promptValidation = await validatePrompt(prompt);
  if (!promptValidation.valid) {
    throw new Error(`Invalid prompt: ${promptValidation.reason}`);
  }
  
  // Build messages array
  const messages: LLMMessage[] = [];
  if (system) {
    messages.push({ role: 'system', content: system });
  }

  // Start with the base prompt
  let enhancedPrompt = prompt;

  // Add RAG context if requested
  if (rag?.usePriorNodeData && ctx?.prevOutput) {
    const contextData = formatNodeDataForContext(ctx.prevOutput);
    if (contextData) {
      enhancedPrompt += `\n\n## Context from Previous Step:\n${contextData}`;
    }
  }

  // Add web content if URLs provided
  if (rag?.urls?.length) {
    // Filter safe URLs
    const safeUrls = rag.urls.filter(isUrlSafe);
    if (safeUrls.length !== rag.urls.length) {
      console.warn(`Filtered out ${rag.urls.length - safeUrls.length} unsafe URLs`);
    }
    
    if (safeUrls.length > 0) {
      try {
        const webContent = await fetchAndSummarizeURLs(safeUrls);
        if (webContent) {
          enhancedPrompt += `\n\n## Reference Content:\n${webContent}`;
        }
      } catch (error) {
        console.warn('Failed to fetch web content for RAG:', error);
        // Continue without web content
      }
    }
  }

  // Apply safety measures
  const safePrompt = await scrubPII(enhancedPrompt);
  if (!(await moderateInput(safePrompt))) {
    throw new Error('Prompt failed content moderation');
  }

  messages.push({ role: 'user', content: safePrompt });

  try {
    const llmProvider = llmRegistry.get(provider);
    const result = await llmProvider.generate({
      model,
      messages,
      temperature: temperature ?? 0.2,
      maxTokens: maxTokens ?? 1024,
      responseFormat: 'text'
    });

    const tokensUsed = result.tokensUsed
      ?? (result.usage?.totalTokens ?? ((result.usage?.promptTokens ?? 0) + (result.usage?.completionTokens ?? 0)));
    const costUSD = result.usage?.costUSD ?? 0;

    if ((tokensUsed ?? 0) > 0 || costUSD > 0) {
      llmBudgetAndCache.recordUsage({
        userId: ctx.userId,
        workflowId: ctx.workflowId,
        organizationId: ctx.organizationId,
        provider,
        model,
        tokensUsed: tokensUsed ?? 0,
        costUSD,
        executionId: ctx.executionId || 'unknown',
        nodeId: ctx.nodeId || 'unknown'
      });
    }

    return {
      text: result.text,
      usage: result.usage,
      tokensUsed: tokensUsed ?? 0,
      model: model,
      provider: provider
    };
  } catch (error) {
    console.error('LLM Generate error:', error);
    throw new Error(`LLM generation failed: ${error.message}`);
  }
}

/**
 * Execute LLM Extract action
 * Extracts structured data using JSON schema
 */
export async function runLLMExtract(params: any, ctx: any) {
  const { provider, model, system, prompt, jsonSchema, temperature, maxTokens } = params;

  // Validate inputs
  const promptValidation = await validatePrompt(prompt);
  if (!promptValidation.valid) {
    throw new Error(`Invalid prompt: ${promptValidation.reason}`);
  }

  if (!jsonSchema || typeof jsonSchema !== 'object') {
    throw new Error('JSON schema is required for extraction');
  }

  // Build system message with extraction instructions
  const systemPrompt = `${system || 'You are a data extraction assistant.'}\n\nExtract data from the input text and return ONLY valid JSON matching this schema:\n${JSON.stringify(jsonSchema, null, 2)}\n\nReturn only the JSON, no other text.`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: await scrubPII(prompt) }
  ];

  try {
    // Check cache first
    const cacheKey = JSON.stringify({ prompt, model, provider, jsonSchema });
    const cachedResponse = llmBudgetAndCache.getCachedResponse(cacheKey, model, provider);
    
    if (cachedResponse) {
      const cachedTokens = cachedResponse.tokensUsed ?? 0;
      return {
        json: JSON.parse(cachedResponse.response),
        extracted: JSON.parse(cachedResponse.response),
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          costUSD: 0 // Cache hit = $0 cost
        },
        model: model,
        provider: provider,
        validation: {
          isValid: true,
          repairAttempts: 0,
          errors: [],
          originalResponse: cachedResponse.response,
          finalResponse: cachedResponse.response
        },
        cached: true,
        tokensUsed: 0,
        cacheSavings: {
          tokensSaved: cachedTokens,
          costSaved: cachedResponse.costUSD ?? 0
        }
      };
    }

    // Estimate cost for budget checking
    const estimatedTokens = Math.ceil(prompt.length / 4); // Rough estimation
    const estimatedCost = llmBudgetAndCache.estimateCost(provider, model, estimatedTokens);
    
    // Check budget constraints
    const budgetCheck = await llmBudgetAndCache.checkBudgetConstraints(
      estimatedCost,
      ctx.userId,
      ctx.workflowId
    );
    
    if (!budgetCheck.allowed) {
      throw new Error(`Budget constraint violation: ${budgetCheck.reason}`);
    }

    const llmProvider = llmRegistry.get(provider);
    const result = await llmProvider.generate({
      model,
      messages,
      temperature: temperature ?? 0.0,
      maxTokens: maxTokens ?? 1024,
      responseFormat: { type: 'json_object', schema: jsonSchema }
    });

    // Validate and potentially repair the response
    const responseText = result.text || JSON.stringify(result.json || {});
    const validation = await llmValidationAndRepair.validateAndRepair(
      responseText,
      jsonSchema,
      prompt,
      {
        maxRepairAttempts: 2,
        strictMode: false,
        repairStrategy: 'hybrid'
      }
    );

    let extractedData = validation.repairedData;
    
    // Fallback to original parsing if validation failed
    if (!extractedData) {
      extractedData = result.json || tryParseJSON(result.text);
    }

    if (!extractedData) {
      throw new Error(`Failed to extract valid JSON from LLM response. Validation errors: ${validation.errors.join(', ')}`);
    }

    // Log validation issues for monitoring
    if (!validation.isValid) {
      console.warn(`🔧 LLM Extract validation issues (${validation.repairAttempts} repairs):`, validation.errors);
    }

    // Record usage for budget tracking
    const actualCost = result.usage?.costUSD ?? estimatedCost;
    const usageTokenEstimate =
      result.usage && (result.usage.promptTokens !== undefined || result.usage.completionTokens !== undefined)
        ? (result.usage.promptTokens ?? 0) + (result.usage.completionTokens ?? 0)
        : undefined;
    const actualTokens = result.tokensUsed
      ?? result.usage?.totalTokens
      ?? usageTokenEstimate
      ?? estimatedTokens;

    llmBudgetAndCache.recordUsage({
      userId: ctx.userId,
      workflowId: ctx.workflowId,
      organizationId: ctx.organizationId,
      provider,
      model,
      tokensUsed: actualTokens,
      costUSD: actualCost,
      executionId: ctx.executionId || 'unknown',
      nodeId: ctx.nodeId || 'unknown'
    });

    // Cache the successful response
    if (validation.isValid && validation.finalResponse) {
      llmBudgetAndCache.cacheResponse(
        cacheKey,
        validation.finalResponse,
        model,
        provider,
        actualTokens,
        actualCost
      );
    }

    return {
      json: extractedData,
      extracted: extractedData, // Alias for backward compatibility
      usage: result.usage,
      tokensUsed: actualTokens,
      model: model,
      provider: provider,
      validation: {
        isValid: validation.isValid,
        repairAttempts: validation.repairAttempts,
        errors: validation.errors,
        originalResponse: validation.originalResponse,
        finalResponse: validation.finalResponse
      },
      cached: false
    };
  } catch (error) {
    console.error('LLM Extract error:', error);
    throw new Error(`LLM extraction failed: ${error.message}`);
  }
}

/**
 * Execute LLM Classify action
 * Classifies text into predefined categories
 */
export async function runLLMClassify(params: any, ctx: any) {
  const { provider, model, prompt, classes, system } = params;

  // Validate inputs
  const promptValidation = await validatePrompt(prompt);
  if (!promptValidation.valid) {
    throw new Error(`Invalid prompt: ${promptValidation.reason}`);
  }

  if (!classes || !Array.isArray(classes) || classes.length === 0) {
    throw new Error('Classes array is required and must not be empty');
  }

  // Build classification system prompt
  const systemPrompt = `${system || 'You are a text classifier.'}\n\nClassify the input text into one of these categories: ${classes.join(', ')}\n\nRespond with ONLY the category label, nothing else.`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: await scrubPII(prompt) }
  ];

  try {
    const llmProvider = llmRegistry.get(provider);
    const result = await llmProvider.generate({
      model,
      messages,
      temperature: 0, // Use deterministic classification
      maxTokens: 50 // Classifications should be short
    });

    const tokensUsed = result.tokensUsed
      ?? (result.usage?.totalTokens ?? ((result.usage?.promptTokens ?? 0) + (result.usage?.completionTokens ?? 0)));
    const costUSD = result.usage?.costUSD ?? 0;

    if ((tokensUsed ?? 0) > 0 || costUSD > 0) {
      llmBudgetAndCache.recordUsage({
        userId: ctx.userId,
        workflowId: ctx.workflowId,
        organizationId: ctx.organizationId,
        provider,
        model,
        tokensUsed: tokensUsed ?? 0,
        costUSD,
        executionId: ctx.executionId || 'unknown',
        nodeId: ctx.nodeId || 'unknown'
      });
    }

    const label = (result.text || '').trim();

    // Validate that the returned label is in the allowed classes
    if (!classes.includes(label)) {
      // Try to find a close match (case insensitive)
      const lowerLabel = label.toLowerCase();
      const matchedClass = classes.find(c => c.toLowerCase() === lowerLabel);
      
      if (matchedClass) {
        return {
          label: matchedClass,
          confidence: 'medium',
          usage: result.usage,
          tokensUsed: tokensUsed ?? 0,
          model: model,
          provider: provider
        };
      } else {
        throw new Error(`Invalid classification label: "${label}". Must be one of: ${classes.join(', ')}`);
      }
    }

    return {
      label,
      confidence: 'high',
      usage: result.usage,
      tokensUsed: tokensUsed ?? 0,
      model: model,
      provider: provider
    };
  } catch (error) {
    console.error('LLM Classify error:', error);
    throw new Error(`LLM classification failed: ${error.message}`);
  }
}

/**
 * Execute LLM Tool Call action
 * Lets the model choose and execute tools/functions
 */
export async function runLLMToolCall(params: any, ctx: any) {
  const { provider, model, system, prompt, tools, temperature, maxTokens } = params;

  // Validate inputs
  const promptValidation = await validatePrompt(prompt);
  if (!promptValidation.valid) {
    throw new Error(`Invalid prompt: ${promptValidation.reason}`);
  }

  if (!tools || !Array.isArray(tools) || tools.length === 0) {
    throw new Error('Tools array is required and must not be empty');
  }

  // Validate tool definitions
  for (const tool of tools) {
    if (!tool.name || !tool.description || !tool.parameters) {
      throw new Error('Each tool must have name, description, and parameters');
    }
  }

  const messages: LLMMessage[] = [];
  if (system) {
    messages.push({ role: 'system', content: system });
  }
  messages.push({ role: 'user', content: await scrubPII(prompt) });

  const toolMap = new Map<string, LLMTool>();
  for (const tool of tools as LLMTool[]) {
    toolMap.set(tool.name, tool);
  }

  try {
    const llmProvider = llmRegistry.get(provider);
    const baseMessages = [...messages];
    let currentMessages = baseMessages;
    let aggregatedUsage: { promptTokens?: number; completionTokens?: number; totalTokens?: number; costUSD?: number } | undefined;
    let totalTokensUsed = 0;
    let lastResult: { result: Awaited<ReturnType<typeof llmProvider.generate>>; attempt: number } | undefined;

    for (let attempt = 0; attempt <= MAX_TOOL_CALL_REPAIR_ATTEMPTS; attempt++) {
      const result = await llmProvider.generate({
        model,
        messages: currentMessages,
        tools: tools as LLMTool[],
        toolChoice: 'auto',
        temperature: temperature ?? 0.2,
        maxTokens: maxTokens ?? 1024
      });

      lastResult = { result, attempt };

      const attemptTokensUsed = result.tokensUsed
        ?? (result.usage?.totalTokens ?? ((result.usage?.promptTokens ?? 0) + (result.usage?.completionTokens ?? 0)));
      const normalizedTokensUsed = attemptTokensUsed ?? 0;
      const costUSD = result.usage?.costUSD ?? 0;

      aggregatedUsage = accumulateUsage(aggregatedUsage, result.usage);
      totalTokensUsed += normalizedTokensUsed;

      if (normalizedTokensUsed > 0 || costUSD > 0) {
        llmBudgetAndCache.recordUsage({
          userId: ctx.userId,
          workflowId: ctx.workflowId,
          organizationId: ctx.organizationId,
          provider,
          model,
          tokensUsed: normalizedTokensUsed,
          costUSD,
          executionId: ctx.executionId || 'unknown',
          nodeId: ctx.nodeId || 'unknown'
        });
      }

      const validation = validateToolCalls(result.toolCalls, toolMap);
      if (validation.valid) {
        return {
          toolCalls: result.toolCalls || [],
          text: result.text,
          hasToolCalls: Boolean(result.toolCalls && result.toolCalls.length > 0),
          usage: aggregatedUsage ?? result.usage,
          tokensUsed: totalTokensUsed,
          model: model,
          provider: provider
        };
      }

      retryManager.emitActionableError({
        executionId: ctx.executionId || 'unknown',
        nodeId: ctx.nodeId || 'unknown',
        nodeType: 'action.llm.tool_call',
        code: 'LLM_TOOL_OUTPUT_SCHEMA_MISMATCH',
        severity: 'warn',
        message: `Tool call schema validation failed on attempt ${attempt + 1}`,
        details: {
          attempt: attempt + 1,
          toolCalls: result.toolCalls,
          issues: validation.issues
        }
      });

      if (attempt === MAX_TOOL_CALL_REPAIR_ATTEMPTS) {
        retryManager.emitActionableError({
          executionId: ctx.executionId || 'unknown',
          nodeId: ctx.nodeId || 'unknown',
          nodeType: 'action.llm.tool_call',
          code: 'LLM_TOOL_OUTPUT_SCHEMA_MISMATCH_FINAL',
          severity: 'error',
          message: `Tool call schema validation failed after ${attempt + 1} attempts`,
          details: {
            attempts: attempt + 1,
            toolCalls: result.toolCalls,
            issues: validation.issues
          }
        });

        throw new ToolCallValidationError(
          `LLM tool call arguments failed schema validation after ${attempt + 1} attempt${attempt + 1 === 1 ? '' : 's'}`,
          validation.issues,
          result.toolCalls
        );
      }

      const repairPrompt = buildToolRepairPrompt({
        attempt,
        issues: validation.issues,
        previousToolCalls: result.toolCalls,
        toolMap
      });
      const sanitizedRepairPrompt = await scrubPII(repairPrompt);
      currentMessages = [...currentMessages, { role: 'user', content: sanitizedRepairPrompt }];
    }

    // This point should be unreachable due to the loop logic, but TypeScript requires a return.
    if (lastResult) {
      return {
        toolCalls: lastResult.result.toolCalls || [],
        text: lastResult.result.text,
        hasToolCalls: Boolean(lastResult.result.toolCalls && lastResult.result.toolCalls.length > 0),
        usage: aggregatedUsage ?? lastResult.result.usage,
        tokensUsed: totalTokensUsed,
        model: model,
        provider: provider
      };
    }

    throw new Error('LLM tool call generation returned no result');
  } catch (error) {
    console.error('LLM Tool Call error:', error);
    if (error instanceof ToolCallValidationError) {
      throw error;
    }
    throw new Error(`LLM tool calling failed: ${error.message}`);
  }
}

type AggregatedUsage = { promptTokens?: number; completionTokens?: number; totalTokens?: number; costUSD?: number } | undefined;

interface ToolValidationIssue {
  toolName: string;
  issues: string[];
  schema?: any;
  rawArguments?: any;
  validationErrors?: ErrorObject[];
  availableTools?: string[];
}

interface ToolValidationResult {
  valid: boolean;
  issues: ToolValidationIssue[];
}

function accumulateUsage(current: AggregatedUsage, usage: AggregatedUsage): AggregatedUsage {
  if (!usage) {
    return current;
  }

  return {
    promptTokens: (current?.promptTokens ?? 0) + (usage.promptTokens ?? 0),
    completionTokens: (current?.completionTokens ?? 0) + (usage.completionTokens ?? 0),
    totalTokens: (current?.totalTokens ?? 0)
      + (usage.totalTokens ?? ((usage.promptTokens ?? 0) + (usage.completionTokens ?? 0))),
    costUSD: (current?.costUSD ?? 0) + (usage.costUSD ?? 0)
  };
}

function getValidatorForSchema(schema: any): ValidateFunction {
  const cacheKey = JSON.stringify(schema);
  let validator = toolSchemaValidators.get(cacheKey);
  if (!validator) {
    validator = toolOutputAjv.compile(schema);
    toolSchemaValidators.set(cacheKey, validator);
  }
  return validator;
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors || errors.length === 0) {
    return ['Arguments failed schema validation for an unknown reason'];
  }

  return errors.map(error => {
    const path = error.instancePath ? error.instancePath.replace(/^\//, '') : '';
    const location = path ? `property "${path}"` : 'the root object';

    if (error.keyword === 'required' && typeof (error.params as any)?.missingProperty === 'string') {
      return `Missing required property "${(error.params as any).missingProperty}"`;
    }

    if (error.keyword === 'additionalProperties' && typeof (error.params as any)?.additionalProperty === 'string') {
      return `Property "${(error.params as any).additionalProperty}" is not allowed`;
    }

    const message = error.message ?? 'failed validation';
    return `${location} ${message}`.trim();
  });
}

function validateToolCalls(toolCalls: LLMToolCall[] | undefined, toolMap: Map<string, LLMTool>): ToolValidationResult {
  if (!toolCalls || toolCalls.length === 0) {
    return { valid: true, issues: [] };
  }

  const issues: ToolValidationIssue[] = [];

  for (const toolCall of toolCalls) {
    const toolName = toolCall?.name || '(unknown)';
    const toolDefinition = toolMap.get(toolName);

    if (!toolDefinition) {
      issues.push({
        toolName,
        issues: [`Tool "${toolName}" is not available. Choose from: ${Array.from(toolMap.keys()).join(', ')}`],
        availableTools: Array.from(toolMap.keys()),
        rawArguments: toolCall?.arguments
      });
      continue;
    }

    const validator = getValidatorForSchema(toolDefinition.parameters);
    const args = toolCall?.arguments;

    if (args === undefined || args === null || typeof args !== 'object' || Array.isArray(args)) {
      issues.push({
        toolName,
        issues: ['Tool arguments must be a JSON object matching the schema'],
        schema: toolDefinition.parameters,
        rawArguments: args
      });
      continue;
    }

    const isValid = validator(args);
    if (!isValid) {
      issues.push({
        toolName,
        issues: formatAjvErrors(validator.errors),
        schema: toolDefinition.parameters,
        rawArguments: args,
        validationErrors: validator.errors ?? undefined
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

interface RepairPromptInput {
  attempt: number;
  issues: ToolValidationIssue[];
  previousToolCalls?: LLMToolCall[];
  toolMap: Map<string, LLMTool>;
}

function buildToolRepairPrompt({ attempt, issues, previousToolCalls, toolMap }: RepairPromptInput): string {
  const attemptNumber = attempt + 1;
  const issueSummary = issues
    .map(issue => {
      const detail = issue.issues.join('; ');
      return `• ${issue.toolName}: ${detail}`;
    })
    .join('\n');

  const schemaSummaries = issues
    .map(issue => {
      const schema = issue.schema ?? toolMap.get(issue.toolName)?.parameters;
      if (!schema) {
        return '';
      }
      return `Schema for "${issue.toolName}":\n${JSON.stringify(schema, null, 2)}`;
    })
    .filter(Boolean)
    .join('\n\n');

  const previousSummary = previousToolCalls && previousToolCalls.length > 0
    ? `Previous tool call payloads:\n${JSON.stringify(previousToolCalls, null, 2)}`
    : '';

  return [
    `Attempt ${attemptNumber} produced tool call arguments that failed schema validation.`,
    'Issues detected:',
    issueSummary,
    previousSummary,
    schemaSummaries ? `Reference schemas:\n${schemaSummaries}` : '',
    'Please respond with a corrected tool call that strictly conforms to the schema. Return only valid JSON for the tool arguments.'
  ].filter(Boolean).join('\n\n');
}

class ToolCallValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: ToolValidationIssue[],
    public readonly toolCalls?: LLMToolCall[]
  ) {
    super(message);
    this.name = 'ToolCallValidationError';
  }
}

/**
 * Helper function to safely parse JSON
 */
function tryParseJSON(text?: string): any {
  if (!text) return undefined;
  
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        // Fall through to return undefined
      }
    }
    
    // Try to extract JSON from the text (look for { ... })
    const jsonObjectMatch = text.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
      try {
        return JSON.parse(jsonObjectMatch[0]);
      } catch {
        // Fall through to return undefined
      }
    }
    
    return undefined;
  }
}