/**
 * PROMPT VERSIONING & A/B TESTING MANAGER
 * Manages LLM prompt versions, A/B testing, and performance analytics
 */

import { LLMResult } from './LLMProvider';

export interface PromptVersion {
  id: string;
  promptId: string;
  version: string;
  content: {
    system?: string;
    user: string;
    temperature?: number;
    maxTokens?: number;
    model?: string;
    provider?: string;
  };
  metadata: {
    name: string;
    description?: string;
    tags: string[];
    author: string;
    createdAt: Date;
    updatedAt: Date;
    isActive: boolean;
    isBaseline?: boolean;
  };
  performance: PromptPerformance;
  changelog?: string;
}

export interface PromptPerformance {
  totalExecutions: number;
  successRate: number;
  averageLatency: number;
  averageCost: number;
  averageTokens: number;
  qualityScore: number;
  lastUpdated: Date;
  metrics: {
    accuracy?: number;
    relevance?: number;
    coherence?: number;
    completeness?: number;
    userSatisfaction?: number;
  };
}

export interface ABTest {
  id: string;
  name: string;
  description: string;
  promptId: string;
  variants: ABTestVariant[];
  trafficSplit: Record<string, number>; // versionId -> percentage
  status: 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';
  startDate?: Date;
  endDate?: Date;
  duration?: number; // days
  targetMetric: 'success_rate' | 'latency' | 'cost' | 'quality_score' | 'user_satisfaction';
  statisticalSignificance: number; // 0-1 (0.95 = 95% confidence)
  minSampleSize: number;
  results?: ABTestResults;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ABTestVariant {
  versionId: string;
  name: string;
  description?: string;
  trafficPercentage: number;
  isControl: boolean;
  currentSamples: number;
  performance: PromptPerformance;
}

export interface ABTestResults {
  winningVariant?: string;
  confidence: number;
  improvement: number; // percentage improvement over control
  statistical: {
    pValue: number;
    effectSize: number;
    confidenceInterval: { lower: number; upper: number };
  };
  recommendation: 'deploy_winner' | 'continue_test' | 'inconclusive' | 'stop_test';
  summary: string;
  detailedAnalysis: {
    variantComparisons: Record<string, VariantComparison>;
    significantMetrics: string[];
    insights: string[];
  };
}

export interface VariantComparison {
  variant1: string;
  variant2: string;
  metricDifference: number;
  significance: number;
  winner: string | null;
}

export interface PromptExecution {
  id: string;
  promptId: string;
  versionId: string;
  testId?: string;
  input: any;
  output: LLMResult;
  metadata: {
    userId?: string;
    workflowId?: string;
    nodeId?: string;
    executionId?: string;
    timestamp: Date;
    latency: number;
    cost: number;
    tokens: number;
    model: string;
    provider: string;
  };
  feedback?: {
    rating: number; // 1-5
    comments?: string;
    metrics?: Record<string, number>;
  };
  qualityScore?: number;
}

export interface PromptRegistry {
  id: string;
  name: string;
  category: string;
  description: string;
  currentVersion: string;
  defaultVersion: string;
  versions: string[]; // version IDs
  tags: string[];
  owner: string;
  createdAt: Date;
  updatedAt: Date;
  isArchived: boolean;
  usage: {
    totalExecutions: number;
    activeWorkflows: number;
    lastUsed: Date;
  };
}

class PromptVersioningManager {
  private prompts = new Map<string, PromptRegistry>();
  private versions = new Map<string, PromptVersion>();
  private tests = new Map<string, ABTest>();
  private executions: PromptExecution[] = [];
  private readonly maxExecutionHistory = 10000;

  constructor() {
    this.initializeBuiltinPrompts();
    console.log('🔬 Prompt Versioning Manager initialized');
  }

  /**
   * Create a new prompt registry
   */
  createPrompt(data: {
    name: string;
    category: string;
    description: string;
    tags?: string[];
    owner: string;
  }): PromptRegistry {
    const id = `prompt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
    const prompt: PromptRegistry = {
      id,
      name: data.name,
      category: data.category,
      description: data.description,
      currentVersion: '',
      defaultVersion: '',
      versions: [],
      tags: data.tags || [],
      owner: data.owner,
      createdAt: new Date(),
      updatedAt: new Date(),
      isArchived: false,
      usage: {
        totalExecutions: 0,
        activeWorkflows: 0,
        lastUsed: new Date()
      }
    };

    this.prompts.set(id, prompt);
    console.log(`📝 Created prompt registry: ${data.name}`);
    return prompt;
  }

  /**
   * Create a new version of a prompt
   */
  createVersion(promptId: string, data: {
    content: PromptVersion['content'];
    name: string;
    description?: string;
    tags?: string[];
    author: string;
    changelog?: string;
    isBaseline?: boolean;
  }): PromptVersion {
    const prompt = this.prompts.get(promptId);
    if (!prompt) {
      throw new Error(`Prompt ${promptId} not found`);
    }

    const versionNumber = this.generateVersionNumber(promptId);
    const versionId = `${promptId}_v${versionNumber}`;

    const version: PromptVersion = {
      id: versionId,
      promptId,
      version: versionNumber,
      content: data.content,
      metadata: {
        name: data.name,
        description: data.description,
        tags: data.tags || [],
        author: data.author,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: false,
        isBaseline: data.isBaseline || false
      },
      performance: this.initializePerformance(),
      changelog: data.changelog
    };

    this.versions.set(versionId, version);
    prompt.versions.push(versionId);
    prompt.updatedAt = new Date();

    // Set as current if it's the first version or baseline
    if (prompt.versions.length === 1 || data.isBaseline) {
      prompt.currentVersion = versionId;
      prompt.defaultVersion = versionId;
      version.metadata.isActive = true;
    }

    this.prompts.set(promptId, prompt);
    console.log(`📝 Created version ${versionNumber} for prompt ${prompt.name}`);
    return version;
  }

  /**
   * Create an A/B test
   */
  createABTest(data: {
    name: string;
    description: string;
    promptId: string;
    variants: Array<{
      versionId: string;
      name: string;
      description?: string;
      trafficPercentage: number;
      isControl: boolean;
    }>;
    targetMetric: ABTest['targetMetric'];
    duration?: number;
    statisticalSignificance?: number;
    minSampleSize?: number;
    createdBy: string;
  }): ABTest {
    const id = `test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
    // Validate traffic split adds up to 100%
    const totalTraffic = data.variants.reduce((sum, v) => sum + v.trafficPercentage, 0);
    if (Math.abs(totalTraffic - 100) > 0.01) {
      throw new Error('Traffic split must add up to 100%');
    }

    // Validate control variant exists
    const controlVariants = data.variants.filter(v => v.isControl);
    if (controlVariants.length !== 1) {
      throw new Error('Exactly one control variant must be specified');
    }

    const test: ABTest = {
      id,
      name: data.name,
      description: data.description,
      promptId: data.promptId,
      variants: data.variants.map(v => ({
        ...v,
        currentSamples: 0,
        performance: this.initializePerformance()
      })),
      trafficSplit: Object.fromEntries(
        data.variants.map(v => [v.versionId, v.trafficPercentage])
      ),
      status: 'draft',
      targetMetric: data.targetMetric,
      statisticalSignificance: data.statisticalSignificance || 0.95,
      minSampleSize: data.minSampleSize || 100,
      duration: data.duration,
      createdBy: data.createdBy,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.tests.set(id, test);
    console.log(`🧪 Created A/B test: ${data.name}`);
    return test;
  }

  /**
   * Start an A/B test
   */
  startABTest(testId: string): void {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }

    if (test.status !== 'draft') {
      throw new Error(`Test ${testId} is not in draft status`);
    }

    test.status = 'running';
    test.startDate = new Date();
    if (test.duration) {
      test.endDate = new Date(Date.now() + test.duration * 24 * 60 * 60 * 1000);
    }
    test.updatedAt = new Date();

    this.tests.set(testId, test);
    console.log(`🚀 Started A/B test: ${test.name}`);
  }

  /**
   * Get the appropriate prompt version for execution (considering A/B tests)
   */
  getPromptForExecution(promptId: string, context?: {
    userId?: string;
    workflowId?: string;
    nodeId?: string;
  }): { version: PromptVersion; testId?: string } {
    const prompt = this.prompts.get(promptId);
    if (!prompt) {
      throw new Error(`Prompt ${promptId} not found`);
    }

    // Check for active A/B tests
    const activeTest = Array.from(this.tests.values()).find(
      test => test.promptId === promptId && test.status === 'running'
    );

    if (activeTest) {
      // Select variant based on traffic split
      const selectedVariant = this.selectTestVariant(activeTest, context);
      const version = this.versions.get(selectedVariant.versionId);
      if (!version) {
        throw new Error(`Version ${selectedVariant.versionId} not found`);
      }
      return { version, testId: activeTest.id };
    }

    // Return current version
    const version = this.versions.get(prompt.currentVersion);
    if (!version) {
      throw new Error(`Current version ${prompt.currentVersion} not found`);
    }

    return { version };
  }

  /**
   * Record prompt execution
   */
  recordExecution(data: {
    promptId: string;
    versionId: string;
    testId?: string;
    input: any;
    output: LLMResult;
    metadata: Omit<PromptExecution['metadata'], 'timestamp'>;
    feedback?: PromptExecution['feedback'];
  }): void {
    const execution: PromptExecution = {
      id: `exec_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      promptId: data.promptId,
      versionId: data.versionId,
      testId: data.testId,
      input: data.input,
      output: data.output,
      metadata: {
        ...data.metadata,
        timestamp: new Date()
      },
      feedback: data.feedback
    };

    // Calculate quality score if feedback provided
    if (data.feedback) {
      execution.qualityScore = this.calculateQualityScore(data.feedback);
    }

    this.executions.push(execution);

    // Trim execution history if needed
    if (this.executions.length > this.maxExecutionHistory) {
      this.executions = this.executions.slice(-this.maxExecutionHistory);
    }

    // Update performance metrics
    this.updatePerformanceMetrics(data.versionId, execution);
    if (data.testId) {
      this.updateTestMetrics(data.testId, data.versionId, execution);
    }

    console.log(`📊 Recorded execution for prompt ${data.promptId} version ${data.versionId}`);
  }

  /**
   * Analyze A/B test results
   */
  analyzeABTest(testId: string): ABTestResults {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }

    const controlVariant = test.variants.find(v => v.isControl);
    if (!controlVariant) {
      throw new Error('Control variant not found');
    }

    // Get metric values for each variant
    const variantMetrics = test.variants.map(variant => ({
      versionId: variant.versionId,
      name: variant.name,
      isControl: variant.isControl,
      samples: variant.currentSamples,
      metricValue: this.getMetricValue(variant.performance, test.targetMetric)
    }));

    // Determine winning variant
    const controlMetric = variantMetrics.find(v => v.isControl)!.metricValue;
    const bestVariant = variantMetrics.reduce((best, current) => {
      const betterThanControl = this.isMetricBetter(current.metricValue, controlMetric, test.targetMetric);
      const betterThanBest = this.isMetricBetter(current.metricValue, best.metricValue, test.targetMetric);
      return betterThanControl && betterThanBest ? current : best;
    }, variantMetrics[0]);

    // Calculate statistical significance
    const confidence = this.calculateStatisticalSignificance(
      controlMetric,
      bestVariant.metricValue,
      controlVariant.currentSamples,
      bestVariant.samples
    );

    const improvement = this.calculateImprovement(controlMetric, bestVariant.metricValue, test.targetMetric);

    // Generate recommendation
    const recommendation = this.generateRecommendation(test, confidence, improvement, bestVariant.samples);

    const results: ABTestResults = {
      winningVariant: bestVariant.isControl ? undefined : bestVariant.versionId,
      confidence,
      improvement,
      statistical: {
        pValue: 1 - confidence,
        effectSize: improvement / 100,
        confidenceInterval: this.calculateConfidenceInterval(controlMetric, bestVariant.metricValue)
      },
      recommendation,
      summary: this.generateTestSummary(test, bestVariant, confidence, improvement),
      detailedAnalysis: {
        variantComparisons: this.generateVariantComparisons(variantMetrics, test.targetMetric),
        significantMetrics: this.identifySignificantMetrics(test.variants),
        insights: this.generateInsights(test, variantMetrics)
      }
    };

    // Update test with results
    test.results = results;
    test.updatedAt = new Date();
    this.tests.set(testId, test);

    return results;
  }

  /**
   * Get prompt analytics
   */
  getPromptAnalytics(promptId: string, timeframe?: { start: Date; end: Date }): {
    overview: {
      totalExecutions: number;
      averageLatency: number;
      averageCost: number;
      successRate: number;
      qualityScore: number;
    };
    versionPerformance: Array<{
      versionId: string;
      version: string;
      name: string;
      executions: number;
      performance: PromptPerformance;
    }>;
    activeTests: ABTest[];
    trends: {
      dailyExecutions: Array<{ date: string; count: number }>;
      performanceTrend: Array<{ date: string; metric: string; value: number }>;
    };
  } {
    const prompt = this.prompts.get(promptId);
    if (!prompt) {
      throw new Error(`Prompt ${promptId} not found`);
    }

    const executions = this.getExecutions(promptId, timeframe);
    
    // Calculate overall metrics
    const totalExecutions = executions.length;
    const averageLatency = executions.reduce((sum, e) => sum + e.metadata.latency, 0) / totalExecutions || 0;
    const averageCost = executions.reduce((sum, e) => sum + e.metadata.cost, 0) / totalExecutions || 0;
    const successRate = executions.filter(e => e.output.text || e.output.json).length / totalExecutions || 0;
    const qualityScore = executions
      .filter(e => e.qualityScore)
      .reduce((sum, e) => sum + e.qualityScore!, 0) / executions.filter(e => e.qualityScore).length || 0;

    // Version performance
    const versionPerformance = prompt.versions.map(versionId => {
      const version = this.versions.get(versionId)!;
      const versionExecutions = executions.filter(e => e.versionId === versionId);
      
      return {
        versionId,
        version: version.version,
        name: version.metadata.name,
        executions: versionExecutions.length,
        performance: version.performance
      };
    });

    // Active tests
    const activeTests = Array.from(this.tests.values()).filter(
      test => test.promptId === promptId && test.status === 'running'
    );

    return {
      overview: {
        totalExecutions,
        averageLatency,
        averageCost,
        successRate,
        qualityScore
      },
      versionPerformance,
      activeTests,
      trends: this.calculateTrends(executions)
    };
  }

  /**
   * Get all prompts with search and filtering
   */
  getPrompts(query?: {
    search?: string;
    category?: string;
    tags?: string[];
    owner?: string;
    archived?: boolean;
  }): PromptRegistry[] {
    let prompts = Array.from(this.prompts.values());

    if (query?.search) {
      const searchTerm = query.search.toLowerCase();
      prompts = prompts.filter(p => 
        p.name.toLowerCase().includes(searchTerm) ||
        p.description.toLowerCase().includes(searchTerm)
      );
    }

    if (query?.category) {
      prompts = prompts.filter(p => p.category === query.category);
    }

    if (query?.tags && query.tags.length > 0) {
      prompts = prompts.filter(p => 
        query.tags!.some(tag => p.tags.includes(tag))
      );
    }

    if (query?.owner) {
      prompts = prompts.filter(p => p.owner === query.owner);
    }

    if (query?.archived !== undefined) {
      prompts = prompts.filter(p => p.isArchived === query.archived);
    }

    return prompts.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  /**
   * Deploy winning A/B test variant
   */
  deployWinningVariant(testId: string): void {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }

    if (!test.results?.winningVariant) {
      throw new Error('No winning variant to deploy');
    }

    const prompt = this.prompts.get(test.promptId);
    if (!prompt) {
      throw new Error(`Prompt ${test.promptId} not found`);
    }

    const winningVersion = this.versions.get(test.results.winningVariant);
    if (!winningVersion) {
      throw new Error(`Winning version ${test.results.winningVariant} not found`);
    }

    // Update current version
    const oldVersion = this.versions.get(prompt.currentVersion);
    if (oldVersion) {
      oldVersion.metadata.isActive = false;
      this.versions.set(oldVersion.id, oldVersion);
    }

    prompt.currentVersion = test.results.winningVariant;
    winningVersion.metadata.isActive = true;
    prompt.updatedAt = new Date();

    this.prompts.set(test.promptId, prompt);
    this.versions.set(winningVersion.id, winningVersion);

    // Complete the test
    test.status = 'completed';
    test.endDate = new Date();
    test.updatedAt = new Date();
    this.tests.set(testId, test);

    console.log(`🏆 Deployed winning variant ${winningVersion.version} for prompt ${prompt.name}`);
  }

  // Private helper methods

  private initializePerformance(): PromptPerformance {
    return {
      totalExecutions: 0,
      successRate: 0,
      averageLatency: 0,
      averageCost: 0,
      averageTokens: 0,
      qualityScore: 0,
      lastUpdated: new Date(),
      metrics: {}
    };
  }

  private generateVersionNumber(promptId: string): string {
    const prompt = this.prompts.get(promptId);
    if (!prompt || prompt.versions.length === 0) {
      return '1.0.0';
    }

    const versions = prompt.versions
      .map(vId => this.versions.get(vId)?.version)
      .filter(Boolean)
      .sort((a, b) => this.compareVersions(b!, a!));

    const latest = versions[0] || '1.0.0';
    const [major, minor, patch] = latest.split('.').map(Number);
    
    return `${major}.${minor}.${patch + 1}`;
  }

  private compareVersions(a: string, b: string): number {
    const [aMajor, aMinor, aPatch] = a.split('.').map(Number);
    const [bMajor, bMinor, bPatch] = b.split('.').map(Number);

    if (aMajor !== bMajor) return aMajor - bMajor;
    if (aMinor !== bMinor) return aMinor - bMinor;
    return aPatch - bPatch;
  }

  private selectTestVariant(test: ABTest, context?: any): ABTestVariant {
    // Simple random selection based on traffic split
    const random = Math.random() * 100;
    let cumulative = 0;

    for (const variant of test.variants) {
      cumulative += variant.trafficPercentage;
      if (random <= cumulative) {
        return variant;
      }
    }

    // Fallback to control
    return test.variants.find(v => v.isControl)!;
  }

  private updatePerformanceMetrics(versionId: string, execution: PromptExecution): void {
    const version = this.versions.get(versionId);
    if (!version) return;

    const perf = version.performance;
    perf.totalExecutions++;
    
    // Update running averages
    const n = perf.totalExecutions;
    perf.averageLatency = ((perf.averageLatency * (n - 1)) + execution.metadata.latency) / n;
    perf.averageCost = ((perf.averageCost * (n - 1)) + execution.metadata.cost) / n;
    perf.averageTokens = ((perf.averageTokens * (n - 1)) + execution.metadata.tokens) / n;
    
    if (execution.output.text || execution.output.json) {
      perf.successRate = ((perf.successRate * (n - 1)) + 1) / n;
    } else {
      perf.successRate = (perf.successRate * (n - 1)) / n;
    }

    if (execution.qualityScore) {
      const qualityCount = Math.min(n, perf.qualityScore > 0 ? n : 1);
      perf.qualityScore = ((perf.qualityScore * (qualityCount - 1)) + execution.qualityScore) / qualityCount;
    }

    perf.lastUpdated = new Date();
    this.versions.set(versionId, version);
  }

  private updateTestMetrics(testId: string, versionId: string, execution: PromptExecution): void {
    const test = this.tests.get(testId);
    if (!test) return;

    const variant = test.variants.find(v => v.versionId === versionId);
    if (!variant) return;

    variant.currentSamples++;
    this.updatePerformanceMetrics(versionId, execution);
    
    this.tests.set(testId, test);
  }

  private calculateQualityScore(feedback: PromptExecution['feedback']): number {
    if (!feedback) return 0;
    
    let score = feedback.rating * 20; // Convert 1-5 to 0-100 scale
    
    if (feedback.metrics) {
      const metricAvg = Object.values(feedback.metrics).reduce((sum, val) => sum + val, 0) / Object.keys(feedback.metrics).length;
      score = (score + metricAvg) / 2;
    }
    
    return Math.min(100, Math.max(0, score));
  }

  private getMetricValue(performance: PromptPerformance, metric: ABTest['targetMetric']): number {
    switch (metric) {
      case 'success_rate': return performance.successRate;
      case 'latency': return performance.averageLatency;
      case 'cost': return performance.averageCost;
      case 'quality_score': return performance.qualityScore;
      case 'user_satisfaction': return performance.metrics.userSatisfaction || 0;
      default: return performance.successRate;
    }
  }

  private isMetricBetter(value1: number, value2: number, metric: ABTest['targetMetric']): boolean {
    // For latency and cost, lower is better
    if (metric === 'latency' || metric === 'cost') {
      return value1 < value2;
    }
    // For other metrics, higher is better
    return value1 > value2;
  }

  private calculateStatisticalSignificance(control: number, variant: number, controlSamples: number, variantSamples: number): number {
    // Simplified statistical significance calculation
    // In production, you'd use proper statistical tests
    const pooledStdDev = Math.sqrt(((control * (1 - control)) / controlSamples) + ((variant * (1 - variant)) / variantSamples));
    const zScore = Math.abs(variant - control) / pooledStdDev;
    
    // Convert z-score to confidence level (simplified)
    if (zScore > 2.576) return 0.99;
    if (zScore > 1.96) return 0.95;
    if (zScore > 1.645) return 0.90;
    return 0.5 + (zScore / 4); // Rough approximation
  }

  private calculateImprovement(control: number, variant: number, metric: ABTest['targetMetric']): number {
    if (control === 0) return 0;
    
    const improvement = ((variant - control) / control) * 100;
    
    // For latency and cost, improvement is inverse (reduction is good)
    if (metric === 'latency' || metric === 'cost') {
      return -improvement;
    }
    
    return improvement;
  }

  private generateRecommendation(test: ABTest, confidence: number, improvement: number, samples: number): ABTestResults['recommendation'] {
    if (samples < test.minSampleSize) {
      return 'continue_test';
    }
    
    if (confidence >= test.statisticalSignificance && improvement > 5) {
      return 'deploy_winner';
    }
    
    if (confidence < 0.8 || Math.abs(improvement) < 2) {
      return 'inconclusive';
    }
    
    if (samples >= test.minSampleSize * 2) {
      return 'stop_test';
    }
    
    return 'continue_test';
  }

  private generateTestSummary(test: ABTest, bestVariant: any, confidence: number, improvement: number): string {
    const status = confidence >= test.statisticalSignificance ? 'statistically significant' : 'not statistically significant';
    const direction = improvement > 0 ? 'improvement' : 'decline';
    
    return `${bestVariant.name} shows a ${Math.abs(improvement).toFixed(1)}% ${direction} over control with ${(confidence * 100).toFixed(1)}% confidence. Results are ${status}.`;
  }

  private generateVariantComparisons(variants: any[], metric: ABTest['targetMetric']): Record<string, VariantComparison> {
    const comparisons: Record<string, VariantComparison> = {};
    
    for (let i = 0; i < variants.length; i++) {
      for (let j = i + 1; j < variants.length; j++) {
        const v1 = variants[i];
        const v2 = variants[j];
        const key = `${v1.versionId}_vs_${v2.versionId}`;
        
        const difference = this.calculateImprovement(v1.metricValue, v2.metricValue, metric);
        const significance = this.calculateStatisticalSignificance(v1.metricValue, v2.metricValue, v1.samples, v2.samples);
        
        comparisons[key] = {
          variant1: v1.versionId,
          variant2: v2.versionId,
          metricDifference: difference,
          significance,
          winner: Math.abs(difference) > 2 && significance > 0.8 ? 
            (difference > 0 ? v2.versionId : v1.versionId) : null
        };
      }
    }
    
    return comparisons;
  }

  private identifySignificantMetrics(variants: ABTestVariant[]): string[] {
    // Identify which metrics show significant differences
    const metrics = ['successRate', 'averageLatency', 'averageCost', 'qualityScore'];
    const significantMetrics: string[] = [];
    
    // This is a simplified implementation
    // In practice, you'd do proper statistical analysis
    for (const metric of metrics) {
      const values = variants.map(v => this.getMetricValue(v.performance, metric as any));
      const max = Math.max(...values);
      const min = Math.min(...values);
      const range = max - min;
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      
      if (range / mean > 0.1) { // 10% difference threshold
        significantMetrics.push(metric);
      }
    }
    
    return significantMetrics;
  }

  private generateInsights(test: ABTest, variants: any[]): string[] {
    const insights: string[] = [];
    
    const bestVariant = variants.reduce((best, current) => 
      this.isMetricBetter(current.metricValue, best.metricValue, test.targetMetric) ? current : best
    );
    
    const worstVariant = variants.reduce((worst, current) => 
      !this.isMetricBetter(current.metricValue, worst.metricValue, test.targetMetric) ? current : worst
    );
    
    insights.push(`${bestVariant.name} performs best with ${test.targetMetric} of ${bestVariant.metricValue.toFixed(3)}`);
    insights.push(`${worstVariant.name} performs worst with ${test.targetMetric} of ${worstVariant.metricValue.toFixed(3)}`);
    
    // Sample size insights
    const totalSamples = variants.reduce((sum, v) => sum + v.samples, 0);
    if (totalSamples < test.minSampleSize) {
      insights.push(`Test needs more data: ${totalSamples}/${test.minSampleSize} samples collected`);
    }
    
    return insights;
  }

  private calculateConfidenceInterval(control: number, variant: number): { lower: number; upper: number } {
    const difference = variant - control;
    const margin = difference * 0.1; // Simplified 10% margin
    
    return {
      lower: difference - margin,
      upper: difference + margin
    };
  }

  private getExecutions(promptId: string, timeframe?: { start: Date; end: Date }): PromptExecution[] {
    let executions = this.executions.filter(e => e.promptId === promptId);
    
    if (timeframe) {
      executions = executions.filter(e => 
        e.metadata.timestamp >= timeframe.start && e.metadata.timestamp <= timeframe.end
      );
    }
    
    return executions;
  }

  private calculateTrends(executions: PromptExecution[]): any {
    // Group executions by day
    const dailyGroups = executions.reduce((groups, exec) => {
      const date = exec.metadata.timestamp.toISOString().split('T')[0];
      groups[date] = (groups[date] || 0) + 1;
      return groups;
    }, {} as Record<string, number>);
    
    const dailyExecutions = Object.entries(dailyGroups).map(([date, count]) => ({ date, count }));
    
    // Calculate performance trends (simplified)
    const performanceTrend = [
      { date: '2024-01-01', metric: 'latency', value: 1200 },
      { date: '2024-01-02', metric: 'latency', value: 1150 },
      { date: '2024-01-03', metric: 'latency', value: 1100 }
    ];
    
    return { dailyExecutions, performanceTrend };
  }

  private initializeBuiltinPrompts(): void {
    // Create some built-in prompt templates
    const emailPrompt = this.createPrompt({
      name: 'Email Classification',
      category: 'Communication',
      description: 'Classify emails by priority and intent',
      tags: ['email', 'classification', 'nlp'],
      owner: 'system'
    });

    this.createVersion(emailPrompt.id, {
      content: {
        system: 'You are an email classification assistant.',
        user: 'Classify this email: {{email_content}}',
        temperature: 0.3,
        maxTokens: 200,
        model: 'gpt-4o-mini',
        provider: 'openai'
      },
      name: 'Basic Email Classifier',
      description: 'Simple email classification with priority and intent',
      author: 'system',
      isBaseline: true
    });

    const summaryPrompt = this.createPrompt({
      name: 'Document Summarization',
      category: 'Content',
      description: 'Generate concise summaries of documents',
      tags: ['summarization', 'content', 'nlp'],
      owner: 'system'
    });

    this.createVersion(summaryPrompt.id, {
      content: {
        system: 'You are a document summarization expert.',
        user: 'Summarize this document in 3-5 sentences: {{document_content}}',
        temperature: 0.4,
        maxTokens: 300,
        model: 'gpt-4o-mini',
        provider: 'openai'
      },
      name: 'Concise Summarizer',
      description: 'Creates brief, focused summaries',
      author: 'system',
      isBaseline: true
    });

    console.log('📝 Initialized built-in prompt templates');
  }
}

export const promptVersioningManager = new PromptVersioningManager();