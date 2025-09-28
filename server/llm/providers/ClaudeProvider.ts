import { LLMProvider, LLMResult, LLMModelId, LLMMessage, LLMTool } from '../LLMProvider';

function normalizeClaudeRole(role: LLMMessage['role']): 'user' | 'assistant' {
  switch (role) {
    case 'assistant':
      return 'assistant';
    case 'system':
    case 'tool':
    case 'user':
    default:
      return 'user';
  }
}

function safeParseJSON(payload?: string) {
  try {
    return payload ? JSON.parse(payload) : undefined;
  } catch {
    return undefined;
  }
}

export class ClaudeProvider implements LLMProvider {
  readonly id = 'anthropic' as const;

  constructor(private apiKey: string) {}

  supportsJSON = (model: LLMModelId) => String(model).startsWith('anthropic:');

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

    const systemMessages = params.messages.filter(m => m.role === 'system');
    const conversation = params.messages
      .filter(m => m.role !== 'system')
      .map(message => ({
        role: normalizeClaudeRole(message.role),
        content: [
          {
            type: 'text',
            text: message.content,
          },
        ],
      }));

    const body: Record<string, any> = {
      model,
      max_tokens: params.maxTokens ?? 1024,
      temperature: params.temperature ?? 0.2,
      messages: conversation,
    };

    if (systemMessages.length > 0) {
      body.system = systemMessages.map(m => m.content).join('\n');
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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: params.abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const contentEntry = data.content?.[0];
    const text: string | undefined = contentEntry?.text;

    let jsonResult;
    if (params.responseFormat && typeof params.responseFormat !== 'string') {
      jsonResult = safeParseJSON(text);
    }

    const usage = data.usage
      ? {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          costUSD: undefined,
        }
      : undefined;

    return {
      text,
      json: jsonResult,
      usage,
    };
  }
}
