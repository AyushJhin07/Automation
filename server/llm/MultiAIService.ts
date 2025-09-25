// CRITICAL FIX: Centralized LLM Provider Service Integration
import { LLMProviderService } from '../services/LLMProviderService.js';
import { GoogleGenerativeAI } from "@google/generative-ai";

type GenerateArgs = {
  model?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
};

function normalizeGenerateArgs(args: GenerateArgs | string): GenerateArgs {
  if (typeof args === 'string') {
    return { prompt: args };
  }

  if (!args?.prompt) {
    throw new Error('Prompt is required for generateText');
  }

  return args;
}

function detectProviderFromModel(model?: string): 'gemini' | 'openai' | 'claude' | undefined {
  if (!model) {
    return undefined;
  }

  const lowerModel = model.toLowerCase();

  if (lowerModel.includes('gemini')) {
    return 'gemini';
  }

  if (lowerModel.includes('gpt') || lowerModel.includes('openai')) {
    return 'openai';
  }

  if (lowerModel.includes('claude')) {
    return 'claude';
  }

  return undefined;
}

function buildStructuredFallback(): string {
  const fallbackPlan = {
    apps: ['gmail', 'sheets'],
    trigger: {
      type: 'time',
      app: 'time',
      operation: 'schedule',
      description: 'Time-based trigger',
      required_inputs: ['frequency'],
      missing_inputs: ['frequency'],
    },
    steps: [
      {
        app: 'gmail',
        operation: 'search_emails',
        description: 'Search emails',
        required_inputs: ['search_query'],
        missing_inputs: ['search_query'],
      },
    ],
    missing_inputs: [
      {
        id: 'frequency',
        question: 'How often should this automation run?',
        type: 'select',
        required: true,
        category: 'trigger',
      },
      {
        id: 'search_query',
        question: 'What email search criteria should we use?',
        type: 'text',
        required: true,
        category: 'action',
      },
    ],
    workflow_name: 'Custom Automation',
    description: 'Automated workflow',
    complexity: 'medium',
  };

  const fallbackResponse = {
    status: 'llm_fallback',
    message: 'LLM provider unavailable. Returning structured fallback response.',
    is_complete: false,
    questions:
      fallbackPlan.missing_inputs?.map((input) => ({
        id: input.id,
        question: input.question,
        type: input.type,
        required: input.required,
        category: input.category,
      })) || [],
    workflow_draft: {
      nodes: [],
      edges: [],
      metadata: {
        automationType: 'fallback',
      },
    },
    ...fallbackPlan,
  };

  return JSON.stringify(fallbackResponse);
}

// ChatGPT Fix: Force Gemini to return JSON
export async function generateJsonWithGemini(modelId: string, prompt: string) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: modelId });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      // 👇 This tells Gemini to return only JSON text.
      responseMimeType: "application/json"
    }
  });

  const text = result.response.text();
  return text;
}

export const MultiAIService = {
  async generateText(args: GenerateArgs | string): Promise<string> {
    const { model, prompt, maxTokens, temperature } = normalizeGenerateArgs(args);
    console.log('🤖 MultiAIService.generateText called');
    console.log('📝 Prompt length:', prompt.length);

    try {
      // CRITICAL FIX: Use centralized provider selection
      const result = await LLMProviderService.generateText(prompt, {
        model,
        temperature: temperature ?? 0.3,
        maxTokens: maxTokens ?? 2000,
        preferredProvider: detectProviderFromModel(model),
      });

      console.log(`✅ LLM Response from ${result.provider}:`, {
        model: result.model,
        responseLength: result.text.length
      });

      return result.text;

    } catch (error) {
      console.error('❌ Centralized LLM generation failed:', error);
      
      // Return structured fallback for automation planning
      return buildStructuredFallback();
    }
  },
};