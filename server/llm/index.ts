import { llmRegistry } from './LLMProvider';
import { OpenAIProvider } from './providers/OpenAIProvider';
import { GeminiProvider } from './providers/GeminiProvider';
import { ClaudeProvider } from './providers/ClaudeProvider';

export function registerLLMProviders() {
  console.log('🤖 Registering LLM providers...');
  
  type Provider = 'gemini' | 'openai' | 'claude';
  const envProvider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase() as Provider;
  const available: Provider[] = [];

  // Register Gemini if API key is available
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (geminiApiKey) {
    llmRegistry.register(new GeminiProvider(geminiApiKey));
    available.push('gemini');
    console.log('✅ Gemini provider registered');
  } else {
    console.log('⚠️ GEMINI_API_KEY not found - skipping Gemini provider');
  }

  // Register OpenAI if API key is available
  if (process.env.OPENAI_API_KEY) {
    llmRegistry.register(new OpenAIProvider(process.env.OPENAI_API_KEY));
    available.push('openai');
    console.log('✅ OpenAI provider registered');
  } else {
    console.log('⚠️ OPENAI_API_KEY not found - skipping OpenAI provider');
  }

  // Register Claude if API key is available
  if (process.env.CLAUDE_API_KEY) {
    llmRegistry.register(new ClaudeProvider(process.env.CLAUDE_API_KEY));
    available.push('claude');
    console.log('✅ Claude provider registered');
  } else {
    console.log('⚠️ CLAUDE_API_KEY not found - skipping Claude provider');
  }
  
  // Choose default intelligently (ChatGPT's fix)
  const defaultProvider =
    (available.includes(envProvider) && envProvider) ||
    (available.includes('gemini') ? 'gemini' :
     available.includes('openai') ? 'openai' :
     available.includes('claude') ? 'claude' : null);

  if (!defaultProvider) {
    console.error('❌ No LLM provider available');
    throw new Error('No LLM provider available');
  }

  console.log(`[LLM] provider default = ${defaultProvider}; available = ${available.join(', ')}`);
  
  const availableProviders = available;
  console.log(`🎯 LLM initialization complete. Available providers: ${availableProviders.join(', ') || 'none'}`);
  
  if (availableProviders.length === 0) {
    console.log('📝 To enable LLM features, set one or more API keys:');
    console.log('   - GEMINI_API_KEY for Gemini models (recommended)');
    console.log('   - OPENAI_API_KEY for OpenAI models');
    console.log('   - LLM_PROVIDER=gemini (set preferred provider)');
  }
}

// Re-export for easy access
export { llmRegistry } from './LLMProvider';
export type { LLMProvider, LLMResult, LLMMessage, LLMTool, LLMToolCall, LLMModelId } from './LLMProvider';