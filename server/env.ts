// Load environment variables as the very first thing
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

// Validate critical environment variables
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

const environment = process.env.NODE_ENV;
console.log(`🌍 Environment: ${environment}`);

const requiredInProduction = ['DATABASE_URL', 'ENCRYPTION_MASTER_KEY', 'JWT_SECRET'];
if (environment === 'production') {
  const missing = requiredInProduction.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for production: ${missing.join(', ')}`
    );
  }
} else {
  const missing = requiredInProduction.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    const missingList = missing.join(', ');
    console.warn(
      `⚠️ Missing environment variables (${missingList}). The application will run in degraded mode. Set them before production deploys.`
    );
  }
}

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
  SERVER_PUBLIC_URL: process.env.SERVER_PUBLIC_URL || '',
  ENABLE_LLM_FEATURES: process.env.ENABLE_LLM_FEATURES === 'true',
  GENERIC_EXECUTOR_ENABLED: process.env.GENERIC_EXECUTOR_ENABLED === 'true',
} as const;

export const FLAGS = {
  GENERIC_EXECUTOR_ENABLED: (process.env.GENERIC_EXECUTOR_ENABLED === 'true')
} as const;
