import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  json,
  jsonb,
  uuid,
  index,
  uniqueIndex,
  serial,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import type { WorkflowTimerPayload } from '../types/workflowTimers';

export type OrganizationPlan = 'starter' | 'professional' | 'enterprise' | 'enterprise_plus';
export type OrganizationStatus = 'active' | 'suspended' | 'trial' | 'churned';

export interface OrganizationLimits {
  maxWorkflows: number;
  maxExecutions: number;
  maxUsers: number;
  maxStorage: number;
  maxConcurrentExecutions: number;
  maxExecutionsPerMinute: number;
}

export interface OrganizationUsageMetrics {
  workflowExecutions: number;
  apiCalls: number;
  storageUsed: number;
  usersActive: number;
  llmTokens?: number;
  llmCostUSD?: number;
  concurrentExecutions?: number;
  executionsInCurrentWindow?: number;
}

export interface OrganizationFeatureFlags {
  ssoEnabled: boolean;
  auditLogging: boolean;
  customBranding: boolean;
  advancedAnalytics: boolean;
  prioritySupport: boolean;
  customIntegrations: boolean;
  onPremiseDeployment: boolean;
  dedicatedInfrastructure: boolean;
}

export interface OrganizationSecuritySettings {
  ipWhitelist: string[];
  allowedDomains: string[];
  allowedIpRanges: string[];
  mfaRequired: boolean;
  sessionTimeout: number;
  passwordPolicy: {
    minLength: number;
    requireSpecialChars: boolean;
    requireNumbers: boolean;
    requireUppercase: boolean;
  };
  apiKeyRotationDays: number;
}

export interface OrganizationBranding {
  logoUrl?: string;
  primaryColor?: string;
  customDomain?: string;
  companyName: string;
  supportEmail: string;
}

export interface OrganizationComplianceSettings {
  gdprEnabled: boolean;
  hipaaCompliant: boolean;
  soc2Type2: boolean;
  dataResidency: 'us' | 'eu' | 'asia' | 'global';
  retentionPolicyDays: number;
}

export type WorkflowVersionState = 'draft' | 'published';
export type WorkflowEnvironment = 'dev' | 'stage' | 'prod';

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
    emailVerified: boolean('email_verified').default(false).notNull(),
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
    emailVerifiedIdx: index('users_email_verified_idx').on(table.emailVerified, table.isActive),
    activeUsersIdx: index('users_active_idx').on(table.isActive, table.plan),
    quotaResetIdx: index('users_quota_reset_idx').on(table.quotaResetDate),
  })
);

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    domain: text('domain'),
    subdomain: text('subdomain').notNull(),
    plan: text('plan').notNull().default('starter'),
    status: text('status').notNull().default('trial'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    trialEndsAt: timestamp('trial_ends_at'),
    billing: json('billing').$type<{
      customerId: string;
      subscriptionId: string;
      currentPeriodStart: string;
      currentPeriodEnd: string;
      usage: OrganizationUsageMetrics;
      limits: OrganizationLimits;
    }>().notNull(),
    features: json('features').$type<OrganizationFeatureFlags>().notNull(),
    security: json('security').$type<OrganizationSecuritySettings>().notNull(),
    branding: json('branding').$type<OrganizationBranding>().notNull(),
    compliance: json('compliance').$type<OrganizationComplianceSettings>().notNull(),
  },
  (table) => ({
    domainIdx: index('organizations_domain_idx').on(table.domain),
    subdomainIdx: uniqueIndex('organizations_subdomain_idx').on(table.subdomain),
    planIdx: index('organizations_plan_idx').on(table.plan),
    statusIdx: index('organizations_status_idx').on(table.status),
    createdAtIdx: index('organizations_created_at_idx').on(table.createdAt),
  })
);

export const organizationMembers = pgTable(
  'organization_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    email: text('email').notNull(),
    role: text('role').notNull().default('member'),
    status: text('status').notNull().default('invited'),
    permissions: json('permissions').$type<{
      canCreateWorkflows: boolean;
      canEditWorkflows: boolean;
      canDeleteWorkflows: boolean;
      canManageUsers: boolean;
      canViewAnalytics: boolean;
      canManageBilling: boolean;
      canAccessApi: boolean;
    }>().notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    mfaEnabled: boolean('mfa_enabled').default(false).notNull(),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    invitedAt: timestamp('invited_at').defaultNow(),
    joinedAt: timestamp('joined_at'),
    lastActiveAt: timestamp('last_active_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    organizationUserIdx: uniqueIndex('organization_members_org_user_idx').on(table.organizationId, table.userId),
    organizationEmailIdx: index('organization_members_org_email_idx').on(table.organizationId, table.email),
    defaultMemberIdx: index('organization_members_default_idx').on(table.userId, table.isDefault),
    membershipStatusIdx: index('organization_members_status_idx').on(table.status),
  })
);

export const organizationRoleAssignments = pgTable(
  'organization_role_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    role: text('role').notNull(),
    grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    organizationUserIdx: uniqueIndex('organization_role_assignments_org_user_idx').on(table.organizationId, table.userId),
    organizationIdx: index('organization_role_assignments_org_idx').on(table.organizationId),
    userIdx: index('organization_role_assignments_user_idx').on(table.userId),
  })
);

export const organizationInvites = pgTable(
  'organization_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
    email: text('email').notNull(),
    role: text('role').notNull().default('member'),
    status: text('status').notNull().default('pending'),
    token: text('token').notNull(),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    organizationEmailIdx: index('organization_invites_email_idx').on(table.organizationId, table.email),
    tokenIdx: uniqueIndex('organization_invites_token_idx').on(table.token),
    inviteStatusIdx: index('organization_invites_status_idx').on(table.status),
  })
);

export const organizationQuotas = pgTable(
  'organization_quotas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
    billingPeriodStart: timestamp('billing_period_start').defaultNow().notNull(),
    billingPeriodEnd: timestamp('billing_period_end').notNull(),
    limits: json('limits').$type<OrganizationLimits>().notNull(),
    usage: json('usage').$type<OrganizationUsageMetrics>().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    organizationIdx: index('organization_quotas_org_idx').on(table.organizationId),
    billingPeriodIdx: index('organization_quotas_period_idx').on(table.organizationId, table.billingPeriodEnd),
  })
);

export const organizationExecutionCounters = pgTable(
  'organization_execution_counters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
    runningExecutions: integer('running_executions').default(0).notNull(),
    windowStart: timestamp('window_start').defaultNow().notNull(),
    executionsInWindow: integer('executions_in_window').default(0).notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    organizationIdx: uniqueIndex('org_exec_counters_org_idx').on(table.organizationId),
  })
);

export const organizationExecutionQuotaAudit = pgTable(
  'organization_execution_quota_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
    eventType: text('event_type').notNull(),
    limitValue: integer('limit_value').notNull(),
    observedValue: integer('observed_value').notNull(),
    windowCount: integer('window_count'),
    windowStart: timestamp('window_start'),
    metadata: jsonb('metadata').$type<Record<string, any> | null>().default(null),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    organizationIdx: index('org_exec_quota_audit_org_idx').on(table.organizationId),
    createdIdx: index('org_exec_quota_audit_created_idx').on(table.createdAt),
  })
);

export const tenantIsolations = pgTable(
  'tenant_isolations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
    dataNamespace: text('data_namespace').notNull(),
    storagePrefix: text('storage_prefix').notNull(),
    cachePrefix: text('cache_prefix').notNull(),
    logPrefix: text('log_prefix').notNull(),
    metricsPrefix: text('metrics_prefix').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    organizationIsolationIdx: uniqueIndex('tenant_isolations_org_idx').on(table.organizationId),
  })
);

export type EncryptionKeyStatus = 'active' | 'rotating' | 'retired';

export const encryptionKeys = pgTable(
  'encryption_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    keyId: text('key_id').notNull(),
    kmsKeyArn: text('kms_key_arn'),
    alias: text('alias'),
    derivedKey: text('derived_key').notNull(),
    status: text('status').notNull().default('active'),
    metadata: jsonb('metadata').$type<Record<string, any> | null>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    activatedAt: timestamp('activated_at'),
    rotatedAt: timestamp('rotated_at'),
    expiresAt: timestamp('expires_at'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    keyIdIdx: uniqueIndex('encryption_keys_key_id_idx').on(table.keyId),
    statusIdx: index('encryption_keys_status_idx').on(table.status),
    aliasIdx: index('encryption_keys_alias_idx').on(table.alias),
  })
);

export type EncryptionRotationJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'completed_with_errors'
  | 'failed';

export const encryptionRotationJobs = pgTable(
  'encryption_rotation_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    targetKeyId: uuid('target_key_id').references(() => encryptionKeys.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('pending'),
    totalConnections: integer('total_connections').default(0).notNull(),
    processed: integer('processed').default(0).notNull(),
    failed: integer('failed').default(0).notNull(),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    lastError: text('last_error'),
    metadata: jsonb('metadata').$type<Record<string, any> | null>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index('encryption_rotation_jobs_status_idx').on(table.status),
    targetKeyIdx: index('encryption_rotation_jobs_target_key_idx').on(table.targetKeyId),
  })
);

// Connections table with security indexes for ALL applications
export const connections = pgTable(
  'connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    provider: text('provider').notNull(), // gemini, openai, claude, slack, hubspot, jira, etc.
    type: text('type').default('saas').notNull(),
    encryptedCredentials: text('encrypted_credentials').notNull(),
    iv: text('iv').notNull(), // AES-256-GCM IV
    encryptionKeyId: uuid('encryption_key_id')
      .references(() => encryptionKeys.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    lastUsed: timestamp('last_used'),
    lastTested: timestamp('last_tested'),
    testStatus: text('test_status'),
    testError: text('test_error'),
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
    userProviderIdx: index('connections_user_provider_idx').on(
      table.organizationId,
      table.userId,
      table.provider,
    ),
    providerIdx: index('connections_provider_idx').on(table.provider),
    activeIdx: index('connections_active_idx').on(table.isActive),
    lastUsedIdx: index('connections_last_used_idx').on(table.lastUsed),
    
    // Security indexes for PII tracking across ALL applications
    piiIdx: index('connections_pii_idx').on(table.containsPii, table.piiType),
    securityLevelIdx: index('connections_security_level_idx').on(table.securityLevel),
    encryptionKeyIdx: index('connections_encryption_key_idx').on(table.encryptionKeyId),
    
    // Unique constraint to prevent duplicate connections
    userProviderNameIdx: uniqueIndex('connections_user_provider_name_idx').on(
      table.organizationId,
      table.userId,
      table.provider,
      table.name,
    ),
  })
);

export const connectionScopedTokens = pgTable(
  'connection_scoped_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    connectionId: uuid('connection_id')
      .references(() => connections.id, { onDelete: 'cascade' })
      .notNull(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    tokenHash: text('token_hash').notNull(),
    scope: jsonb('scope').$type<Record<string, any> | null>(),
    stepId: text('step_id').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
    metadata: jsonb('metadata').$type<Record<string, any> | null>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    tokenHashIdx: uniqueIndex('connection_scoped_tokens_hash_idx').on(table.tokenHash),
    expiresIdx: index('connection_scoped_tokens_expires_idx').on(table.expiresAt),
    connectionIdx: index('connection_scoped_tokens_connection_idx').on(table.connectionId),
    activeTokenIdx: index('connection_scoped_tokens_active_idx').on(table.usedAt),
  })
);

// Workflows table with indexes for ALL application types
export const workflows = pgTable(
  'workflows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
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
    userIdx: index('workflows_user_idx').on(table.organizationId, table.userId),
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
    userActiveIdx: index('workflows_user_active_idx').on(table.organizationId, table.userId, table.isActive),
    userCategoryIdx: index('workflows_user_category_idx').on(table.organizationId, table.userId, table.category),
  })
);

export const workflowVersions = pgTable(
  'workflow_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowId: uuid('workflow_id')
      .references(() => workflows.id, { onDelete: 'cascade' })
      .notNull(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    versionNumber: integer('version_number').notNull(),
    state: text('state').notNull().default('draft'),
    graph: jsonb('graph').$type<Record<string, any>>().notNull(),
    metadata: jsonb('metadata').$type<Record<string, any> | null>().default(null),
    name: text('name'),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at'),
    publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => ({
    workflowVersionIdx: uniqueIndex('workflow_versions_unique_version').on(
      table.workflowId,
      table.versionNumber,
    ),
    workflowStateIdx: index('workflow_versions_workflow_state_idx').on(table.workflowId, table.state),
  })
);

export const workflowDeployments = pgTable(
  'workflow_deployments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowId: uuid('workflow_id')
      .references(() => workflows.id, { onDelete: 'cascade' })
      .notNull(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    versionId: uuid('version_id')
      .references(() => workflowVersions.id, { onDelete: 'cascade' })
      .notNull(),
    environment: text('environment').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    deployedAt: timestamp('deployed_at').defaultNow().notNull(),
    deployedBy: uuid('deployed_by').references(() => users.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata').$type<Record<string, any> | null>().default(null),
    rollbackOf: uuid('rollback_of').references(() => workflowDeployments.id, { onDelete: 'set null' }),
  },
  (table) => ({
    workflowIdx: index('workflow_deployments_workflow_idx').on(table.workflowId),
    environmentIdx: index('workflow_deployments_environment_idx').on(table.workflowId, table.environment),
  })
);

// Workflow executions table with comprehensive tracking for ALL applications
export const workflowExecutions = pgTable(
  'workflow_executions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
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
    workflowIdx: index('executions_workflow_idx').on(table.organizationId, table.workflowId),
    userIdx: index('executions_user_idx').on(table.organizationId, table.userId),
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
    workflowTimeIdx: index('executions_workflow_time_idx').on(table.organizationId, table.workflowId, table.startedAt),
    statusTimeIdx: index('executions_status_time_idx').on(table.status, table.startedAt),
  })
);

export const nodeExecutionResults = pgTable(
  'node_execution_results',
  {
    id: serial('id').primaryKey(),
    executionId: text('execution_id').notNull(),
    nodeId: text('node_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    resultHash: text('result_hash').notNull(),
    resultData: jsonb('result_data').$type<any>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
  },
  (table) => ({
    executionLookupIdx: uniqueIndex('node_execution_results_execution_idx').on(
      table.executionId,
      table.nodeId,
      table.idempotencyKey
    ),
    expiryIdx: index('node_execution_results_expiry_idx').on(table.expiresAt),
  })
);

export const executionLogs = pgTable(
  'execution_logs',
  {
    executionId: text('execution_id').notNull(),
    workflowId: text('workflow_id').notNull(),
    workflowName: text('workflow_name'),
    userId: text('user_id'),
    status: text('status').notNull(),
    startTime: timestamp('start_time', { withTimezone: true }).defaultNow().notNull(),
    endTime: timestamp('end_time', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    triggerType: text('trigger_type'),
    triggerData: jsonb('trigger_data'),
    finalOutput: jsonb('final_output'),
    error: text('error'),
    totalNodes: integer('total_nodes').notNull().default(0),
    completedNodes: integer('completed_nodes').notNull().default(0),
    failedNodes: integer('failed_nodes').notNull().default(0),
    correlationId: text('correlation_id'),
    tags: text('tags').array(),
    metadata: jsonb('metadata'),
    timeline: jsonb('timeline'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.executionId], name: 'execution_logs_execution_id_pk' }),
    workflowIdx: index('execution_logs_workflow_idx').on(table.workflowId),
    statusIdx: index('execution_logs_status_idx').on(table.status),
    startTimeIdx: index('execution_logs_start_time_idx').on(table.startTime),
    correlationIdx: index('execution_logs_correlation_idx').on(table.correlationId),
  })
);

export const nodeLogs = pgTable(
  'node_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    executionId: text('execution_id')
      .references(() => executionLogs.executionId, { onDelete: 'cascade' })
      .notNull(),
    nodeId: text('node_id').notNull(),
    nodeType: text('node_type'),
    nodeLabel: text('node_label'),
    status: text('status').notNull(),
    attempt: integer('attempt').notNull().default(1),
    maxAttempts: integer('max_attempts').notNull().default(1),
    startTime: timestamp('start_time', { withTimezone: true }).defaultNow().notNull(),
    endTime: timestamp('end_time', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    input: jsonb('input'),
    output: jsonb('output'),
    error: text('error'),
    correlationId: text('correlation_id'),
    retryHistory: jsonb('retry_history'),
    metadata: jsonb('metadata'),
    timeline: jsonb('timeline'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    executionIdx: index('node_logs_execution_idx').on(table.executionId),
    executionNodeUnique: uniqueIndex('node_logs_execution_node_unique').on(table.executionId, table.nodeId),
    statusIdx: index('node_logs_status_idx').on(table.status),
    startTimeIdx: index('node_logs_start_time_idx').on(table.startTime),
  })
);

export const workflowTimers = pgTable(
  'workflow_timers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    executionId: uuid('execution_id')
      .references(() => workflowExecutions.id, { onDelete: 'cascade' })
      .notNull(),
    resumeAt: timestamp('resume_at').notNull(),
    payload: json('payload').$type<WorkflowTimerPayload>().notNull(),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    dispatchedAt: timestamp('dispatched_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    lastError: text('last_error'),
  },
  (table) => ({
    resumeAtIdx: index('workflow_timers_resume_at_idx').on(table.resumeAt),
    statusIdx: index('workflow_timers_status_idx').on(table.status),
    executionIdx: index('workflow_timers_execution_idx').on(table.executionId),
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
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
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
        requestsPerHour?: number;
        requestsPerDay?: number;
        dailyLimit?: number;
        burstLimit?: number;
        concurrency?: {
          maxConcurrentRequests?: number;
          scope?: 'connection' | 'connector' | 'organization';
        };
        headers?: {
          limit?: string[];
          remaining?: string[];
          reset?: string[];
          retryAfter?: string[];
        };
      };
      concurrency?: {
        maxConcurrentRequests?: number;
        scope?: 'connection' | 'connector' | 'organization';
      };
      rateLimitHeaders?: {
        limit?: string[];
        remaining?: string[];
        reset?: string[];
        retryAfter?: string[];
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

export const organizationConnectorEntitlements = pgTable(
  'organization_connector_entitlements',
  {
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    connectorId: text('connector_id').notNull(),
    isEnabled: boolean('is_enabled').default(false).notNull(),
    enabledAt: timestamp('enabled_at'),
    disabledAt: timestamp('disabled_at'),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata').$type<Record<string, any> | null>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.organizationId, table.connectorId] }),
    organizationIdx: index('org_connector_entitlements_org_idx').on(table.organizationId),
    connectorIdx: index('org_connector_entitlements_connector_idx').on(table.connectorId),
    enabledIdx: index('org_connector_entitlements_enabled_idx').on(table.isEnabled),
  })
);

export const organizationConnectorEntitlementAudit = pgTable(
  'organization_connector_entitlement_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    connectorId: text('connector_id').notNull(),
    action: text('action').notNull(),
    performedBy: uuid('performed_by').references(() => users.id, { onDelete: 'set null' }),
    reason: text('reason'),
    metadata: jsonb('metadata').$type<Record<string, any> | null>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    organizationIdx: index('org_connector_audit_org_idx').on(table.organizationId),
    connectorIdx: index('org_connector_audit_connector_idx').on(table.connectorId),
    actionIdx: index('org_connector_audit_action_idx').on(table.action),
  })
);

// Sessions table for secure authentication across ALL applications
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
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
    organizationIdx: index('sessions_org_idx').on(table.organizationId),
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
  organizationMemberships: many(organizationMembers),
}));

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
  members: many(organizationMembers),
  invites: many(organizationInvites),
  quotas: many(organizationQuotas),
  tenantIsolation: one(tenantIsolations),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, { fields: [organizationMembers.organizationId], references: [organizations.id] }),
  user: one(users, { fields: [organizationMembers.userId], references: [users.id] }),
}));

export const organizationInvitesRelations = relations(organizationInvites, ({ one }) => ({
  organization: one(organizations, { fields: [organizationInvites.organizationId], references: [organizations.id] }),
  invitedByUser: one(users, { fields: [organizationInvites.invitedBy], references: [users.id] }),
}));

export const organizationQuotasRelations = relations(organizationQuotas, ({ one }) => ({
  organization: one(organizations, { fields: [organizationQuotas.organizationId], references: [organizations.id] }),
}));

export const organizationExecutionCountersRelations = relations(organizationExecutionCounters, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationExecutionCounters.organizationId],
    references: [organizations.id],
  }),
}));

export const organizationExecutionQuotaAuditRelations = relations(
  organizationExecutionQuotaAudit,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationExecutionQuotaAudit.organizationId],
      references: [organizations.id],
    }),
  })
);

export const tenantIsolationsRelations = relations(tenantIsolations, ({ one }) => ({
  organization: one(organizations, { fields: [tenantIsolations.organizationId], references: [organizations.id] }),
}));

export const encryptionKeysRelations = relations(encryptionKeys, ({ many }) => ({
  connections: many(connections),
  rotationJobs: many(encryptionRotationJobs),
}));

export const encryptionRotationJobsRelations = relations(encryptionRotationJobs, ({ one }) => ({
  targetKey: one(encryptionKeys, {
    fields: [encryptionRotationJobs.targetKeyId],
    references: [encryptionKeys.id],
  }),
}));

export const connectionsRelations = relations(connections, ({ one, many }) => ({
  user: one(users, { fields: [connections.userId], references: [users.id] }),
  organization: one(organizations, {
    fields: [connections.organizationId],
    references: [organizations.id],
  }),
  encryptionKey: one(encryptionKeys, {
    fields: [connections.encryptionKeyId],
    references: [encryptionKeys.id],
  }),
  scopedTokens: many(connectionScopedTokens),
}));

export const connectionScopedTokensRelations = relations(connectionScopedTokens, ({ one }) => ({
  connection: one(connections, {
    fields: [connectionScopedTokens.connectionId],
    references: [connections.id],
  }),
  organization: one(organizations, {
    fields: [connectionScopedTokens.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [connectionScopedTokens.createdBy],
    references: [users.id],
  }),
}));

export const workflowsRelations = relations(workflows, ({ one, many }) => ({
  user: one(users, { fields: [workflows.userId], references: [users.id] }),
  organization: one(organizations, { fields: [workflows.organizationId], references: [organizations.id] }),
  executions: many(workflowExecutions),
  versions: many(workflowVersions),
  deployments: many(workflowDeployments),
}));

export const workflowVersionsRelations = relations(workflowVersions, ({ one, many }) => ({
  workflow: one(workflows, { fields: [workflowVersions.workflowId], references: [workflows.id] }),
  organization: one(organizations, {
    fields: [workflowVersions.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, { fields: [workflowVersions.createdBy], references: [users.id] }),
  publishedByUser: one(users, { fields: [workflowVersions.publishedBy], references: [users.id] }),
  deployments: many(workflowDeployments),
}));

export const workflowDeploymentsRelations = relations(workflowDeployments, ({ one }) => ({
  workflow: one(workflows, { fields: [workflowDeployments.workflowId], references: [workflows.id] }),
  organization: one(organizations, {
    fields: [workflowDeployments.organizationId],
    references: [organizations.id],
  }),
  version: one(workflowVersions, { fields: [workflowDeployments.versionId], references: [workflowVersions.id] }),
  deployedByUser: one(users, { fields: [workflowDeployments.deployedBy], references: [users.id] }),
  rollbackOfDeployment: one(workflowDeployments, {
    fields: [workflowDeployments.rollbackOf],
    references: [workflowDeployments.id],
  }),
}));

export const workflowExecutionsRelations = relations(workflowExecutions, ({ one, many }) => ({
  workflow: one(workflows, { fields: [workflowExecutions.workflowId], references: [workflows.id] }),
  user: one(users, { fields: [workflowExecutions.userId], references: [users.id] }),
  organization: one(organizations, { fields: [workflowExecutions.organizationId], references: [organizations.id] }),
  timers: many(workflowTimers),
}));

export const executionLogsRelations = relations(executionLogs, ({ many }) => ({
  nodes: many(nodeLogs),
}));

export const nodeLogsRelations = relations(nodeLogs, ({ one }) => ({
  execution: one(executionLogs, { fields: [nodeLogs.executionId], references: [executionLogs.executionId] }),
}));

export const workflowTimersRelations = relations(workflowTimers, ({ one }) => ({
  execution: one(workflowExecutions, { fields: [workflowTimers.executionId], references: [workflowExecutions.id] }),
}));

export const usageTrackingRelations = relations(usageTracking, ({ one }) => ({
  user: one(users, { fields: [usageTracking.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
  organization: one(organizations, { fields: [sessions.organizationId], references: [organizations.id] }),
}));

export const organizationConnectorEntitlementsRelations = relations(
  organizationConnectorEntitlements,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationConnectorEntitlements.organizationId],
      references: [organizations.id],
    }),
    updatedByUser: one(users, {
      fields: [organizationConnectorEntitlements.updatedBy],
      references: [users.id],
    }),
  })
);

export const organizationConnectorEntitlementAuditRelations = relations(
  organizationConnectorEntitlementAudit,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [organizationConnectorEntitlementAudit.organizationId],
      references: [organizations.id],
    }),
    performedByUser: one(users, {
      fields: [organizationConnectorEntitlementAudit.performedBy],
      references: [users.id],
    }),
  })
);

// Webhook logs table for trigger event tracking
export const webhookLogs = pgTable(
  'webhook_logs',
  {
    id: text('id').primaryKey(),
    webhookId: text('webhook_id').notNull(),
    workflowId: text('workflow_id').notNull(),
    appId: text('app_id').notNull(),
    triggerId: text('trigger_id').notNull(),
    payload: json('payload').$type<any>(),
    headers: json('headers').$type<Record<string, string>>(),
    timestamp: timestamp('timestamp').defaultNow().notNull(),
    signature: text('signature'),
    processed: boolean('processed').default(false).notNull(),
    source: text('source').default('webhook').notNull(),
    dedupeToken: text('dedupe_token'),
    executionId: text('execution_id'),
    error: text('error'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    webhookIdIdx: index('webhook_logs_webhook_id_idx').on(table.webhookId),
    appTriggerIdx: index('webhook_logs_app_trigger_idx').on(table.appId, table.triggerId),
    timestampIdx: index('webhook_logs_timestamp_idx').on(table.timestamp),
    processedIdx: index('webhook_logs_processed_idx').on(table.processed),
    workflowIdx: index('webhook_logs_workflow_idx').on(table.workflowId),
    sourceIdx: index('webhook_logs_source_idx').on(table.source),
    dedupeIdx: index('webhook_logs_dedupe_idx').on(table.dedupeToken),
  })
);

export const webhookDedupe = pgTable(
  'webhook_dedupe',
  {
    triggerId: text('trigger_id').notNull(),
    token: text('token').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.triggerId, table.token], name: 'webhook_dedupe_pk' }),
    triggerIdx: index('webhook_dedupe_trigger_idx').on(table.triggerId),
    createdIdx: index('webhook_dedupe_created_idx').on(table.createdAt),
  })
);

// Polling triggers table for scheduled trigger tracking
export const pollingTriggers = pgTable(
  'polling_triggers',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id').notNull(),
    appId: text('app_id').notNull(),
    triggerId: text('trigger_id').notNull(),
    interval: integer('interval').notNull(), // seconds
    lastPoll: timestamp('last_poll'),
    nextPoll: timestamp('next_poll').notNull(),
    nextPollAt: timestamp('next_poll_at').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    dedupeKey: text('dedupe_key'),
    metadata: json('metadata').$type<Record<string, any>>(),
    cursor: json('cursor').$type<Record<string, any> | null>(),
    backoffCount: integer('backoff_count').default(0).notNull(),
    lastStatus: text('last_status'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    workflowIdIdx: index('polling_triggers_workflow_id_idx').on(table.workflowId),
    appTriggerIdx: index('polling_triggers_app_trigger_idx').on(table.appId, table.triggerId),
    nextPollIdx: index('polling_triggers_next_poll_idx').on(table.nextPoll),
    nextPollAtIdx: index('polling_triggers_next_poll_at_idx').on(table.nextPollAt),
    activeIdx: index('polling_triggers_active_idx').on(table.isActive),
  })
);

// Workflow triggers table for persisted trigger metadata
export const workflowTriggers = pgTable(
  'workflow_triggers',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id').notNull(),
    type: text('type').notNull(),
    appId: text('app_id').notNull(),
    triggerId: text('trigger_id').notNull(),
    endpoint: text('endpoint'),
    secret: text('secret'),
    metadata: json('metadata').$type<Record<string, any>>(),
    dedupeState: json('dedupe_state').$type<{ tokens?: string[]; updatedAt?: string }>(),
    isActive: boolean('is_active').default(true).notNull(),
    lastSyncedAt: timestamp('last_synced_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    workflowIdx: index('workflow_triggers_workflow_idx').on(table.workflowId),
    appTriggerIdx: index('workflow_triggers_app_trigger_idx').on(table.appId, table.triggerId),
    typeIdx: index('workflow_triggers_type_idx').on(table.type),
    activeIdx: index('workflow_triggers_active_idx').on(table.isActive),
  })
);

// Database connection
const connectionString = process.env.DATABASE_URL;

let db: any = null;

if (!connectionString) {
  const environment = process.env.NODE_ENV ?? 'development';
  // In development or test environments, log a warning but don't crash
  if (environment === 'development' || environment === 'test') {
    console.warn('⚠️ DATABASE_URL not set - database features will be disabled in development/test environments');
    db = null;
  } else {
    throw new Error('DATABASE_URL environment variable is required');
  }
} else {
  const sql = neon(connectionString);
  db = drizzle(sql, {
    schema: {
      users,
      organizations,
      organizationMembers,
      organizationInvites,
      organizationQuotas,
      organizationExecutionCounters,
      organizationExecutionQuotaAudit,
      tenantIsolations,
      connections,
      encryptionKeys,
      encryptionRotationJobs,
      connectionScopedTokens,
      workflows,
      workflowExecutions,
      nodeExecutionResults,
      executionLogs,
      nodeLogs,
      workflowTimers,
      usageTracking,
      connectorDefinitions,
      organizationConnectorEntitlements,
      organizationConnectorEntitlementAudit,
      sessions,
      usersRelations,
      organizationsRelations,
      organizationMembersRelations,
      organizationInvitesRelations,
      organizationQuotasRelations,
      organizationExecutionCountersRelations,
      organizationExecutionQuotaAuditRelations,
      tenantIsolationsRelations,
      encryptionKeysRelations,
      encryptionRotationJobsRelations,
      connectionsRelations,
      connectionScopedTokensRelations,
      workflowsRelations,
      workflowExecutionsRelations,
      executionLogsRelations,
      nodeLogsRelations,
      workflowTimersRelations,
      usageTrackingRelations,
      organizationConnectorEntitlementsRelations,
      organizationConnectorEntitlementAuditRelations,
      sessionsRelations,
      webhookLogs,
      pollingTriggers,
      workflowTriggers,
    },
  });
}


export function setDatabaseClientForTests(databaseClient: any): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setDatabaseClientForTests should only be used in test environment');
  }

  db = databaseClient;
}

export { db };

console.log('✅ Database schema loaded with comprehensive indexes and PII tracking for ALL applications');