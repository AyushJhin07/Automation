/**
 * LLMAnalytics - Comprehensive usage tracking, cost optimization, and performance metrics
 * Provides insights into LLM usage patterns, costs, and optimization opportunities
 */

export interface LLMUsageMetrics {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  averageLatency: number;
  errorRate: number;
  successRate: number;
  topModels: Record<string, number>;
  topProviders: Record<string, number>;
  costByProvider: Record<string, number>;
  tokensByProvider: Record<string, number>;
  dailyUsage: Record<string, UsageDay>;
}

export interface UsageDay {
  date: string;
  requests: number;
  tokens: number;
  cost: number;
  errors: number;
  averageLatency: number;
}

export interface LLMRequest {
  id: string;
  timestamp: number;
  provider: string;
  model: string;
  userId?: string;
  workflowId: string;
  nodeId?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  latency: number;
  success: boolean;
  error?: string;
  requestType: 'parameter' | 'standalone' | 'chain' | 'tool';
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  tokensPerMinute: number;
  tokensPerHour: number;
  tokensPerDay: number;
  costPerDay: number;
}

export interface RateLimitStatus {
  allowed: boolean;
  reason?: string;
  resetTime?: number;
  remaining: {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
    tokensPerMinute: number;
    tokensPerHour: number;
    tokensPerDay: number;
    costPerDay: number;
  };
}

class UsageTracker {
  private requests: LLMRequest[] = [];
  private maxHistorySize = 10000; // Keep last 10k requests

  logRequest(request: LLMRequest): void {
    this.requests.push(request);
    
    // Trim history if too large
    if (this.requests.length > this.maxHistorySize) {
      this.requests = this.requests.slice(-this.maxHistorySize);
    }
  }

  getMetrics(since?: number): LLMUsageMetrics {
    const filteredRequests = since 
      ? this.requests.filter(r => r.timestamp >= since)
      : this.requests;

    if (filteredRequests.length === 0) {
      return this.getEmptyMetrics();
    }

    const totalRequests = filteredRequests.length;
    const successfulRequests = filteredRequests.filter(r => r.success);
    const failedRequests = filteredRequests.filter(r => !r.success);

    const totalTokens = filteredRequests.reduce((sum, r) => sum + r.totalTokens, 0);
    const totalCost = filteredRequests.reduce((sum, r) => sum + r.cost, 0);
    const totalLatency = filteredRequests.reduce((sum, r) => sum + r.latency, 0);

    const topModels: Record<string, number> = {};
    const topProviders: Record<string, number> = {};
    const costByProvider: Record<string, number> = {};
    const tokensByProvider: Record<string, number> = {};

    filteredRequests.forEach(request => {
      // Models
      topModels[request.model] = (topModels[request.model] || 0) + 1;
      
      // Providers
      topProviders[request.provider] = (topProviders[request.provider] || 0) + 1;
      costByProvider[request.provider] = (costByProvider[request.provider] || 0) + request.cost;
      tokensByProvider[request.provider] = (tokensByProvider[request.provider] || 0) + request.totalTokens;
    });

    // Daily usage
    const dailyUsage = this.calculateDailyUsage(filteredRequests);

    return {
      totalRequests,
      totalTokens,
      totalCost,
      averageLatency: totalLatency / totalRequests,
      errorRate: failedRequests.length / totalRequests,
      successRate: successfulRequests.length / totalRequests,
      topModels,
      topProviders,
      costByProvider,
      tokensByProvider,
      dailyUsage
    };
  }

  private calculateDailyUsage(requests: LLMRequest[]): Record<string, UsageDay> {
    const dailyData: Record<string, UsageDay> = {};

    requests.forEach(request => {
      const date = new Date(request.timestamp).toISOString().split('T')[0];
      
      if (!dailyData[date]) {
        dailyData[date] = {
          date,
          requests: 0,
          tokens: 0,
          cost: 0,
          errors: 0,
          averageLatency: 0
        };
      }

      const day = dailyData[date];
      day.requests++;
      day.tokens += request.totalTokens;
      day.cost += request.cost;
      if (!request.success) day.errors++;
      day.averageLatency = (day.averageLatency * (day.requests - 1) + request.latency) / day.requests;
    });

    return dailyData;
  }

  private getEmptyMetrics(): LLMUsageMetrics {
    return {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      averageLatency: 0,
      errorRate: 0,
      successRate: 0,
      topModels: {},
      topProviders: {},
      costByProvider: {},
      tokensByProvider: {},
      dailyUsage: {}
    };
  }

  getUserMetrics(userId: string, since?: number): LLMUsageMetrics {
    const userRequests = this.requests.filter(r => r.userId === userId);
    const filteredRequests = since 
      ? userRequests.filter(r => r.timestamp >= since)
      : userRequests;

    return this.calculateMetricsFromRequests(filteredRequests);
  }

  private calculateMetricsFromRequests(requests: LLMRequest[]): LLMUsageMetrics {
    if (requests.length === 0) return this.getEmptyMetrics();

    // Similar calculation as getMetrics but for specific request set
    const totalRequests = requests.length;
    const successfulRequests = requests.filter(r => r.success);
    const totalTokens = requests.reduce((sum, r) => sum + r.totalTokens, 0);
    const totalCost = requests.reduce((sum, r) => sum + r.cost, 0);
    const totalLatency = requests.reduce((sum, r) => sum + r.latency, 0);

    return {
      totalRequests,
      totalTokens,
      totalCost,
      averageLatency: totalLatency / totalRequests,
      errorRate: (totalRequests - successfulRequests.length) / totalRequests,
      successRate: successfulRequests.length / totalRequests,
      topModels: {},
      topProviders: {},
      costByProvider: {},
      tokensByProvider: {},
      dailyUsage: this.calculateDailyUsage(requests)
    };
  }
}

class RateLimiter {
  private windows = new Map<string, number[]>(); // userId -> timestamps array
  private defaultLimits: RateLimitConfig = {
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    requestsPerDay: 10000,
    tokensPerMinute: 50000,
    tokensPerHour: 500000,
    tokensPerDay: 2000000,
    costPerDay: 50 // $50 per day
  };

  checkRateLimit(
    userId: string, 
    tokenCount: number, 
    estimatedCost: number,
    customLimits?: Partial<RateLimitConfig>
  ): RateLimitStatus {
    const limits = { ...this.defaultLimits, ...customLimits };
    const now = Date.now();
    
    // Get user's request history
    if (!this.windows.has(userId)) {
      this.windows.set(userId, []);
    }
    
    const userHistory = this.windows.get(userId)!;
    
    // Clean old entries
    this.cleanOldEntries(userHistory, now);
    
    // Check limits
    const minuteAgo = now - 60 * 1000;
    const hourAgo = now - 60 * 60 * 1000;
    const dayAgo = now - 24 * 60 * 60 * 1000;
    
    const requestsLastMinute = userHistory.filter(t => t > minuteAgo).length;
    const requestsLastHour = userHistory.filter(t => t > hourAgo).length;
    const requestsLastDay = userHistory.filter(t => t > dayAgo).length;
    
    // Check request limits
    if (requestsLastMinute >= limits.requestsPerMinute) {
      return {
        allowed: false,
        reason: 'Requests per minute limit exceeded',
        resetTime: minuteAgo + 60 * 1000,
        remaining: this.calculateRemaining(limits, requestsLastMinute, requestsLastHour, requestsLastDay, 0, 0, 0, 0)
      };
    }
    
    if (requestsLastHour >= limits.requestsPerHour) {
      return {
        allowed: false,
        reason: 'Requests per hour limit exceeded',
        resetTime: hourAgo + 60 * 60 * 1000,
        remaining: this.calculateRemaining(limits, requestsLastMinute, requestsLastHour, requestsLastDay, 0, 0, 0, 0)
      };
    }
    
    if (requestsLastDay >= limits.requestsPerDay) {
      return {
        allowed: false,
        reason: 'Requests per day limit exceeded',
        resetTime: dayAgo + 24 * 60 * 60 * 1000,
        remaining: this.calculateRemaining(limits, requestsLastMinute, requestsLastHour, requestsLastDay, 0, 0, 0, 0)
      };
    }

    // TODO: Check token and cost limits (would need additional tracking)
    
    return {
      allowed: true,
      remaining: this.calculateRemaining(limits, requestsLastMinute, requestsLastHour, requestsLastDay, 0, 0, 0, 0)
    };
  }

  recordRequest(userId: string, timestamp: number = Date.now()): void {
    if (!this.windows.has(userId)) {
      this.windows.set(userId, []);
    }
    
    this.windows.get(userId)!.push(timestamp);
  }

  private cleanOldEntries(history: number[], now: number): void {
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const index = history.findIndex(t => t > dayAgo);
    if (index > 0) {
      history.splice(0, index);
    }
  }

  private calculateRemaining(
    limits: RateLimitConfig,
    requestsLastMinute: number,
    requestsLastHour: number,
    requestsLastDay: number,
    tokensLastMinute: number,
    tokensLastHour: number,
    tokensLastDay: number,
    costLastDay: number
  ) {
    return {
      requestsPerMinute: Math.max(0, limits.requestsPerMinute - requestsLastMinute),
      requestsPerHour: Math.max(0, limits.requestsPerHour - requestsLastHour),
      requestsPerDay: Math.max(0, limits.requestsPerDay - requestsLastDay),
      tokensPerMinute: Math.max(0, limits.tokensPerMinute - tokensLastMinute),
      tokensPerHour: Math.max(0, limits.tokensPerHour - tokensLastHour),
      tokensPerDay: Math.max(0, limits.tokensPerDay - tokensLastDay),
      costPerDay: Math.max(0, limits.costPerDay - costLastDay)
    };
  }
}

export class LLMAnalytics {
  private usageTracker = new UsageTracker();
  private rateLimiter = new RateLimiter();
  private costOptimizer = new CostOptimizer();

  /**
   * Log an LLM request for analytics
   */
  logRequest(request: LLMRequest): void {
    this.usageTracker.logRequest(request);
    
    // Learn patterns for cost optimization
    this.costOptimizer.analyzeRequest(request);
    
    console.log(`📊 LLM Request logged: ${request.provider}:${request.model} - ${request.totalTokens} tokens, $${request.cost.toFixed(4)}`);
  }

  /**
   * Check rate limits before making a request
   */
  checkRateLimit(
    userId: string, 
    estimatedTokens: number, 
    estimatedCost: number,
    customLimits?: Partial<RateLimitConfig>
  ): RateLimitStatus {
    return this.rateLimiter.checkRateLimit(userId, estimatedTokens, estimatedCost, customLimits);
  }

  /**
   * Record a request for rate limiting
   */
  recordRequest(userId: string): void {
    this.rateLimiter.recordRequest(userId);
  }

  /**
   * Get usage metrics for a time period
   */
  getUsageMetrics(since?: number): LLMUsageMetrics {
    return this.usageTracker.getMetrics(since);
  }

  /**
   * Get user-specific metrics
   */
  getUserMetrics(userId: string, since?: number): LLMUsageMetrics {
    return this.usageTracker.getUserMetrics(userId, since);
  }

  /**
   * Get cost optimization recommendations
   */
  getCostOptimizationRecommendations(): CostOptimizationRecommendation[] {
    return this.costOptimizer.getRecommendations();
  }

  /**
   * Get real-time dashboard data
   */
  getDashboardData(): {
    metrics: LLMUsageMetrics;
    recentActivity: LLMRequest[];
    recommendations: CostOptimizationRecommendation[];
    alerts: AnalyticsAlert[];
  } {
    const last24Hours = Date.now() - 24 * 60 * 60 * 1000;
    const metrics = this.getUsageMetrics(last24Hours);
    
    return {
      metrics,
      recentActivity: this.usageTracker['requests'].slice(-20), // Last 20 requests
      recommendations: this.getCostOptimizationRecommendations(),
      alerts: this.generateAlerts(metrics)
    };
  }

  private generateAlerts(metrics: LLMUsageMetrics): AnalyticsAlert[] {
    const alerts: AnalyticsAlert[] = [];

    // High error rate alert
    if (metrics.errorRate > 0.1) {
      alerts.push({
        type: 'error_rate',
        severity: 'high',
        message: `Error rate is ${(metrics.errorRate * 100).toFixed(1)}% - investigate provider issues`,
        threshold: 0.1,
        current: metrics.errorRate
      });
    }

    // High cost alert
    if (metrics.totalCost > 100) {
      alerts.push({
        type: 'cost',
        severity: 'medium',
        message: `Daily cost is $${metrics.totalCost.toFixed(2)} - consider optimization`,
        threshold: 100,
        current: metrics.totalCost
      });
    }

    // High latency alert
    if (metrics.averageLatency > 5000) {
      alerts.push({
        type: 'latency',
        severity: 'medium',
        message: `Average latency is ${metrics.averageLatency.toFixed(0)}ms - check provider performance`,
        threshold: 5000,
        current: metrics.averageLatency
      });
    }

    return alerts;
  }
}

interface CostOptimizationRecommendation {
  type: 'model' | 'provider' | 'caching' | 'batching';
  impact: 'high' | 'medium' | 'low';
  description: string;
  potentialSavings: number;
  implementationEffort: 'low' | 'medium' | 'high';
}

interface AnalyticsAlert {
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  threshold: number;
  current: number;
}

class CostOptimizer {
  private patterns: Map<string, number> = new Map();
  private providerCosts: Map<string, number[]> = new Map();

  analyzeRequest(request: LLMRequest): void {
    // Track patterns
    const pattern = `${request.provider}:${request.model}:${Math.floor(request.totalTokens / 100) * 100}`;
    this.patterns.set(pattern, (this.patterns.get(pattern) || 0) + 1);

    // Track provider costs
    if (!this.providerCosts.has(request.provider)) {
      this.providerCosts.set(request.provider, []);
    }
    this.providerCosts.get(request.provider)!.push(request.cost);
  }

  getRecommendations(): CostOptimizationRecommendation[] {
    const recommendations: CostOptimizationRecommendation[] = [];

    // Analyze provider costs
    const avgCosts = new Map<string, number>();
    for (const [provider, costs] of this.providerCosts) {
      const avg = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
      avgCosts.set(provider, avg);
    }

    // Recommend cheaper providers
    if (avgCosts.size > 1) {
      const providers = Array.from(avgCosts.entries()).sort((a, b) => a[1] - b[1]);
      const cheapest = providers[0];
      const mostExpensive = providers[providers.length - 1];

      if (mostExpensive[1] > cheapest[1] * 1.5) {
        recommendations.push({
          type: 'provider',
          impact: 'high',
          description: `Consider switching from ${mostExpensive[0]} to ${cheapest[0]} for cost savings`,
          potentialSavings: (mostExpensive[1] - cheapest[1]) * 1000, // Estimate for 1000 requests
          implementationEffort: 'medium'
        });
      }
    }

    // Recommend caching for repeated patterns
    const frequentPatterns = Array.from(this.patterns.entries())
      .filter(([_, count]) => count > 10)
      .sort((a, b) => b[1] - a[1]);

    if (frequentPatterns.length > 0) {
      recommendations.push({
        type: 'caching',
        impact: 'medium',
        description: 'Implement caching for repeated LLM calls to reduce costs',
        potentialSavings: frequentPatterns.length * 0.01, // Estimate
        implementationEffort: 'low'
      });
    }

    return recommendations;
  }
}

export const llmAnalytics = new LLMAnalytics();