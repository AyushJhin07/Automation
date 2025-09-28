import { LLMProvider, LLMResult, LLMModelId, LLMMessage, LLMTool } from '../LLMProvider';

function toGeminiRole(role: LLMMessage['role']): 'user' | 'model' {
  switch (role) {
    case 'assistant':
    case 'tool':
      return 'model';
    case 'system':
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

export class GeminiProvider implements LLMProvider {
  readonly id = 'google' as const;

  constructor(private apiKey: string) {}

  supportsJSON = (model: LLMModelId) => String(model).startsWith('google:');

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
    const model = String(params.model).replace('google:', '');

    const contents = params.messages.map(message => ({
      role: toGeminiRole(message.role),
      parts: [
        {
          text: message.content,
        },
      ],
    }));

    const body: Record<string, any> = {
      contents,
      generationConfig: {
        temperature: params.temperature ?? 0.2,
        maxOutputTokens: params.maxTokens ?? 1024,
        topP: 0.8,
        topK: 40,
      },
    };

    if (params.responseFormat && typeof params.responseFormat !== 'string') {
      body.generationConfig.responseMimeType = 'application/json';
      if (params.responseFormat.schema) {
        body.generationConfig.responseSchema = params.responseFormat.schema;
      }
    }

    if (params.tools && params.tools.length > 0) {
      body.tools = params.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }));
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: params.abortSignal,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];

    const textPart = candidate?.content?.parts?.find((part: any) => typeof part?.text === 'string');
    const text: string | undefined = textPart?.text;

    let jsonResult;
    if (params.responseFormat && typeof params.responseFormat !== 'string') {
      jsonResult = safeParseJSON(text);
      if (!jsonResult) {
        const jsonPart = candidate?.content?.parts?.find((part: any) => part?.mimeType === 'application/json');
        jsonResult = safeParseJSON(jsonPart?.text);
      }
    }

    const usage = data.usageMetadata
      ? {
          promptTokens: data.usageMetadata.promptTokenCount,
          completionTokens: data.usageMetadata.candidatesTokenCount,
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
