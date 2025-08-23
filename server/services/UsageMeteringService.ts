import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { eq, and, gte, lte, sum, count } from 'drizzle-orm';
import { users, usageTracking, workflowExecutions, workflows } from '../database/schema';

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
  name: string;
  apiCalls: number;
  tokens: number;
  workflowRuns: number;
  storage: number; // bytes
  price: number; // cents per month
  features: string[];
}

export class UsageMeteringService {
  private db: any;
  private usageCache = new Map<string, UsageMetrics>();
  private cacheExpiry = new Map<string, number>();

  // Plan definitions
  private readonly PLANS: Record<string, PlanLimits> = {
    free: {
      name: 'Free',
      apiCalls: 1000,
      tokens: 100000,
      workflowRuns: 100,
      storage: 100 * 1024 * 1024, // 100MB
      price: 0,
      features: ['Basic workflows', 'Community support']
    },
    pro: {
      name: 'Pro',
      apiCalls: 10000,
      tokens: 1000000,
      workflowRuns: 1000,
      storage: 1024 * 1024 * 1024, // 1GB
      price: 2900, // $29/month
      features: ['Advanced workflows', 'Priority support', 'Custom connectors']
    },
    enterprise: {
      name: 'Enterprise',
      apiCalls: 100000,
      tokens: 10000000,
      workflowRuns: 10000,
      storage: 10 * 1024 * 1024 * 1024, // 10GB
      price: 9900, // $99/month
      features: ['Unlimited workflows', '24/7 support', 'Custom integrations', 'SLA']
    }
  };

  constructor() {
    const sql = neon(process.env.DATABASE_URL!);
    this.db = drizzle(sql);
    
    // Start usage tracking
    this.startUsageTracking();
  }

  /**
   * Record API usage
   */
  public async recordApiUsage(
    userId: string,
    apiCalls: number = 1,
    tokensUsed: number = 0,
    cost: number = 0
  ): Promise<void> {
    const period = this.getCurrentBillingPeriod();
    
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
            updatedAt: new Date()
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
          estimatedCost: Math.round(cost * 100)
        });
      }

      // Update user's monthly counters
      await this.db
        .update(users)
        .set({
          monthlyApiCalls: users.monthlyApiCalls + apiCalls,
          monthlyTokensUsed: users.monthlyTokensUsed + tokensUsed,
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));

      // Clear cache for this user
      this.clearUserCache(userId);

      // Check for quota alerts
      await this.checkQuotaAlerts(userId);

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
    const period = this.getCurrentBillingPeriod();
    
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
            updatedAt: new Date()
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
          estimatedCost: 0
        });
      }

      // Update workflow statistics
      await this.db
        .update(workflows)
        .set({
          totalRuns: workflows.totalRuns + 1,
          successfulRuns: success ? workflows.successfulRuns + 1 : workflows.successfulRuns,
          lastRun: new Date(),
          updatedAt: new Date()
        })
        .where(eq(workflows.id, workflowId));

      this.clearUserCache(userId);

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

      const plan = this.PLANS[user.planType] || this.PLANS.free;
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
    const period = year && month ? { year, month } : this.getCurrentBillingPeriod();
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

      const plan = this.PLANS[user.planType] || this.PLANS.free;
      
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
    
    try {
      await this.db
        .update(users)
        .set({
          monthlyApiCalls: 0,
          monthlyTokensUsed: 0,
          updatedAt: new Date()
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
    if (!this.PLANS[newPlan]) {
      throw new Error(`Invalid plan: ${newPlan}`);
    }

    try {
      const plan = this.PLANS[newPlan];
      
      await this.db
        .update(users)
        .set({
          planType: newPlan,
          quotaApiCalls: plan.apiCalls,
          quotaTokens: plan.tokens,
          updatedAt: new Date()
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
  public getAvailablePlans(): PlanLimits[] {
    return Object.values(this.PLANS);
  }

  /**
   * Private helper methods
   */
  private getCurrentBillingPeriod(): BillingPeriod {
    const now = new Date();
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
    const now = new Date();
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
      
      // Check for approaching limits (80% threshold)
      const alerts: UsageAlert[] = [];
      
      if (usage.usage.apiCallsPercent > 80) {
        alerts.push({
          userId,
          type: usage.usage.apiCallsPercent > 100 ? 'limit_exceeded' : 'approaching_limit',
          quotaType: 'api_calls',
          threshold: 80,
          current: usage.apiCalls,
          limit: usage.quotas.apiCalls,
          timestamp: new Date()
        });
      }

      if (usage.usage.tokensPercent > 80) {
        alerts.push({
          userId,
          type: usage.usage.tokensPercent > 100 ? 'limit_exceeded' : 'approaching_limit',
          quotaType: 'tokens',
          threshold: 80,
          current: usage.tokensUsed,
          limit: usage.quotas.tokens,
          timestamp: new Date()
        });
      }

      // Send alerts (in a real implementation, you'd send emails/notifications)
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
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const msUntilNextMonth = nextMonth.getTime() - now.getTime();
    
    setTimeout(() => {
      this.resetMonthlyUsage();
      
      // Then reset every month
      setInterval(() => {
        this.resetMonthlyUsage();
      }, 30 * 24 * 60 * 60 * 1000); // 30 days
      
    }, msUntilNextMonth);
  }
}

export const usageMeteringService = new UsageMeteringService();