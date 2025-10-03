/**
 * RETRY MANAGER - Production-grade retry system with exponential backoff
 * Handles retries, idempotency, and failure management for workflow execution
 */

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterEnabled: boolean;
  retryableErrors: string[]; // Error codes/types that should be retried
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
}

export interface CircuitBreakerStatus {
  connectorId?: string;
  nodeId: string;
  state: 'closed' | 'open';
  consecutiveFailures: number;
  openedAt?: Date;
  lastFailureAt?: Date;
  cooldownMs: number;
  cooldownRemainingMs: number;
  threshold: number;
}

export class CircuitBreakerOpenError extends Error {
  constructor(message: string, public readonly status: CircuitBreakerStatus) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

export interface RetryAttempt {
  attempt: number;
  timestamp: Date;
  error?: string;
  nextRetryAt?: Date;
}

export interface IdempotencyKey {
  key: string;
  nodeId: string;
  executionId: string;
  result?: any;
  createdAt: Date;
  expiresAt: Date;
}

export interface RetryableExecution {
  nodeId: string;
  executionId: string;
  attempts: RetryAttempt[];
  policy: RetryPolicy;
  status: 'pending' | 'retrying' | 'succeeded' | 'failed' | 'dlq';
  idempotencyKey?: string;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
  connectorId?: string;
  circuitBreaker?: CircuitBreakerConfig;
}

type CircuitState = 'closed' | 'open';

interface CircuitBreakerInternalState {
  key: string;
  connectorId?: string;
  nodeId: string;
  state: CircuitState;
  consecutiveFailures: number;
  openedAt?: number;
  lastFailureAt?: number;
  cooldownMs: number;
  threshold: number;
}

class RetryManager {
  private executions = new Map<string, RetryableExecution>();
  private idempotencyCache = new Map<string, IdempotencyKey>();
  private circuitStates = new Map<string, CircuitBreakerInternalState>();
  private defaultPolicy: RetryPolicy = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitterEnabled: true,
    retryableErrors: ['TIMEOUT', 'RATE_LIMIT', 'NETWORK_ERROR', 'SERVICE_UNAVAILABLE']
  };
  private defaultCircuitBreaker: CircuitBreakerConfig = {
    failureThreshold: 5,
    cooldownMs: 60 * 1000
  };

  /**
   * Execute a node with retry logic and idempotency
   */
  async executeWithRetry<T>(
    nodeId: string,
    executionId: string,
    executor: () => Promise<T>,
    options: {
      policy?: Partial<RetryPolicy>;
      idempotencyKey?: string;
      nodeType?: string;
      connectorId?: string;
      circuitBreaker?: Partial<CircuitBreakerConfig>;
    } = {}
  ): Promise<T> {
    const policy = { ...this.defaultPolicy, ...options.policy };
    const executionKey = `${executionId}:${nodeId}`;
    const connectorId = options.connectorId;
    const circuitConfig = connectorId
      ? { ...this.defaultCircuitBreaker, ...options.circuitBreaker }
      : undefined;
    let circuitState: CircuitBreakerInternalState | undefined;

    if (connectorId && circuitConfig) {
      circuitState = this.getOrCreateCircuitState(connectorId, nodeId, circuitConfig);

      if (circuitState.state === 'open' && !this.hasCircuitCooldownExpired(circuitState)) {
        throw new CircuitBreakerOpenError(
          `Circuit breaker is open for connector ${connectorId} on node ${nodeId}`,
          this.toCircuitStatus(circuitState)
        );
      }

      if (circuitState.state === 'open' && this.hasCircuitCooldownExpired(circuitState)) {
        circuitState.state = 'closed';
        circuitState.consecutiveFailures = 0;
        circuitState.openedAt = undefined;
      }

      circuitState.cooldownMs = circuitConfig.cooldownMs;
      circuitState.threshold = circuitConfig.failureThreshold;
    }

    // Check idempotency cache first
    if (options.idempotencyKey) {
      const cached = this.idempotencyCache.get(options.idempotencyKey);
      if (cached && cached.expiresAt > new Date()) {
        console.log(`🔄 Idempotency hit for ${nodeId} - returning cached result`);
        return cached.result;
      }
    }

    // Get or create retry execution record
    let retryExecution = this.executions.get(executionKey);
    if (!retryExecution) {
      retryExecution = {
        nodeId,
        executionId,
        attempts: [],
        policy,
        status: 'pending',
        idempotencyKey: options.idempotencyKey,
        createdAt: new Date(),
        updatedAt: new Date(),
        connectorId,
        circuitBreaker: circuitConfig
      };
      this.executions.set(executionKey, retryExecution);
    } else {
      retryExecution.connectorId = connectorId;
      retryExecution.circuitBreaker = circuitConfig;
    }

    return this.attemptExecution(
      retryExecution,
      executor,
      circuitState && circuitConfig
        ? { state: circuitState, config: circuitConfig }
        : undefined
    );
  }

  /**
   * Attempt execution with retry logic
   */
  private async attemptExecution<T>(
    retryExecution: RetryableExecution,
    executor: () => Promise<T>,
    circuitContext?: { state: CircuitBreakerInternalState; config: CircuitBreakerConfig }
  ): Promise<T> {
    const currentAttempt = retryExecution.attempts.length + 1;
    
    if (currentAttempt > retryExecution.policy.maxAttempts) {
      retryExecution.status = 'dlq';
      retryExecution.updatedAt = new Date();
      throw new Error(`Node ${retryExecution.nodeId} failed after ${retryExecution.policy.maxAttempts} attempts - moved to DLQ`);
    }

    const attempt: RetryAttempt = {
      attempt: currentAttempt,
      timestamp: new Date()
    };

    try {
      console.log(`🔄 Executing ${retryExecution.nodeId} - attempt ${currentAttempt}/${retryExecution.policy.maxAttempts}`);
      
      retryExecution.status = currentAttempt === 1 ? 'pending' : 'retrying';
      retryExecution.attempts.push(attempt);
      retryExecution.updatedAt = new Date();

      const result = await executor();

      // Success - cache result if idempotency key provided
      retryExecution.status = 'succeeded';
      retryExecution.updatedAt = new Date();

      if (retryExecution.idempotencyKey) {
        this.cacheIdempotentResult(retryExecution.idempotencyKey, retryExecution.nodeId, retryExecution.executionId, result);
      }

      if (circuitContext) {
        this.recordCircuitSuccess(circuitContext.state);
      }

      console.log(`✅ Node ${retryExecution.nodeId} succeeded on attempt ${currentAttempt}`);
      return result;

    } catch (error: any) {
      attempt.error = error.message;
      retryExecution.lastError = error.message;
      retryExecution.updatedAt = new Date();

      if (circuitContext) {
        const updatedState = this.recordCircuitFailure(circuitContext.state, circuitContext.config);
        if (updatedState.state === 'open') {
          (error as any).circuitBreakerState = this.toCircuitStatus(updatedState);
        }
      }

      const shouldRetry = this.shouldRetryError(error, retryExecution.policy);
      
      if (!shouldRetry || currentAttempt >= retryExecution.policy.maxAttempts) {
        retryExecution.status = 'failed';
        console.error(`❌ Node ${retryExecution.nodeId} failed permanently:`, error.message);
        throw error;
      }

      // Calculate next retry delay
      const delay = this.calculateRetryDelay(currentAttempt, retryExecution.policy);
      attempt.nextRetryAt = new Date(Date.now() + delay);
      
      console.warn(`⚠️ Node ${retryExecution.nodeId} failed on attempt ${currentAttempt}, retrying in ${delay}ms:`, error.message);
      
      // Wait for retry delay
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Recursive retry
      return this.attemptExecution(retryExecution, executor);
    }
  }

  /**
   * Check if error should be retried based on policy
   */
  private shouldRetryError(error: any, policy: RetryPolicy): boolean {
    if (error instanceof CircuitBreakerOpenError) {
      return false;
    }
    const errorType = this.classifyError(error);
    return policy.retryableErrors.includes(errorType);
  }

  /**
   * Classify error type for retry decisions
   */
  private classifyError(error: any): string {
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('timeout') || message.includes('timed out')) {
      return 'TIMEOUT';
    }
    if (message.includes('rate limit') || message.includes('429')) {
      return 'RATE_LIMIT';
    }
    if (message.includes('network') || message.includes('econnreset') || message.includes('econnrefused')) {
      return 'NETWORK_ERROR';
    }
    if (message.includes('503') || message.includes('service unavailable')) {
      return 'SERVICE_UNAVAILABLE';
    }
    if (message.includes('500') || message.includes('internal server error')) {
      return 'SERVER_ERROR';
    }
    
    return 'UNKNOWN_ERROR';
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryDelay(attempt: number, policy: RetryPolicy): number {
    let delay = policy.initialDelayMs * Math.pow(policy.backoffMultiplier, attempt - 1);
    delay = Math.min(delay, policy.maxDelayMs);
    
    if (policy.jitterEnabled) {
      // Add ±25% jitter to prevent thundering herd
      const jitter = delay * 0.25;
      delay = delay + (Math.random() * 2 - 1) * jitter;
    }
    
    return Math.max(100, Math.floor(delay)); // Minimum 100ms delay
  }

  /**
   * Cache idempotent result
   */
  private cacheIdempotentResult(key: string, nodeId: string, executionId: string, result: any): void {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    this.idempotencyCache.set(key, {
      key,
      nodeId,
      executionId,
      result,
      createdAt: new Date(),
      expiresAt
    });
  }

  /**
   * Get retry status for a node execution
   */
  getRetryStatus(executionId: string, nodeId: string): RetryableExecution | undefined {
    return this.executions.get(`${executionId}:${nodeId}`);
  }

  getCircuitStatus(nodeId: string, connectorId?: string): CircuitBreakerStatus | undefined {
    if (!connectorId) {
      return undefined;
    }

    const state = this.circuitStates.get(this.getCircuitKey(connectorId, nodeId));
    return state ? this.toCircuitStatus(state) : undefined;
  }

  private getCircuitKey(connectorId: string, nodeId: string): string {
    return `${connectorId}:${nodeId}`;
  }

  private getOrCreateCircuitState(
    connectorId: string,
    nodeId: string,
    config: CircuitBreakerConfig
  ): CircuitBreakerInternalState {
    const key = this.getCircuitKey(connectorId, nodeId);
    let state = this.circuitStates.get(key);

    if (!state) {
      state = {
        key,
        connectorId,
        nodeId,
        state: 'closed',
        consecutiveFailures: 0,
        cooldownMs: config.cooldownMs,
        threshold: config.failureThreshold
      };
      this.circuitStates.set(key, state);
    } else {
      state.connectorId = connectorId;
      state.cooldownMs = config.cooldownMs;
      state.threshold = config.failureThreshold;
    }

    return state;
  }

  private hasCircuitCooldownExpired(state: CircuitBreakerInternalState): boolean {
    if (state.openedAt == null) {
      return true;
    }

    return Date.now() - state.openedAt >= state.cooldownMs;
  }

  private recordCircuitSuccess(state: CircuitBreakerInternalState): void {
    state.state = 'closed';
    state.consecutiveFailures = 0;
    state.openedAt = undefined;
    state.lastFailureAt = undefined;
  }

  private recordCircuitFailure(
    state: CircuitBreakerInternalState,
    config: CircuitBreakerConfig
  ): CircuitBreakerInternalState {
    state.consecutiveFailures += 1;
    state.lastFailureAt = Date.now();
    state.cooldownMs = config.cooldownMs;
    state.threshold = config.failureThreshold;

    if (state.consecutiveFailures >= config.failureThreshold) {
      state.state = 'open';
      state.openedAt = Date.now();
    }

    return state;
  }

  private toCircuitStatus(state: CircuitBreakerInternalState): CircuitBreakerStatus {
    const openedAt = state.openedAt ? new Date(state.openedAt) : undefined;
    const lastFailureAt = state.lastFailureAt ? new Date(state.lastFailureAt) : undefined;
    const remainingMs = state.state === 'open' && state.openedAt
      ? Math.max(0, state.cooldownMs - (Date.now() - state.openedAt))
      : 0;

    return {
      connectorId: state.connectorId,
      nodeId: state.nodeId,
      state: state.state,
      consecutiveFailures: state.consecutiveFailures,
      openedAt,
      lastFailureAt,
      cooldownMs: state.cooldownMs,
      cooldownRemainingMs: remainingMs,
      threshold: state.threshold
    };
  }

  /**
   * Get all failed executions for DLQ processing
   */
  getDLQItems(): RetryableExecution[] {
    return Array.from(this.executions.values()).filter(exec => exec.status === 'dlq');
  }

  /**
   * Replay a failed execution from DLQ
   */
  async replayFromDLQ(executionId: string, nodeId: string): Promise<void> {
    const executionKey = `${executionId}:${nodeId}`;
    const retryExecution = this.executions.get(executionKey);
    
    if (!retryExecution || retryExecution.status !== 'dlq') {
      throw new Error(`No DLQ item found for ${executionKey}`);
    }

    // Reset for replay
    retryExecution.status = 'pending';
    retryExecution.attempts = [];
    retryExecution.lastError = undefined;
    retryExecution.updatedAt = new Date();
    
    console.log(`🔄 Replaying DLQ item: ${executionKey}`);
  }

  /**
   * Clean up old executions and expired idempotency keys
   */
  cleanup(): void {
    const now = new Date();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    
    // Clean old executions
    for (const [key, execution] of this.executions.entries()) {
      if (now.getTime() - execution.createdAt.getTime() > maxAge) {
        this.executions.delete(key);
      }
    }
    
    // Clean expired idempotency keys
    for (const [key, item] of this.idempotencyCache.entries()) {
      if (item.expiresAt <= now) {
        this.idempotencyCache.delete(key);
      }
    }

    for (const [key, state] of this.circuitStates.entries()) {
      const lastActivity = state.lastFailureAt ?? state.openedAt;
      if (state.state === 'closed' && lastActivity && now.getTime() - lastActivity > maxAge) {
        this.circuitStates.delete(key);
      }
    }

    console.log(`🧹 Cleanup completed - ${this.executions.size} active executions, ${this.idempotencyCache.size} cached keys`);
  }

  /**
   * Get retry manager statistics
   */
  getStats(): {
    activeExecutions: number;
    cachedKeys: number;
    dlqItems: number;
    successRate: number;
  } {
    const executions = Array.from(this.executions.values());
    const dlqItems = executions.filter(e => e.status === 'dlq').length;
    const succeeded = executions.filter(e => e.status === 'succeeded').length;
    const total = executions.length;
    
    return {
      activeExecutions: executions.filter(e => e.status === 'pending' || e.status === 'retrying').length,
      cachedKeys: this.idempotencyCache.size,
      dlqItems,
      successRate: total > 0 ? succeeded / total : 1
    };
  }
}

export const retryManager = new RetryManager();

// Start cleanup interval
setInterval(() => {
  retryManager.cleanup();
}, 60 * 60 * 1000); // Every hour