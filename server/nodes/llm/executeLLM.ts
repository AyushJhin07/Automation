import { llmRegistry, LLMMessage, LLMTool } from '../../llm/LLMProvider';
import { fetchAndSummarizeURLs, formatNodeDataForContext, isUrlSafe } from './rag';
import { moderateInput, scrubPII, validatePrompt } from './safety';
import { llmValidationAndRepair } from '../../llm/LLMValidationAndRepair';
import { llmBudgetAndCache } from '../../llm/LLMBudgetAndCache';

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

    return {
      text: result.text,
      usage: result.usage,
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
      return {
        json: JSON.parse(cachedResponse.response),
        extracted: JSON.parse(cachedResponse.response),
        usage: {
          promptTokens: cachedResponse.tokensUsed,
          completionTokens: 0,
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
        cached: true
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
    const actualCost = result.usage?.costUSD || estimatedCost;
    const actualTokens = result.usage?.promptTokens && result.usage?.completionTokens 
      ? result.usage.promptTokens + result.usage.completionTokens 
      : estimatedTokens;

    llmBudgetAndCache.recordUsage({
      userId: ctx.userId,
      workflowId: ctx.workflowId,
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

  try {
    const llmProvider = llmRegistry.get(provider);
    const result = await llmProvider.generate({
      model,
      messages,
      tools: tools as LLMTool[],
      toolChoice: 'auto',
      temperature: temperature ?? 0.2,
      maxTokens: maxTokens ?? 1024
    });

    return {
      toolCalls: result.toolCalls || [],
      text: result.text,
      hasToolCalls: Boolean(result.toolCalls && result.toolCalls.length > 0),
      usage: result.usage,
      model: model,
      provider: provider
    };
  } catch (error) {
    console.error('LLM Tool Call error:', error);
    throw new Error(`LLM tool calling failed: ${error.message}`);
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