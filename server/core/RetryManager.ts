import { createHash } from 'node:crypto';
import { and, eq, gt, lte, sql } from 'drizzle-orm';

import { db, nodeExecutionResults } from '../database/schema.js';
import { SandboxPolicyViolationError } from '../runtime/SandboxShared.js';

/**
 * RETRY MANAGER - Production-grade retry system with exponential backoff
 * Handles retries, idempotency, and failure management for workflow execution
 */

type NodeExecutionResultRow = typeof nodeExecutionResults.$inferSelect;

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface NodeExecutionResultStore {
  find(params: { executionId: string; nodeId: string; idempotencyKey: string; now: Date }): Promise<NodeExecutionResultRow | undefined>;
  upsert(record: { executionId: string; nodeId: string; idempotencyKey: string; resultHash: string; resultData: any; expiresAt: Date }): Promise<void>;
  deleteExpired(now: Date): Promise<number>;
  countActive(now: Date): Promise<number>;
}

class InMemoryNodeExecutionResultStore implements NodeExecutionResultStore {
  private readonly store = new Map<string, NodeExecutionResultRow>();
  private nextId = 1;

  private getKey(executionId: string, nodeId: string, idempotencyKey: string): string {
    return `${executionId}:${nodeId}:${idempotencyKey}`;
  }

  async find(params: { executionId: string; nodeId: string; idempotencyKey: string; now: Date }): Promise<NodeExecutionResultRow | undefined> {
    const key = this.getKey(params.executionId, params.nodeId, params.idempotencyKey);
    const record = this.store.get(key);
    if (!record) {
      return undefined;
    }

    if (record.expiresAt <= params.now) {
      this.store.delete(key);
      return undefined;
    }

    return { ...record };
  }

  async upsert(record: { executionId: string; nodeId: string; idempotencyKey: string; resultHash: string; resultData: any; expiresAt: Date }): Promise<void> {
    const key = this.getKey(record.executionId, record.nodeId, record.idempotencyKey);
    const existing = this.store.get(key);

    if (existing) {
      this.store.set(key, {
        ...existing,
        resultHash: record.resultHash,
        resultData: record.resultData,
        expiresAt: record.expiresAt
      });
      return;
    }

    const createdAt = new Date();
    this.store.set(key, {
      id: this.nextId++,
      executionId: record.executionId,
      nodeId: record.nodeId,
      idempotencyKey: record.idempotencyKey,
      resultHash: record.resultHash,
      resultData: record.resultData,
      createdAt,
      expiresAt: record.expiresAt
    });
  }

  async deleteExpired(now: Date): Promise<number> {
    let deleted = 0;
    for (const [key, record] of this.store.entries()) {
      if (record.expiresAt <= now) {
        this.store.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  async countActive(now: Date): Promise<number> {
    let count = 0;
    for (const record of this.store.values()) {
      if (record.expiresAt > now) {
        count++;
      }
    }
    return count;
  }
}

class DatabaseNodeExecutionResultStore implements NodeExecutionResultStore {
  constructor(private readonly fallback: NodeExecutionResultStore) {}

  private getDb() {
    return db;
  }

  async find(params: { executionId: string; nodeId: string; idempotencyKey: string; now: Date }): Promise<NodeExecutionResultRow | undefined> {
    const database = this.getDb();
    if (!database) {
      return this.fallback.find(params);
    }

    const results = await database
      .select()
      .from(nodeExecutionResults)
      .where(
        and(
          eq(nodeExecutionResults.executionId, params.executionId),
          eq(nodeExecutionResults.nodeId, params.nodeId),
          eq(nodeExecutionResults.idempotencyKey, params.idempotencyKey),
          gt(nodeExecutionResults.expiresAt, params.now)
        )
      )
      .limit(1);

    return results[0];
  }

  async upsert(record: { executionId: string; nodeId: string; idempotencyKey: string; resultHash: string; resultData: any; expiresAt: Date }): Promise<void> {
    const database = this.getDb();
    if (!database) {
      return this.fallback.upsert(record);
    }

    await database
      .insert(nodeExecutionResults)
      .values({
        executionId: record.executionId,
        nodeId: record.nodeId,
        idempotencyKey: record.idempotencyKey,
        resultHash: record.resultHash,
        resultData: record.resultData,
        expiresAt: record.expiresAt
      })
      .onConflictDoUpdate({
        target: [
          nodeExecutionResults.executionId,
          nodeExecutionResults.nodeId,
          nodeExecutionResults.idempotencyKey
        ],
        set: {
          resultHash: record.resultHash,
          resultData: record.resultData,
          expiresAt: record.expiresAt
        }
      });
  }

  async deleteExpired(now: Date): Promise<number> {
    const database = this.getDb();
    if (!database) {
      return this.fallback.deleteExpired(now);
    }

    const [{ value: expiredCount = 0 } = { value: 0 }] = await database
      .select({ value: sql<number>`count(*)` })
      .from(nodeExecutionResults)
      .where(lte(nodeExecutionResults.expiresAt, now));

    if (expiredCount > 0) {
      await database.delete(nodeExecutionResults).where(lte(nodeExecutionResults.expiresAt, now));
    }

    return Number(expiredCount ?? 0);
  }

  async countActive(now: Date): Promise<number> {
    const database = this.getDb();
    if (!database) {
      return this.fallback.countActive(now);
    }

    const [{ value = 0 } = { value: 0 }] = await database
      .select({ value: sql<number>`count(*)` })
      .from(nodeExecutionResults)
      .where(gt(nodeExecutionResults.expiresAt, now));

    return Number(value ?? 0);
  }
}

const fallbackNodeExecutionResultStore = new InMemoryNodeExecutionResultStore();
let currentNodeExecutionResultStore: NodeExecutionResultStore = new DatabaseNodeExecutionResultStore(fallbackNodeExecutionResultStore);

export function setNodeExecutionResultStoreForTests(store: NodeExecutionResultStore | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setNodeExecutionResultStoreForTests should only be used in test environment');
  }

  currentNodeExecutionResultStore = store ?? new DatabaseNodeExecutionResultStore(new InMemoryNodeExecutionResultStore());
}

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
  requestHash?: string;
  lastResultHash?: string;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
  connectorId?: string;
  nodeType?: string;
  nodeLabel?: string;
  circuitConfig?: CircuitBreakerConfig;
}

export type ActionableErrorSeverity = 'info' | 'warn' | 'error';

export interface ActionableErrorEvent {
  executionId: string;
  nodeId: string;
  code: string;
  message: string;
  nodeType?: string;
  severity: ActionableErrorSeverity;
  timestamp: Date;
  details?: Record<string, any>;
}

type ActionableErrorInput = Omit<ActionableErrorEvent, 'timestamp' | 'severity'> & {
  severity?: ActionableErrorSeverity;
  timestamp?: Date;
};

class RetryManager {
  private executions = new Map<string, RetryableExecution>();
  private circuitStates = new Map<string, CircuitBreakerState>();
  private readonly idempotencyTtlMs = IDEMPOTENCY_TTL_MS;
  private cachedKeyEstimate = 0;
  private cachedKeyEstimateStale = true;
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
  private actionableErrors: ActionableErrorEvent[] = [];

  private getNodeExecutionResultStore(): NodeExecutionResultStore {
    return currentNodeExecutionResultStore;
  }

  private markCachedKeyEstimateStale(): void {
    this.cachedKeyEstimateStale = true;
  }

  private async refreshCachedKeyEstimate(now = new Date()): Promise<void> {
    try {
      this.cachedKeyEstimate = await this.getNodeExecutionResultStore().countActive(now);
      this.cachedKeyEstimateStale = false;
    } catch (error) {
      console.error('⚠️ Failed to refresh node execution result cache size', error);
    }
  }

  private async getCachedResult(idempotencyKey: string, nodeId: string, executionId: string): Promise<any | undefined> {
    try {
      const record = await this.getNodeExecutionResultStore().find({
        executionId,
        nodeId,
        idempotencyKey,
        now: new Date()
      });
      return record?.resultData;
    } catch (error) {
      console.error(`⚠️ Failed to read idempotent result for ${executionId}:${nodeId}`, error);
      return undefined;
    }
  }

  private computeResultHash(result: any): { normalized: any; hash: string } {
    const normalized = result === undefined ? null : result;
    let serialized: string;
    try {
      serialized = JSON.stringify(normalized);
    } catch (error) {
      serialized = JSON.stringify(String(normalized));
    }

    const hash = createHash('sha256')
      .update(serialized ?? '')
      .digest('hex');

    return { normalized, hash };
  }

  registerRequestHash(executionId: string, nodeId: string, requestHash: string): void {
    const key = `${executionId}:${nodeId}`;
    const execution = this.executions.get(key);
    if (!execution) {
      return;
    }
    execution.requestHash = requestHash;
  }

  getRequestHash(executionId: string, nodeId: string): string | undefined {
    const key = `${executionId}:${nodeId}`;
    return this.executions.get(key)?.requestHash;
  }

  emitActionableError(event: ActionableErrorInput): void {
    const enriched: ActionableErrorEvent = {
      executionId: event.executionId,
      nodeId: event.nodeId,
      code: event.code,
      message: event.message,
      nodeType: event.nodeType,
      severity: event.severity ?? 'error',
      timestamp: event.timestamp ?? new Date(),
      details: event.details,
    };

    this.actionableErrors.push(enriched);
    if (this.actionableErrors.length > 1000) {
      this.actionableErrors.shift();
    }

    const logContext = {
      executionId: enriched.executionId,
      nodeId: enriched.nodeId,
      nodeType: enriched.nodeType,
      details: enriched.details,
    };

    switch (enriched.severity) {
      case 'info':
        console.info(`📣 [RetryManager] ${enriched.code} (info) - ${enriched.message}`, logContext);
        break;
      case 'warn':
        console.warn(`📣 [RetryManager] ${enriched.code} (warn) - ${enriched.message}`, logContext);
        break;
      case 'error':
      default:
        console.error(`📣 [RetryManager] ${enriched.code} (error) - ${enriched.message}`, logContext);
        break;
    }
  }

  getActionableErrors(filter: { executionId?: string; nodeId?: string; code?: string } = {}): ActionableErrorEvent[] {
    return this.actionableErrors.filter(event => {
      if (filter.executionId && event.executionId !== filter.executionId) {
        return false;
      }
      if (filter.nodeId && event.nodeId !== filter.nodeId) {
        return false;
      }
      if (filter.code && event.code !== filter.code) {
        return false;
      }
      return true;
    });
  }

  clearActionableErrors(): void {
    this.actionableErrors = [];
  }

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
      const cached = await this.getCachedResult(options.idempotencyKey, nodeId, executionId);
      if (cached !== undefined) {
        console.log(`🔄 Idempotency hit for ${nodeId} - returning cached result`);
        return cached;
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
      const precomputed = this.computeResultHash(result);
      retryExecution.lastResultHash = precomputed.hash;

      // Success - cache result if idempotency key provided
      retryExecution.status = 'succeeded';
      retryExecution.updatedAt = new Date();
      this.recordCircuitSuccess(retryExecution);

      if (retryExecution.idempotencyKey) {
        await this.cacheIdempotentResult(
          retryExecution.idempotencyKey,
          retryExecution.nodeId,
          retryExecution.executionId,
          result,
          precomputed
        );
      }

      console.log(`✅ Node ${retryExecution.nodeId} succeeded on attempt ${currentAttempt}`);
      return result;

    } catch (error: any) {
      attempt.error = error.message;
      retryExecution.lastError = error.message;
      retryExecution.updatedAt = new Date();

      const circuitState = this.recordCircuitFailure(retryExecution, error);

      const shouldRetry = this.shouldRetryError(error, retryExecution.policy);

      if (error instanceof SandboxPolicyViolationError) {
        retryExecution.status = 'dlq';
        retryExecution.updatedAt = new Date();
        throw error;
      }

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
  private async cacheIdempotentResult(
    key: string,
    nodeId: string,
    executionId: string,
    result: any,
    precomputed?: { normalized: any; hash: string }
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + this.idempotencyTtlMs);

    try {
      const { normalized, hash } = precomputed ?? this.computeResultHash(result);
      await this.getNodeExecutionResultStore().upsert({
        executionId,
        nodeId,
        idempotencyKey: key,
        resultHash: hash,
        resultData: normalized,
        expiresAt
      });

      this.markCachedKeyEstimateStale();
      await this.refreshCachedKeyEstimate();
    } catch (error) {
      console.error(`⚠️ Failed to cache idempotent result for ${executionId}:${nodeId}`, error);
    }
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
  async cleanup(): Promise<void> {
    const now = new Date();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    // Clean old executions
    for (const [key, execution] of this.executions.entries()) {
      if (now.getTime() - execution.createdAt.getTime() > maxAge) {
        this.executions.delete(key);
      }
    }

    try {
      await this.getNodeExecutionResultStore().deleteExpired(now);
      await this.refreshCachedKeyEstimate(now);
    } catch (error) {
      console.error('⚠️ Failed to cleanup node execution result cache', error);
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

    console.log(`🧹 Cleanup completed - ${this.executions.size} active executions, ${this.cachedKeyEstimate} cached keys, ${this.circuitStates.size} circuit states`);
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

    if (this.cachedKeyEstimateStale) {
      void this.refreshCachedKeyEstimate();
    }

    return {
      activeExecutions: executions.filter(e => e.status === 'pending' || e.status === 'retrying').length,
      cachedKeys: this.cachedKeyEstimate,
      dlqItems,
      successRate: total > 0 ? succeeded / total : 1,
      openCircuits: Array.from(this.circuitStates.values()).filter(state => state.state === 'open').length
    };
  }

  resetForTests(): void {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('resetForTests should only be used in test environment');
    }

    this.executions.clear();
    this.circuitStates.clear();
    this.cachedKeyEstimate = 0;
    this.cachedKeyEstimateStale = true;
    this.clearActionableErrors();
  }
}

export const retryManager = new RetryManager();

// Start cleanup interval
setInterval(() => {
  retryManager.cleanup().catch(error => {
    console.error('⚠️ RetryManager cleanup failed', error);
  });
}, 60 * 60 * 1000); // Every hour

export type { ActionableErrorEvent };
