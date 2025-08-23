import { pgTable, text, timestamp, boolean, integer, jsonb, uuid, varchar, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Users table - for authentication and tenant management
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: varchar('name', { length: 255 }),
  role: varchar('role', { length: 50 }).default('user'), // 'admin', 'user', 'trial'
  planType: varchar('plan_type', { length: 50 }).default('free'), // 'free', 'pro', 'enterprise'
  isActive: boolean('is_active').default(true),
  emailVerified: boolean('email_verified').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  lastLoginAt: timestamp('last_login_at'),
  
  // Usage tracking
  monthlyApiCalls: integer('monthly_api_calls').default(0),
  monthlyTokensUsed: integer('monthly_tokens_used').default(0),
  quotaApiCalls: integer('quota_api_calls').default(1000), // per month
  quotaTokens: integer('quota_tokens').default(100000), // per month
}, (table) => ({
  emailIdx: index('users_email_idx').on(table.email),
  planIdx: index('users_plan_idx').on(table.planType),
}));

// Encrypted API connections - secure storage for LLM and SaaS API keys
export const connections = pgTable('connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  
  // Connection details
  name: varchar('name', { length: 255 }).notNull(), // "My OpenAI Key", "Production Gemini"
  provider: varchar('provider', { length: 100 }).notNull(), // 'openai', 'gemini', 'claude', 'slack', 'gmail'
  type: varchar('type', { length: 50 }).notNull(), // 'llm', 'saas', 'database'
  
  // Encrypted credentials
  encryptedCredentials: text('encrypted_credentials').notNull(), // JSON encrypted with AES
  credentialsIv: text('credentials_iv').notNull(), // Initialization vector for encryption
  
  // Connection status
  isActive: boolean('is_active').default(true),
  lastTested: timestamp('last_tested'),
  testStatus: varchar('test_status', { length: 50 }), // 'success', 'failed', 'pending'
  testError: text('test_error'),
  
  // Metadata
  metadata: jsonb('metadata'), // Additional provider-specific config
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  userProviderIdx: index('connections_user_provider_idx').on(table.userId, table.provider),
  typeIdx: index('connections_type_idx').on(table.type),
}));

// Workflows - stored automation workflows
export const workflows = pgTable('workflows', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  
  // Workflow details
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 100 }), // 'email', 'crm', 'ecommerce', 'productivity'
  
  // Workflow definition
  nodeGraph: jsonb('node_graph').notNull(), // Complete NodeGraph JSON
  generatedCode: text('generated_code'), // Generated Google Apps Script
  
  // Status and deployment
  status: varchar('status', { length: 50 }).default('draft'), // 'draft', 'active', 'paused', 'error'
  isPublic: boolean('is_public').default(false), // For template sharing
  deploymentId: text('deployment_id'), // Google Apps Script deployment ID
  webAppUrl: text('web_app_url'), // If deployed as web app
  
  // Execution tracking
  totalRuns: integer('total_runs').default(0),
  successfulRuns: integer('successful_runs').default(0),
  lastRun: timestamp('last_run'),
  lastError: text('last_error'),
  
  // Metadata
  tags: jsonb('tags'), // Array of tags
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  userIdx: index('workflows_user_idx').on(table.userId),
  statusIdx: index('workflows_status_idx').on(table.status),
  categoryIdx: index('workflows_category_idx').on(table.category),
  publicIdx: index('workflows_public_idx').on(table.isPublic),
}));

// Workflow executions - detailed execution logs
export const workflowExecutions = pgTable('workflow_executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  
  // Execution details
  correlationId: varchar('correlation_id', { length: 100 }).notNull(), // For tracing
  status: varchar('status', { length: 50 }).notNull(), // 'running', 'success', 'failed', 'timeout'
  
  // Timing
  startedAt: timestamp('started_at').defaultNow(),
  completedAt: timestamp('completed_at'),
  durationMs: integer('duration_ms'),
  
  // Execution data
  triggerData: jsonb('trigger_data'), // Input data that triggered execution
  nodeResults: jsonb('node_results'), // Results from each node
  errorDetails: jsonb('error_details'), // Detailed error information
  
  // Resource usage
  tokensUsed: integer('tokens_used').default(0),
  apiCallsMade: integer('api_calls_made').default(0),
  
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  workflowIdx: index('executions_workflow_idx').on(table.workflowId),
  userIdx: index('executions_user_idx').on(table.userId),
  statusIdx: index('executions_status_idx').on(table.status),
  correlationIdx: index('executions_correlation_idx').on(table.correlationId),
}));

// Usage tracking - for billing and quotas
export const usageTracking = pgTable('usage_tracking', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  
  // Time period
  year: integer('year').notNull(),
  month: integer('month').notNull(), // 1-12
  
  // Usage metrics
  apiCalls: integer('api_calls').default(0),
  tokensUsed: integer('tokens_used').default(0),
  workflowRuns: integer('workflow_runs').default(0),
  storageUsed: integer('storage_used').default(0), // in bytes
  
  // Cost tracking
  estimatedCost: integer('estimated_cost').default(0), // in cents
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  userPeriodIdx: index('usage_user_period_idx').on(table.userId, table.year, table.month),
}));

// Connector definitions - for the 500+ apps framework
export const connectorDefinitions = pgTable('connector_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Connector identity
  name: varchar('name', { length: 255 }).notNull(), // "Slack", "HubSpot", "Shopify"
  slug: varchar('slug', { length: 100 }).notNull().unique(), // "slack", "hubspot", "shopify"
  category: varchar('category', { length: 100 }).notNull(), // "communication", "crm", "ecommerce"
  
  // Connector metadata
  description: text('description'),
  iconUrl: text('icon_url'),
  websiteUrl: text('website_url'),
  documentationUrl: text('documentation_url'),
  
  // Technical details
  apiBaseUrl: text('api_base_url'),
  authType: varchar('auth_type', { length: 50 }).notNull(), // 'oauth2', 'api_key', 'basic'
  authConfig: jsonb('auth_config'), // OAuth endpoints, scopes, etc.
  
  // Connector definition
  triggers: jsonb('triggers'), // Available trigger types
  actions: jsonb('actions'), // Available action types
  rateLimits: jsonb('rate_limits'), // Rate limiting configuration
  
  // Status
  isActive: boolean('is_active').default(true),
  isVerified: boolean('is_verified').default(false), // Manually verified by team
  popularity: integer('popularity').default(0), // Usage count
  
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  slugIdx: index('connectors_slug_idx').on(table.slug),
  categoryIdx: index('connectors_category_idx').on(table.category),
  popularityIdx: index('connectors_popularity_idx').on(table.popularity),
}));

// Sessions - for JWT token management
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  
  token: text('token').notNull().unique(),
  refreshToken: text('refresh_token').notNull().unique(),
  
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  lastUsedAt: timestamp('last_used_at').defaultNow(),
  
  // Session metadata
  userAgent: text('user_agent'),
  ipAddress: varchar('ip_address', { length: 45 }), // IPv6 compatible
  isActive: boolean('is_active').default(true),
}, (table) => ({
  tokenIdx: index('sessions_token_idx').on(table.token),
  userIdx: index('sessions_user_idx').on(table.userId),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  connections: many(connections),
  workflows: many(workflows),
  executions: many(workflowExecutions),
  usage: many(usageTracking),
  sessions: many(sessions),
}));

export const connectionsRelations = relations(connections, ({ one }) => ({
  user: one(users, {
    fields: [connections.userId],
    references: [users.id],
  }),
}));

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  user: one(users, {
    fields: [workflows.userId],
    references: [users.id],
  }),
  executions: many(workflowExecutions),
}));

export const workflowExecutionsRelations = relations(workflowExecutions, ({ one }) => ({
  workflow: one(workflows, {
    fields: [workflowExecutions.workflowId],
    references: [workflows.id],
  }),
  user: one(users, {
    fields: [workflowExecutions.userId],
    references: [users.id],
  }),
}));

export const usageTrackingRelations = relations(usageTracking, ({ one }) => ({
  user: one(users, {
    fields: [usageTracking.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));