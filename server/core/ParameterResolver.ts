/**
 * ParameterResolver - AI-as-a-Field Implementation
 * Resolves parameter values that can be Static, AI-powered, or Reference-based
 */

import { llmRegistry } from '../llm/LLMProvider';
import { ParamValue, EvaluatedValue, ParameterContext } from '../../shared/nodeGraphSchema';

/**
 * Cache for LLM responses to avoid repeated API calls
 */
class LLMCache {
  private cache = new Map<string, { value: any; expiry: number }>();

  get(key: string): any | undefined {
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) {
      return cached.value;
    }
    if (cached) {
      this.cache.delete(key); // Remove expired entry
    }
    return undefined;
  }

  set(key: string, value: any, ttlSec: number = 300): void {
    const expiry = Date.now() + (ttlSec * 1000);
    this.cache.set(key, { value, expiry });
    
    // Simple LRU: remove oldest entries if cache gets too large
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

const llmCache = new LLMCache();

/**
 * Resolve a single parameter value based on its mode
 */
export async function resolveParamValue(
  value: ParamValue, 
  context: ParameterContext
): Promise<any> {
  // Handle null/undefined
  if (value == null) {
    return value;
  }

  // Handle primitive types (backwards compatibility)
  if (typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  // Handle EvaluatedValue objects
  const evalValue = value as EvaluatedValue;
  
  switch (evalValue.mode) {
    case 'static':
      return evalValue.value;
    
    case 'ref':
      return resolveReference(evalValue.nodeId, evalValue.path, context);
    
    case 'llm':
      return await resolveLLMValue(evalValue, context);
    
    default:
      // Fallback: treat as static object
      return value;
  }
}

/**
 * Resolve all parameters in an object recursively
 */
export async function resolveAllParams(
  params: Record<string, any>, 
  context: ParameterContext
): Promise<Record<string, any>> {
  const resolved: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(params || {})) {
    try {
      resolved[key] = await resolveParamValue(value, context);
    } catch (error) {
      console.error(`Failed to resolve parameter ${key}:`, error);
      // On error, use the original value or null
      resolved[key] = typeof value === 'object' && value?.mode ? null : value;
    }
  }
  
  return resolved;
}

/**
 * Resolve a reference to previous node output
 */
function resolveReference(nodeId: string, path: string, context: ParameterContext): any {
  const nodeOutput = context.nodeOutputs[nodeId];
  
  if (!nodeOutput) {
    console.warn(`Reference to node ${nodeId} not found in context`);
    return undefined;
  }
  
  // Handle root reference
  if (!path || path === '$' || path === '') {
    return nodeOutput;
  }
  
  // Handle dot-notation path traversal
  try {
    return path.split('.').reduce((obj: any, key: string) => {
      if (obj && typeof obj === 'object' && key in obj) {
        return obj[key];
      }
      return undefined;
    }, nodeOutput);
  } catch (error) {
    console.warn(`Failed to resolve reference path ${nodeId}.${path}:`, error);
    return undefined;
  }
}

/**
 * Resolve an LLM-powered parameter value
 */
async function resolveLLMValue(
  llmValue: Extract<EvaluatedValue, { mode: 'llm' }>, 
  context: ParameterContext
): Promise<any> {
  const { provider, model, prompt, system, temperature, maxTokens, jsonSchema, cacheTtlSec } = llmValue;
  
  // Create cache key for identical requests
  const cacheKey = createLLMCacheKey(llmValue, context);
  
  // Check cache first
  if (cacheTtlSec && cacheTtlSec > 0) {
    const cached = llmCache.get(cacheKey);
    if (cached !== undefined) {
      console.log('📋 Using cached LLM response');
      return cached;
    }
  }
  
  try {
    // Get LLM provider
    const llmProvider = llmRegistry.get(provider);
    
    // Interpolate prompt with context
    const interpolatedPrompt = interpolatePrompt(prompt, context);
    
    // Build messages
    const messages = [];
    if (system) {
      messages.push({ role: 'system', content: system });
    }
    messages.push({ role: 'user', content: interpolatedPrompt });
    
    // Determine if we want JSON response
    const wantsJSON = Boolean(jsonSchema);
    
    // Call LLM
    console.log(`🤖 Resolving LLM parameter: ${provider}:${model}`);
    const result = await llmProvider.generate({
      model: model as any,
      messages: messages as any,
      temperature: temperature ?? 0.2,
      maxTokens: maxTokens ?? 512,
      responseFormat: wantsJSON ? { type: 'json_object', schema: jsonSchema } : 'text'
    });
    
    // Extract the result
    let resolvedValue;
    if (wantsJSON) {
      resolvedValue = result.json ?? tryParseJSON(result.text);
      if (!resolvedValue) {
        throw new Error('Failed to get valid JSON from LLM response');
      }
    } else {
      resolvedValue = result.text ?? '';
    }
    
    // Cache the result
    if (cacheTtlSec && cacheTtlSec > 0) {
      llmCache.set(cacheKey, resolvedValue, cacheTtlSec);
    }
    
    // Log usage for monitoring
    if (result.usage) {
      console.log(`💰 LLM usage: ${result.usage.promptTokens + result.usage.completionTokens} tokens, $${result.usage.costUSD?.toFixed(6) || '0'}`);
    }
    
    return resolvedValue;
    
  } catch (error) {
    console.error('❌ LLM parameter resolution failed:', error);
    throw new Error(`LLM parameter resolution failed: ${error.message}`);
  }
}

/**
 * Interpolate prompt template with context data
 * Supports {{ref:nodeId.path}} syntax for referencing previous node outputs
 */
function interpolatePrompt(template: string, context: ParameterContext): string {
  return template.replace(/\{\{ref:([^.}]+)\.([^}]+)\}\}/g, (_match, nodeId, path) => {
    const value = resolveReference(nodeId, path, context);
    return formatValueForPrompt(value);
  }).replace(/\{\{ref:([^}]+)\}\}/g, (_match, nodeId) => {
    const value = resolveReference(nodeId, '', context);
    return formatValueForPrompt(value);
  });
}

/**
 * Format a value for inclusion in a prompt
 */
function formatValueForPrompt(value: any): string {
  if (value == null) {
    return '[null]';
  }
  if (typeof value === 'string') {
    return value;
  }
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
 * Create a cache key for LLM requests
 */
function createLLMCacheKey(llmValue: Extract<EvaluatedValue, { mode: 'llm' }>, context: ParameterContext): string {
  // Include the interpolated prompt in the cache key so different contexts get different cache entries
  const interpolatedPrompt = interpolatePrompt(llmValue.prompt, context);
  
  const keyData = {
    provider: llmValue.provider,
    model: llmValue.model,
    prompt: interpolatedPrompt,
    system: llmValue.system,
    temperature: llmValue.temperature,
    maxTokens: llmValue.maxTokens,
    jsonSchema: llmValue.jsonSchema
  };
  
  // Create a hash-like key
  return Buffer.from(JSON.stringify(keyData)).toString('base64').slice(0, 32);
}

/**
 * Helper to safely parse JSON
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
        // Fall through
      }
    }
    
    // Try to extract JSON object from text
    const jsonObjectMatch = text.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
      try {
        return JSON.parse(jsonObjectMatch[0]);
      } catch {
        // Fall through
      }
    }
    
    return undefined;
  }
}

/**
 * Utility to clear the LLM cache (useful for testing)
 */
export function clearLLMCache(): void {
  llmCache.clear();
}

/**
 * Utility to check if a value is an EvaluatedValue
 */
export function isEvaluatedValue(value: any): value is EvaluatedValue {
  return typeof value === 'object' && 
         value !== null && 
         !Array.isArray(value) && 
         'mode' in value &&
         ['static', 'ref', 'llm'].includes(value.mode);
}