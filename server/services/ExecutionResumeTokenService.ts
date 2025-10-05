import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { env } from '../env.js';
import { db, executionResumeTokens } from '../database/schema.js';
import { getErrorMessage } from '../types/common.js';
import { and, eq, sql } from 'drizzle-orm';
import type { WorkflowResumeState } from '../types/workflowTimers.js';

type ResumeTokenRecord = {
  id: string;
  executionId: string;
  workflowId: string;
  organizationId: string;
  nodeId: string;
  userId?: string | null;
  resumeState: WorkflowResumeState;
  initialData: any;
  triggerType?: string | null;
  waitUntil?: Date | null;
  metadata?: Record<string, any> | null;
  expiresAt: Date;
};

type IssueTokenParams = {
  executionId: string;
  workflowId: string;
  organizationId: string;
  nodeId: string;
  userId?: string | null;
  resumeState: WorkflowResumeState;
  initialData: any;
  triggerType?: string | null;
  waitUntil?: Date | null;
  metadata?: Record<string, any> | null;
  ttlMs?: number;
};

type ConsumeTokenParams = {
  token: string;
  signature?: string | null;
  executionId?: string;
  nodeId?: string;
  organizationId?: string;
};

type ConsumedTokenResult = ResumeTokenRecord & {
  tokenId: string;
};

type ConsumeSuccessResult = {
  status: 'success';
  record: ConsumedTokenResult;
};

type ConsumeInvalidResult = {
  status: 'invalid';
  reason: 'token_missing' | 'signature_invalid' | 'not_found' | 'context_mismatch';
  message?: string;
};

type ConsumeExpiredResult = {
  status: 'expired';
  reason: 'expired' | 'consumed';
  expiresAt?: Date;
  consumedAt?: Date | null;
};

type ConsumeErrorResult = {
  status: 'error';
  message: string;
};

export type ConsumeResult =
  | ConsumeSuccessResult
  | ConsumeInvalidResult
  | ConsumeExpiredResult
  | ConsumeErrorResult;

const DEFAULT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

class ExecutionResumeTokenService {
  private static instance: ExecutionResumeTokenService;
  private readonly memoryStore = new Map<string, ResumeTokenRecord>();
  private readonly memoryIndex = new Map<string, string>();
  private readonly memoryConsumed = new Map<string, { expiresAt: Date; consumedAt: Date | null }>();

  private constructor() {}

  public static getInstance(): ExecutionResumeTokenService {
    if (!ExecutionResumeTokenService.instance) {
      ExecutionResumeTokenService.instance = new ExecutionResumeTokenService();
    }
    return ExecutionResumeTokenService.instance;
  }

  private getBaseUrl(): string {
    return env.SERVER_PUBLIC_URL || process.env.BASE_URL || 'http://localhost:5000';
  }

  private createToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private signToken(token: string): string {
    const secret = env.JWT_SECRET || 'resume-token-secret';
    return createHmac('sha256', secret).update(token).digest('hex');
  }

  private verifySignature(token: string, provided: string | undefined | null): boolean {
    if (!provided) {
      return false;
    }
    const expected = this.signToken(token);
    try {
      return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
    } catch {
      return false;
    }
  }

  private buildCallbackUrl(executionId: string, nodeId: string, token: string, signature: string): string {
    const base = this.getBaseUrl().replace(/\/$/, '');
    const search = new URLSearchParams({ token, signature });
    return `${base}/api/runs/${encodeURIComponent(executionId)}/nodes/${encodeURIComponent(nodeId)}/resume?${search.toString()}`;
  }

  private useMemoryStore(): boolean {
    if (process.env.EXECUTION_RESUME_FORCE_MEMORY === 'true') {
      return true;
    }
    return !db;
  }

  private storeInMemory(record: ResumeTokenRecord & { token: string }): void {
    this.memoryStore.set(record.id, record);
    this.memoryIndex.set(this.hashToken(record.token), record.id);
    this.memoryConsumed.delete(this.hashToken(record.token));
  }

  private consumeFromMemory(params: ConsumeTokenParams): ConsumeResult {
    const now = Date.now();
    const tokenHash = this.hashToken(params.token);
    const recordId = this.memoryIndex.get(tokenHash);
    if (!recordId) {
      const consumed = this.memoryConsumed.get(tokenHash);
      if (consumed) {
        return { status: 'expired', reason: 'consumed', expiresAt: consumed.expiresAt, consumedAt: consumed.consumedAt };
      }
      return { status: 'invalid', reason: 'not_found' };
    }
    const stored = this.memoryStore.get(recordId);
    if (!stored) {
      this.memoryIndex.delete(tokenHash);
      const consumed = this.memoryConsumed.get(tokenHash);
      if (consumed) {
        return { status: 'expired', reason: 'consumed', expiresAt: consumed.expiresAt, consumedAt: consumed.consumedAt };
      }
      return { status: 'invalid', reason: 'not_found' };
    }
    if (stored.expiresAt.getTime() <= now) {
      this.memoryStore.delete(recordId);
      this.memoryIndex.delete(tokenHash);
      this.memoryConsumed.set(tokenHash, { expiresAt: stored.expiresAt, consumedAt: stored.expiresAt });
      return { status: 'expired', reason: 'expired', expiresAt: stored.expiresAt, consumedAt: stored.expiresAt };
    }
    if (params.executionId && params.executionId !== stored.executionId) {
      return { status: 'invalid', reason: 'context_mismatch' };
    }
    if (params.nodeId && params.nodeId !== stored.nodeId) {
      return { status: 'invalid', reason: 'context_mismatch' };
    }
    if (params.organizationId && params.organizationId !== stored.organizationId) {
      return { status: 'invalid', reason: 'context_mismatch' };
    }
    this.memoryStore.delete(recordId);
    this.memoryIndex.delete(tokenHash);
    const consumedAt = new Date();
    this.memoryConsumed.set(tokenHash, { expiresAt: stored.expiresAt, consumedAt });
    return { status: 'success', record: { ...stored, tokenId: recordId } };
  }

  public async issueToken(
    params: IssueTokenParams,
  ): Promise<
    | {
        tokenId: string;
        token: string;
        signature: string;
        callbackUrl: string;
        expiresAt: Date;
      }
    | null
  > {
    const token = this.createToken();
    const signature = this.signToken(token);
    const tokenHash = this.hashToken(token);
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + Math.max(60_000, params.ttlMs ?? DEFAULT_TOKEN_TTL_MS),
    );

    if (this.useMemoryStore()) {
      const id = randomBytes(16).toString('hex');
      this.storeInMemory({
        id,
        token,
        executionId: params.executionId,
        workflowId: params.workflowId,
        organizationId: params.organizationId,
        nodeId: params.nodeId,
        userId: params.userId,
        resumeState: params.resumeState,
        initialData: params.initialData,
        triggerType: params.triggerType ?? 'callback',
        waitUntil: params.waitUntil ?? null,
        metadata: params.metadata ?? null,
        expiresAt,
      });

      return {
        tokenId: id,
        token,
        signature,
        callbackUrl: this.buildCallbackUrl(params.executionId, params.nodeId, token, signature),
        expiresAt,
      };
    }

    try {
      const cleanupConditions = and(
        eq(executionResumeTokens.executionId, params.executionId),
        eq(executionResumeTokens.nodeId, params.nodeId),
        sql`${executionResumeTokens.consumedAt} IS NULL`,
      );

      await db
        .update(executionResumeTokens)
        .set({
          consumedAt: now,
          updatedAt: now,
        })
        .where(cleanupConditions);

      const [created] = await db
        .insert(executionResumeTokens)
        .values({
          executionId: params.executionId,
          workflowId: params.workflowId,
          organizationId: params.organizationId,
          nodeId: params.nodeId,
          userId: params.userId ?? null,
          tokenHash,
          resumeState: params.resumeState,
          initialData: params.initialData,
          triggerType: params.triggerType ?? 'callback',
          waitUntil: params.waitUntil ?? null,
          metadata: params.metadata ?? null,
          expiresAt,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: executionResumeTokens.id });

      const tokenId = created?.id ?? randomBytes(16).toString('hex');

      return {
        tokenId,
        token,
        signature,
        callbackUrl: this.buildCallbackUrl(params.executionId, params.nodeId, token, signature),
        expiresAt,
      };
    } catch (error) {
      console.error('Failed to persist execution resume token:', getErrorMessage(error));
      return null;
    }
  }

  public async consume(params: ConsumeTokenParams): Promise<ConsumeResult> {
    const token = typeof params.token === 'string' ? params.token.trim() : '';
    if (!token) {
      return { status: 'invalid', reason: 'token_missing' };
    }
    if (!this.verifySignature(token, params.signature ?? null)) {
      return { status: 'invalid', reason: 'signature_invalid' };
    }

    if (this.useMemoryStore()) {
      return this.consumeFromMemory({ ...params, token });
    }

    try {
      const tokenHash = this.hashToken(token);
      const [existing] = await db
        .select({
          id: executionResumeTokens.id,
          executionId: executionResumeTokens.executionId,
          workflowId: executionResumeTokens.workflowId,
          organizationId: executionResumeTokens.organizationId,
          nodeId: executionResumeTokens.nodeId,
          userId: executionResumeTokens.userId,
          resumeState: executionResumeTokens.resumeState,
          initialData: executionResumeTokens.initialData,
          triggerType: executionResumeTokens.triggerType,
          waitUntil: executionResumeTokens.waitUntil,
          metadata: executionResumeTokens.metadata,
          expiresAt: executionResumeTokens.expiresAt,
          consumedAt: executionResumeTokens.consumedAt,
        })
        .from(executionResumeTokens)
        .where(eq(executionResumeTokens.tokenHash, tokenHash))
        .limit(1);

      if (!existing) {
        return { status: 'invalid', reason: 'not_found' };
      }

      if (params.executionId && params.executionId !== existing.executionId) {
        return { status: 'invalid', reason: 'context_mismatch' };
      }
      if (params.nodeId && params.nodeId !== existing.nodeId) {
        return { status: 'invalid', reason: 'context_mismatch' };
      }
      if (params.organizationId && params.organizationId !== existing.organizationId) {
        return { status: 'invalid', reason: 'context_mismatch' };
      }

      const now = new Date();

      if (existing.consumedAt) {
        return {
          status: 'expired',
          reason: 'consumed',
          expiresAt: existing.expiresAt,
          consumedAt: existing.consumedAt,
        };
      }

      if (existing.expiresAt.getTime() <= now.getTime()) {
        return {
          status: 'expired',
          reason: 'expired',
          expiresAt: existing.expiresAt,
          consumedAt: existing.consumedAt ?? existing.expiresAt,
        };
      }

      const [updated] = await db
        .update(executionResumeTokens)
        .set({
          consumedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(executionResumeTokens.id, existing.id),
            sql`${executionResumeTokens.consumedAt} IS NULL`,
            sql`${executionResumeTokens.expiresAt} > ${now}`,
          ),
        )
        .returning({
          id: executionResumeTokens.id,
          executionId: executionResumeTokens.executionId,
          workflowId: executionResumeTokens.workflowId,
          organizationId: executionResumeTokens.organizationId,
          nodeId: executionResumeTokens.nodeId,
          userId: executionResumeTokens.userId,
          resumeState: executionResumeTokens.resumeState,
          initialData: executionResumeTokens.initialData,
          triggerType: executionResumeTokens.triggerType,
          waitUntil: executionResumeTokens.waitUntil,
          metadata: executionResumeTokens.metadata,
          expiresAt: executionResumeTokens.expiresAt,
        });

      if (!updated) {
        return {
          status: 'expired',
          reason: 'consumed',
          expiresAt: existing.expiresAt,
          consumedAt: existing.consumedAt ?? now,
        };
      }

      return {
        status: 'success',
        record: {
          tokenId: updated.id,
          executionId: updated.executionId,
          workflowId: updated.workflowId,
          organizationId: updated.organizationId,
          nodeId: updated.nodeId,
          userId: updated.userId ?? null,
          resumeState: updated.resumeState as WorkflowResumeState,
          initialData: updated.initialData,
          triggerType: updated.triggerType,
          waitUntil: updated.waitUntil ?? null,
          metadata: (updated.metadata ?? {}) as Record<string, any>,
          expiresAt: updated.expiresAt,
        },
      };
    } catch (error) {
      console.error('Failed to consume execution resume token:', getErrorMessage(error));
      return { status: 'error', message: getErrorMessage(error) };
    }
  }

  public async consumeToken(params: ConsumeTokenParams): Promise<ConsumedTokenResult | null> {
    const result = await this.consume(params);
    if (result.status === 'success') {
      return result.record;
    }
    return null;
  }
}

export const executionResumeTokenService = ExecutionResumeTokenService.getInstance();

export type ExecutionResumeTokenServiceInstance = ExecutionResumeTokenService;
