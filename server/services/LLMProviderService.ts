/**
 * CRITICAL FIX: Centralized LLM Provider Selection
 * 
 * Ensures consistent provider selection across all routes
 * Eliminates mixed provider usage and provides clear observability
 */

interface LLMProviderCapabilities {
  gemini: boolean;
  openai: boolean;
  claude: boolean;
}

export class LLMProviderService {
  
  /**
   * CRITICAL: Single source of truth for provider selection
   */
  static selectProvider(): string {
    const requested = (process.env.LLM_PROVIDER || '').toLowerCase();
    const capabilities = this.getProviderCapabilities();
    
    console.log('🎯 LLM Provider Selection:', {
      requested,
      capabilities,
      environmentProvider: process.env.LLM_PROVIDER
    });

    // Honor explicit preference if available
    if (requested && capabilities[requested as keyof LLMProviderCapabilities]) {
      console.log(`✅ Using requested provider: ${requested}`);
      return requested;
    }

    // Fallback hierarchy (prefer Gemini > OpenAI > Claude)
    if (capabilities.gemini) {
      console.log('✅ Using Gemini (preferred fallback)');
      return 'gemini';
    }
    
    if (capabilities.openai) {
      console.log('⚠️ Using OpenAI (Gemini not available)');
      return 'openai';
    }
    
    if (capabilities.claude) {
      console.log('⚠️ Using Claude (Gemini/OpenAI not available)');
      return 'claude';
    }

    console.warn('❌ No LLM providers available, using fallback');
    return 'fallback';
  }

  /**
   * Get available provider capabilities
   */
  static getProviderCapabilities(): LLMProviderCapabilities {
    return {
      gemini: !!process.env.GEMINI_API_KEY,
      openai: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'test-key-for-development',
      claude: !!process.env.CLAUDE_API_KEY
    };
  }

  /**
   * Get API key for selected provider
   */
  static getAPIKey(provider: string): string | null {
    switch (provider) {
      case 'gemini':
        return process.env.GEMINI_API_KEY || null;
      case 'openai':
        return process.env.OPENAI_API_KEY || null;
      case 'claude':
        return process.env.CLAUDE_API_KEY || null;
      default:
        return null;
    }
  }

  /**
   * Get model name for provider
   */
  static getDefaultModel(provider: string): string {
    switch (provider) {
      case 'gemini':
        return 'gemini-2.0-flash-exp';
      case 'openai':
        return 'gpt-4o-mini';
      case 'claude':
        return 'claude-3-5-haiku-20241022';
      default:
        return 'gemini-2.0-flash-exp';
    }
  }

  /**
   * Generate text with automatic provider selection
   */
  static async generateText(prompt: string, options: {
    preferredProvider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}): Promise<{ text: string; provider: string; model: string }> {
    
    const provider = options.preferredProvider || this.selectProvider();
    const model = options.model || this.getDefaultModel(provider);
    const apiKey = this.getAPIKey(provider);

    console.log(`🤖 LLM Generation Request:`, {
      provider,
      model,
      promptLength: prompt.length,
      hasApiKey: !!apiKey
    });

    if (!apiKey) {
      console.error(`❌ No API key available for provider: ${provider}`);
      throw new Error(`LLM provider ${provider} not configured`);
    }

    try {
      let text: string;

      switch (provider) {
        case 'gemini':
          text = await this.callGeminiAPI(apiKey, model, prompt, options);
          break;
        case 'openai':
          text = await this.callOpenAIAPI(apiKey, model, prompt, options);
          break;
        case 'claude':
          text = await this.callClaudeAPI(apiKey, model, prompt, options);
          break;
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

      console.log(`✅ LLM Response received from ${provider}:`, {
        responseLength: text.length,
        model,
        provider
      });

      return { text, provider, model };

    } catch (error) {
      console.error(`❌ LLM generation failed for ${provider}:`, error);
      
      // Try fallback provider
      if (provider !== 'gemini' && this.getProviderCapabilities().gemini) {
        console.log('🔄 Falling back to Gemini');
        return this.generateText(prompt, { ...options, preferredProvider: 'gemini' });
      }
      
      throw error;
    }
  }

  /**
   * Call Gemini API
   */
  private static async callGeminiAPI(
    apiKey: string, 
    model: string, 
    prompt: string, 
    options: any
  ): Promise<string> {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options.temperature || 0.3,
          maxOutputTokens: options.maxTokens || 2000,
          topP: 0.8,
          topK: 40
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      throw new Error('No response from Gemini API');
    }

    return text;
  }

  /**
   * Call OpenAI API
   */
  private static async callOpenAIAPI(
    apiKey: string, 
    model: string, 
    prompt: string, 
    options: any
  ): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model.includes('openai:') ? model.split(':')[1] : model,
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature || 0.3,
        max_tokens: options.maxTokens || 2000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    
    if (!text) {
      throw new Error('No response from OpenAI API');
    }

    return text;
  }

  /**
   * Call Claude API
   */
  private static async callClaudeAPI(
    apiKey: string, 
    model: string, 
    prompt: string, 
    options: any
  ): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model.includes('claude:') ? model.split(':')[1] : model,
        max_tokens: options.maxTokens || 2000,
        system: 'You are a helpful automation expert.',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;
    
    if (!text) {
      throw new Error('No response from Claude API');
    }

    return text;
  }

  /**
   * Get provider status for monitoring
   */
  static getProviderStatus(): {
    selected: string;
    available: string[];
    capabilities: LLMProviderCapabilities;
    configured: boolean;
  } {
    const selected = this.selectProvider();
    const capabilities = this.getProviderCapabilities();
    const available = Object.entries(capabilities)
      .filter(([_, available]) => available)
      .map(([provider, _]) => provider);

    return {
      selected,
      available,
      capabilities,
      configured: available.length > 0
    };
  }
}