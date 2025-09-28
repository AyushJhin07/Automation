import { LLMProvider, LLMResult, LLMModelId, LLMMessage, LLMTool } from '../LLMProvider.js';

type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: Array<{ type: 'text'; text: string }>;
};

export class ClaudeProvider implements LLMProvider {
  readonly id = 'anthropic' as const;

  constructor(private readonly apiKey: string) {}

  supportsJSON(model: LLMModelId) {
    return String(model).startsWith('anthropic:');
  }

  async generate(params: {
    model: LLMModelId;
    messages: LLMMessage[];
    temperature?: number;
    maxTokens?: number;
    tools?: LLMTool[];
    toolChoice?: 'auto' | 'none' | { name: string };
    responseFormat?: 'text' | { type: 'json_object'; schema?: any };
    abortSignal?: AbortSignal;
  }): Promise<LLMResult> {
    const model = String(params.model).replace('anthropic:', '');
    const systemMessage = params.messages.find(m => m.role === 'system');
    const conversation: AnthropicMessage[] = params.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: [{ type: 'text', text: m.content }]
      }));

    const body: Record<string, any> = {
      model,
      max_tokens: params.maxTokens ?? 1024,
      temperature: params.temperature ?? 0.2,
      messages: conversation,
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    if (params.responseFormat && typeof params.responseFormat !== 'string') {
      body.response_format = { type: 'json_object' };
    }

    if (params.tools && params.tools.length > 0) {
      body.tools = params.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      }));

      if (params.toolChoice) {
        body.tool_choice = params.toolChoice;
      }
    }

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: params.abortSignal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Claude API error (${res.status}): ${errorText}`);
      }

      const data = await res.json();
      const text = (data.content || [])
        .map((part: any) => part?.text)
        .filter(Boolean)
        .join('');

      const usage = data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
      } : undefined;

      const wantsJSON = params.responseFormat && typeof params.responseFormat !== 'string';
      const json = wantsJSON ? safeParseJSON(text) : undefined;

      return {
        text: text ?? undefined,
        json,
        usage,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Claude request was aborted');
      }
      throw error;
    }
  }
}

function safeParseJSON(value?: string) {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
