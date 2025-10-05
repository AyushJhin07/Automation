import { rateLimiter, type RateLimitRules, type RateLimitScope } from './RateLimiter';
import { retryManager } from '../core/RetryManager.js';
import {
  recordConnectorRatePolicyOverride,
  recordConnectorRetryEvent,
  recordConnectorThrottleEvent,
} from '../observability/index.js';

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise(resolve => setTimeout(resolve, ms));
}

export type TransportBackoffEventType = 'rate_limiter' | 'http_retry' | 'network_retry';

export interface TransportBackoffEvent {
  type: TransportBackoffEventType;
  waitMs: number;
  attempt: number;
  reason: string;
  statusCode?: number;
  limiterAttempts?: number;
}

export type RateLimitPolicyScope = 'connector' | 'operation' | 'runtime' | 'custom';

export interface RateLimitContext {
  connectorId: string;
  connectionId?: string | null;
  organizationId?: string | null;
  tokens?: number;
  rules?: RateLimitRules | null;
  bucketScope?: RateLimitScope;
  policyScope?: RateLimitPolicyScope;
  policyName?: string;
}

export interface TransportRequestOptions {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: BodyInit | null;
  prepareBody?: () => BodyInit | undefined | null;
  rawBody?: any;
  rateLimit?: RateLimitContext;
  retry?: {
    maxAttempts?: number;
  };
  fetch?: typeof fetch;
  onResponse?: (context: {
    response: Response;
    attempt: number;
    request: {
      method: string;
      url: string;
      headers: Record<string, string>;
      body?: any;
      init: RequestInit;
    };
  }) => Promise<{ retryAfterMs?: number } | void> | { retryAfterMs?: number } | void;
}

export interface TransportResult {
  response: Response;
  attempts: number;
  backoffEvents: TransportBackoffEvent[];
  rateLimiter: { waitMs: number; attempts: number };
  lastRetryAfterMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;

class HttpTransport {
  public async request(options: TransportRequestOptions): Promise<TransportResult> {
    const fetchImpl = options.fetch ?? fetch;
    const maxAttempts = Math.max(1, options.retry?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    const backoffEvents: TransportBackoffEvent[] = [];
    let totalLimiterWaitMs = 0;
    let totalLimiterAttempts = 0;
    let lastRetryAfterMs: number | undefined;
    let lastError: unknown;

    const rateLimitContext = options.rateLimit;
    const connectorId = rateLimitContext?.connectorId ?? 'unknown';
    const connectionId = rateLimitContext?.connectionId ?? null;
    const organizationId = rateLimitContext?.organizationId ?? null;

    if (rateLimitContext?.policyScope && rateLimitContext.policyScope !== 'connector') {
      recordConnectorRatePolicyOverride({
        connectorId,
        connectionId,
        organizationId,
        scope: rateLimitContext.policyScope,
        policy: rateLimitContext.policyName,
      });
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let releaseLimiter: (() => void) | undefined;
      try {
        if (rateLimitContext) {
          const limiterResult = await rateLimiter.acquire({
            connectorId,
            connectionId,
            organizationId,
            tokens: rateLimitContext.tokens,
            rules: rateLimitContext.rules ?? null,
            bucketScope: rateLimitContext.bucketScope,
          });
          releaseLimiter = limiterResult.release;

          totalLimiterWaitMs += limiterResult.waitMs;
          totalLimiterAttempts += limiterResult.attempts;

          if (limiterResult.waitMs > 0 || limiterResult.enforced) {
            backoffEvents.push({
              type: 'rate_limiter',
              waitMs: limiterResult.waitMs,
              attempt: attempt - 1,
              reason: 'token_bucket',
              limiterAttempts: limiterResult.attempts,
            });
            recordConnectorThrottleEvent({
              connectorId,
              connectionId,
              organizationId,
              source: 'rate_limiter',
              reason: 'token_bucket',
              waitMs: limiterResult.waitMs,
              attempts: limiterResult.attempts,
            });
          }
        }

        const headers = { ...(options.headers ?? {}) };
        const preparedBody = options.prepareBody ? options.prepareBody() : options.body;
        const requestInit: RequestInit = {
          method: options.method,
          headers,
          body: preparedBody ?? undefined,
        };

        const response = await fetchImpl(options.url, requestInit);

        let retryAfterMs: number | undefined;
        if (options.onResponse) {
          const hookResult = await options.onResponse({
            response,
            attempt,
            request: {
              method: options.method,
              url: options.url,
              headers,
              body: options.rawBody,
              init: requestInit,
            },
          });
          if (hookResult && typeof hookResult === 'object') {
            retryAfterMs = hookResult.retryAfterMs;
          }
        }
        lastRetryAfterMs = retryAfterMs;

        const status = response.status;
        const decision = retryManager.getHttpRetryDecision({
          attempt,
          maxAttempts,
          statusCode: status,
          retryAfterMs,
          connectorId,
          connectionId: connectionId ?? undefined,
          organizationId: organizationId ?? undefined,
        });

        if (decision.penaltyMs && rateLimitContext) {
          rateLimiter.schedulePenalty({
            connectorId,
            connectionId,
            organizationId,
            waitMs: decision.penaltyMs,
            scope: decision.penaltyScope,
          });
        }

        const isThrottleStatus = status === 429 || (status >= 500 && status <= 599);
        if (isThrottleStatus && rateLimitContext) {
          recordConnectorThrottleEvent({
            connectorId,
            connectionId,
            organizationId,
            source: 'http_status',
            reason: status === 429 ? 'http_429' : `http_${status}`,
            statusCode: status,
            waitMs: decision.shouldRetry ? decision.waitMs : undefined,
          });
        }

        if (decision.shouldRetry) {
          if (decision.waitMs > 0) {
            backoffEvents.push({
              type: 'http_retry',
              waitMs: decision.waitMs,
              attempt,
              reason: status === 429 ? 'http_429' : `http_${status}`,
              statusCode: status,
            });
          }

          recordConnectorRetryEvent({
            connectorId,
            connectionId,
            organizationId,
            reason: decision.reason,
            waitMs: decision.waitMs,
            attempt,
            statusCode: status,
          });

          if (decision.waitMs > 0) {
            await sleep(decision.waitMs);
          }
          continue;
        }

        return {
          response,
          attempts: attempt,
          backoffEvents,
          rateLimiter: { waitMs: totalLimiterWaitMs, attempts: totalLimiterAttempts },
          lastRetryAfterMs,
        };
      } catch (error) {
        lastError = error;
        const decision = retryManager.getHttpRetryDecision({
          attempt,
          maxAttempts,
          error: error instanceof Error ? error : new Error(String(error ?? 'unknown_error')),
          connectorId,
          connectionId: connectionId ?? undefined,
          organizationId: organizationId ?? undefined,
        });

        if (decision.shouldRetry) {
          backoffEvents.push({
            type: 'network_retry',
            waitMs: decision.waitMs,
            attempt,
            reason: decision.reason,
          });

          recordConnectorRetryEvent({
            connectorId,
            connectionId,
            organizationId,
            reason: decision.reason,
            waitMs: decision.waitMs,
            attempt,
          });

          if (decision.waitMs > 0) {
            await sleep(decision.waitMs);
          }
          continue;
        }

        throw error;
      } finally {
        if (releaseLimiter) {
          try {
            releaseLimiter();
          } catch (releaseError) {
            console.warn('[HttpTransport] Failed to release rate limiter slot:', releaseError);
          }
        }
      }
    }

    throw lastError ?? new Error('HTTP request failed after exhausting retries');
  }
}

export const httpTransport = new HttpTransport();
