// CRITICAL FIX: Centralized LLM Provider Service Integration
import { LLMProviderService } from '../services/LLMProviderService.js';
import { GoogleGenerativeAI } from "@google/generative-ai";

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

type GenerateArgs = { model?: string; prompt: string };

export const MultiAIService = {
  async generateText({ model, prompt }: GenerateArgs): Promise<string> {
    console.log('🤖 MultiAIService.generateText called');
    console.log('📝 Prompt length:', prompt.length);
    
    try {
      // CRITICAL FIX: Use centralized provider selection
      const result = await LLMProviderService.generateText(prompt, {
        model,
        temperature: 0.3,
        maxTokens: 2000
      });

      console.log(`✅ LLM Response from ${result.provider}:`, {
        model: result.model,
        responseLength: result.text.length
      });

      return result.text;

    } catch (error) {
      console.error('❌ Centralized LLM generation failed:', error);
      
      // Return structured fallback for automation planning
      return this.getStructuredFallback();
    }
  },

  getStructuredFallback(): string {
    return `{
      "apps": ["gmail", "sheets"],
      "trigger": {
        "type": "time",
        "app": "time",
        "operation": "schedule",
        "description": "Time-based trigger",
        "required_inputs": ["frequency"],
        "missing_inputs": ["frequency"]
      },
      "steps": [
        {
          "app": "gmail",
          "operation": "search_emails", 
          "description": "Search emails",
          "required_inputs": ["search_query"],
          "missing_inputs": ["search_query"]
        }
      ],
      "missing_inputs": [
        {"id": "frequency", "question": "How often should this automation run?", "type": "select", "required": true, "category": "trigger"},
        {"id": "search_query", "question": "What email search criteria?", "type": "text", "required": true, "category": "trigger"}
      ],
      "workflow_name": "Custom Automation",
      "description": "Automated workflow",
      "complexity": "medium"
    }`;
  }
};