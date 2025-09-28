import { LLMProvider, LLMResult, LLMModelId, LLMMessage, LLMTool } from '../LLMProvider.js';

type GeminiContent = {
  role: string;
  parts: Array<{ text?: string }>;
};

export class GeminiProvider implements LLMProvider {
  readonly id = 'google' as const;

  constructor(private readonly apiKey: string) {}

  supportsJSON(model: LLMModelId) {
    return String(model).startsWith('google:');
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
    const model = String(params.model).replace('google:', '');

    const systemMessage = params.messages.find(m => m.role === 'system');
    const dialogue: GeminiContent[] = params.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

    const body: Record<string, any> = {
      contents: dialogue,
      generationConfig: {
        temperature: params.temperature ?? 0.2,
        maxOutputTokens: params.maxTokens ?? 1024,
      },
    };

    if (systemMessage) {
      body.systemInstruction = {
        role: 'system',
        parts: [{ text: systemMessage.content }]
      };
    }

    if (params.responseFormat && typeof params.responseFormat !== 'string') {
      body.generationConfig.responseMimeType = 'application/json';
    }

    if (params.tools && params.tools.length > 0) {
      body.tools = params.tools.map(tool => ({
        functionDeclarations: [{
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        }]
      }));
    }

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: params.abortSignal
        });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Gemini API error (${res.status}): ${errorText}`);
      }

      const data = await res.json();
      const candidate = data.candidates?.[0];
      const text = (candidate?.content?.parts || [])
        .map((part: any) => part?.text)
        .filter(Boolean)
        .join('');

      const usage = data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
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
        throw new Error('Gemini request was aborted');
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
