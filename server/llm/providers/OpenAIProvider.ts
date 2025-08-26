import { LLMProvider, LLMResult, LLMModelId, LLMMessage, LLMTool } from '../LLMProvider';

export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai';
  
  constructor(private apiKey: string) {}
  
  supportsJSON = (m: LLMModelId) => String(m).startsWith('openai:');

  async generate(p: {
    model: LLMModelId; 
    messages: LLMMessage[]; 
    temperature?: number; 
    maxTokens?: number;
    tools?: LLMTool[]; 
    toolChoice?: 'auto' | 'none' | { name: string }; 
    responseFormat?: 'text' | { type: 'json_object'; schema?: any };
    abortSignal?: AbortSignal;
  }): Promise<LLMResult> {
    const model = String(p.model).replace('openai:', '');
    
    const body: any = {
      model,
      temperature: p.temperature ?? 0.2,
      max_tokens: p.maxTokens ?? 1024,
      messages: p.messages,
    };

    // Add tools if provided
    if (p.tools && p.tools.length > 0) {
      body.tools = p.tools.map(t => ({ 
        type: 'function', 
        function: { 
          name: t.name, 
          description: t.description, 
          parameters: t.parameters 
        } 
      }));
    }

    // Add tool choice if provided
    if (p.toolChoice) {
      body.tool_choice = p.toolChoice;
    }

    // Add response format for JSON
    if (p.responseFormat && typeof p.responseFormat !== 'string') {
      body.response_format = { type: 'json_object' };
    }

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${this.apiKey}` 
        },
        body: JSON.stringify(body),
        signal: p.abortSignal
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`OpenAI API error (${res.status}): ${errorText}`);
      }

      const data = await res.json();
      const msg = data.choices?.[0]?.message;
      
      // Parse tool calls if present
      const toolCalls = msg?.tool_calls?.map((t: any) => ({
        name: t.function?.name,
        arguments: safeParse(t.function?.arguments)
      })) ?? undefined;

      // Calculate usage
      const usage = data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        costUSD: this.calculateCost(model, data.usage)
      } : undefined;

      const text = msg?.content ?? undefined;
      let json;
      
      // Parse JSON response if requested
      if (p.responseFormat && typeof p.responseFormat !== 'string') {
        json = safeParse(text);
      }

      return { text, json, toolCalls, usage };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('OpenAI request was aborted');
      }
      throw error;
    }
  }

  async moderate(text: string): Promise<{ allowed: boolean; categories?: Record<string, boolean> }> {
    try {
      const res = await fetch('https://api.openai.com/v1/moderations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({ input: text })
      });

      if (!res.ok) {
        console.warn('Moderation check failed, allowing by default');
        return { allowed: true };
      }

      const data = await res.json();
      const result = data.results?.[0];
      
      return {
        allowed: !result?.flagged,
        categories: result?.categories || {}
      };
    } catch (error) {
      console.warn('Moderation check error, allowing by default:', error);
      return { allowed: true };
    }
  }

  private calculateCost(model: string, usage: any): number {
    // Rough cost estimation (per 1k tokens)
    const costPer1k = {
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'gpt-4.1': { input: 0.005, output: 0.015 },
      'o3-mini': { input: 0.00015, output: 0.0006 }
    } as const;

    const modelCost = costPer1k[model as keyof typeof costPer1k] || costPer1k['gpt-4o-mini'];
    const inputCost = (usage.prompt_tokens / 1000) * modelCost.input;
    const outputCost = (usage.completion_tokens / 1000) * modelCost.output;
    
    return Math.round((inputCost + outputCost) * 100000) / 100000; // Round to 5 decimal places
  }
}

function safeParse(s?: string) { 
  try { 
    return s ? JSON.parse(s) : undefined; 
  } catch { 
    return undefined; 
  } 
}