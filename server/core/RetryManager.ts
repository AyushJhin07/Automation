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

export interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownMs: number;
  halfOpenMaxAttempts: number;
}

export interface CircuitBreakerSnapshot {
  key: string;
  nodeId: string;
  nodeLabel?: string;
  connectorId: string;
  state: 'closed' | 'open' | 'half_open';
  consecutiveFailures: number;
  openedAt?: Date;
  lastFailureAt?: Date;
  lastRecoveryAt?: Date;
  lastError?: string;
  halfOpenAttempts: number;
  failureThreshold: number;
  cooldownMs: number;
  halfOpenMaxAttempts: number;
}

interface CircuitBreakerState {
  key: string;
  nodeId: string;
  nodeLabel?: string;
  connectorId: string;
  state: 'closed' | 'open' | 'half_open';
  consecutiveFailures: number;
  openedAt?: Date;
  lastFailureAt?: Date;
  lastRecoveryAt?: Date;
  lastError?: string;
  halfOpenAttempts: number;
  config: CircuitBreakerConfig;
}

export class CircuitBreakerOpenError extends Error {
  constructor(message: string, public readonly snapshot: CircuitBreakerSnapshot, cause?: Error) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    if (cause) {
      (this as any).cause = cause;
    }
  }
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
  nodeType?: string;
  nodeLabel?: string;
  circuitConfig?: CircuitBreakerConfig;
}

class RetryManager {
  private executions = new Map<string, RetryableExecution>();
  private idempotencyCache = new Map<string, IdempotencyKey>();
  private circuitStates = new Map<string, CircuitBreakerState>();
  private defaultPolicy: RetryPolicy = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitterEnabled: true,
    retryableErrors: ['TIMEOUT', 'RATE_LIMIT', 'NETWORK_ERROR', 'SERVICE_UNAVAILABLE']
  };
  private defaultCircuitConfig: CircuitBreakerConfig = {
    failureThreshold: 3,
    cooldownMs: 60_000,
    halfOpenMaxAttempts: 1
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
      nodeLabel?: string;
      circuitBreaker?: Partial<CircuitBreakerConfig>;
    } = {}
  ): Promise<T> {
    const policy = { ...this.defaultPolicy, ...options.policy };
    const circuitConfig = { ...this.defaultCircuitConfig, ...options.circuitBreaker };
    const executionKey = `${executionId}:${nodeId}`;
    
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
        connectorId: options.connectorId,
        nodeType: options.nodeType,
        nodeLabel: options.nodeLabel,
        circuitConfig
      };
      this.executions.set(executionKey, retryExecution);
    } else {
      retryExecution.policy = policy;
      retryExecution.circuitConfig = circuitConfig;
      if (options.connectorId) {
        retryExecution.connectorId = options.connectorId;
      }
      if (options.nodeType) {
        retryExecution.nodeType = options.nodeType;
      }
      if (options.nodeLabel) {
        retryExecution.nodeLabel = options.nodeLabel;
      }
    }

    return this.attemptExecution(retryExecution, executor);
  }

  /**
   * Attempt execution with retry logic
   */
  private async attemptExecution<T>(
    retryExecution: RetryableExecution,
    executor: () => Promise<T>
  ): Promise<T> {
    const currentAttempt = retryExecution.attempts.length + 1;

    if (currentAttempt > retryExecution.policy.maxAttempts) {
      retryExecution.status = 'dlq';
      retryExecution.updatedAt = new Date();
      throw new Error(`Node ${retryExecution.nodeId} failed after ${retryExecution.policy.maxAttempts} attempts - moved to DLQ`);
    }

    this.ensureCircuitAvailability(retryExecution);

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
      this.recordCircuitSuccess(retryExecution);

      if (retryExecution.idempotencyKey) {
        this.cacheIdempotentResult(retryExecution.idempotencyKey, retryExecution.nodeId, retryExecution.executionId, result);
      }

      console.log(`✅ Node ${retryExecution.nodeId} succeeded on attempt ${currentAttempt}`);
      return result;

    } catch (error: any) {
      attempt.error = error.message;
      retryExecution.lastError = error.message;
      retryExecution.updatedAt = new Date();

      const circuitState = this.recordCircuitFailure(retryExecution, error);

      const shouldRetry = this.shouldRetryError(error, retryExecution.policy);

      if (circuitState && circuitState.state === 'open') {
        retryExecution.status = 'failed';
        const snapshot = this.toCircuitSnapshot(circuitState);
        console.error(`🚫 Circuit breaker opened for ${circuitState.connectorId}:${circuitState.nodeId}`);
        throw new CircuitBreakerOpenError(
          `Circuit breaker open for ${circuitState.connectorId} on node ${retryExecution.nodeLabel || retryExecution.nodeId}`,
          snapshot,
          error instanceof Error ? error : undefined
        );
      }

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
    const errorType = this.classifyError(error);
    return policy.retryableErrors.includes(errorType);
  }

  private ensureCircuitAvailability(retryExecution: RetryableExecution): void {
    const state = this.getOrCreateCircuitState(retryExecution);
    if (!state) {
      return;
    }

    if (state.state === 'open') {
      if (state.openedAt && Date.now() - state.openedAt.getTime() >= state.config.cooldownMs) {
        state.state = 'half_open';
        state.halfOpenAttempts = 0;
        console.warn(`🔁 Circuit breaker for ${state.connectorId}:${state.nodeId} entering HALF_OPEN`);
      } else {
        const snapshot = this.toCircuitSnapshot(state);
        throw new CircuitBreakerOpenError(
          `Circuit breaker open for ${state.connectorId} on node ${state.nodeLabel || state.nodeId}`,
          snapshot
        );
      }
    }

    if (state.state === 'half_open') {
      if (state.halfOpenAttempts >= state.config.halfOpenMaxAttempts) {
        const snapshot = this.toCircuitSnapshot(state);
        throw new CircuitBreakerOpenError(
          `Circuit breaker half-open limit reached for ${state.connectorId} on node ${state.nodeLabel || state.nodeId}`,
          snapshot
        );
      }
      state.halfOpenAttempts++;
    }
  }

  private getCircuitKey(connectorId: string, nodeId: string): string {
    return `${connectorId}:${nodeId}`;
  }

  private getOrCreateCircuitState(retryExecution: RetryableExecution): CircuitBreakerState | undefined {
    if (!retryExecution.connectorId) {
      return undefined;
    }

    const key = this.getCircuitKey(retryExecution.connectorId, retryExecution.nodeId);
    const config = retryExecution.circuitConfig ?? this.defaultCircuitConfig;
    let state = this.circuitStates.get(key);

    if (!state) {
      state = {
        key,
        nodeId: retryExecution.nodeId,
        nodeLabel: retryExecution.nodeLabel,
        connectorId: retryExecution.connectorId,
        state: 'closed',
        consecutiveFailures: 0,
        openedAt: undefined,
        lastFailureAt: undefined,
        lastRecoveryAt: undefined,
        lastError: undefined,
        halfOpenAttempts: 0,
        config
      };
      this.circuitStates.set(key, state);
    } else {
      state.config = config;
      if (retryExecution.nodeLabel) {
        state.nodeLabel = retryExecution.nodeLabel;
      }
    }

    return state;
  }

  private recordCircuitSuccess(retryExecution: RetryableExecution): void {
    const state = this.getOrCreateCircuitState(retryExecution);
    if (!state) {
      return;
    }

    if (state.consecutiveFailures > 0 || state.state !== 'closed') {
      console.log(`🔌 Circuit breaker reset for ${state.connectorId}:${state.nodeId}`);
    }

    state.consecutiveFailures = 0;
    state.state = 'closed';
    state.openedAt = undefined;
    state.lastFailureAt = undefined;
    state.lastError = undefined;
    state.lastRecoveryAt = new Date();
    state.halfOpenAttempts = 0;
  }

  private recordCircuitFailure(retryExecution: RetryableExecution, error: any): CircuitBreakerState | undefined {
    const state = this.getOrCreateCircuitState(retryExecution);
    if (!state) {
      return undefined;
    }

    state.consecutiveFailures += 1;
    state.lastFailureAt = new Date();
    state.lastError = typeof error?.message === 'string' ? error.message : String(error);

    if (state.state === 'half_open' || state.consecutiveFailures >= state.config.failureThreshold) {
      if (state.state !== 'open') {
        console.warn(`🚨 Opening circuit breaker for ${state.connectorId}:${state.nodeId}`);
      }
      state.state = 'open';
      state.openedAt = new Date();
      state.halfOpenAttempts = 0;
    }

    return state;
  }

  private toCircuitSnapshot(state: CircuitBreakerState): CircuitBreakerSnapshot {
    return {
      key: state.key,
      nodeId: state.nodeId,
      nodeLabel: state.nodeLabel,
      connectorId: state.connectorId,
      state: state.state,
      consecutiveFailures: state.consecutiveFailures,
      openedAt: state.openedAt,
      lastFailureAt: state.lastFailureAt,
      lastRecoveryAt: state.lastRecoveryAt,
      lastError: state.lastError,
      halfOpenAttempts: state.halfOpenAttempts,
      failureThreshold: state.config.failureThreshold,
      cooldownMs: state.config.cooldownMs,
      halfOpenMaxAttempts: state.config.halfOpenMaxAttempts
    };
  }

  getCircuitState(connectorId: string, nodeId: string): CircuitBreakerSnapshot | undefined {
    if (!connectorId) {
      return undefined;
    }

    const key = this.getCircuitKey(connectorId, nodeId);
    const state = this.circuitStates.get(key);
    if (!state) {
      return {
        key,
        nodeId,
        nodeLabel: undefined,
        connectorId,
        state: 'closed',
        consecutiveFailures: 0,
        halfOpenAttempts: 0,
        failureThreshold: this.defaultCircuitConfig.failureThreshold,
        cooldownMs: this.defaultCircuitConfig.cooldownMs,
        halfOpenMaxAttempts: this.defaultCircuitConfig.halfOpenMaxAttempts
      };
    }

    return this.toCircuitSnapshot(state);
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
      const lastActivity = state.lastFailureAt?.getTime()
        ?? state.lastRecoveryAt?.getTime()
        ?? state.openedAt?.getTime()
        ?? 0;

      if (state.state === 'closed' && lastActivity > 0 && now.getTime() - lastActivity > maxAge) {
        this.circuitStates.delete(key);
      }
    }

    console.log(`🧹 Cleanup completed - ${this.executions.size} active executions, ${this.idempotencyCache.size} cached keys, ${this.circuitStates.size} circuit states`);
  }

  /**
   * Get retry manager statistics
   */
  getStats(): {
    activeExecutions: number;
    cachedKeys: number;
    dlqItems: number;
    successRate: number;
    openCircuits: number;
  } {
    const executions = Array.from(this.executions.values());
    const dlqItems = executions.filter(e => e.status === 'dlq').length;
    const succeeded = executions.filter(e => e.status === 'succeeded').length;
    const total = executions.length;

    return {
      activeExecutions: executions.filter(e => e.status === 'pending' || e.status === 'retrying').length,
      cachedKeys: this.idempotencyCache.size,
      dlqItems,
      successRate: total > 0 ? succeeded / total : 1,
      openCircuits: Array.from(this.circuitStates.values()).filter(state => state.state === 'open').length
    };
  }
}

export const retryManager = new RetryManager();

// Start cleanup interval
setInterval(() => {
  retryManager.cleanup();
}, 60 * 60 * 1000); // Every hour