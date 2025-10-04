import { randomUUID } from 'node:crypto';
import { eq, and, gte, lte, sum, count } from 'drizzle-orm';
import { users, usageTracking, workflowExecutions, workflows, db } from '../database/schema';
import { organizationService } from './OrganizationService';
import { billingPlanService, type BillingPlanDefinition, type BillingPlanProvider } from './BillingPlanService';
import {
  billingProviderService,
  type MeteringEventType,
  type BillingProviderService as BillingProvider,
  type InvoiceAdjustment,
} from './BillingProviderService';

export interface UsageMetrics {
  userId: string;
  period: {
    year: number;
    month: number;
    startDate: Date;
    endDate: Date;
  };
  
  // API Usage
  apiCalls: number;
  tokensUsed: number;
  
  // Workflow Usage
  workflowRuns: number;
  workflowsCreated: number;
  
  // Storage Usage
  storageUsed: number; // bytes
  
  // Cost Tracking
  estimatedCost: number; // cents
  
  // Quotas
  quotas: {
    apiCalls: number;
    tokens: number;
    workflowRuns: number;
    storage: number;
  };
  
  // Usage percentages
  usage: {
    apiCallsPercent: number;
    tokensPercent: number;
    workflowRunsPercent: number;
    storagePercent: number;
  };
}

export interface QuotaCheck {
  hasQuota: boolean;
  quotaType?: 'api_calls' | 'tokens' | 'workflow_runs' | 'storage';
  current: number;
  limit: number;
  remaining: number;
  resetDate: Date;
}

export interface BillingPeriod {
  startDate: Date;
  endDate: Date;
  year: number;
  month: number;
}

export interface UsageAlert {
  userId: string;
  type: 'approaching_limit' | 'limit_exceeded' | 'unusual_usage';
  quotaType: string;
  threshold: number;
  current: number;
  limit: number;
  timestamp: Date;
}

export interface PlanLimits {
  code: string;
  name: string;
  apiCalls: number;
  tokens: number;
  workflowRuns: number;
  storage: number; // bytes
  priceCents: number; // cents per month
  currency: string;
  features: string[];
}

export interface UsageExportRow {
  userId: string;
  email: string;
  planCode: string;
  planName: string;
  apiCalls: number;
  tokensUsed: number;
  workflowRuns: number;
  storageUsed: number;
  estimatedCost: number;
}

export interface UsageExportResult {
  format: 'json' | 'csv';
  rows: UsageExportRow[];
  csv?: string;
  summary: {
    totalApiCalls: number;
    totalTokensUsed: number;
    totalWorkflowRuns: number;
    totalEstimatedCost: number;
    distinctUsers: number;
  };
  period: {
    startDate: Date;
    endDate: Date;
  };
}

interface UsageMeteringDependencies {
  planProvider?: BillingPlanProvider;
  billingProvider?: BillingProviderService;
  db?: typeof db;
  now?: () => Date;
}

export class UsageMeteringService {
  private readonly planProvider: BillingPlanProvider;
  private readonly billingProvider: BillingProvider;
  private readonly now: () => Date;
  private readonly planCacheTtlMs = 5 * 60 * 1000;
  private db: typeof db | null;
  private usageCache = new Map<string, UsageMetrics>();
  private cacheExpiry = new Map<string, number>();
  private plans = new Map<string, PlanLimits>();
  private plansExpireAt = 0;
  private plansLoading: Promise<void> | null = null;
  private reconciliationTimer: NodeJS.Timeout | null = null;

  constructor(dependencies: UsageMeteringDependencies = {}) {
    this.db = dependencies.db ?? db;
    this.planProvider = dependencies.planProvider ?? billingPlanService;
    this.billingProvider = dependencies.billingProvider ?? billingProviderService;
    this.now = dependencies.now ?? (() => new Date());

    if (!this.db && process.env.NODE_ENV !== 'development') {
      throw new Error('Database connection not available');
    }

    if (this.db) {
      this.startUsageTracking();
      this.scheduleInvoiceReconciliation();
    }
  }

  /**
   * Record API usage
   */
  public async recordApiUsage(
    userId: string,
    apiCalls: number = 1,
    tokensUsed: number = 0,
    cost: number = 0,
    organizationId?: string
  ): Promise<void> {
    if (!this.db) {
      throw new Error('Database connection not available');
    }

    const period = this.getCurrentBillingPeriod();
    const timestamp = this.now();

    try {
      // Update or insert usage record
      const existingUsage = await this.db
        .select()
        .from(usageTracking)
        .where(and(
          eq(usageTracking.userId, userId),
          eq(usageTracking.year, period.year),
          eq(usageTracking.month, period.month)
        ))
        .limit(1);

      if (existingUsage.length > 0) {
        // Update existing record
        await this.db
          .update(usageTracking)
          .set({
            apiCalls: existingUsage[0].apiCalls + apiCalls,
            tokensUsed: existingUsage[0].tokensUsed + tokensUsed,
            estimatedCost: existingUsage[0].estimatedCost + Math.round(cost * 100), // Convert to cents
            updatedAt: timestamp
          })
          .where(and(
            eq(usageTracking.userId, userId),
            eq(usageTracking.year, period.year),
            eq(usageTracking.month, period.month)
          ));
      } else {
        // Insert new record
        await this.db.insert(usageTracking).values({
          userId,
          year: period.year,
          month: period.month,
          apiCalls,
          tokensUsed,
          workflowRuns: 0,
          storageUsed: 0,
          estimatedCost: Math.round(cost * 100),
          createdAt: timestamp,
          updatedAt: timestamp
        });
      }

      // Update user's monthly counters
      await this.db
        .update(users)
        .set({
          monthlyApiCalls: users.monthlyApiCalls + apiCalls,
          monthlyTokensUsed: users.monthlyTokensUsed + tokensUsed,
          updatedAt: timestamp
        })
        .where(eq(users.id, userId));

      // Clear cache for this user
      this.clearUserCache(userId);

      if (organizationId) {
        await organizationService.recordUsage(organizationId, { apiCalls });
      }

      // Check for quota alerts
      await this.checkQuotaAlerts(userId);

      const user = await this.getUserWithUsage(userId);
      if (user) {
        const plan = await this.getPlanByCode(user.planType);
        await this.emitMeteringEvents(plan, userId, organizationId, [
          { type: 'api_calls', quantity: apiCalls },
          { type: 'tokens', quantity: tokensUsed },
        ]);
        await this.detectOverages(user, plan, organizationId);
      }

    } catch (error) {
      console.error('❌ Failed to record API usage:', error);
      throw error;
    }
  }

  /**
   * Record workflow execution
   */
  public async recordWorkflowExecution(
    userId: string,
    workflowId: string,
    success: boolean,
    tokensUsed: number = 0,
    apiCalls: number = 0
  ): Promise<void> {
    if (!this.db) {
      throw new Error('Database connection not available');
    }

    const period = this.getCurrentBillingPeriod();
    const timestamp = this.now();

    try {
      // Update usage tracking
      const existingUsage = await this.db
        .select()
        .from(usageTracking)
        .where(and(
          eq(usageTracking.userId, userId),
          eq(usageTracking.year, period.year),
          eq(usageTracking.month, period.month)
        ))
        .limit(1);

      if (existingUsage.length > 0) {
        await this.db
          .update(usageTracking)
          .set({
            workflowRuns: existingUsage[0].workflowRuns + 1,
            apiCalls: existingUsage[0].apiCalls + apiCalls,
            tokensUsed: existingUsage[0].tokensUsed + tokensUsed,
            updatedAt: timestamp
          })
          .where(and(
            eq(usageTracking.userId, userId),
            eq(usageTracking.year, period.year),
            eq(usageTracking.month, period.month)
          ));
      } else {
        await this.db.insert(usageTracking).values({
          userId,
          year: period.year,
          month: period.month,
          apiCalls,
          tokensUsed,
          workflowRuns: 1,
          storageUsed: 0,
          estimatedCost: 0,
          createdAt: timestamp,
          updatedAt: timestamp
        });
      }

      // Update workflow statistics
      await this.db
        .update(workflows)
        .set({
          totalRuns: workflows.totalRuns + 1,
          successfulRuns: success ? workflows.successfulRuns + 1 : workflows.successfulRuns,
          lastRun: timestamp,
          updatedAt: timestamp
        })
        .where(eq(workflows.id, workflowId));

      this.clearUserCache(userId);

      const user = await this.getUserWithUsage(userId);
      if (user) {
        const plan = await this.getPlanByCode(user.planType);
        await this.emitMeteringEvents(plan, userId, undefined, [
          { type: 'workflow_runs', quantity: 1 },
          { type: 'tokens', quantity: tokensUsed },
          { type: 'api_calls', quantity: apiCalls },
        ]);
        await this.detectOverages(user, plan, undefined);
      }

    } catch (error) {
      console.error('❌ Failed to record workflow execution:', error);
      throw error;
    }
  }

  /**
   * Check quota for user
   */
  public async checkQuota(
    userId: string,
    apiCalls: number = 0,
    tokens: number = 0,
    workflowRuns: number = 0,
    storage: number = 0
  ): Promise<QuotaCheck> {
    try {
      const user = await this.getUserWithUsage(userId);
      if (!user) {
        return {
          hasQuota: false,
          quotaType: 'api_calls',
          current: 0,
          limit: 0,
          remaining: 0,
          resetDate: this.getNextBillingPeriod().startDate
        };
      }

      const plan = await this.getPlanByCode(user.planType);
      const resetDate = this.getNextBillingPeriod().startDate;

      // Check API calls
      if (user.monthlyApiCalls + apiCalls > plan.apiCalls) {
        return {
          hasQuota: false,
          quotaType: 'api_calls',
          current: user.monthlyApiCalls,
          limit: plan.apiCalls,
          remaining: Math.max(0, plan.apiCalls - user.monthlyApiCalls),
          resetDate
        };
      }

      // Check tokens
      if (user.monthlyTokensUsed + tokens > plan.tokens) {
        return {
          hasQuota: false,
          quotaType: 'tokens',
          current: user.monthlyTokensUsed,
          limit: plan.tokens,
          remaining: Math.max(0, plan.tokens - user.monthlyTokensUsed),
          resetDate
        };
      }

      // For successful quota check, return the most restrictive remaining quota
      const apiCallsRemaining = plan.apiCalls - user.monthlyApiCalls;
      const tokensRemaining = plan.tokens - user.monthlyTokensUsed;

      return {
        hasQuota: true,
        current: user.monthlyApiCalls,
        limit: plan.apiCalls,
        remaining: Math.min(apiCallsRemaining, tokensRemaining),
        resetDate
      };

    } catch (error) {
      console.error('❌ Failed to check quota:', error);
      return {
        hasQuota: false,
        quotaType: 'api_calls',
        current: 0,
        limit: 0,
        remaining: 0,
        resetDate: this.getNextBillingPeriod().startDate
      };
    }
  }

  /**
   * Get usage metrics for user
   */
  public async getUserUsage(userId: string, year?: number, month?: number): Promise<UsageMetrics> {
    if (!this.db) {
      throw new Error('Database connection not available');
    }

    const period = year && month
      ? {
          year,
          month,
          startDate: new Date(year, month - 1, 1),
          endDate: new Date(year, month, 0),
        }
      : this.getCurrentBillingPeriod();
    const cacheKey = `usage_${userId}_${period.year}_${period.month}`;
    
    // Check cache
    const cached = this.usageCache.get(cacheKey);
    const expiry = this.cacheExpiry.get(cacheKey);
    
    if (cached && expiry && Date.now() < expiry) {
      return cached;
    }

    try {
      const user = await this.getUserWithUsage(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const plan = await this.getPlanByCode(user.planType);

      // Get usage data for the period
      const [usage] = await this.db
        .select()
        .from(usageTracking)
        .where(and(
          eq(usageTracking.userId, userId),
          eq(usageTracking.year, period.year),
          eq(usageTracking.month, period.month)
        ))
        .limit(1);

      const apiCalls = usage?.apiCalls || 0;
      const tokensUsed = usage?.tokensUsed || 0;
      const workflowRuns = usage?.workflowRuns || 0;
      const storageUsed = usage?.storageUsed || 0;

      const metrics: UsageMetrics = {
        userId,
        period: {
          year: period.year,
          month: period.month,
          startDate: period.startDate,
          endDate: period.endDate
        },
        apiCalls,
        tokensUsed,
        workflowRuns,
        workflowsCreated: 0, // Would need separate query
        storageUsed,
        estimatedCost: usage?.estimatedCost || 0,
        quotas: {
          apiCalls: plan.apiCalls,
          tokens: plan.tokens,
          workflowRuns: plan.workflowRuns,
          storage: plan.storage
        },
        usage: {
          apiCallsPercent: (apiCalls / plan.apiCalls) * 100,
          tokensPercent: (tokensUsed / plan.tokens) * 100,
          workflowRunsPercent: (workflowRuns / plan.workflowRuns) * 100,
          storagePercent: (storageUsed / plan.storage) * 100
        }
      };

      // Cache for 5 minutes
      this.usageCache.set(cacheKey, metrics);
      this.cacheExpiry.set(cacheKey, Date.now() + 300000);

      return metrics;

    } catch (error) {
      console.error('❌ Failed to get user usage:', error);
      throw error;
    }
  }

  /**
   * Get usage analytics for admin
   */
  public async getUsageAnalytics(startDate: Date, endDate: Date): Promise<{
    totalUsers: number;
    totalApiCalls: number;
    totalTokensUsed: number;
    totalWorkflowRuns: number;
    totalRevenue: number;
    planDistribution: Record<string, number>;
    topUsers: Array<{
      userId: string;
      email: string;
      apiCalls: number;
      tokensUsed: number;
      estimatedCost: number;
    }>;
  }> {
    if (!this.db) {
      throw new Error('Database connection not available');
    }

    try {
      // Get total metrics
      const totalMetrics = await this.db
        .select({
          totalApiCalls: sum(usageTracking.apiCalls),
          totalTokensUsed: sum(usageTracking.tokensUsed),
          totalWorkflowRuns: sum(usageTracking.workflowRuns),
          totalRevenue: sum(usageTracking.estimatedCost)
        })
        .from(usageTracking)
        .where(and(
          gte(usageTracking.createdAt, startDate),
          lte(usageTracking.createdAt, endDate)
        ));

      // Get plan distribution
      const planDistribution = await this.db
        .select({
          planType: users.planType,
          count: count()
        })
        .from(users)
        .where(eq(users.isActive, true))
        .groupBy(users.planType);

      // Get top users
      const topUsers = await this.db
        .select({
          userId: usageTracking.userId,
          email: users.email,
          apiCalls: sum(usageTracking.apiCalls),
          tokensUsed: sum(usageTracking.tokensUsed),
          estimatedCost: sum(usageTracking.estimatedCost)
        })
        .from(usageTracking)
        .innerJoin(users, eq(usageTracking.userId, users.id))
        .where(and(
          gte(usageTracking.createdAt, startDate),
          lte(usageTracking.createdAt, endDate)
        ))
        .groupBy(usageTracking.userId, users.email)
        .orderBy(sum(usageTracking.apiCalls))
        .limit(10);

      return {
        totalUsers: await this.getTotalActiveUsers(),
        totalApiCalls: Number(totalMetrics[0]?.totalApiCalls || 0),
        totalTokensUsed: Number(totalMetrics[0]?.totalTokensUsed || 0),
        totalWorkflowRuns: Number(totalMetrics[0]?.totalWorkflowRuns || 0),
        totalRevenue: Number(totalMetrics[0]?.totalRevenue || 0),
        planDistribution: planDistribution.reduce((acc, item) => {
          acc[item.planType] = Number(item.count);
          return acc;
        }, {} as Record<string, number>),
        topUsers: topUsers.map(user => ({
          userId: user.userId,
          email: user.email,
          apiCalls: Number(user.apiCalls),
          tokensUsed: Number(user.tokensUsed),
          estimatedCost: Number(user.estimatedCost)
        }))
      };

    } catch (error) {
      console.error('❌ Failed to get usage analytics:', error);
      throw error;
    }
  }

  /**
   * Reset monthly usage counters
   */
  public async resetMonthlyUsage(): Promise<void> {
    console.log('🔄 Resetting monthly usage counters...');

    if (!this.db) {
      throw new Error('Database connection not available');
    }

    const timestamp = this.now();

    try {
      await this.db
        .update(users)
        .set({
          monthlyApiCalls: 0,
          monthlyTokensUsed: 0,
          updatedAt: timestamp
        });

      // Clear all caches
      this.usageCache.clear();
      this.cacheExpiry.clear();

      console.log('✅ Monthly usage counters reset');

    } catch (error) {
      console.error('❌ Failed to reset monthly usage:', error);
      throw error;
    }
  }

  /**
   * Upgrade user plan
   */
  public async upgradeUserPlan(userId: string, newPlan: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database connection not available');
    }

    const plan = await this.getPlanByCode(newPlan);

    try {
      await this.db
        .update(users)
        .set({
          planType: newPlan,
          quotaApiCalls: plan.apiCalls,
          quotaTokens: plan.tokens,
          updatedAt: this.now()
        })
        .where(eq(users.id, userId));

      this.clearUserCache(userId);
      console.log(`✅ User ${userId} upgraded to ${newPlan} plan`);

    } catch (error) {
      console.error('❌ Failed to upgrade user plan:', error);
      throw error;
    }
  }

  /**
   * Get available plans
   */
  public async getAvailablePlans(): Promise<PlanLimits[]> {
    await this.loadPlans();
    return Array.from(this.plans.values());
  }

  public async listUsageAlerts(thresholdPercent = 80): Promise<UsageAlert[]> {
    if (!this.db) {
      return [];
    }

    await this.loadPlans();

    const usersList = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.isActive, true));

    const alerts: UsageAlert[] = [];
    for (const entry of usersList) {
      try {
        const usage = await this.getUserUsage(entry.id);
        alerts.push(...this.buildUsageAlerts(entry.id, usage, thresholdPercent));
      } catch (error) {
        console.error(`❌ Failed to build usage alerts for user ${entry.id}:`, error);
      }
    }

    return alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  public async generateUsageExport(options: {
    startDate?: Date;
    endDate?: Date;
    format?: 'json' | 'csv';
    planCodes?: string[];
  } = {}): Promise<UsageExportResult> {
    if (!this.db) {
      throw new Error('Database connection not available');
    }

    const period = (() => {
      if (options.startDate && options.endDate) {
        return { startDate: options.startDate, endDate: options.endDate };
      }
      const current = this.getCurrentBillingPeriod();
      return { startDate: current.startDate, endDate: current.endDate };
    })();

    const rows = await this.db
      .select({
        userId: usageTracking.userId,
        email: users.email,
        planType: users.planType,
        apiCalls: sum(usageTracking.apiCalls),
        tokensUsed: sum(usageTracking.tokensUsed),
        workflowRuns: sum(usageTracking.workflowRuns),
        storageUsed: sum(usageTracking.storageUsed),
        estimatedCost: sum(usageTracking.estimatedCost),
      })
      .from(usageTracking)
      .innerJoin(users, eq(usageTracking.userId, users.id))
      .where(and(
        gte(usageTracking.createdAt, period.startDate),
        lte(usageTracking.createdAt, period.endDate),
      ))
      .groupBy(usageTracking.userId, users.email, users.planType);

    await this.loadPlans();

    const filtered = options.planCodes && options.planCodes.length > 0
      ? rows.filter((row) => options.planCodes?.includes(row.planType))
      : rows;

    const exportRows: UsageExportRow[] = filtered.map((row) => {
      const plan = this.plans.get(row.planType) ?? this.plans.get('free');
      return {
        userId: row.userId,
        email: row.email,
        planCode: row.planType,
        planName: plan?.name ?? row.planType,
        apiCalls: Number(row.apiCalls ?? 0),
        tokensUsed: Number(row.tokensUsed ?? 0),
        workflowRuns: Number(row.workflowRuns ?? 0),
        storageUsed: Number(row.storageUsed ?? 0),
        estimatedCost: Number(row.estimatedCost ?? 0),
      } satisfies UsageExportRow;
    });

    const summary = exportRows.reduce(
      (acc, row) => {
        acc.totalApiCalls += row.apiCalls;
        acc.totalTokensUsed += row.tokensUsed;
        acc.totalWorkflowRuns += row.workflowRuns;
        acc.totalEstimatedCost += row.estimatedCost;
        return acc;
      },
      {
        totalApiCalls: 0,
        totalTokensUsed: 0,
        totalWorkflowRuns: 0,
        totalEstimatedCost: 0,
        distinctUsers: exportRows.length,
      },
    );

    const format = options.format ?? 'json';
    const csv = format === 'csv' ? this.toCsv(exportRows) : undefined;

    return {
      format,
      rows: exportRows,
      csv,
      summary,
      period: {
        startDate: period.startDate,
        endDate: period.endDate,
      },
    } satisfies UsageExportResult;
  }

  public async calculateProratedCharge(options: {
    planCode: string;
    activationDate: Date;
    periodStart: Date;
    periodEnd: Date;
    quantity?: number;
  }): Promise<number> {
    const plan = await this.getPlanByCode(options.planCode);
    if (plan.priceCents <= 0) {
      return 0;
    }

    const periodStart = new Date(options.periodStart);
    const periodEnd = new Date(options.periodEnd);
    const activation = new Date(options.activationDate);

    const msPerDay = 86_400_000;
    const totalDays = Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / msPerDay) + 1);
    const effectiveStart = activation > periodStart ? activation : periodStart;
    const billableDays = Math.max(0, Math.ceil((periodEnd.getTime() - effectiveStart.getTime()) / msPerDay) + 1);

    if (billableDays <= 0) {
      return 0;
    }

    const ratio = Math.min(1, billableDays / totalDays);
    const quantity = options.quantity ?? 1;
    return Math.round(plan.priceCents * ratio * quantity);
  }

  public async reconcileInvoices(): Promise<InvoiceAdjustment[]> {
    return this.billingProvider.reconcileInvoices(this.now());
  }

  /**
   * Private helper methods
   */
  private async loadPlans(force = false): Promise<void> {
    const now = this.now().getTime();
    if (!force && this.plans.size > 0 && this.plansExpireAt > now) {
      return;
    }

    if (this.plansLoading) {
      await this.plansLoading;
      return;
    }

    this.plansLoading = (async () => {
      const definitions = await this.planProvider.listPlans(true);
      const mapped = new Map<string, PlanLimits>();
      for (const definition of definitions) {
        mapped.set(definition.code, this.mapPlanDefinition(definition));
      }
      this.plans = mapped;
      this.plansExpireAt = this.now().getTime() + this.planCacheTtlMs;
      this.plansLoading = null;
    })();

    await this.plansLoading;
  }

  private mapPlanDefinition(plan: BillingPlanDefinition): PlanLimits {
    return {
      code: plan.code,
      name: plan.name,
      apiCalls: plan.usageQuotas.apiCalls,
      tokens: plan.usageQuotas.tokens,
      workflowRuns: plan.usageQuotas.workflowRuns,
      storage: plan.usageQuotas.storage,
      priceCents: plan.priceCents,
      currency: plan.currency,
      features: Array.isArray(plan.features) ? plan.features : [],
    } satisfies PlanLimits;
  }

  private async getPlanByCode(planCode: string): Promise<PlanLimits> {
    await this.loadPlans();
    const plan = this.plans.get(planCode) ?? this.plans.get('free');
    if (!plan) {
      throw new Error('No billing plans have been configured');
    }
    return plan;
  }

  private calculateUnitPrice(plan: PlanLimits, type: MeteringEventType): number {
    if (plan.priceCents <= 0) {
      return 0;
    }

    let divisor = 0;
    switch (type) {
      case 'api_calls':
        divisor = plan.apiCalls;
        break;
      case 'tokens':
        divisor = plan.tokens;
        break;
      case 'workflow_runs':
        divisor = plan.workflowRuns;
        break;
      case 'storage':
        divisor = plan.storage;
        break;
      default:
        divisor = 0;
    }

    if (divisor <= 0) {
      return 0;
    }

    return Math.max(0, Math.round(plan.priceCents / divisor));
  }

  private async emitMeteringEvents(
    plan: PlanLimits,
    userId: string,
    organizationId: string | undefined,
    events: Array<{ type: MeteringEventType; quantity: number }>,
  ): Promise<void> {
    for (const event of events) {
      if (!event.quantity || event.quantity <= 0) {
        continue;
      }

      await this.billingProvider.emitMeteringEvent({
        eventId: randomUUID(),
        userId,
        organizationId,
        planCode: plan.code,
        usageType: event.type,
        quantity: event.quantity,
        unitPriceCents: this.calculateUnitPrice(plan, event.type),
        occurredAt: this.now(),
        metadata: {
          planName: plan.name,
        },
      });
    }
  }

  private async detectOverages(
    user: any,
    plan: PlanLimits,
    organizationId: string | undefined,
  ): Promise<void> {
    const overages: Array<{ resource: string; quantity: number }> = [];

    if (user.monthlyApiCalls > plan.apiCalls) {
      overages.push({ resource: 'api_calls', quantity: user.monthlyApiCalls - plan.apiCalls });
    }

    if (user.monthlyTokensUsed > plan.tokens) {
      overages.push({ resource: 'tokens', quantity: user.monthlyTokensUsed - plan.tokens });
    }

    for (const overage of overages) {
      await this.billingProvider.emitMeteringEvent({
        eventId: randomUUID(),
        userId: user.id ?? user.userId ?? 'unknown',
        organizationId,
        planCode: plan.code,
        usageType: 'overage',
        quantity: overage.quantity,
        unitPriceCents: 0,
        occurredAt: this.now(),
        metadata: {
          resource: overage.resource,
          limit: overage.resource === 'api_calls' ? plan.apiCalls : plan.tokens,
        },
      });
    }
  }

  private buildUsageAlerts(userId: string, usage: UsageMetrics, thresholdPercent: number): UsageAlert[] {
    const alerts: UsageAlert[] = [];
    const threshold = Math.max(0, thresholdPercent);

    if (usage.usage.apiCallsPercent >= threshold) {
      alerts.push({
        userId,
        type: usage.usage.apiCallsPercent > 100 ? 'limit_exceeded' : 'approaching_limit',
        quotaType: 'api_calls',
        threshold: threshold,
        current: usage.apiCalls,
        limit: usage.quotas.apiCalls,
        timestamp: this.now(),
      });
    }

    if (usage.usage.tokensPercent >= threshold) {
      alerts.push({
        userId,
        type: usage.usage.tokensPercent > 100 ? 'limit_exceeded' : 'approaching_limit',
        quotaType: 'tokens',
        threshold: threshold,
        current: usage.tokensUsed,
        limit: usage.quotas.tokens,
        timestamp: this.now(),
      });
    }

    if (usage.usage.workflowRunsPercent >= threshold) {
      alerts.push({
        userId,
        type: usage.usage.workflowRunsPercent > 100 ? 'limit_exceeded' : 'approaching_limit',
        quotaType: 'workflow_runs',
        threshold: threshold,
        current: usage.workflowRuns,
        limit: usage.quotas.workflowRuns,
        timestamp: this.now(),
      });
    }

    if (usage.usage.storagePercent >= threshold) {
      alerts.push({
        userId,
        type: usage.usage.storagePercent > 100 ? 'limit_exceeded' : 'approaching_limit',
        quotaType: 'storage',
        threshold: threshold,
        current: usage.storageUsed,
        limit: usage.quotas.storage,
        timestamp: this.now(),
      });
    }

    return alerts;
  }

  private toCsv(rows: UsageExportRow[]): string {
    const headers = ['userId', 'email', 'planCode', 'planName', 'apiCalls', 'tokensUsed', 'workflowRuns', 'storageUsed', 'estimatedCost'];
    const body = rows
      .map((row) =>
        [
          row.userId,
          row.email,
          row.planCode,
          row.planName,
          row.apiCalls,
          row.tokensUsed,
          row.workflowRuns,
          row.storageUsed,
          row.estimatedCost,
        ]
          .map((value) => {
            if (typeof value === 'string') {
              const escaped = value.replace(/"/g, '""');
              return `"${escaped}"`;
            }
            return String(value);
          })
          .join(','),
      )
      .join('\n');

    return `${headers.join(',')}\n${body}`;
  }

  private getCurrentBillingPeriod(): BillingPeriod {
    const now = this.now();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    return {
      startDate: new Date(year, month - 1, 1),
      endDate: new Date(year, month, 0),
      year,
      month
    };
  }

  private getNextBillingPeriod(): BillingPeriod {
    const now = this.now();
    const year = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
    const month = now.getMonth() === 11 ? 1 : now.getMonth() + 2;

    return {
      startDate: new Date(year, month - 1, 1),
      endDate: new Date(year, month, 0),
      year,
      month
    };
  }

  private async getUserWithUsage(userId: string): Promise<any> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user;
  }

  private async getTotalActiveUsers(): Promise<number> {
    if (!this.db) {
      return 0;
    }

    const result = await this.db
      .select({ count: count() })
      .from(users)
      .where(eq(users.isActive, true));

    return Number(result[0]?.count || 0);
  }

  private clearUserCache(userId: string): void {
    const period = this.getCurrentBillingPeriod();
    const cacheKey = `usage_${userId}_${period.year}_${period.month}`;
    this.usageCache.delete(cacheKey);
    this.cacheExpiry.delete(cacheKey);
  }

  private async checkQuotaAlerts(userId: string): Promise<void> {
    try {
      const usage = await this.getUserUsage(userId);
      const alerts = this.buildUsageAlerts(userId, usage, 80);

      for (const alert of alerts) {
        console.log(`🚨 Usage alert for user ${userId}: ${alert.type} for ${alert.quotaType}`);
      }

    } catch (error) {
      console.error('❌ Failed to check quota alerts:', error);
    }
  }

  private startUsageTracking(): void {
    console.log('📊 Starting usage tracking...');

    // Reset monthly usage on the 1st of each month
    const now = this.now();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const MAX_TIMEOUT_MS = 2_147_483_647; // Maximum delay supported by Node.js timers

    const runReset = (targetDate: Date): void => {
      (async () => {
        try {
          await this.resetMonthlyUsage();
        } catch (error) {
          console.error('❌ Scheduled monthly usage reset failed:', error);
        } finally {
          const nextTarget = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1);
          scheduleNextReset(nextTarget);
        }
      })();
    };

    const scheduleNextReset = (targetDate: Date): void => {
      const schedule = () => {
        const remaining = targetDate.getTime() - Date.now();

        if (remaining <= 0) {
          runReset(targetDate);
          return;
        }

        if (remaining > MAX_TIMEOUT_MS) {
          setTimeout(schedule, MAX_TIMEOUT_MS);
        } else {
          setTimeout(() => runReset(targetDate), Math.max(0, remaining));
        }
      };

      schedule();
    };

    scheduleNextReset(nextMonth);
  }

  private scheduleInvoiceReconciliation(intervalMs = 1000 * 60 * 60): void {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    const run = async () => {
      try {
        const adjustments = await this.billingProvider.reconcileInvoices(this.now());
        if (adjustments.length > 0) {
          console.log(`📄 Reconciled ${adjustments.length} billing adjustments.`);
        }
      } catch (error) {
        console.error('❌ Failed to reconcile invoices:', error);
      }
    };

    void run();

    if (this.reconciliationTimer) {
      clearInterval(this.reconciliationTimer);
    }

    this.reconciliationTimer = setInterval(() => {
      void run();
    }, Math.max(5 * 60 * 1000, intervalMs));
  }
}

export const usageMeteringService = new UsageMeteringService();