import { llmRegistry } from './LLMProvider';
import { OpenAIProvider } from './providers/OpenAIProvider';
// Future providers can be added here:
// import { AnthropicProvider } from './providers/AnthropicProvider';
// import { GoogleProvider } from './providers/GoogleProvider';

export function registerLLMProviders() {
  console.log('🤖 Registering LLM providers...');
  
  // Register OpenAI if API key is available
  if (process.env.OPENAI_API_KEY) {
    llmRegistry.register(new OpenAIProvider(process.env.OPENAI_API_KEY));
    console.log('✅ OpenAI provider registered');
  } else {
    console.log('⚠️  OpenAI API key not found - skipping OpenAI provider');
  }
  
  // Future provider registrations:
  // if (process.env.ANTHROPIC_API_KEY) {
  //   llmRegistry.register(new AnthropicProvider(process.env.ANTHROPIC_API_KEY));
  //   console.log('✅ Anthropic provider registered');
  // }
  
  // if (process.env.GOOGLE_API_KEY) {
  //   llmRegistry.register(new GoogleProvider(process.env.GOOGLE_API_KEY));
  //   console.log('✅ Google provider registered');
  // }
  
  const availableProviders = llmRegistry.getAvailableProviders();
  console.log(`🎯 LLM initialization complete. Available providers: ${availableProviders.join(', ') || 'none'}`);
  
  if (availableProviders.length === 0) {
    console.log('📝 To enable LLM features, set one or more API keys:');
    console.log('   - OPENAI_API_KEY for OpenAI models');
    console.log('   - ANTHROPIC_API_KEY for Claude models (future)');
    console.log('   - GOOGLE_API_KEY for Gemini models (future)');
  }
}

// Re-export for easy access
export { llmRegistry } from './LLMProvider';
export type { LLMProvider, LLMResult, LLMMessage, LLMTool, LLMToolCall, LLMModelId } from './LLMProvider';