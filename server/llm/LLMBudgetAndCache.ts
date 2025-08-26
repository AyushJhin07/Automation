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
  provider: string;
  model: string;
  tokensUsed: number;
  costUSD: number;
  timestamp: Date;
  executionId: string;
  nodeId: string;
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
  private cache = new Map<string, CacheEntry>();
  private maxCacheSize = 1000; // Maximum number of cache entries
  private defaultCacheTTL = 24 * 60 * 60; // 24 hours in seconds
  
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
    setInterval(() => this.cleanupExpiredCache(), 60 * 60 * 1000); // Every hour
    setInterval(() => this.cleanupOldUsageRecords(), 24 * 60 * 60 * 1000); // Every day
    
    console.log('💰 LLM Budget and Cache system initialized');
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
    
    // Check for alerts
    const budgetStatus = this.getBudgetStatus();
    if (budgetStatus.shouldAlert) {
      this.sendBudgetAlert(budgetStatus);
    }

    console.log(`💰 Recorded LLM usage: $${usage.costUSD} (${usage.tokensUsed} tokens)`);
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
    costByDay: Array<{ date: string; cost: number }>;
  } {
    const now = new Date();
    let startDate: Date;

    switch (timeframe) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default: // day
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    const records = this.usageRecords.filter(record => record.timestamp >= startDate);
    
    const totalCost = records.reduce((sum, record) => sum + record.costUSD, 0);
    const totalTokens = records.reduce((sum, record) => sum + record.tokensUsed, 0);
    const totalRequests = records.length;
    const averageCostPerRequest = totalRequests > 0 ? totalCost / totalRequests : 0;

    // Aggregate by model
    const modelStats = new Map<string, { cost: number; requests: number }>();
    const providerStats = new Map<string, { cost: number; requests: number }>();
    const userStats = new Map<string, { cost: number; requests: number }>();

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
      costByDay
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
    
    const cleanedCount = initialCount - this.usageRecords.length;
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} old usage records`);
    }
  }
}

export const llmBudgetAndCache = new LLMBudgetAndCache();