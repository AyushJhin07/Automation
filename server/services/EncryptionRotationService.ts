import { sql, eq } from 'drizzle-orm';
import type { Queue } from '../queue/index.js';
import { createQueue } from '../queue/index.js';
import { db, connections, encryptionRotationJobs, type EncryptionRotationJobStatus } from '../database/schema';
import { EncryptionService } from './EncryptionService';
import { getErrorMessage } from '../types/common';

export interface EncryptionRotationJobSummary {
  id: string;
  status: EncryptionRotationJobStatus;
  totalConnections: number;
  processed: number;
  failed: number;
  percentComplete: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
  targetKeyId?: string | null;
  lastError?: string | null;
  metadata?: Record<string, any> | null;
  estimatedRemainingSeconds?: number | null;
}

type RotationJobPayload = { jobId: string };

const DEFAULT_BATCH_SIZE = 50;

export class EncryptionRotationService {
  private queue: Queue<RotationJobPayload, unknown, 'encryption.rotate'> | null = null;

  private ensureQueue(): Queue<RotationJobPayload, unknown, 'encryption.rotate'> {
    if (!this.queue) {
      this.queue = createQueue('encryption.rotate', {
        defaultJobOptions: {
          removeOnComplete: true,
          attempts: 1,
        },
      });
    }
    return this.queue;
  }

  public async startRotation(options: {
    targetKeyId?: string | null;
    metadata?: Record<string, any>;
  } = {}): Promise<{ jobId: string }> {
    if (!db) {
      throw new Error('Database is not available. Cannot start encryption rotation.');
    }

    await EncryptionService.refreshKeyMetadata();
    let targetKeyId = options.targetKeyId ?? EncryptionService.getActiveEncryptionKeyId();

    if (!targetKeyId) {
      throw new Error('No active encryption key is available for rotation.');
    }

    const totalResult = await db.execute(
      sql`SELECT COUNT(*)::int AS count FROM ${connections} WHERE ${connections.encryptionKeyId} IS DISTINCT FROM ${targetKeyId}`
    );
    const totalConnections = Number((totalResult.rows?.[0] as { count?: number })?.count ?? 0);

    const [job] = await db
      .insert(encryptionRotationJobs)
      .values({
        targetKeyId,
        status: 'pending',
        totalConnections,
        processed: 0,
        failed: 0,
        metadata: options.metadata ?? null,
      })
      .returning({ id: encryptionRotationJobs.id });

    const queue = this.ensureQueue();
    await queue.add('encryption.rotate', { jobId: job.id });

    return { jobId: job.id };
  }

  public async getJob(jobId: string): Promise<EncryptionRotationJobSummary | null> {
    if (!db) {
      return null;
    }

    const [job] = await db
      .select()
      .from(encryptionRotationJobs)
      .where(eq(encryptionRotationJobs.id, jobId))
      .limit(1);

    if (!job) {
      return null;
    }

    return this.mapJob(job);
  }

  public async listJobs(limit: number = 20): Promise<EncryptionRotationJobSummary[]> {
    if (!db) {
      return [];
    }

    const rows = await db
      .select()
      .from(encryptionRotationJobs)
      .orderBy(encryptionRotationJobs.createdAt)
      .limit(Math.max(1, Math.min(limit, 100)));

    return rows.map((row) => this.mapJob(row));
  }

  public async processJob(jobId: string): Promise<void> {
    if (!db) {
      throw new Error('Database is not available. Cannot process encryption rotation job.');
    }

    const [job] = await db
      .select()
      .from(encryptionRotationJobs)
      .where(eq(encryptionRotationJobs.id, jobId))
      .limit(1);

    if (!job) {
      throw new Error(`Encryption rotation job ${jobId} not found`);
    }

    await EncryptionService.refreshKeyMetadata();
    let targetKeyId = job.targetKeyId ?? EncryptionService.getActiveEncryptionKeyId();

    if (!targetKeyId) {
      throw new Error('No active encryption key is available for rotation.');
    }

    const startTime = new Date();
    await db
      .update(encryptionRotationJobs)
      .set({
        status: 'running',
        startedAt: job.startedAt ?? startTime,
        updatedAt: startTime,
        targetKeyId,
      })
      .where(eq(encryptionRotationJobs.id, jobId));

    let processed = job.processed ?? 0;
    let failed = job.failed ?? 0;
    let lastError: string | null = job.lastError ?? null;
    const batchSize = Math.max(1, Number(process.env.ENCRYPTION_ROTATION_BATCH_SIZE ?? DEFAULT_BATCH_SIZE));

    try {
      while (true) {
        const batchResult = await db.execute(
          sql`
            SELECT id, encrypted_credentials, iv, encryption_key_id, data_key_ciphertext
            FROM ${connections}
            WHERE ${connections.encryptionKeyId} IS DISTINCT FROM ${targetKeyId}
            ORDER BY ${connections.updatedAt}
            LIMIT ${batchSize}
          `
        );

        const rows = (batchResult.rows ?? []) as Array<{
          id: string;
          encrypted_credentials: string;
          iv: string;
          encryption_key_id: string | null;
          data_key_ciphertext: string | null;
        }>;

        if (rows.length === 0) {
          break;
        }

        for (const row of rows) {
          try {
            const credentials = await EncryptionService.decryptCredentials(
              row.encrypted_credentials,
              row.iv,
              row.encryption_key_id,
              row.data_key_ciphertext
            );
            const reEncrypted = await EncryptionService.encryptCredentials(credentials);
            await db
              .update(connections)
              .set({
                encryptedCredentials: reEncrypted.encryptedData,
                iv: reEncrypted.iv,
                encryptionKeyId: reEncrypted.keyId ?? null,
                dataKeyCiphertext: reEncrypted.dataKeyCiphertext ?? null,
                updatedAt: new Date(),
              })
              .where(eq(connections.id, row.id));
            processed += 1;
          } catch (error) {
            failed += 1;
            lastError = getErrorMessage(error);
            await db
              .update(connections)
              .set({ lastError: `Key rotation failed: ${lastError}`, updatedAt: new Date() })
              .where(eq(connections.id, row.id));
          }
        }

        await db
          .update(encryptionRotationJobs)
          .set({
            processed,
            failed,
            lastError,
            updatedAt: new Date(),
          })
          .where(eq(encryptionRotationJobs.id, jobId));
      }

      const completionStatus: EncryptionRotationJobStatus = failed > 0 ? 'completed_with_errors' : 'completed';
      const completedAt = new Date();

      await db
        .update(encryptionRotationJobs)
        .set({
          status: completionStatus,
          processed,
          failed,
          lastError,
          completedAt,
          updatedAt: completedAt,
        })
        .where(eq(encryptionRotationJobs.id, jobId));
    } catch (error) {
      const message = getErrorMessage(error);
      await db
        .update(encryptionRotationJobs)
        .set({
          status: 'failed',
          lastError: message,
          updatedAt: new Date(),
        })
        .where(eq(encryptionRotationJobs.id, jobId));
      throw error;
    }
  }

  private mapJob(row: typeof encryptionRotationJobs.$inferSelect): EncryptionRotationJobSummary {
    const percent = row.totalConnections > 0
      ? Math.min(1, Math.max(0, row.processed / row.totalConnections)) * 100
      : 100;

    let estimatedRemainingSeconds: number | null = null;
    if (row.startedAt && row.processed > 0 && row.totalConnections > row.processed) {
      const elapsedSeconds = (Date.now() - row.startedAt.getTime()) / 1000;
      const rate = row.processed / elapsedSeconds;
      if (rate > 0) {
        const remaining = row.totalConnections - row.processed;
        estimatedRemainingSeconds = Math.round(remaining / rate);
      }
    }

    return {
      id: row.id,
      status: row.status as EncryptionRotationJobStatus,
      totalConnections: row.totalConnections,
      processed: row.processed,
      failed: row.failed,
      percentComplete: Number(percent.toFixed(2)),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      targetKeyId: row.targetKeyId,
      lastError: row.lastError,
      metadata: row.metadata as Record<string, any> | null,
      estimatedRemainingSeconds,
    };
  }
}

export const encryptionRotationService = new EncryptionRotationService();
