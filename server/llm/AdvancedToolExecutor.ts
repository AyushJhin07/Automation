/**
 * AdvancedToolExecutor - Execute actual function calls from LLM responses
 * Supports dynamic tool registration, secure execution, and result handling
 */

import { LLMToolCall } from './LLMProvider';

export interface ExecutableFunction {
  name: string;
  description: string;
  parameters: any; // JSON Schema
  handler: (args: any, context: ExecutionContext) => Promise<any>;
  permissions?: string[];
  rateLimit?: { maxCalls: number; windowMs: number };
}

export interface ExecutionContext {
  userId?: string;
  workflowId: string;
  nodeId: string;
  executionId: string;
  permissions: string[];
}

export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  result?: any;
  error?: string;
  executionTime: number;
  tokensUsed?: number;
}

class ToolRegistry {
  private tools = new Map<string, ExecutableFunction>();
  private executionCounts = new Map<string, { count: number; windowStart: number }>();

  register(tool: ExecutableFunction): void {
    this.tools.set(tool.name, tool);
    console.log(`🔧 Registered tool: ${tool.name}`);
  }

  get(name: string): ExecutableFunction | undefined {
    return this.tools.get(name);
  }

  list(): ExecutableFunction[] {
    return Array.from(this.tools.values());
  }

  checkRateLimit(toolName: string, userId: string): boolean {
    const tool = this.tools.get(toolName);
    if (!tool?.rateLimit) return true;

    const key = `${toolName}:${userId}`;
    const now = Date.now();
    const stats = this.executionCounts.get(key);

    if (!stats || now - stats.windowStart > tool.rateLimit.windowMs) {
      this.executionCounts.set(key, { count: 1, windowStart: now });
      return true;
    }

    if (stats.count >= tool.rateLimit.maxCalls) {
      return false;
    }

    stats.count++;
    return true;
  }
}

export const toolRegistry = new ToolRegistry();

export class AdvancedToolExecutor {
  /**
   * Execute multiple tool calls from LLM response
   */
  async executeToolCalls(
    toolCalls: LLMToolCall[], 
    context: ExecutionContext
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];

    for (const toolCall of toolCalls) {
      const result = await this.executeSingleTool(toolCall, context);
      results.push(result);
    }

    return results;
  }

  /**
   * Execute a single tool call
   */
  private async executeSingleTool(
    toolCall: LLMToolCall, 
    context: ExecutionContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const tool = toolRegistry.get(toolCall.name);
      if (!tool) {
        throw new Error(`Tool '${toolCall.name}' not found`);
      }

      // Check permissions
      if (tool.permissions && tool.permissions.length > 0) {
        const hasPermission = tool.permissions.some(perm => 
          context.permissions.includes(perm)
        );
        if (!hasPermission) {
          throw new Error(`Insufficient permissions for tool '${toolCall.name}'`);
        }
      }

      // Check rate limits
      if (context.userId && !toolRegistry.checkRateLimit(toolCall.name, context.userId)) {
        throw new Error(`Rate limit exceeded for tool '${toolCall.name}'`);
      }

      // Validate arguments against schema
      this.validateArguments(toolCall.arguments, tool.parameters);

      // Execute the tool
      console.log(`🔧 Executing tool: ${toolCall.name}`);
      const result = await tool.handler(toolCall.arguments, context);

      const executionTime = Date.now() - startTime;
      console.log(`✅ Tool ${toolCall.name} completed in ${executionTime}ms`);

      return {
        toolName: toolCall.name,
        success: true,
        result,
        executionTime
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`❌ Tool ${toolCall.name} failed:`, error);

      return {
        toolName: toolCall.name,
        success: false,
        error: error.message,
        executionTime
      };
    }
  }

  /**
   * Validate tool arguments against JSON schema
   */
  private validateArguments(args: any, schema: any): void {
    // Basic validation - in production, use a proper JSON schema validator
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in args)) {
          throw new Error(`Missing required argument: ${field}`);
        }
      }
    }
  }

  /**
   * Get available tools for LLM (with permission filtering)
   */
  getAvailableTools(context: ExecutionContext): any[] {
    return toolRegistry.list()
      .filter(tool => {
        if (!tool.permissions || tool.permissions.length === 0) return true;
        return tool.permissions.some(perm => context.permissions.includes(perm));
      })
      .map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }));
  }
}

// Built-in tools
export function registerBuiltInTools(): void {
  // HTTP Request Tool
  toolRegistry.register({
    name: 'http_request',
    description: 'Make HTTP requests to external APIs',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', format: 'uri' },
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'] },
        headers: { type: 'object' },
        body: { type: 'object' }
      },
      required: ['url']
    },
    handler: async (args) => {
      const { url, method = 'GET', headers = {}, body } = args;
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body ? JSON.stringify(body) : undefined
      });

      const data = await response.text();
      let parsedData;
      try {
        parsedData = JSON.parse(data);
      } catch {
        parsedData = data;
      }

      return {
        status: response.status,
        data: parsedData,
        headers: Object.fromEntries(response.headers.entries())
      };
    },
    permissions: ['http_requests'],
    rateLimit: { maxCalls: 100, windowMs: 60000 }
  });

  // Calculator Tool
  toolRegistry.register({
    name: 'calculator',
    description: 'Perform mathematical calculations',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Mathematical expression to evaluate' }
      },
      required: ['expression']
    },
    handler: async (args) => {
      const { expression } = args;
      
      // Safe math evaluation (basic implementation)
      // In production, use a proper math parser
      const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
      if (sanitized !== expression) {
        throw new Error('Invalid characters in mathematical expression');
      }

      try {
        const result = Function(`"use strict"; return (${sanitized})`)();
        return { result, expression };
      } catch (error) {
        throw new Error(`Math evaluation failed: ${error.message}`);
      }
    }
  });

  // Date/Time Tool
  toolRegistry.register({
    name: 'datetime',
    description: 'Get current date/time or format dates',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['now', 'format', 'parse'] },
        input: { type: 'string' },
        format: { type: 'string' },
        timezone: { type: 'string' }
      },
      required: ['action']
    },
    handler: async (args) => {
      const { action, input, format, timezone } = args;
      
      switch (action) {
        case 'now':
          return {
            timestamp: Date.now(),
            iso: new Date().toISOString(),
            formatted: new Date().toLocaleString()
          };
        case 'format':
          if (!input) throw new Error('Input date required for formatting');
          const date = new Date(input);
          return {
            iso: date.toISOString(),
            formatted: date.toLocaleString(),
            timestamp: date.getTime()
          };
        case 'parse':
          if (!input) throw new Error('Input string required for parsing');
          const parsed = new Date(input);
          if (isNaN(parsed.getTime())) throw new Error('Invalid date format');
          return {
            timestamp: parsed.getTime(),
            iso: parsed.toISOString()
          };
        default:
          throw new Error(`Unknown datetime action: ${action}`);
      }
    }
  });

  // Data Transformation Tool
  toolRegistry.register({
    name: 'transform_data',
    description: 'Transform and manipulate JSON data',
    parameters: {
      type: 'object',
      properties: {
        data: { type: 'object', description: 'Data to transform' },
        operation: { 
          type: 'string', 
          enum: ['filter', 'map', 'reduce', 'sort', 'group', 'extract'] 
        },
        field: { type: 'string' },
        condition: { type: 'object' },
        mapping: { type: 'object' }
      },
      required: ['data', 'operation']
    },
    handler: async (args) => {
      const { data, operation, field, condition, mapping } = args;
      
      if (!Array.isArray(data) && typeof data !== 'object') {
        throw new Error('Data must be an array or object');
      }

      switch (operation) {
        case 'extract':
          if (!field) throw new Error('Field path required for extraction');
          return extractField(data, field);
        case 'filter':
          if (!Array.isArray(data)) throw new Error('Filter requires array data');
          return data.filter(item => evaluateCondition(item, condition));
        case 'map':
          if (!Array.isArray(data)) throw new Error('Map requires array data');
          return data.map(item => applyMapping(item, mapping));
        case 'sort':
          if (!Array.isArray(data)) throw new Error('Sort requires array data');
          return data.sort((a, b) => {
            const aVal = extractField(a, field);
            const bVal = extractField(b, field);
            return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
          });
        default:
          throw new Error(`Unknown transformation operation: ${operation}`);
      }
    }
  });

  console.log('🔧 Built-in tools registered successfully');
}

// Helper functions
function extractField(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => 
    current && current[key] !== undefined ? current[key] : undefined, obj
  );
}

function evaluateCondition(item: any, condition: any): boolean {
  if (!condition) return true;
  // Simple condition evaluation - in production, use a proper query language
  for (const [field, value] of Object.entries(condition)) {
    if (extractField(item, field) !== value) return false;
  }
  return true;
}

function applyMapping(item: any, mapping: any): any {
  if (!mapping) return item;
  const result: any = {};
  for (const [newKey, oldKey] of Object.entries(mapping)) {
    result[newKey] = extractField(item, oldKey as string);
  }
  return result;
}

export const toolExecutor = new AdvancedToolExecutor();