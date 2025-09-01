/**
 * PRODUCTION DEPLOYMENT: Environment Configuration & Security Hardening
 * 
 * Enterprise-grade environment setup for production deployment
 * with comprehensive security, monitoring, and scalability features.
 */

export interface ProductionConfig {
  // Core Application
  NODE_ENV: 'production';
  PORT: number;
  HOST: string;
  
  // Database
  DATABASE_URL: string;
  DATABASE_POOL_SIZE: number;
  DATABASE_SSL: boolean;
  
  // LLM Providers
  LLM_PROVIDER: 'gemini' | 'openai' | 'claude';
  GEMINI_API_KEY: string;
  OPENAI_API_KEY?: string;
  CLAUDE_API_KEY?: string;
  
  // Authentication & Security
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  BCRYPT_ROUNDS: number;
  SESSION_SECRET: string;
  
  // Rate Limiting
  RATE_LIMIT_ENABLED: boolean;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  
  // Monitoring & Observability
  LOG_LEVEL: 'error' | 'warn' | 'info' | 'debug';
  ENABLE_METRICS: boolean;
  METRICS_PORT: number;
  HEALTH_CHECK_INTERVAL: number;
  
  // External Services
  REDIS_URL?: string;
  ELASTICSEARCH_URL?: string;
  SENTRY_DSN?: string;
  
  // Feature Flags
  ENABLE_LLM_FEATURES: boolean;
  ENABLE_COLLABORATION: boolean;
  ENABLE_ANALYTICS: boolean;
  ENABLE_TEMPLATES: boolean;
  
  // Performance
  MAX_CONCURRENT_BUILDS: number;
  BUILD_TIMEOUT_MS: number;
  LLM_TIMEOUT_MS: number;
  
  // Security
  CORS_ORIGINS: string[];
  ENABLE_HTTPS: boolean;
  SSL_CERT_PATH?: string;
  SSL_KEY_PATH?: string;
}

// Production environment template
export const PRODUCTION_ENV_TEMPLATE = `# PRODUCTION ENVIRONMENT CONFIGURATION
# Enterprise Automation Platform - Production Deployment

# =================================
# CORE APPLICATION CONFIGURATION
# =================================
NODE_ENV=production
PORT=5000
HOST=0.0.0.0

# =================================
# DATABASE CONFIGURATION
# =================================
DATABASE_URL="postgresql://username:password@host:5432/automation_platform"
DATABASE_POOL_SIZE=20
DATABASE_SSL=true

# =================================
# LLM PROVIDER CONFIGURATION
# =================================
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-api-key-here
# OPENAI_API_KEY=your-openai-api-key-here (optional fallback)
# CLAUDE_API_KEY=your-claude-api-key-here (optional fallback)

# =================================
# AUTHENTICATION & SECURITY
# =================================
JWT_SECRET=your-super-secure-jwt-secret-at-least-32-characters-long
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=12
SESSION_SECRET=your-session-secret-at-least-32-characters-long

# =================================
# RATE LIMITING & PROTECTION
# =================================
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# =================================
# MONITORING & OBSERVABILITY
# =================================
LOG_LEVEL=info
ENABLE_METRICS=true
METRICS_PORT=9090
HEALTH_CHECK_INTERVAL=30000
SENTRY_DSN=your-sentry-dsn-for-error-tracking

# =================================
# EXTERNAL SERVICES
# =================================
REDIS_URL=redis://localhost:6379
ELASTICSEARCH_URL=http://localhost:9200

# =================================
# FEATURE FLAGS
# =================================
ENABLE_LLM_FEATURES=true
ENABLE_COLLABORATION=true
ENABLE_ANALYTICS=true
ENABLE_TEMPLATES=true

# =================================
# PERFORMANCE CONFIGURATION
# =================================
MAX_CONCURRENT_BUILDS=10
BUILD_TIMEOUT_MS=300000
LLM_TIMEOUT_MS=30000

# =================================
# SECURITY CONFIGURATION
# =================================
CORS_ORIGINS=["https://yourdomain.com","https://app.yourdomain.com"]
ENABLE_HTTPS=true
SSL_CERT_PATH=/path/to/ssl/cert.pem
SSL_KEY_PATH=/path/to/ssl/private.key

# =================================
# GOOGLE APPS SCRIPT CONFIGURATION
# =================================
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
GOOGLE_REDIRECT_URI=https://yourdomain.com/auth/google/callback

# =================================
# THIRD-PARTY INTEGRATIONS
# =================================
SLACK_CLIENT_ID=your-slack-app-client-id
SLACK_CLIENT_SECRET=your-slack-app-client-secret
SALESFORCE_CLIENT_ID=your-salesforce-connected-app-id
SALESFORCE_CLIENT_SECRET=your-salesforce-connected-app-secret

# =================================
# MONITORING & ALERTING
# =================================
DATADOG_API_KEY=your-datadog-api-key
NEWRELIC_LICENSE_KEY=your-newrelic-license-key
PAGERDUTY_INTEGRATION_KEY=your-pagerduty-integration-key

# =================================
# BACKUP & DISASTER RECOVERY
# =================================
BACKUP_ENABLED=true
BACKUP_INTERVAL_HOURS=6
BACKUP_RETENTION_DAYS=30
S3_BACKUP_BUCKET=your-backup-bucket-name
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key`;

export class ProductionConfigValidator {
  
  static validateConfig(config: Partial<ProductionConfig>): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Critical validations
    if (!config.JWT_SECRET || config.JWT_SECRET.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters long');
    }

    if (!config.DATABASE_URL) {
      errors.push('DATABASE_URL is required for production');
    }

    if (!config.GEMINI_API_KEY && !config.OPENAI_API_KEY) {
      errors.push('At least one LLM provider API key is required');
    }

    if (config.NODE_ENV !== 'production') {
      warnings.push('NODE_ENV should be set to "production"');
    }

    if (!config.SENTRY_DSN) {
      warnings.push('SENTRY_DSN recommended for error tracking');
    }

    if (!config.REDIS_URL) {
      warnings.push('REDIS_URL recommended for session storage and caching');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  static generateSecureDefaults(): Partial<ProductionConfig> {
    return {
      NODE_ENV: 'production',
      PORT: 5000,
      HOST: '0.0.0.0',
      
      JWT_EXPIRES_IN: '7d',
      BCRYPT_ROUNDS: 12,
      
      RATE_LIMIT_ENABLED: true,
      RATE_LIMIT_WINDOW_MS: 900000, // 15 minutes
      RATE_LIMIT_MAX_REQUESTS: 100,
      
      LOG_LEVEL: 'info',
      ENABLE_METRICS: true,
      METRICS_PORT: 9090,
      HEALTH_CHECK_INTERVAL: 30000,
      
      ENABLE_LLM_FEATURES: true,
      ENABLE_COLLABORATION: true,
      ENABLE_ANALYTICS: true,
      ENABLE_TEMPLATES: true,
      
      MAX_CONCURRENT_BUILDS: 10,
      BUILD_TIMEOUT_MS: 300000, // 5 minutes
      LLM_TIMEOUT_MS: 30000, // 30 seconds
      
      DATABASE_POOL_SIZE: 20,
      DATABASE_SSL: true,
      
      ENABLE_HTTPS: true
    };
  }
}