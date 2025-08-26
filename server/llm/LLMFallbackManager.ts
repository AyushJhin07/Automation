/**
 * LLMFallbackManager - Multi-provider fallbacks with circuit breakers and intelligent routing
 * Automatically switches between providers based on availability, performance, and cost
 */

import { llmRegistry, LLMProvider, LLMResult, LLMMessage, LLMTool, LLMModelId } from './LLMProvider';

export interface ProviderConfig {
  id: string;
  priority: number; // Higher = preferred
  maxConcurrentRequests: number;
  timeoutMs: number;
  costMultiplier: number; // For cost comparison
  models: string[];
  circuitBreaker: CircuitBreakerConfig;
}

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening
  timeoutMs: number; // How long to wait before trying again
  halfOpenMaxRequests: number; // Max requests to test when half-open
}

export interface FallbackRequest {
  model: LLMModelId;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: LLMTool[];
  toolChoice?: 'auto' | 'none' | { name: string };
  responseFormat?: 'text' | { type: 'json_object'; schema?: any };
  abortSignal?: AbortSignal;
  preferredProviders?: string[];
  maxCost?: number;
  maxLatency?: number;
}

export interface FallbackResult extends LLMResult {
  providerUsed: string;
  attemptsCount: number;
  failedProviders: string[];
  totalLatency: number;
  routingReason: string;
}

enum CircuitState {
  CLOSED = 'closed',     // Normal operation
  OPEN = 'open',         // Failing, rejecting requests
  HALF_OPEN = 'half_open' // Testing if service recovered
}

class CircuitBreaker {
  private state = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenRequestCount = 0;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.config.timeoutMs) {
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenRequestCount = 0;
        console.log(`🔄 Circuit breaker moving to HALF_OPEN state`);
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenRequestCount >= this.config.halfOpenMaxRequests) {
        throw new Error('Circuit breaker HALF_OPEN request limit exceeded');
      }
      this.halfOpenRequestCount++;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.CLOSED;
      console.log(`✅ Circuit breaker recovered to CLOSED state`);
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      console.log(`❌ Circuit breaker back to OPEN state`);
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      console.log(`🚫 Circuit breaker OPENED due to failures`);
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  isAvailable(): boolean {
    return this.state === CircuitState.CLOSED || 
           (this.state === CircuitState.HALF_OPEN && 
            this.halfOpenRequestCount < this.config.halfOpenMaxRequests);
  }
}

class ProviderMetrics {
  private latencies: number[] = [];
  private costs: number[] = [];
  private successCount = 0;
  private failureCount = 0;
  private concurrentRequests = 0;
  private lastUsed = 0;

  recordRequest(latency: number, cost: number, success: boolean): void {
    this.latencies.push(latency);
    this.costs.push(cost);
    
    // Keep only last 100 entries
    if (this.latencies.length > 100) {
      this.latencies = this.latencies.slice(-100);
      this.costs = this.costs.slice(-100);
    }

    if (success) {
      this.successCount++;
    } else {
      this.failureCount++;
    }

    this.lastUsed = Date.now();
  }

  incrementConcurrent(): void {
    this.concurrentRequests++;
  }

  decrementConcurrent(): void {
    this.concurrentRequests = Math.max(0, this.concurrentRequests - 1);
  }

  getAverageLatency(): number {
    return this.latencies.length > 0 
      ? this.latencies.reduce((sum, l) => sum + l, 0) / this.latencies.length
      : 0;
  }

  getAverageCost(): number {
    return this.costs.length > 0
      ? this.costs.reduce((sum, c) => sum + c, 0) / this.costs.length
      : 0;
  }

  getSuccessRate(): number {
    const total = this.successCount + this.failureCount;
    return total > 0 ? this.successCount / total : 1;
  }

  getConcurrentRequests(): number {
    return this.concurrentRequests;
  }

  getScore(weights: { latency: number; cost: number; success: number; load: number }): number {
    const latencyScore = Math.max(0, 1 - this.getAverageLatency() / 10000); // Normalize to 10s max
    const costScore = Math.max(0, 1 - this.getAverageCost() / 0.1); // Normalize to $0.10 max
    const successScore = this.getSuccessRate();
    const loadScore = Math.max(0, 1 - this.concurrentRequests / 10); // Normalize to 10 concurrent max

    return (
      latencyScore * weights.latency +
      costScore * weights.cost +
      successScore * weights.success +
      loadScore * weights.load
    );
  }
}

export class LLMFallbackManager {
  private providers = new Map<string, ProviderConfig>();
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private metrics = new Map<string, ProviderMetrics>();
  private defaultWeights = {
    latency: 0.3,
    cost: 0.2,
    success: 0.4,
    load: 0.1
  };

  constructor() {
    this.initializeDefaultProviders();
  }

  /**
   * Register a provider configuration
   */
  registerProvider(config: ProviderConfig): void {
    this.providers.set(config.id, config);
    this.circuitBreakers.set(config.id, new CircuitBreaker(config.circuitBreaker));
    this.metrics.set(config.id, new ProviderMetrics());
    
    console.log(`🔧 Registered fallback provider: ${config.id}`);
  }

  /**
   * Execute LLM request with automatic fallback
   */
  async executeWithFallback(request: FallbackRequest): Promise<FallbackResult> {
    const startTime = Date.now();
    const failedProviders: string[] = [];
    let attemptsCount = 0;

    // Get available providers in order of preference
    const providers = this.selectProviders(request);
    
    if (providers.length === 0) {
      throw new Error('No available providers for this request');
    }

    console.log(`🔄 Attempting fallback with providers: ${providers.map(p => p.id).join(' → ')}`);

    for (const providerConfig of providers) {
      attemptsCount++;
      
      try {
        const provider = llmRegistry.get(providerConfig.id);
        const metrics = this.metrics.get(providerConfig.id)!;
        const circuitBreaker = this.circuitBreakers.get(providerConfig.id)!;

        // Check if provider is available
        if (!circuitBreaker.isAvailable()) {
          failedProviders.push(providerConfig.id);
          console.log(`⏭️  Skipping ${providerConfig.id} - circuit breaker not available`);
          continue;
        }

        // Check concurrent request limit
        if (metrics.getConcurrentRequests() >= providerConfig.maxConcurrentRequests) {
          failedProviders.push(providerConfig.id);
          console.log(`⏭️  Skipping ${providerConfig.id} - too many concurrent requests`);
          continue;
        }

        // Attempt request with circuit breaker
        metrics.incrementConcurrent();
        const requestStart = Date.now();

        try {
          const result = await circuitBreaker.execute(async () => {
            const timeoutPromise = new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error('Request timeout')), providerConfig.timeoutMs);
            });

            const requestPromise = provider.generate({
              model: request.model,
              messages: request.messages,
              temperature: request.temperature,
              maxTokens: request.maxTokens,
              tools: request.tools,
              toolChoice: request.toolChoice,
              responseFormat: request.responseFormat,
              abortSignal: request.abortSignal
            });

            return Promise.race([requestPromise, timeoutPromise]);
          });

          const requestLatency = Date.now() - requestStart;
          const totalLatency = Date.now() - startTime;
          
          // Record successful metrics
          metrics.recordRequest(requestLatency, result.usage?.costUSD || 0, true);
          metrics.decrementConcurrent();

          console.log(`✅ Request succeeded with ${providerConfig.id} in ${requestLatency}ms`);

          return {
            ...result,
            providerUsed: providerConfig.id,
            attemptsCount,
            failedProviders,
            totalLatency,
            routingReason: this.getRoutingReason(providerConfig, providers)
          };

        } catch (error) {
          const requestLatency = Date.now() - requestStart;
          metrics.recordRequest(requestLatency, 0, false);
          metrics.decrementConcurrent();
          
          failedProviders.push(providerConfig.id);
          console.log(`❌ Request failed with ${providerConfig.id}:`, error.message);
          
          // Continue to next provider
          continue;
        }

      } catch (error) {
        failedProviders.push(providerConfig.id);
        console.log(`❌ Provider ${providerConfig.id} unavailable:`, error.message);
        continue;
      }
    }

    // All providers failed
    const totalLatency = Date.now() - startTime;
    throw new Error(`All providers failed. Attempted: ${failedProviders.join(', ')}. Total time: ${totalLatency}ms`);
  }

  /**
   * Get provider recommendations based on current metrics
   */
  getProviderRecommendations(): Array<{
    providerId: string;
    score: number;
    metrics: {
      avgLatency: number;
      avgCost: number;
      successRate: number;
      concurrentRequests: number;
      circuitState: string;
    };
    recommendation: string;
  }> {
    const recommendations = [];

    for (const [providerId, config] of this.providers) {
      const metrics = this.metrics.get(providerId)!;
      const circuitBreaker = this.circuitBreakers.get(providerId)!;
      
      const score = metrics.getScore(this.defaultWeights);
      const avgLatency = metrics.getAverageLatency();
      const avgCost = metrics.getAverageCost();
      const successRate = metrics.getSuccessRate();
      
      let recommendation = '';
      if (circuitBreaker.getState() === CircuitState.OPEN) {
        recommendation = 'Circuit breaker is open - provider experiencing issues';
      } else if (successRate < 0.9) {
        recommendation = 'Low success rate - monitor for issues';
      } else if (avgLatency > 5000) {
        recommendation = 'High latency - consider using for non-time-critical requests';
      } else if (avgCost > 0.05) {
        recommendation = 'High cost - use for high-value requests only';
      } else {
        recommendation = 'Good performance - recommended for general use';
      }

      recommendations.push({
        providerId,
        score,
        metrics: {
          avgLatency,
          avgCost,
          successRate,
          concurrentRequests: metrics.getConcurrentRequests(),
          circuitState: circuitBreaker.getState()
        },
        recommendation
      });
    }

    return recommendations.sort((a, b) => b.score - a.score);
  }

  /**
   * Get real-time status of all providers
   */
  getProviderStatus(): Record<string, {
    available: boolean;
    circuitState: string;
    concurrentRequests: number;
    maxConcurrentRequests: number;
    avgLatency: number;
    successRate: number;
  }> {
    const status: Record<string, any> = {};

    for (const [providerId, config] of this.providers) {
      const metrics = this.metrics.get(providerId)!;
      const circuitBreaker = this.circuitBreakers.get(providerId)!;

      status[providerId] = {
        available: circuitBreaker.isAvailable(),
        circuitState: circuitBreaker.getState(),
        concurrentRequests: metrics.getConcurrentRequests(),
        maxConcurrentRequests: config.maxConcurrentRequests,
        avgLatency: metrics.getAverageLatency(),
        successRate: metrics.getSuccessRate()
      };
    }

    return status;
  }

  private selectProviders(request: FallbackRequest): ProviderConfig[] {
    let availableProviders = Array.from(this.providers.values());

    // Filter by model support
    const modelProvider = request.model.split(':')[0];
    availableProviders = availableProviders.filter(p => 
      p.models.includes(request.model) || p.id === modelProvider
    );

    // Apply user preferences
    if (request.preferredProviders) {
      const preferred = availableProviders.filter(p => 
        request.preferredProviders!.includes(p.id)
      );
      const others = availableProviders.filter(p => 
        !request.preferredProviders!.includes(p.id)
      );
      availableProviders = [...preferred, ...others];
    }

    // Filter by constraints
    if (request.maxCost) {
      availableProviders = availableProviders.filter(p => {
        const metrics = this.metrics.get(p.id)!;
        return metrics.getAverageCost() * p.costMultiplier <= request.maxCost!;
      });
    }

    if (request.maxLatency) {
      availableProviders = availableProviders.filter(p => {
        const metrics = this.metrics.get(p.id)!;
        return metrics.getAverageLatency() <= request.maxLatency!;
      });
    }

    // Sort by score (priority + performance)
    availableProviders.sort((a, b) => {
      const scoreA = this.calculateProviderScore(a);
      const scoreB = this.calculateProviderScore(b);
      return scoreB - scoreA;
    });

    return availableProviders;
  }

  private calculateProviderScore(config: ProviderConfig): number {
    const metrics = this.metrics.get(config.id)!;
    const circuitBreaker = this.circuitBreakers.get(config.id)!;

    if (!circuitBreaker.isAvailable()) {
      return -1; // Lowest priority
    }

    const baseScore = config.priority;
    const performanceScore = metrics.getScore(this.defaultWeights);
    
    return baseScore + performanceScore;
  }

  private getRoutingReason(used: ProviderConfig, available: ProviderConfig[]): string {
    if (available.length === 1) {
      return 'Only available provider';
    }
    
    if (available[0].id === used.id) {
      return 'Highest priority available provider';
    }
    
    return `Selected after ${available.findIndex(p => p.id === used.id)} failed attempts`;
  }

  private initializeDefaultProviders(): void {
    // Register default provider configurations
    this.registerProvider({
      id: 'openai',
      priority: 10,
      maxConcurrentRequests: 10,
      timeoutMs: 30000,
      costMultiplier: 1.0,
      models: ['openai:gpt-4o-mini', 'openai:gpt-4.1', 'openai:o3-mini'],
      circuitBreaker: {
        failureThreshold: 5,
        timeoutMs: 60000,
        halfOpenMaxRequests: 3
      }
    });

    this.registerProvider({
      id: 'anthropic',
      priority: 8,
      maxConcurrentRequests: 8,
      timeoutMs: 25000,
      costMultiplier: 1.2,
      models: ['anthropic:claude-3-5-sonnet', 'anthropic:claude-3-haiku'],
      circuitBreaker: {
        failureThreshold: 5,
        timeoutMs: 60000,
        halfOpenMaxRequests: 3
      }
    });

    this.registerProvider({
      id: 'google',
      priority: 6,
      maxConcurrentRequests: 6,
      timeoutMs: 20000,
      costMultiplier: 0.8,
      models: ['google:gemini-1.5-pro', 'google:gemini-1.5-flash'],
      circuitBreaker: {
        failureThreshold: 5,
        timeoutMs: 60000,
        halfOpenMaxRequests: 3
      }
    });

    console.log('🔧 Initialized default provider configurations');
  }
}

export const llmFallbackManager = new LLMFallbackManager();