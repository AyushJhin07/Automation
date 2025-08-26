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
}

class RetryManager {
  private executions = new Map<string, RetryableExecution>();
  private idempotencyCache = new Map<string, IdempotencyKey>();
  private defaultPolicy: RetryPolicy = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitterEnabled: true,
    retryableErrors: ['TIMEOUT', 'RATE_LIMIT', 'NETWORK_ERROR', 'SERVICE_UNAVAILABLE']
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
    } = {}
  ): Promise<T> {
    const policy = { ...this.defaultPolicy, ...options.policy };
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
        updatedAt: new Date()
      };
      this.executions.set(executionKey, retryExecution);
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

      console.log(`✅ Node ${retryExecution.nodeId} succeeded on attempt ${currentAttempt}`);
      return result;

    } catch (error: any) {
      attempt.error = error.message;
      retryExecution.lastError = error.message;
      retryExecution.updatedAt = new Date();

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