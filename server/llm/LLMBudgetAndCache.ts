import { organizationService } from '../services/OrganizationService';

/**
 * LLM BUDGET & CACHE - Controls costs and improves performance
 * Implements budget limits, cost tracking, and intelligent caching for LLM operations
 */

export interface BudgetConfig {
  dailyLimitUSD: number;
  monthlyLimitUSD: number;
  perUserDailyLimitUSD?: number;
  perWorkflowLimitUSD?: number;
  alertThresholds: {
    daily: number; // percentage (0-100)
    monthly: number; // percentage (0-100)
  };
  emergencyStopThreshold: number; // percentage (0-100)
}

export interface UsageRecord {
  userId?: string;
  workflowId?: string;
  organizationId?: string;
  provider: string;
  model: string;
  tokensUsed: number;
  costUSD: number;
  timestamp: Date;
  executionId: string;
  nodeId: string;
}

interface NodeUsageBreakdown {
  tokensUsed: number;
  costUSD: number;
  provider?: string;
  model?: string;
}

interface ExecutionUsageAggregate {
  executionId: string;
  workflowId?: string;
  organizationId?: string;
  userId?: string;
  totalTokens: number;
  totalCost: number;
  nodes: Record<string, NodeUsageBreakdown>;
  startedAt: Date;
  updatedAt: Date;
}

export interface BudgetStatus {
  currentDailySpend: number;
  currentMonthlySpend: number;
  dailyLimit: number;
  monthlyLimit: number;
  dailyPercentageUsed: number;
  monthlyPercentageUsed: number;
  isOverBudget: boolean;
  shouldAlert: boolean;
  emergencyStop: boolean;
  remainingDailyBudget: number;
  remainingMonthlyBudget: number;
}

export interface CacheEntry {
  key: string;
  prompt: string;
  response: string;
  model: string;
  provider: string;
  tokensUsed: number;
  costUSD: number;
  timestamp: Date;
  accessCount: number;
  lastAccessed: Date;
  ttl: number; // Time to live in seconds
}

export interface CacheStats {
  totalEntries: number;
  hitRate: number;
  missRate: number;
  totalHits: number;
  totalMisses: number;
  cacheSize: number; // in MB
  averageTokensSaved: number;
  totalCostSaved: number;
}

class LLMBudgetAndCache {
  private usageRecords: UsageRecord[] = [];
  private executionUsage = new Map<string, ExecutionUsageAggregate>();
  private cache = new Map<string, CacheEntry>();
  private maxCacheSize = 1000; // Maximum number of cache entries
  private defaultCacheTTL = 24 * 60 * 60; // 24 hours in seconds
  private cacheCleanupInterval?: NodeJS.Timeout;
  private usageCleanupInterval?: NodeJS.Timeout;
  
  private defaultBudgetConfig: BudgetConfig = {
    dailyLimitUSD: 100,
    monthlyLimitUSD: 2000,
    perUserDailyLimitUSD: 50,
    perWorkflowLimitUSD: 200,
    alertThresholds: {
      daily: 80,
      monthly: 85
    },
    emergencyStopThreshold: 95
  };

  private currentBudgetConfig: BudgetConfig;
  private stats = {
    totalHits: 0,
    totalMisses: 0
  };

  constructor(budgetConfig?: Partial<BudgetConfig>) {
    this.currentBudgetConfig = { ...this.defaultBudgetConfig, ...budgetConfig };
    
    // Start cleanup intervals
    this.cacheCleanupInterval = setInterval(() => this.cleanupExpiredCache(), 60 * 60 * 1000);
    this.cacheCleanupInterval.unref?.();
    this.usageCleanupInterval = setInterval(() => this.cleanupOldUsageRecords(), 24 * 60 * 60 * 1000);
    this.usageCleanupInterval.unref?.();

    console.log('💰 LLM Budget and Cache system initialized');
  }

  public dispose(): void {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = undefined;
    }
    if (this.usageCleanupInterval) {
      clearInterval(this.usageCleanupInterval);
      this.usageCleanupInterval = undefined;
    }
  }

  /**
   * Check if a request can proceed based on budget constraints
   */
  async checkBudgetConstraints(
    estimatedCostUSD: number,
    userId?: string,
    workflowId?: string
  ): Promise<{
    allowed: boolean;
    reason?: string;
    budgetStatus: BudgetStatus;
  }> {
    const budgetStatus = this.getBudgetStatus();
    
    // Check emergency stop
    if (budgetStatus.emergencyStop) {
      return {
        allowed: false,
        reason: 'Emergency budget stop activated - contact administrator',
        budgetStatus
      };
    }

    // Check if adding this cost would exceed daily limit
    if (budgetStatus.currentDailySpend + estimatedCostUSD > budgetStatus.dailyLimit) {
      return {
        allowed: false,
        reason: `Would exceed daily budget limit ($${budgetStatus.dailyLimit})`,
        budgetStatus
      };
    }

    // Check if adding this cost would exceed monthly limit
    if (budgetStatus.currentMonthlySpend + estimatedCostUSD > budgetStatus.monthlyLimit) {
      return {
        allowed: false,
        reason: `Would exceed monthly budget limit ($${budgetStatus.monthlyLimit})`,
        budgetStatus
      };
    }

    // Check per-user daily limit
    if (userId && this.currentBudgetConfig.perUserDailyLimitUSD) {
      const userDailySpend = this.getUserDailySpend(userId);
      if (userDailySpend + estimatedCostUSD > this.currentBudgetConfig.perUserDailyLimitUSD) {
        return {
          allowed: false,
          reason: `Would exceed user daily limit ($${this.currentBudgetConfig.perUserDailyLimitUSD})`,
          budgetStatus
        };
      }
    }

    // Check per-workflow limit
    if (workflowId && this.currentBudgetConfig.perWorkflowLimitUSD) {
      const workflowSpend = this.getWorkflowSpend(workflowId);
      if (workflowSpend + estimatedCostUSD > this.currentBudgetConfig.perWorkflowLimitUSD) {
        return {
          allowed: false,
          reason: `Would exceed workflow limit ($${this.currentBudgetConfig.perWorkflowLimitUSD})`,
          budgetStatus
        };
      }
    }

    return {
      allowed: true,
      budgetStatus
    };
  }

  /**
   * Record LLM usage for budget tracking
   */
  recordUsage(usage: Omit<UsageRecord, 'timestamp'>): void {
    const record: UsageRecord = {
      ...usage,
      timestamp: new Date()
    };

    this.usageRecords.push(record);
    this.updateExecutionUsage(record);

    if (record.organizationId) {
      void organizationService
        .recordUsage(record.organizationId, {
          llmTokens: record.tokensUsed,
          llmCostUSD: record.costUSD,
        })
        .catch((error) => {
          console.warn('⚠️ Failed to record organization LLM usage', error);
        });
    }

    // Check for alerts
    const budgetStatus = this.getBudgetStatus();
    if (budgetStatus.shouldAlert) {
      this.sendBudgetAlert(budgetStatus);
    }

    console.log(
      `💰 Recorded LLM usage: $${usage.costUSD} (${usage.tokensUsed} tokens) [exec=${usage.executionId}]`
    );
  }

  /**
   * Check cache for a prompt
   */
  getCachedResponse(prompt: string, model: string, provider: string): CacheEntry | null {
    const key = this.generateCacheKey(prompt, model, provider);
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.totalMisses++;
      return null;
    }

    // Check if entry has expired
    const now = new Date();
    const ageInSeconds = (now.getTime() - entry.timestamp.getTime()) / 1000;
    
    if (ageInSeconds > entry.ttl) {
      this.cache.delete(key);
      this.stats.totalMisses++;
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = now;
    this.stats.totalHits++;
    
    console.log(`🎯 Cache hit for ${provider}:${model} - saved $${entry.costUSD}`);
    return entry;
  }

  /**
   * Store response in cache
   */
  cacheResponse(
    prompt: string,
    response: string,
    model: string,
    provider: string,
    tokensUsed: number,
    costUSD: number,
    ttlSeconds?: number
  ): void {
    const key = this.generateCacheKey(prompt, model, provider);
    const ttl = ttlSeconds || this.defaultCacheTTL;
    
    const entry: CacheEntry = {
      key,
      prompt,
      response,
      model,
      provider,
      tokensUsed,
      costUSD,
      timestamp: new Date(),
      accessCount: 0,
      lastAccessed: new Date(),
      ttl
    };

    // Check cache size and evict if necessary
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLeastRecentlyUsed();
    }

    this.cache.set(key, entry);
    console.log(`💾 Cached response for ${provider}:${model} (TTL: ${ttl}s)`);
  }

  /**
   * Get current budget status
   */
  getBudgetStatus(): BudgetStatus {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const dailyRecords = this.usageRecords.filter(record => record.timestamp >= startOfDay);
    const monthlyRecords = this.usageRecords.filter(record => record.timestamp >= startOfMonth);

    const currentDailySpend = dailyRecords.reduce((sum, record) => sum + record.costUSD, 0);
    const currentMonthlySpend = monthlyRecords.reduce((sum, record) => sum + record.costUSD, 0);

    const dailyPercentageUsed = (currentDailySpend / this.currentBudgetConfig.dailyLimitUSD) * 100;
    const monthlyPercentageUsed = (currentMonthlySpend / this.currentBudgetConfig.monthlyLimitUSD) * 100;

    const shouldAlert = 
      dailyPercentageUsed >= this.currentBudgetConfig.alertThresholds.daily ||
      monthlyPercentageUsed >= this.currentBudgetConfig.alertThresholds.monthly;

    const emergencyStop = 
      dailyPercentageUsed >= this.currentBudgetConfig.emergencyStopThreshold ||
      monthlyPercentageUsed >= this.currentBudgetConfig.emergencyStopThreshold;

    return {
      currentDailySpend,
      currentMonthlySpend,
      dailyLimit: this.currentBudgetConfig.dailyLimitUSD,
      monthlyLimit: this.currentBudgetConfig.monthlyLimitUSD,
      dailyPercentageUsed,
      monthlyPercentageUsed,
      isOverBudget: currentDailySpend > this.currentBudgetConfig.dailyLimitUSD || 
                    currentMonthlySpend > this.currentBudgetConfig.monthlyLimitUSD,
      shouldAlert,
      emergencyStop,
      remainingDailyBudget: Math.max(0, this.currentBudgetConfig.dailyLimitUSD - currentDailySpend),
      remainingMonthlyBudget: Math.max(0, this.currentBudgetConfig.monthlyLimitUSD - currentMonthlySpend)
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats {
    const totalRequests = this.stats.totalHits + this.stats.totalMisses;
    const hitRate = totalRequests > 0 ? (this.stats.totalHits / totalRequests) * 100 : 0;
    const missRate = 100 - hitRate;

    const cacheEntries = Array.from(this.cache.values());
    const totalTokensSaved = cacheEntries.reduce((sum, entry) => sum + (entry.tokensUsed * entry.accessCount), 0);
    const totalCostSaved = cacheEntries.reduce((sum, entry) => sum + (entry.costUSD * entry.accessCount), 0);
    const averageTokensSaved = cacheEntries.length > 0 ? totalTokensSaved / cacheEntries.length : 0;

    // Estimate cache size in MB (rough approximation)
    const cacheSize = cacheEntries.reduce((sum, entry) => 
      sum + (entry.prompt.length + entry.response.length) * 2, 0) / (1024 * 1024);

    return {
      totalEntries: this.cache.size,
      hitRate,
      missRate,
      totalHits: this.stats.totalHits,
      totalMisses: this.stats.totalMisses,
      cacheSize,
      averageTokensSaved,
      totalCostSaved
    };
  }

  /**
   * Get usage analytics
   */
  getUsageAnalytics(timeframe: 'day' | 'week' | 'month' = 'day'): {
    totalCost: number;
    totalTokens: number;
    totalRequests: number;
    averageCostPerRequest: number;
    topModels: Array<{ model: string; cost: number; requests: number }>;
    topProviders: Array<{ provider: string; cost: number; requests: number }>;
    topUsers: Array<{ userId: string; cost: number; requests: number }>;
    topWorkflows: Array<{ workflowId: string; cost: number; tokens: number; requests: number }>;
    costByDay: Array<{ date: string; cost: number }>;
  } {
    const records = this.filterUsageRecords(timeframe);

    const totalCost = records.reduce((sum, record) => sum + record.costUSD, 0);
    const totalTokens = records.reduce((sum, record) => sum + record.tokensUsed, 0);
    const totalRequests = records.length;
    const averageCostPerRequest = totalRequests > 0 ? totalCost / totalRequests : 0;

    // Aggregate by model
    const modelStats = new Map<string, { cost: number; requests: number }>();
    const providerStats = new Map<string, { cost: number; requests: number }>();
    const userStats = new Map<string, { cost: number; requests: number }>();
    const workflowStats = new Map<string, { cost: number; tokens: number; requests: number }>();

    records.forEach(record => {
      // Models
      const modelKey = `${record.provider}:${record.model}`;
      const existingModel = modelStats.get(modelKey) || { cost: 0, requests: 0 };
      modelStats.set(modelKey, {
        cost: existingModel.cost + record.costUSD,
        requests: existingModel.requests + 1
      });

      // Providers
      const existingProvider = providerStats.get(record.provider) || { cost: 0, requests: 0 };
      providerStats.set(record.provider, {
        cost: existingProvider.cost + record.costUSD,
        requests: existingProvider.requests + 1
      });

      // Users
      if (record.userId) {
        const existingUser = userStats.get(record.userId) || { cost: 0, requests: 0 };
        userStats.set(record.userId, {
          cost: existingUser.cost + record.costUSD,
          requests: existingUser.requests + 1
        });
      }

      if (record.workflowId) {
        const existingWorkflow = workflowStats.get(record.workflowId) || { cost: 0, tokens: 0, requests: 0 };
        workflowStats.set(record.workflowId, {
          cost: existingWorkflow.cost + record.costUSD,
          tokens: existingWorkflow.tokens + record.tokensUsed,
          requests: existingWorkflow.requests + 1,
        });
      }
    });

    const topModels = Array.from(modelStats.entries())
      .map(([model, stats]) => ({ model, ...stats }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);

    const topProviders = Array.from(providerStats.entries())
      .map(([provider, stats]) => ({ provider, ...stats }))
      .sort((a, b) => b.cost - a.cost);

    const topUsers = Array.from(userStats.entries())
      .map(([userId, stats]) => ({ userId, ...stats }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);

    const topWorkflows = Array.from(workflowStats.entries())
      .map(([workflowId, stats]) => ({ workflowId, ...stats }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);

    // Cost by day
    const costByDay = this.getCostByDay(records);

    return {
      totalCost,
      totalTokens,
      totalRequests,
      averageCostPerRequest,
      topModels,
      topProviders,
      topUsers,
      topWorkflows,
      costByDay
    };
  }

  getWorkflowUsageSummary(timeframe: 'day' | 'week' | 'month' = 'day'): {
    timeframe: 'day' | 'week' | 'month';
    totalWorkflows: number;
    totalTokens: number;
    totalCost: number;
    workflows: Array<{
      workflowId: string;
      totalTokens: number;
      totalCost: number;
      requests: number;
      executions: number;
      averageTokensPerRequest: number;
      averageCostPerRequest: number;
      lastUsedAt: string | null;
    }>;
  } {
    const records = this.filterUsageRecords(timeframe).filter((record) => Boolean(record.workflowId));

    const workflowStats = new Map<
      string,
      { tokens: number; cost: number; requests: number; executions: Set<string>; lastUsed: Date | null }
    >();

    for (const record of records) {
      if (!record.workflowId) continue;
      const current = workflowStats.get(record.workflowId) || {
        tokens: 0,
        cost: 0,
        requests: 0,
        executions: new Set<string>(),
        lastUsed: null,
      };

      current.tokens += record.tokensUsed;
      current.cost += record.costUSD;
      current.requests += 1;
      current.executions.add(record.executionId);
      if (!current.lastUsed || record.timestamp > current.lastUsed) {
        current.lastUsed = record.timestamp;
      }

      workflowStats.set(record.workflowId, current);
    }

    const workflows = Array.from(workflowStats.entries())
      .map(([workflowId, stats]) => ({
        workflowId,
        totalTokens: stats.tokens,
        totalCost: stats.cost,
        requests: stats.requests,
        executions: stats.executions.size,
        averageTokensPerRequest: stats.requests > 0 ? stats.tokens / stats.requests : 0,
        averageCostPerRequest: stats.requests > 0 ? stats.cost / stats.requests : 0,
        lastUsedAt: stats.lastUsed ? stats.lastUsed.toISOString() : null,
      }))
      .sort((a, b) => b.totalCost - a.totalCost);

    const totalTokens = workflows.reduce((sum, wf) => sum + wf.totalTokens, 0);
    const totalCost = workflows.reduce((sum, wf) => sum + wf.totalCost, 0);

    return {
      timeframe,
      totalWorkflows: workflows.length,
      totalTokens,
      totalCost,
      workflows,
    };
  }

  getExecutionUsage(executionId: string): {
    executionId: string;
    workflowId?: string;
    organizationId?: string;
    userId?: string;
    totalTokens: number;
    totalCost: number;
    startedAt: string;
    updatedAt: string;
    nodes: Array<{
      nodeId: string;
      tokensUsed: number;
      costUSD: number;
      provider?: string;
      model?: string;
    }>;
  } | null {
    const aggregate = this.executionUsage.get(executionId);
    if (!aggregate) {
      return null;
    }

    return {
      executionId: aggregate.executionId,
      workflowId: aggregate.workflowId,
      organizationId: aggregate.organizationId,
      userId: aggregate.userId,
      totalTokens: aggregate.totalTokens,
      totalCost: aggregate.totalCost,
      startedAt: aggregate.startedAt.toISOString(),
      updatedAt: aggregate.updatedAt.toISOString(),
      nodes: Object.entries(aggregate.nodes).map(([nodeId, stats]) => ({
        nodeId,
        tokensUsed: stats.tokensUsed,
        costUSD: stats.costUSD,
        provider: stats.provider,
        model: stats.model,
      })),
    };
  }

  /**
   * Update budget configuration
   */
  updateBudgetConfig(newConfig: Partial<BudgetConfig>): void {
    this.currentBudgetConfig = { ...this.currentBudgetConfig, ...newConfig };
    console.log('💰 Budget configuration updated');
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.stats.totalHits = 0;
    this.stats.totalMisses = 0;
    console.log('🗑️ Cache cleared');
  }

  /**
   * Estimate cost for a request (simplified)
   */
  estimateCost(provider: string, model: string, promptTokens: number): number {
    // Simplified cost estimation - in production, use actual provider pricing
    const baseCostPer1kTokens = this.getBaseCostPer1kTokens(provider, model);
    return (promptTokens / 1000) * baseCostPer1kTokens;
  }

  // Private helper methods

  private updateExecutionUsage(record: UsageRecord): void {
    const existing = this.executionUsage.get(record.executionId);
    const timestamp = record.timestamp;

    if (!existing) {
      this.executionUsage.set(record.executionId, {
        executionId: record.executionId,
        workflowId: record.workflowId,
        organizationId: record.organizationId,
        userId: record.userId,
        totalTokens: record.tokensUsed,
        totalCost: record.costUSD,
        nodes: {
          [record.nodeId]: {
            tokensUsed: record.tokensUsed,
            costUSD: record.costUSD,
            provider: record.provider,
            model: record.model,
          },
        },
        startedAt: timestamp,
        updatedAt: timestamp,
      });
      return;
    }

    existing.totalTokens += record.tokensUsed;
    existing.totalCost += record.costUSD;
    existing.workflowId = existing.workflowId ?? record.workflowId;
    existing.organizationId = existing.organizationId ?? record.organizationId;
    existing.userId = existing.userId ?? record.userId;

    const currentNode = existing.nodes[record.nodeId] ?? {
      tokensUsed: 0,
      costUSD: 0,
      provider: record.provider,
      model: record.model,
    };
    currentNode.tokensUsed += record.tokensUsed;
    currentNode.costUSD += record.costUSD;
    currentNode.provider = currentNode.provider ?? record.provider;
    currentNode.model = currentNode.model ?? record.model;
    existing.nodes[record.nodeId] = currentNode;

    existing.updatedAt = timestamp;
  }

  private filterUsageRecords(timeframe: 'day' | 'week' | 'month'): UsageRecord[] {
    const startDate = this.getTimeframeStart(timeframe);
    return this.usageRecords.filter((record) => record.timestamp >= startDate);
  }

  private getTimeframeStart(timeframe: 'day' | 'week' | 'month'): Date {
    const now = new Date();
    switch (timeframe) {
      case 'week':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'month':
        return new Date(now.getFullYear(), now.getMonth(), 1);
      default:
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
  }

  private generateCacheKey(prompt: string, model: string, provider: string): string {
    const content = `${provider}:${model}:${prompt}`;
    // Simple hash function - in production, use crypto.createHash
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `llm_cache_${Math.abs(hash)}`;
  }

  private evictLeastRecentlyUsed(): void {
    if (this.cache.size === 0) return;

    let oldestEntry: CacheEntry | null = null;
    let oldestKey = '';

    for (const [key, entry] of this.cache.entries()) {
      if (!oldestEntry || entry.lastAccessed < oldestEntry.lastAccessed) {
        oldestEntry = entry;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      console.log(`🗑️ Evicted LRU cache entry: ${oldestKey}`);
    }
  }

  private getUserDailySpend(userId: string): number {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return this.usageRecords
      .filter(record => record.userId === userId && record.timestamp >= startOfDay)
      .reduce((sum, record) => sum + record.costUSD, 0);
  }

  private getWorkflowSpend(workflowId: string): number {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    return this.usageRecords
      .filter(record => record.workflowId === workflowId && record.timestamp >= startOfMonth)
      .reduce((sum, record) => sum + record.costUSD, 0);
  }

  private sendBudgetAlert(budgetStatus: BudgetStatus): void {
    // In production, send email/Slack notification
    console.warn(`🚨 BUDGET ALERT: Daily: ${budgetStatus.dailyPercentageUsed.toFixed(1)}%, Monthly: ${budgetStatus.monthlyPercentageUsed.toFixed(1)}%`);
  }

  private getCostByDay(records: UsageRecord[]): Array<{ date: string; cost: number }> {
    const costByDate = new Map<string, number>();
    
    records.forEach(record => {
      const dateKey = record.timestamp.toISOString().split('T')[0];
      const existing = costByDate.get(dateKey) || 0;
      costByDate.set(dateKey, existing + record.costUSD);
    });

    return Array.from(costByDate.entries())
      .map(([date, cost]) => ({ date, cost }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private getBaseCostPer1kTokens(provider: string, model: string): number {
    // Simplified pricing - in production, use actual provider pricing tables
    const pricing: Record<string, Record<string, number>> = {
      openai: {
        'gpt-4o-mini': 0.15,
        'gpt-4': 30.0,
        'gpt-3.5-turbo': 1.5
      },
      anthropic: {
        'claude-3-5-sonnet': 3.0,
        'claude-3-haiku': 0.25
      },
      google: {
        'gemini-1.5-pro': 1.25,
        'gemini-1.5-flash': 0.075
      }
    };

    return pricing[provider]?.[model] || 1.0; // Default fallback
  }

  private cleanupExpiredCache(): void {
    const now = new Date();
    let expiredCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      const ageInSeconds = (now.getTime() - entry.timestamp.getTime()) / 1000;
      if (ageInSeconds > entry.ttl) {
        this.cache.delete(key);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      console.log(`🧹 Cleaned up ${expiredCount} expired cache entries`);
    }
  }

  private cleanupOldUsageRecords(): void {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days ago
    const initialCount = this.usageRecords.length;
    
    this.usageRecords = this.usageRecords.filter(record => record.timestamp >= cutoff);

    for (const [executionId, aggregate] of this.executionUsage.entries()) {
      if (aggregate.updatedAt < cutoff) {
        this.executionUsage.delete(executionId);
      }
    }

    const cleanedCount = initialCount - this.usageRecords.length;
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} old usage records`);
    }
  }
}

export const llmBudgetAndCache = new LLMBudgetAndCache();