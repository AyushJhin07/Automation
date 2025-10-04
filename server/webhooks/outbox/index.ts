import type { QueueRunRequest } from '../../services/ExecutionQueueService';
import type {
  TriggerPersistenceService,
  WebhookOutboxRecord,
} from '../../services/TriggerPersistenceService';
import { getErrorMessage } from '../../types/common.js';

type QueueService = {
  enqueue: (request: QueueRunRequest) => Promise<{ executionId: string }>;
};

interface DispatchOptions {
  record: WebhookOutboxRecord;
  queueService: QueueService;
  persistence: TriggerPersistenceService;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export async function dispatchOutboxRecord(
  options: DispatchOptions
): Promise<{ success: boolean; executionId?: string; error?: string }> {
  const { record, queueService, persistence, logger = console } = options;
  const payload = record.payload as QueueRunRequest | undefined;

  if (!payload || typeof payload !== 'object') {
    const message = 'Outbox payload missing or invalid';
    logger.error?.(`[webhook-outbox] ${message}`, { outboxId: record.id });
    await persistence.markWebhookOutboxFailed(record, message);
    return { success: false, error: message };
  }

  try {
    const result = await queueService.enqueue(payload);
    await persistence.markWebhookOutboxDispatched(record, { executionId: result.executionId });
    logger.info?.(`[webhook-outbox] Dispatched outbox ${record.id}`, {
      executionId: result.executionId,
    });
    return { success: true, executionId: result.executionId };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error?.(`[webhook-outbox] Failed to dispatch ${record.id}: ${errorMessage}`);
    await persistence.markWebhookOutboxFailed(record, errorMessage);
    return { success: false, error: errorMessage };
  }
}

interface ReplayOptions {
  persistence: TriggerPersistenceService;
  queueService: QueueService;
  limit?: number;
  olderThan?: Date;
  statuses?: Array<'pending' | 'failed'>;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export async function replayStuckOutboxEntries(
  options: ReplayOptions
): Promise<{ total: number; succeeded: number; failed: number }> {
  const limit = Math.max(1, options.limit ?? 25);
  const records = await options.persistence.listPendingWebhookOutbox({
    limit,
    statuses: options.statuses,
    olderThan: options.olderThan,
  });

  let succeeded = 0;
  let failed = 0;

  for (const record of records) {
    const result = await dispatchOutboxRecord({
      record,
      queueService: options.queueService,
      persistence: options.persistence,
      logger: options.logger,
    });
    if (result.success) {
      succeeded += 1;
    } else {
      failed += 1;
    }
  }

  return { total: records.length, succeeded, failed };
}
