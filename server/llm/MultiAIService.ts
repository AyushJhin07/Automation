// MultiAIService - Missing implementation for generateText
type GenerateArgs = { model?: string; prompt: string };

export const MultiAIService = {
  async generateText({ model = 'gemini-2.0-flash-exp', prompt }: GenerateArgs): Promise<string> {
    console.log('🤖 MultiAIService.generateText called with model:', model);
    console.log('📝 Prompt length:', prompt.length);
    
    // CRITICAL FIX: Respect LLM_PROVIDER environment variable
    const preferredProvider = process.env.LLM_PROVIDER || 'gemini';
    console.log('🎯 Preferred LLM provider:', preferredProvider);
    
    try {
      // Use preferred provider (Gemini by default)
      if (preferredProvider === 'gemini') {
        const apiKey = process.env.GEMINI_API_KEY;
      
        if (!apiKey) {
          console.warn('⚠️ GEMINI_API_KEY not configured, trying OpenAI fallback');
          return this.tryOpenAIFallback(prompt);
        }

        console.log('🎯 Using Gemini API for LLM generation');
        return this.callGeminiAPI(apiKey, model, prompt);
      } else if (preferredProvider === 'openai') {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          console.warn('⚠️ OPENAI_API_KEY not configured, trying Gemini fallback');
          return this.tryGeminiFallback(prompt);
        }
        
        console.log('🎯 Using OpenAI API for LLM generation');
        return this.callOpenAIAPI(apiKey, model, prompt);
      } else {
        console.warn('⚠️ Unknown LLM provider, using Gemini default');
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          return this.getStructuredFallback();
        }
        return this.callGeminiAPI(apiKey, model, prompt);
      }
    } catch (error) {
      console.error('❌ LLM generateText failed:', error);
      return this.getStructuredFallback();
    }
  },

  async callGeminiAPI(apiKey: string, model: string, prompt: string): Promise<string> {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2000,
            topP: 0.8,
            topK: 40
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Gemini API error:', response.status, errorText);
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!aiResponse) {
        throw new Error('No response from Gemini API');
      }

      console.log('✅ Gemini API Response received, length:', aiResponse.length);
      return aiResponse;
  },

  async callOpenAIAPI(apiKey: string, model: string, prompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model.includes('openai:') ? model.split(':')[1] : 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content;
    
    if (!aiResponse) {
      throw new Error('No response from OpenAI API');
    }

    console.log('✅ OpenAI API Response received, length:', aiResponse.length);
    return aiResponse;
  },

  async tryOpenAIFallback(prompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey && apiKey !== 'test-key-for-development') {
      console.log('🔄 Falling back to OpenAI');
      return this.callOpenAIAPI(apiKey, 'gpt-4o-mini', prompt);
    }
    return this.getStructuredFallback();
  },

  async tryGeminiFallback(prompt: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      console.log('🔄 Falling back to Gemini');
      return this.callGeminiAPI(apiKey, 'gemini-2.0-flash-exp', prompt);
    }
    return this.getStructuredFallback();
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