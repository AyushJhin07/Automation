// Load environment variables as the very first thing
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

// Validate critical environment variables
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

console.log(`🌍 Environment: ${process.env.NODE_ENV}`);

// Export environment variables for easy access
export const env = {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  JWT_SECRET: process.env.JWT_SECRET,
  PORT: process.env.PORT || '5000',
  ENABLE_LLM_FEATURES: process.env.ENABLE_LLM_FEATURES === 'true',
} as const;