import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { 
  pgTable, 
  text, 
  timestamp, 
  integer, 
  boolean, 
  json, 
  uuid,
  index,
  uniqueIndex,
  serial
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table with performance indexes
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    name: text('name'), // User's display name
    role: text('role').notNull().default('user'), // user, admin, enterprise
    plan: text('plan').notNull().default('free'), // free, pro, enterprise
    planType: text('plan_type').notNull().default('free'), // Alias for plan for compatibility
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    lastLogin: timestamp('last_login'),
    isActive: boolean('is_active').default(true).notNull(),
    quotaResetDate: timestamp('quota_reset_date').defaultNow().notNull(),
    
    // Usage quotas and tracking
    quotaApiCalls: integer('quota_api_calls').default(1000).notNull(),
    quotaTokens: integer('quota_tokens').default(100000).notNull(),
    monthlyApiCalls: integer('monthly_api_calls').default(0).notNull(),
    monthlyTokensUsed: integer('monthly_tokens_used').default(0).notNull(),
    
    // PII tracking for ALL applications
    piiConsentGiven: boolean('pii_consent_given').default(false).notNull(),
    piiConsentDate: timestamp('pii_consent_date'),
    piiLastReviewed: timestamp('pii_last_reviewed'),
    
    // Preferences
    emailNotifications: boolean('email_notifications').default(true).notNull(),
    timezone: text('timezone').default('America/New_York').notNull(),
    language: text('language').default('en').notNull(),
  },
  (table) => ({
    // Performance indexes for ALL application queries
    emailIdx: uniqueIndex('users_email_idx').on(table.email),
    planIdx: index('users_plan_idx').on(table.plan),
    createdAtIdx: index('users_created_at_idx').on(table.createdAt),
    lastLoginIdx: index('users_last_login_idx').on(table.lastLogin),
    activeUsersIdx: index('users_active_idx').on(table.isActive, table.plan),
    quotaResetIdx: index('users_quota_reset_idx').on(table.quotaResetDate),
  })
);

// Connections table with security indexes for ALL applications
export const connections = pgTable(
  'connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    provider: text('provider').notNull(), // gemini, openai, claude, slack, hubspot, jira, etc.
    encryptedCredentials: text('encrypted_credentials').notNull(),
    iv: text('iv').notNull(), // AES-256-GCM IV
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    lastUsed: timestamp('last_used'),
    lastTested: timestamp('last_tested'),
    lastError: text('last_error'),
    isActive: boolean('is_active').default(true).notNull(),
    
    // PII and security tracking for ALL applications
    containsPii: boolean('contains_pii').default(false).notNull(),
    piiType: text('pii_type'), // email, phone, ssn, payment, etc.
    securityLevel: text('security_level').default('standard').notNull(), // standard, high, critical
    accessRestricted: boolean('access_restricted').default(false).notNull(),
    
    // Metadata for ALL application types
    metadata: json('metadata').$type<{
      scopes?: string[];
      refreshToken?: boolean;
      expiresAt?: string;
      rateLimits?: {
        requestsPerSecond?: number;
        requestsPerMinute?: number;
        dailyLimit?: number;
      };
      customSettings?: Record<string, any>;
    }>(),
  },
  (table) => ({
    // Performance indexes for ALL applications
    userProviderIdx: index('connections_user_provider_idx').on(table.userId, table.provider),
    providerIdx: index('connections_provider_idx').on(table.provider),
    activeIdx: index('connections_active_idx').on(table.isActive),
    lastUsedIdx: index('connections_last_used_idx').on(table.lastUsed),
    
    // Security indexes for PII tracking across ALL applications
    piiIdx: index('connections_pii_idx').on(table.containsPii, table.piiType),
    securityLevelIdx: index('connections_security_level_idx').on(table.securityLevel),
    
    // Unique constraint to prevent duplicate connections
    userProviderNameIdx: uniqueIndex('connections_user_provider_name_idx')
      .on(table.userId, table.provider, table.name),
  })
);

// Workflows table with indexes for ALL application types
export const workflows = pgTable(
  'workflows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    graph: json('graph').$type<Record<string, any>>().notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    lastExecuted: timestamp('last_executed'),
    executionCount: integer('execution_count').default(0).notNull(),
    totalRuns: integer('total_runs').default(0).notNull(), // Total execution runs
    successfulRuns: integer('successful_runs').default(0).notNull(), // Successful execution runs
    
    // Categories for ALL application domains
    category: text('category').default('general').notNull(), // email, crm, ecommerce, finance, hr, marketing, etc.
    tags: text('tags').array(),
    
    // PII and security tracking for workflows across ALL applications
    containsPii: boolean('contains_pii').default(false).notNull(),
    piiElements: text('pii_elements').array(), // types of PII detected
    securityReview: boolean('security_review').default(false).notNull(),
    securityReviewDate: timestamp('security_review_date'),
    riskLevel: text('risk_level').default('low').notNull(), // low, medium, high, critical
    
    // Compliance tracking for ALL applications
    complianceFlags: text('compliance_flags').array(), // gdpr, hipaa, sox, pci, etc.
    dataRetentionDays: integer('data_retention_days').default(90),
    
    // Performance metadata
    avgExecutionTime: integer('avg_execution_time'), // milliseconds
    successRate: integer('success_rate').default(100), // percentage
    
    // Workflow metadata for ALL application types
    metadata: json('metadata').$type<{
      version?: string;
      nodeCount?: number;
      complexity?: 'simple' | 'medium' | 'complex';
      requiredScopes?: string[];
      estimatedCost?: number;
      [key: string]: any;
    }>(),
  },
  (table) => ({
    // Performance indexes for ALL applications
    userIdx: index('workflows_user_idx').on(table.userId),
    categoryIdx: index('workflows_category_idx').on(table.category),
    activeIdx: index('workflows_active_idx').on(table.isActive),
    lastExecutedIdx: index('workflows_last_executed_idx').on(table.lastExecuted),
    executionCountIdx: index('workflows_execution_count_idx').on(table.executionCount),
    
    // Security and compliance indexes for ALL applications
    piiIdx: index('workflows_pii_idx').on(table.containsPii),
    riskLevelIdx: index('workflows_risk_level_idx').on(table.riskLevel),
    securityReviewIdx: index('workflows_security_review_idx').on(table.securityReview),
    complianceIdx: index('workflows_compliance_idx').on(table.complianceFlags),
    
    // Performance monitoring indexes
    performanceIdx: index('workflows_performance_idx').on(table.avgExecutionTime, table.successRate),
    
    // Composite indexes for common queries
    userActiveIdx: index('workflows_user_active_idx').on(table.userId, table.isActive),
    userCategoryIdx: index('workflows_user_category_idx').on(table.userId, table.category),
  })
);

// Workflow executions table with comprehensive tracking for ALL applications
export const workflowExecutions = pgTable(
  'workflow_executions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    status: text('status').notNull(), // started, completed, failed, cancelled
    startedAt: timestamp('started_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    duration: integer('duration'), // milliseconds
    
    // Execution context for ALL applications
    triggerType: text('trigger_type').notNull(), // manual, scheduled, webhook, email, etc.
    triggerData: json('trigger_data').$type<Record<string, any>>(),
    
    // Results and errors for ALL applications
    nodeResults: json('node_results').$type<Record<string, any>>(),
    errorDetails: json('error_details').$type<{
      nodeId?: string;
      error?: string;
      stack?: string;
      context?: Record<string, any>;
    }>(),
    
    // PII tracking for execution data across ALL applications
    processedPii: boolean('processed_pii').default(false).notNull(),
    piiTypes: text('pii_types').array(),
    
    // Resource usage tracking for ALL applications
    apiCallsMade: integer('api_calls_made').default(0).notNull(),
    tokensUsed: integer('tokens_used').default(0).notNull(),
    dataProcessed: integer('data_processed').default(0).notNull(), // bytes
    
    // Billing and metering
    cost: integer('cost').default(0).notNull(), // cents
    
    // Execution metadata for ALL application types
    metadata: json('metadata').$type<{
      nodeExecutions?: Array<{
        nodeId: string;
        status: string;
        duration: number;
        error?: string;
      }>;
      externalCalls?: Array<{
        service: string;
        endpoint: string;
        duration: number;
        status: number;
      }>;
      [key: string]: any;
    }>(),
  },
  (table) => ({
    // Performance indexes for ALL applications
    workflowIdx: index('executions_workflow_idx').on(table.workflowId),
    userIdx: index('executions_user_idx').on(table.userId),
    statusIdx: index('executions_status_idx').on(table.status),
    startedAtIdx: index('executions_started_at_idx').on(table.startedAt),
    durationIdx: index('executions_duration_idx').on(table.duration),
    triggerTypeIdx: index('executions_trigger_type_idx').on(table.triggerType),
    
    // PII and security indexes for ALL applications
    piiIdx: index('executions_pii_idx').on(table.processedPii),
    
    // Resource usage indexes for billing and monitoring
    apiCallsIdx: index('executions_api_calls_idx').on(table.apiCallsMade),
    costIdx: index('executions_cost_idx').on(table.cost),
    
    // Composite indexes for common analytics queries
    userTimeIdx: index('executions_user_time_idx').on(table.userId, table.startedAt),
    workflowTimeIdx: index('executions_workflow_time_idx').on(table.workflowId, table.startedAt),
    statusTimeIdx: index('executions_status_time_idx').on(table.status, table.startedAt),
  })
);

// Usage tracking table with comprehensive metering for ALL applications
export const usageTracking = pgTable(
  'usage_tracking',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    date: timestamp('date').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(), // Add missing createdAt
    year: integer('year').notNull(), // Add missing year column
    month: integer('month').notNull(), // Add missing month column
    
    // API usage tracking for ALL applications
    apiCalls: integer('api_calls').default(0).notNull(),
    llmTokens: integer('llm_tokens').default(0).notNull(),
    tokensUsed: integer('tokens_used').default(0).notNull(), // Alias for llmTokens
    workflowRuns: integer('workflow_runs').default(0).notNull(),
    storageUsed: integer('storage_used').default(0).notNull(), // bytes
    
    // Service-specific usage for ALL applications
    emailsSent: integer('emails_sent').default(0).notNull(),
    webhooksReceived: integer('webhooks_received').default(0).notNull(),
    httpRequests: integer('http_requests').default(0).notNull(),
    dataTransfer: integer('data_transfer').default(0).notNull(), // bytes
    
    // PII processing tracking for ALL applications
    piiRecordsProcessed: integer('pii_records_processed').default(0).notNull(),
    
    // Cost tracking
    cost: integer('cost').default(0).notNull(), // cents
    estimatedCost: integer('estimated_cost').default(0).notNull(), // cents - alias for cost
    
    // Metadata for detailed tracking
    metadata: json('metadata').$type<{
      serviceCosts?: Record<string, number>;
      errorCounts?: Record<string, number>;
      averageResponseTimes?: Record<string, number>;
      [key: string]: any;
    }>(),
  },
  (table) => ({
    // Indexes for usage analytics across ALL applications
    userDateIdx: index('usage_user_date_idx').on(table.userId, table.date),
    dateIdx: index('usage_date_idx').on(table.date),
    userIdx: index('usage_user_idx').on(table.userId),
    
    // Resource usage indexes
    apiCallsIdx: index('usage_api_calls_idx').on(table.apiCalls),
    costIdx: index('usage_cost_idx').on(table.cost),
    
    // PII tracking index
    piiIdx: index('usage_pii_idx').on(table.piiRecordsProcessed),
  })
);

// Connector definitions table for ALL applications
export const connectorDefinitions = pgTable(
  'connector_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    description: text('description'),
    
    // Connector configuration for ALL applications
    config: json('config').$type<{
      authentication?: {
        type: 'oauth2' | 'api_key' | 'basic' | 'custom';
        scopes?: string[];
        authUrl?: string;
        tokenUrl?: string;
      };
      actions?: Array<{
        id: string;
        name: string;
        endpoint: string;
        method: string;
        params: Record<string, any>;
      }>;
      triggers?: Array<{
        id: string;
        name: string;
        type: 'webhook' | 'polling' | 'event';
        config: Record<string, any>;
      }>;
      rateLimits?: {
        requestsPerSecond?: number;
        requestsPerMinute?: number;
        dailyLimit?: number;
      };
    }>().notNull(),
    
    // Metadata for ALL application connectors
    version: text('version').default('1.0.0').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    popularity: integer('popularity').default(0).notNull(),
    
    // PII and security metadata for ALL applications
    handlesPersonalData: boolean('handles_personal_data').default(false).notNull(),
    securityLevel: text('security_level').default('standard').notNull(),
    complianceFlags: text('compliance_flags').array(),
    
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Performance indexes for connector discovery
    slugIdx: uniqueIndex('connectors_slug_idx').on(table.slug),
    categoryIdx: index('connectors_category_idx').on(table.category),
    activeIdx: index('connectors_active_idx').on(table.isActive),
    popularityIdx: index('connectors_popularity_idx').on(table.popularity),
    
    // Security and compliance indexes for ALL applications
    piiIdx: index('connectors_pii_idx').on(table.handlesPersonalData),
    securityLevelIdx: index('connectors_security_level_idx').on(table.securityLevel),
  })
);

// Sessions table for secure authentication across ALL applications
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    token: text('token').notNull().unique(), // JWT token
    refreshToken: text('refresh_token').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    lastUsed: timestamp('last_used').defaultNow().notNull(),
    isActive: boolean('is_active').default(true).notNull(), // Active session flag
    
    // Security tracking for ALL applications
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    isRevoked: boolean('is_revoked').default(false).notNull(),
    revokedAt: timestamp('revoked_at'),
    revokeReason: text('revoke_reason'),
  },
  (table) => ({
    // Performance and security indexes
    userIdx: index('sessions_user_idx').on(table.userId),
    refreshTokenIdx: uniqueIndex('sessions_refresh_token_idx').on(table.refreshToken),
    expiresAtIdx: index('sessions_expires_at_idx').on(table.expiresAt),
    activeSessionsIdx: index('sessions_active_idx').on(table.isRevoked, table.expiresAt),
  })
);

// Define relations between tables
export const usersRelations = relations(users, ({ many }) => ({
  connections: many(connections),
  workflows: many(workflows),
  workflowExecutions: many(workflowExecutions),
  usageTracking: many(usageTracking),
  sessions: many(sessions),
}));

export const connectionsRelations = relations(connections, ({ one }) => ({
  user: one(users, { fields: [connections.userId], references: [users.id] }),
}));

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  user: one(users, { fields: [workflows.userId], references: [users.id] }),
  executions: many(workflowExecutions),
}));

export const workflowExecutionsRelations = relations(workflowExecutions, ({ one }) => ({
  workflow: one(workflows, { fields: [workflowExecutions.workflowId], references: [workflows.id] }),
  user: one(users, { fields: [workflowExecutions.userId], references: [users.id] }),
}));

export const usageTrackingRelations = relations(usageTracking, ({ one }) => ({
  user: one(users, { fields: [usageTracking.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

// Database connection
const connectionString = process.env.DATABASE_URL;

let db: any = null;

if (!connectionString) {
  // In development, log a warning but don't crash
  if (process.env.NODE_ENV === 'development') {
    console.warn('⚠️ DATABASE_URL not set - database features will be disabled in development');
    db = null;
  } else {
    throw new Error('DATABASE_URL environment variable is required');
  }
} else {
  const sql = neon(connectionString);
  db = drizzle(sql, {
    schema: {
      users,
      connections,
      workflows,
      workflowExecutions,
      usageTracking,
      connectorDefinitions,
      sessions,
      usersRelations,
      connectionsRelations,
      workflowsRelations,
      workflowExecutionsRelations,
      usageTrackingRelations,
      sessionsRelations,
    },
  });
}

export { db };

console.log('✅ Database schema loaded with comprehensive indexes and PII tracking for ALL applications');