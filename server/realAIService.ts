// REAL AI SERVICE - Actually calls Gemini, Claude, OpenAI APIs
// No fake fallback - uses real API keys and tracks usage

interface RealAIRequest {
  prompt: string;
  model: 'gemini' | 'claude' | 'openai';
  apiKey: string;
  conversationHistory?: ConversationMessage[];
}

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface RealAIResponse {
  response: string;
  model: string;
  tokensUsed: number;
  cost: number;
  confidence: number;
  needsMoreInfo: boolean;
  followUpQuestions?: string[];
}

export class RealAIService {
  
  public static async callRealGemini(request: RealAIRequest): Promise<RealAIResponse> {
    if (!request.apiKey) {
      throw new Error('Gemini API key is required');
    }

    console.log(`🔥 REAL Gemini API call starting...`);
    
    const systemPrompt = `You are an expert automation consultant. Your job is to understand the user's automation needs and either:
1. If you have enough information: Generate a detailed workflow specification
2. If you need more info: Ask 1-2 specific clarifying questions

🚨 CRITICAL: Runtime is Google Apps Script ONLY. Do not propose or suggest any other runtimes, servers, or platforms. All external APIs must be called via UrlFetchApp. OAuth must use Apps Script OAuth2 library. No Node.js, Python, or external servers allowed.

For the prompt: "${request.prompt}"

If you have enough info, respond with JSON:
{
  "action": "generate_workflow",
  "intent": "email_automation|crm_automation|ecommerce_automation|etc",
  "apps": ["Gmail", "Google Sheets", etc],
  "workflow": [
    {"step": 1, "app": "Gmail", "function": "search_emails", "purpose": "Find candidate emails"}
  ],
  "confidence": 0.9
}

If you need more info, respond with JSON:
{
  "action": "ask_questions",
  "questions": ["What specific information do you want to extract from emails?", "How often should follow-ups be sent?"],
  "reasoning": "Need to clarify data extraction and timing"
}`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${request.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: systemPrompt
            }]
          }],
          generationConfig: {
            temperature: 0.1,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('❌ Gemini API Error:', response.status, errorData);
        throw new Error(`Gemini API error: ${response.status} - ${errorData}`);
      }

      const data = await response.json();
      console.log('✅ Gemini API Response received');
      
      const aiResponse = data.candidates[0].content.parts[0].text;
      console.log('🧠 Gemini Response:', aiResponse);
      
      // Parse JSON response
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(aiResponse.replace(/```json\n?|\n?```/g, ''));
      } catch (parseError) {
        console.error('❌ Failed to parse Gemini JSON response');
        throw new Error('Invalid JSON response from Gemini');
      }

      // Calculate usage and cost
      const tokensUsed = this.estimateTokens(request.prompt + aiResponse);
      const cost = tokensUsed * 0.00025; // Gemini Pro pricing

      console.log(`💰 Gemini Usage: ${tokensUsed} tokens, $${cost.toFixed(4)} cost`);

      return {
        response: aiResponse,
        model: 'Gemini Pro',
        tokensUsed,
        cost,
        confidence: parsedResponse.confidence || 0.8,
        needsMoreInfo: parsedResponse.action === 'ask_questions',
        followUpQuestions: parsedResponse.questions || []
      };

    } catch (error) {
      console.error('❌ Gemini API call failed:', error);
      throw error;
    }
  }

  public static async callRealClaude(request: RealAIRequest): Promise<RealAIResponse> {
    if (!request.apiKey) {
      throw new Error('Claude API key is required');
    }

    console.log(`🔥 REAL Claude API call starting...`);

    const systemPrompt = `You are an expert automation consultant. Analyze the user's automation request and either generate a workflow or ask clarifying questions.`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': request.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 2000,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: `Analyze this automation request: "${request.prompt}"`
            }
          ]
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('❌ Claude API Error:', response.status, errorData);
        throw new Error(`Claude API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Claude API Response received');
      
      const aiResponse = data.content[0].text;
      
      // Calculate usage and cost
      const tokensUsed = this.estimateTokens(request.prompt + aiResponse);
      const cost = tokensUsed * 0.00025; // Claude Haiku pricing

      console.log(`💰 Claude Usage: ${tokensUsed} tokens, $${cost.toFixed(4)} cost`);

      return {
        response: aiResponse,
        model: 'Claude 3 Haiku',
        tokensUsed,
        cost,
        confidence: 0.85,
        needsMoreInfo: aiResponse.toLowerCase().includes('question'),
        followUpQuestions: []
      };

    } catch (error) {
      console.error('❌ Claude API call failed:', error);
      throw error;
    }
  }

  public static async callRealOpenAI(request: RealAIRequest): Promise<RealAIResponse> {
    if (!request.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    console.log(`🔥 REAL OpenAI API call starting...`);

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${request.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini-2024-07-18',
          messages: [
            {
              role: 'system',
              content: 'You are an expert automation consultant. Analyze automation requests and generate workflows or ask clarifying questions.'
            },
            {
              role: 'user',
              content: `Analyze this automation request: "${request.prompt}"`
            }
          ],
          max_tokens: 2000,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('❌ OpenAI API Error:', response.status, errorData);
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ OpenAI API Response received');
      
      const aiResponse = data.choices[0].message.content;
      const tokensUsed = data.usage.total_tokens;
      const cost = tokensUsed * 0.00015; // GPT-4o Mini pricing

      console.log(`💰 OpenAI Usage: ${tokensUsed} tokens, $${cost.toFixed(4)} cost`);

      return {
        response: aiResponse,
        model: 'GPT-4o Mini',
        tokensUsed,
        cost,
        confidence: 0.9,
        needsMoreInfo: aiResponse.toLowerCase().includes('question'),
        followUpQuestions: []
      };

    } catch (error) {
      console.error('❌ OpenAI API call failed:', error);
      throw error;
    }
  }

  private static estimateTokens(text: string): number {
    // Rough token estimation (1 token ≈ 4 characters)
    return Math.ceil(text.length / 4);
  }

  public static async processAutomationRequest(
    prompt: string,
    model: string,
    apiKey: string,
    conversationHistory: ConversationMessage[] = []
  ): Promise<RealAIResponse> {
    
    const request: RealAIRequest = {
      prompt,
      model: model as any,
      apiKey,
      conversationHistory
    };

    console.log(`🚀 Processing automation request with REAL ${model} API...`);

    switch (model) {
      case 'gemini':
        return this.callRealGemini(request);
      case 'claude':
        return this.callRealClaude(request);
      case 'openai':
        return this.callRealOpenAI(request);
      default:
        throw new Error(`Unsupported model: ${model}`);
    }
  }
}

// Conversation Management
export class ConversationManager {
  private static conversations: Map<string, ConversationMessage[]> = new Map();

  public static addMessage(userId: string, role: 'user' | 'assistant', content: string) {
    if (!this.conversations.has(userId)) {
      this.conversations.set(userId, []);
    }
    
    const conversation = this.conversations.get(userId)!;
    conversation.push({
      role,
      content,
      timestamp: new Date()
    });

    // Keep only last 10 messages to manage token usage
    if (conversation.length > 10) {
      this.conversations.set(userId, conversation.slice(-10));
    }
  }

  public static getConversation(userId: string): ConversationMessage[] {
    return this.conversations.get(userId) || [];
  }

  public static clearConversation(userId: string) {
    this.conversations.delete(userId);
  }
}