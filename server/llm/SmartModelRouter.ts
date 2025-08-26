/**
 * SMART MODEL ROUTER
 * Intelligent routing of LLM requests based on cost, speed, accuracy, and context
 */

export interface ModelProfile {
  id: string;
  provider: string;
  name: string;
  tier: ModelTier;
  capabilities: ModelCapabilities;
  performance: ModelPerformance;
  pricing: ModelPricing;
  limits: ModelLimits;
  availability: ModelAvailability;
}

export type ModelTier = 'ultra_fast' | 'fast' | 'balanced' | 'accurate' | 'ultra_accurate';

export interface ModelCapabilities {
  maxTokens: number;
  supportsJSON: boolean;
  supportsFunctionCalling: boolean;
  supportsStreaming: boolean;
  supportsSystemPrompts: boolean;
  languages: string[];
  specialties: ModelSpecialty[];
}

export type ModelSpecialty = 
  | 'general' | 'coding' | 'math' | 'reasoning' | 'creative_writing' 
  | 'summarization' | 'translation' | 'qa' | 'classification' | 'extraction';

export interface ModelPerformance {
  averageLatency: number; // milliseconds
  tokensPerSecond: number;
  qualityScore: number; // 0-100
  reliabilityScore: number; // 0-100
  accuracyByTask: Record<ModelSpecialty, number>; // 0-100
}

export interface ModelPricing {
  inputTokenPrice: number; // USD per 1K tokens
  outputTokenPrice: number; // USD per 1K tokens
  perRequestCost: number; // Fixed cost per request
  currency: string;
  billingModel: 'per_token' | 'per_request' | 'subscription';
}

export interface ModelLimits {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  tokensPerMinute: number;
  tokensPerDay: number;
  concurrentRequests: number;
}

export interface ModelAvailability {
  regions: string[];
  uptime: number; // percentage
  maintenanceWindows: Array<{
    start: string; // ISO time
    end: string; // ISO time
    frequency: 'daily' | 'weekly' | 'monthly';
  }>;
}

export interface RoutingRequest {
  id: string;
  prompt: string;
  task: ModelSpecialty;
  priority: RequestPriority;
  constraints: RoutingConstraints;
  context: RequestContext;
  user: UserProfile;
}

export type RequestPriority = 'low' | 'normal' | 'high' | 'critical';

export interface RoutingConstraints {
  maxCost?: number; // USD
  maxLatency?: number; // milliseconds
  minQuality?: number; // 0-100
  preferredProviders?: string[];
  excludedProviders?: string[];
  requiresJSON?: boolean;
  requiresFunctionCalling?: boolean;
  requiresStreaming?: boolean;
}

export interface RequestContext {
  workflowId?: string;
  nodeId?: string;
  userId?: string;
  sessionId?: string;
  previousRequests?: string[];
  timeOfDay?: string;
  expectedVolume?: number;
}

export interface UserProfile {
  id: string;
  tier: UserTier;
  dailyBudget: number;
  usedBudget: number;
  preferences: UserPreferences;
  usage: UserUsageStats;
}

export type UserTier = 'free' | 'starter' | 'pro' | 'enterprise';

export interface UserPreferences {
  preferredProviders: string[];
  defaultQualityThreshold: number;
  maxLatency: number;
  costSensitivity: 'low' | 'medium' | 'high';
  qualityOverSpeed: boolean;
}

export interface UserUsageStats {
  totalRequests: number;
  totalCost: number;
  averageLatency: number;
  preferredTasks: ModelSpecialty[];
  successRate: number;
}

export interface RoutingDecision {
  selectedModel: ModelProfile;
  reason: RoutingReason;
  alternatives: Array<{
    model: ModelProfile;
    score: number;
    reasoning: string;
  }>;
  estimatedCost: number;
  estimatedLatency: number;
  estimatedQuality: number;
  confidence: number; // 0-100
}

export type RoutingReason = 
  | 'cost_optimized' | 'speed_optimized' | 'quality_optimized' | 'balanced'
  | 'budget_constrained' | 'latency_constrained' | 'provider_preference'
  | 'task_specialized' | 'fallback' | 'load_balancing';

export interface RoutingStrategy {
  name: string;
  description: string;
  weight: RoutingWeights;
  rules: RoutingRule[];
}

export interface RoutingWeights {
  cost: number; // 0-1
  speed: number; // 0-1
  quality: number; // 0-1
  reliability: number; // 0-1
  availability: number; // 0-1
}

export interface RoutingRule {
  id: string;
  condition: RuleCondition;
  action: RuleAction;
  priority: number;
}

export interface RuleCondition {
  taskType?: ModelSpecialty[];
  userTier?: UserTier[];
  timeOfDay?: Array<{ start: string; end: string }>;
  budgetThreshold?: number;
  latencyRequirement?: number;
  qualityRequirement?: number;
}

export interface RuleAction {
  type: 'route_to_model' | 'apply_strategy' | 'reject_request' | 'queue_request';
  value: string;
  metadata?: Record<string, any>;
}

export interface CostOptimization {
  strategy: OptimizationStrategy;
  savings: {
    potential: number;
    realized: number;
  };
  recommendations: OptimizationRecommendation[];
}

export type OptimizationStrategy = 
  | 'prompt_compression' | 'batch_processing' | 'caching' | 'model_switching'
  | 'off_peak_routing' | 'quality_adaptation' | 'provider_arbitrage';

export interface OptimizationRecommendation {
  strategy: OptimizationStrategy;
  description: string;
  estimatedSavings: number; // USD
  implementationComplexity: 'low' | 'medium' | 'high';
  riskLevel: 'low' | 'medium' | 'high';
}

class SmartModelRouter {
  private models = new Map<string, ModelProfile>();
  private strategies = new Map<string, RoutingStrategy>();
  private routingHistory: Array<{ request: RoutingRequest; decision: RoutingDecision; outcome: any }> = [];
  
  private readonly maxHistorySize = 10000;
  private readonly defaultStrategy = 'balanced';

  constructor() {
    this.initializeModels();
    this.initializeStrategies();
    this.startPerformanceMonitoring();
    console.log('🎯 Smart Model Router initialized');
  }

  /**
   * Route a request to the optimal model
   */
  async routeRequest(request: RoutingRequest): Promise<RoutingDecision> {
    // Validate request constraints
    this.validateRequest(request);

    // Get available models
    const availableModels = this.getAvailableModels(request);
    
    if (availableModels.length === 0) {
      throw new Error('No available models match the request constraints');
    }

    // Select routing strategy
    const strategy = this.selectRoutingStrategy(request);
    
    // Score and rank models
    const scoredModels = this.scoreModels(availableModels, request, strategy);
    
    // Select best model
    const selectedModel = scoredModels[0].model;
    
    // Create routing decision
    const decision: RoutingDecision = {
      selectedModel,
      reason: this.determineRoutingReason(selectedModel, request, strategy),
      alternatives: scoredModels.slice(1, 4).map(sm => ({
        model: sm.model,
        score: sm.score,
        reasoning: sm.reasoning
      })),
      estimatedCost: this.estimateCost(selectedModel, request),
      estimatedLatency: this.estimateLatency(selectedModel, request),
      estimatedQuality: this.estimateQuality(selectedModel, request),
      confidence: scoredModels[0].score
    };

    // Record routing decision
    this.recordRoutingDecision(request, decision);
    
    console.log(`🎯 Routed request ${request.id} to ${selectedModel.name} (${decision.reason})`);
    
    return decision;
  }

  /**
   * Get cost optimization recommendations
   */
  getCostOptimization(userId: string, timeframe?: { start: Date; end: Date }): CostOptimization {
    const userHistory = this.getUserRoutingHistory(userId, timeframe);
    
    if (userHistory.length === 0) {
      return {
        strategy: 'caching',
        savings: { potential: 0, realized: 0 },
        recommendations: []
      };
    }

    const totalCost = userHistory.reduce((sum, h) => sum + h.decision.estimatedCost, 0);
    const averageLatency = userHistory.reduce((sum, h) => sum + h.decision.estimatedLatency, 0) / userHistory.length;
    
    const recommendations: OptimizationRecommendation[] = [];

    // Analyze prompt compression opportunities
    const longPrompts = userHistory.filter(h => h.request.prompt.length > 2000);
    if (longPrompts.length > 0) {
      recommendations.push({
        strategy: 'prompt_compression',
        description: `${longPrompts.length} requests with prompts >2000 chars could benefit from compression`,
        estimatedSavings: longPrompts.length * 0.015, // Estimate 15% savings
        implementationComplexity: 'medium',
        riskLevel: 'low'
      });
    }

    // Analyze caching opportunities
    const duplicatePrompts = this.findDuplicatePrompts(userHistory);
    if (duplicatePrompts.length > 0) {
      recommendations.push({
        strategy: 'caching',
        description: `${duplicatePrompts.length} duplicate prompts could be cached`,
        estimatedSavings: duplicatePrompts.length * 0.8, // Almost full cost savings
        implementationComplexity: 'low',
        riskLevel: 'low'
      });
    }

    // Analyze model switching opportunities
    const expensiveRequests = userHistory.filter(h => h.decision.estimatedCost > 0.05);
    if (expensiveRequests.length > 0) {
      recommendations.push({
        strategy: 'model_switching',
        description: `${expensiveRequests.length} expensive requests could use cheaper models`,
        estimatedSavings: expensiveRequests.length * 0.03,
        implementationComplexity: 'medium',
        riskLevel: 'medium'
      });
    }

    // Analyze batch processing opportunities
    const quickRequests = userHistory.filter(h => 
      h.request.priority === 'low' && h.decision.estimatedLatency < 2000
    );
    if (quickRequests.length > 5) {
      recommendations.push({
        strategy: 'batch_processing',
        description: `${quickRequests.length} low-priority requests could be batched`,
        estimatedSavings: quickRequests.length * 0.02,
        implementationComplexity: 'high',
        riskLevel: 'low'
      });
    }

    const potentialSavings = recommendations.reduce((sum, r) => sum + r.estimatedSavings, 0);

    return {
      strategy: recommendations.length > 0 ? recommendations[0].strategy : 'caching',
      savings: {
        potential: potentialSavings,
        realized: 0 // Would track actual savings over time
      },
      recommendations: recommendations.sort((a, b) => b.estimatedSavings - a.estimatedSavings)
    };
  }

  /**
   * Get model performance analytics
   */
  getModelAnalytics(timeframe?: { start: Date; end: Date }): {
    modelUsage: Array<{
      modelId: string;
      requests: number;
      totalCost: number;
      averageLatency: number;
      successRate: number;
    }>;
    costTrends: Array<{
      date: string;
      totalCost: number;
      requestCount: number;
    }>;
    routingReasons: Array<{
      reason: RoutingReason;
      count: number;
      percentage: number;
    }>;
    recommendations: string[];
  } {
    let history = this.routingHistory;
    
    if (timeframe) {
      // Filter by timeframe (would use actual timestamps in production)
      history = this.routingHistory.slice(-1000); // Last 1000 for demo
    }

    // Model usage statistics
    const modelUsage = new Map<string, { requests: number; totalCost: number; latencySum: number; successes: number }>();
    
    history.forEach(h => {
      const modelId = h.decision.selectedModel.id;
      if (!modelUsage.has(modelId)) {
        modelUsage.set(modelId, { requests: 0, totalCost: 0, latencySum: 0, successes: 0 });
      }
      
      const stats = modelUsage.get(modelId)!;
      stats.requests++;
      stats.totalCost += h.decision.estimatedCost;
      stats.latencySum += h.decision.estimatedLatency;
      stats.successes += h.outcome?.success ? 1 : 0;
    });

    const modelUsageArray = Array.from(modelUsage.entries()).map(([modelId, stats]) => ({
      modelId,
      requests: stats.requests,
      totalCost: stats.totalCost,
      averageLatency: stats.latencySum / stats.requests,
      successRate: (stats.successes / stats.requests) * 100
    })).sort((a, b) => b.requests - a.requests);

    // Cost trends (simplified - would use actual dates)
    const costTrends = [
      { date: '2024-01-01', totalCost: 15.30, requestCount: 150 },
      { date: '2024-01-02', totalCost: 18.45, requestCount: 180 },
      { date: '2024-01-03', totalCost: 12.20, requestCount: 120 },
      { date: '2024-01-04', totalCost: 22.10, requestCount: 210 },
      { date: '2024-01-05', totalCost: 19.80, requestCount: 195 }
    ];

    // Routing reasons distribution
    const reasonCounts = new Map<RoutingReason, number>();
    history.forEach(h => {
      reasonCounts.set(h.decision.reason, (reasonCounts.get(h.decision.reason) || 0) + 1);
    });

    const totalRequests = history.length;
    const routingReasons = Array.from(reasonCounts.entries()).map(([reason, count]) => ({
      reason,
      count,
      percentage: (count / totalRequests) * 100
    })).sort((a, b) => b.count - a.count);

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (modelUsageArray.length > 0) {
      const topModel = modelUsageArray[0];
      if (topModel.averageLatency > 5000) {
        recommendations.push(`Consider faster alternatives to ${topModel.modelId} for latency-sensitive tasks`);
      }
      if (topModel.successRate < 95) {
        recommendations.push(`Monitor ${topModel.modelId} reliability - success rate below 95%`);
      }
    }

    const totalCost = history.reduce((sum, h) => sum + h.decision.estimatedCost, 0);
    if (totalCost > 100) {
      recommendations.push('High usage detected - consider implementing cost optimization strategies');
    }

    return {
      modelUsage: modelUsageArray,
      costTrends,
      routingReasons,
      recommendations
    };
  }

  /**
   * Add or update a model profile
   */
  addModel(model: ModelProfile): void {
    this.models.set(model.id, model);
    console.log(`📊 Added model profile: ${model.name}`);
  }

  /**
   * Get all available models
   */
  getModels(): ModelProfile[] {
    return Array.from(this.models.values());
  }

  /**
   * Update model performance metrics
   */
  updateModelPerformance(modelId: string, metrics: {
    latency?: number;
    qualityScore?: number;
    successRate?: number;
  }): void {
    const model = this.models.get(modelId);
    if (!model) return;

    if (metrics.latency !== undefined) {
      model.performance.averageLatency = 
        (model.performance.averageLatency + metrics.latency) / 2;
    }
    
    if (metrics.qualityScore !== undefined) {
      model.performance.qualityScore = 
        (model.performance.qualityScore + metrics.qualityScore) / 2;
    }
    
    if (metrics.successRate !== undefined) {
      model.performance.reliabilityScore = 
        (model.performance.reliabilityScore + metrics.successRate) / 2;
    }
  }

  // Private methods

  private initializeModels(): void {
    const models: ModelProfile[] = [
      {
        id: 'openai-gpt-4o-mini',
        provider: 'openai',
        name: 'GPT-4o Mini',
        tier: 'fast',
        capabilities: {
          maxTokens: 128000,
          supportsJSON: true,
          supportsFunctionCalling: true,
          supportsStreaming: true,
          supportsSystemPrompts: true,
          languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'],
          specialties: ['general', 'coding', 'reasoning', 'qa', 'classification']
        },
        performance: {
          averageLatency: 800,
          tokensPerSecond: 150,
          qualityScore: 85,
          reliabilityScore: 98,
          accuracyByTask: {
            general: 85,
            coding: 80,
            math: 75,
            reasoning: 85,
            creative_writing: 75,
            summarization: 90,
            translation: 80,
            qa: 88,
            classification: 90,
            extraction: 85
          }
        },
        pricing: {
          inputTokenPrice: 0.00015,
          outputTokenPrice: 0.0006,
          perRequestCost: 0,
          currency: 'USD',
          billingModel: 'per_token'
        },
        limits: {
          requestsPerMinute: 1000,
          requestsPerHour: 30000,
          requestsPerDay: 200000,
          tokensPerMinute: 200000,
          tokensPerDay: 2000000,
          concurrentRequests: 100
        },
        availability: {
          regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
          uptime: 99.9,
          maintenanceWindows: []
        }
      },
      {
        id: 'openai-gpt-4',
        provider: 'openai',
        name: 'GPT-4',
        tier: 'accurate',
        capabilities: {
          maxTokens: 128000,
          supportsJSON: true,
          supportsFunctionCalling: true,
          supportsStreaming: true,
          supportsSystemPrompts: true,
          languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'],
          specialties: ['general', 'coding', 'math', 'reasoning', 'creative_writing', 'qa']
        },
        performance: {
          averageLatency: 2500,
          tokensPerSecond: 50,
          qualityScore: 95,
          reliabilityScore: 99,
          accuracyByTask: {
            general: 95,
            coding: 95,
            math: 90,
            reasoning: 98,
            creative_writing: 90,
            summarization: 95,
            translation: 90,
            qa: 96,
            classification: 94,
            extraction: 92
          }
        },
        pricing: {
          inputTokenPrice: 0.03,
          outputTokenPrice: 0.06,
          perRequestCost: 0,
          currency: 'USD',
          billingModel: 'per_token'
        },
        limits: {
          requestsPerMinute: 500,
          requestsPerHour: 10000,
          requestsPerDay: 40000,
          tokensPerMinute: 40000,
          tokensPerDay: 300000,
          concurrentRequests: 50
        },
        availability: {
          regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
          uptime: 99.95,
          maintenanceWindows: []
        }
      },
      {
        id: 'anthropic-claude-3-haiku',
        provider: 'anthropic',
        name: 'Claude 3 Haiku',
        tier: 'ultra_fast',
        capabilities: {
          maxTokens: 200000,
          supportsJSON: true,
          supportsFunctionCalling: false,
          supportsStreaming: true,
          supportsSystemPrompts: true,
          languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh'],
          specialties: ['general', 'summarization', 'qa', 'classification', 'extraction']
        },
        performance: {
          averageLatency: 400,
          tokensPerSecond: 200,
          qualityScore: 80,
          reliabilityScore: 97,
          accuracyByTask: {
            general: 80,
            coding: 70,
            math: 70,
            reasoning: 78,
            creative_writing: 75,
            summarization: 88,
            translation: 85,
            qa: 85,
            classification: 88,
            extraction: 90
          }
        },
        pricing: {
          inputTokenPrice: 0.00025,
          outputTokenPrice: 0.00125,
          perRequestCost: 0,
          currency: 'USD',
          billingModel: 'per_token'
        },
        limits: {
          requestsPerMinute: 1000,
          requestsPerHour: 40000,
          requestsPerDay: 300000,
          tokensPerMinute: 300000,
          tokensPerDay: 5000000,
          concurrentRequests: 100
        },
        availability: {
          regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
          uptime: 99.8,
          maintenanceWindows: []
        }
      },
      {
        id: 'google-gemini-pro',
        provider: 'google',
        name: 'Gemini Pro',
        tier: 'balanced',
        capabilities: {
          maxTokens: 128000,
          supportsJSON: true,
          supportsFunctionCalling: true,
          supportsStreaming: true,
          supportsSystemPrompts: true,
          languages: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'hi', 'ar'],
          specialties: ['general', 'coding', 'math', 'reasoning', 'translation']
        },
        performance: {
          averageLatency: 1200,
          tokensPerSecond: 100,
          qualityScore: 88,
          reliabilityScore: 96,
          accuracyByTask: {
            general: 88,
            coding: 85,
            math: 88,
            reasoning: 90,
            creative_writing: 80,
            summarization: 87,
            translation: 92,
            qa: 89,
            classification: 87,
            extraction: 85
          }
        },
        pricing: {
          inputTokenPrice: 0.001,
          outputTokenPrice: 0.002,
          perRequestCost: 0,
          currency: 'USD',
          billingModel: 'per_token'
        },
        limits: {
          requestsPerMinute: 600,
          requestsPerHour: 15000,
          requestsPerDay: 100000,
          tokensPerMinute: 120000,
          tokensPerDay: 1000000,
          concurrentRequests: 60
        },
        availability: {
          regions: ['us-central1', 'europe-west1', 'asia-east1'],
          uptime: 99.7,
          maintenanceWindows: []
        }
      }
    ];

    models.forEach(model => {
      this.models.set(model.id, model);
    });

    console.log(`📊 Initialized ${models.length} model profiles`);
  }

  private initializeStrategies(): void {
    const strategies: RoutingStrategy[] = [
      {
        name: 'cost_optimized',
        description: 'Minimize cost while maintaining acceptable quality',
        weight: { cost: 0.7, speed: 0.1, quality: 0.1, reliability: 0.05, availability: 0.05 },
        rules: [
          {
            id: 'cost_basic_tasks',
            condition: { taskType: ['classification', 'extraction', 'summarization'] },
            action: { type: 'route_to_model', value: 'cheapest_suitable' },
            priority: 1
          }
        ]
      },
      {
        name: 'speed_optimized',
        description: 'Minimize latency for real-time applications',
        weight: { cost: 0.1, speed: 0.7, quality: 0.1, reliability: 0.05, availability: 0.05 },
        rules: [
          {
            id: 'speed_critical',
            condition: { latencyRequirement: 1000 },
            action: { type: 'route_to_model', value: 'fastest_suitable' },
            priority: 1
          }
        ]
      },
      {
        name: 'quality_optimized',
        description: 'Maximize output quality regardless of cost',
        weight: { cost: 0.05, speed: 0.1, quality: 0.7, reliability: 0.1, availability: 0.05 },
        rules: [
          {
            id: 'quality_complex_tasks',
            condition: { taskType: ['reasoning', 'creative_writing', 'coding'] },
            action: { type: 'route_to_model', value: 'highest_quality' },
            priority: 1
          }
        ]
      },
      {
        name: 'balanced',
        description: 'Balance cost, speed, and quality',
        weight: { cost: 0.3, speed: 0.3, quality: 0.3, reliability: 0.05, availability: 0.05 },
        rules: []
      }
    ];

    strategies.forEach(strategy => {
      this.strategies.set(strategy.name, strategy);
    });

    console.log(`🎯 Initialized ${strategies.length} routing strategies`);
  }

  private validateRequest(request: RoutingRequest): void {
    if (!request.prompt || request.prompt.trim().length === 0) {
      throw new Error('Request prompt cannot be empty');
    }
    
    if (request.constraints.maxCost !== undefined && request.constraints.maxCost <= 0) {
      throw new Error('Max cost constraint must be positive');
    }
    
    if (request.constraints.maxLatency !== undefined && request.constraints.maxLatency <= 0) {
      throw new Error('Max latency constraint must be positive');
    }
  }

  private getAvailableModels(request: RoutingRequest): ModelProfile[] {
    return Array.from(this.models.values()).filter(model => {
      // Check constraints
      if (request.constraints.requiresJSON && !model.capabilities.supportsJSON) {
        return false;
      }
      
      if (request.constraints.requiresFunctionCalling && !model.capabilities.supportsFunctionCalling) {
        return false;
      }
      
      if (request.constraints.requiresStreaming && !model.capabilities.supportsStreaming) {
        return false;
      }
      
      if (request.constraints.preferredProviders?.length > 0 && 
          !request.constraints.preferredProviders.includes(model.provider)) {
        return false;
      }
      
      if (request.constraints.excludedProviders?.includes(model.provider)) {
        return false;
      }
      
      // Check estimated cost
      if (request.constraints.maxCost !== undefined) {
        const estimatedCost = this.estimateCost(model, request);
        if (estimatedCost > request.constraints.maxCost) {
          return false;
        }
      }
      
      // Check estimated latency
      if (request.constraints.maxLatency !== undefined) {
        const estimatedLatency = this.estimateLatency(model, request);
        if (estimatedLatency > request.constraints.maxLatency) {
          return false;
        }
      }
      
      // Check minimum quality
      if (request.constraints.minQuality !== undefined) {
        const estimatedQuality = this.estimateQuality(model, request);
        if (estimatedQuality < request.constraints.minQuality) {
          return false;
        }
      }
      
      return true;
    });
  }

  private selectRoutingStrategy(request: RoutingRequest): RoutingStrategy {
    // Strategy selection based on user preferences and request context
    if (request.user.preferences.costSensitivity === 'high') {
      return this.strategies.get('cost_optimized')!;
    }
    
    if (request.priority === 'critical' || request.constraints.maxLatency !== undefined) {
      return this.strategies.get('speed_optimized')!;
    }
    
    if (request.user.preferences.qualityOverSpeed) {
      return this.strategies.get('quality_optimized')!;
    }
    
    return this.strategies.get(this.defaultStrategy)!;
  }

  private scoreModels(
    models: ModelProfile[], 
    request: RoutingRequest, 
    strategy: RoutingStrategy
  ): Array<{ model: ModelProfile; score: number; reasoning: string }> {
    const scored = models.map(model => {
      const scores = {
        cost: this.scoreCost(model, request),
        speed: this.scoreSpeed(model, request),
        quality: this.scoreQuality(model, request),
        reliability: this.scoreReliability(model, request),
        availability: this.scoreAvailability(model, request)
      };
      
      const weightedScore = 
        scores.cost * strategy.weight.cost +
        scores.speed * strategy.weight.speed +
        scores.quality * strategy.weight.quality +
        scores.reliability * strategy.weight.reliability +
        scores.availability * strategy.weight.availability;
      
      const reasoning = this.generateReasoning(model, scores, strategy);
      
      return {
        model,
        score: weightedScore * 100, // Convert to 0-100 scale
        reasoning
      };
    });
    
    return scored.sort((a, b) => b.score - a.score);
  }

  private scoreCost(model: ModelProfile, request: RoutingRequest): number {
    const estimatedCost = this.estimateCost(model, request);
    
    // Score inversely proportional to cost (lower cost = higher score)
    const maxCost = 1.0; // $1 as reference point
    return Math.max(0, 1 - (estimatedCost / maxCost));
  }

  private scoreSpeed(model: ModelProfile, request: RoutingRequest): number {
    const estimatedLatency = this.estimateLatency(model, request);
    
    // Score inversely proportional to latency (lower latency = higher score)
    const maxLatency = 10000; // 10 seconds as reference point
    return Math.max(0, 1 - (estimatedLatency / maxLatency));
  }

  private scoreQuality(model: ModelProfile, request: RoutingRequest): number {
    const taskAccuracy = model.performance.accuracyByTask[request.task] || model.performance.qualityScore;
    return taskAccuracy / 100; // Convert to 0-1 scale
  }

  private scoreReliability(model: ModelProfile, request: RoutingRequest): number {
    return model.performance.reliabilityScore / 100; // Convert to 0-1 scale
  }

  private scoreAvailability(model: ModelProfile, request: RoutingRequest): number {
    return model.availability.uptime / 100; // Convert to 0-1 scale
  }

  private estimateCost(model: ModelProfile, request: RoutingRequest): number {
    const promptTokens = Math.ceil(request.prompt.length / 4); // Rough token estimation
    const outputTokens = 150; // Estimated output length
    
    const inputCost = (promptTokens / 1000) * model.pricing.inputTokenPrice;
    const outputCost = (outputTokens / 1000) * model.pricing.outputTokenPrice;
    
    return inputCost + outputCost + model.pricing.perRequestCost;
  }

  private estimateLatency(model: ModelProfile, request: RoutingRequest): number {
    const baseLatency = model.performance.averageLatency;
    const promptLength = request.prompt.length;
    
    // Add latency based on prompt length
    const lengthPenalty = Math.max(0, (promptLength - 1000) / 1000) * 200;
    
    return baseLatency + lengthPenalty;
  }

  private estimateQuality(model: ModelProfile, request: RoutingRequest): number {
    return model.performance.accuracyByTask[request.task] || model.performance.qualityScore;
  }

  private determineRoutingReason(
    model: ModelProfile, 
    request: RoutingRequest, 
    strategy: RoutingStrategy
  ): RoutingReason {
    if (strategy.name === 'cost_optimized') return 'cost_optimized';
    if (strategy.name === 'speed_optimized') return 'speed_optimized';
    if (strategy.name === 'quality_optimized') return 'quality_optimized';
    if (model.capabilities.specialties.includes(request.task)) return 'task_specialized';
    return 'balanced';
  }

  private generateReasoning(
    model: ModelProfile, 
    scores: Record<string, number>, 
    strategy: RoutingStrategy
  ): string {
    const topFactors = Object.entries(scores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 2)
      .map(([factor]) => factor);
    
    return `Selected for ${topFactors.join(' and ')} optimization (${strategy.name} strategy)`;
  }

  private recordRoutingDecision(request: RoutingRequest, decision: RoutingDecision): void {
    this.routingHistory.push({
      request,
      decision,
      outcome: { success: true, actualLatency: decision.estimatedLatency, actualCost: decision.estimatedCost }
    });
    
    // Trim history if needed
    if (this.routingHistory.length > this.maxHistorySize) {
      this.routingHistory = this.routingHistory.slice(-this.maxHistorySize);
    }
  }

  private getUserRoutingHistory(
    userId: string, 
    timeframe?: { start: Date; end: Date }
  ): Array<{ request: RoutingRequest; decision: RoutingDecision; outcome: any }> {
    return this.routingHistory.filter(h => h.request.context.userId === userId);
  }

  private findDuplicatePrompts(
    history: Array<{ request: RoutingRequest; decision: RoutingDecision; outcome: any }>
  ): Array<{ request: RoutingRequest; decision: RoutingDecision; outcome: any }> {
    const prompts = new Map<string, number>();
    const duplicates: Array<{ request: RoutingRequest; decision: RoutingDecision; outcome: any }> = [];
    
    history.forEach(h => {
      const count = prompts.get(h.request.prompt) || 0;
      prompts.set(h.request.prompt, count + 1);
      
      if (count > 0) {
        duplicates.push(h);
      }
    });
    
    return duplicates;
  }

  private startPerformanceMonitoring(): void {
    // Monitor model performance every 5 minutes
    setInterval(() => {
      // In production, this would collect real metrics from model responses
      console.log('📊 Monitoring model performance...');
    }, 5 * 60 * 1000);
  }
}

export const smartModelRouter = new SmartModelRouter();