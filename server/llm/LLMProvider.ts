export type LLMModelId =
  | 'openai:gpt-4o-mini' | 'openai:gpt-4.1' | 'openai:o3-mini'
  | 'anthropic:claude-3-5-sonnet' | 'anthropic:claude-3-haiku'
  | 'google:gemini-1.5-pro' | 'google:gemini-1.5-flash';

export type LLMMessage = { 
  role: 'system' | 'user' | 'assistant' | 'tool'; 
  content: string 
};

export type LLMTool = { 
  name: string; 
  description: string; 
  parameters: any 
};

export type LLMToolCall = { 
  name: string; 
  arguments: any 
};

export interface LLMResult {
  text?: string;
  json?: any;
  toolCalls?: LLMToolCall[];
  usage?: { 
    promptTokens?: number; 
    completionTokens?: number; 
    costUSD?: number 
  };
}

export interface LLMProvider {
  readonly id: 'openai' | 'anthropic' | 'google';
  supportsJSON(model: LLMModelId): boolean;
  generate(params: {
    model: LLMModelId;
    messages: LLMMessage[];
    temperature?: number;
    maxTokens?: number;
    tools?: LLMTool[];
    toolChoice?: 'auto' | 'none' | { name: string };
    responseFormat?: 'text' | { type: 'json_object'; schema?: any };
    abortSignal?: AbortSignal;
  }): Promise<LLMResult>;
  moderate?(text: string): Promise<{ 
    allowed: boolean; 
    categories?: Record<string, boolean> 
  }>;
}

export class LLMRegistry {
  private providers = new Map<string, LLMProvider>();
  
  register(p: LLMProvider) { 
    this.providers.set(p.id, p); 
  }
  
  get(id: string) { 
    const p = this.providers.get(id); 
    if (!p) throw new Error(`LLM provider ${id} not found`); 
    return p; 
  }
  
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }
  
  getAvailableModels(): Record<string, string[]> {
    const models: Record<string, string[]> = {};
    for (const [id, provider] of this.providers) {
      models[id] = this.getModelsForProvider(id);
    }
    return models;
  }
  
  private getModelsForProvider(providerId: string): string[] {
    switch (providerId) {
      case 'openai':
        return ['openai:gpt-4o-mini', 'openai:gpt-4.1', 'openai:o3-mini'];
      case 'anthropic':
        return ['anthropic:claude-3-5-sonnet', 'anthropic:claude-3-haiku'];
      case 'google':
        return ['google:gemini-1.5-pro', 'google:gemini-1.5-flash'];
      default:
        return [];
    }
  }
}

export const llmRegistry = new LLMRegistry();