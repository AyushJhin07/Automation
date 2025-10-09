import type { PollingTrigger } from '../webhooks/types.js';

export interface FallbackHandlerContext {
  trigger: PollingTrigger;
  cursor: Record<string, any> | null;
  now: Date;
  log: (message: string, details?: Record<string, any>) => void;
}

export interface FallbackResultItem {
  payload: any;
  dedupeToken?: string;
}

export interface FallbackLogEntry {
  message: string;
  details?: Record<string, any>;
}

export interface FallbackHandlerResult {
  items?: Array<FallbackResultItem | any>;
  cursor?: Record<string, any> | null;
  logs?: Array<string | FallbackLogEntry>;
  diagnostics?: Record<string, any>;
  latencyMs?: number;
}

export type FallbackHandler = (
  context: FallbackHandlerContext,
) => Promise<FallbackHandlerResult | void | null> | FallbackHandlerResult | void | null;

const registry = new Map<string, FallbackHandler>();

const normalizeKey = (key: string): string => key.trim().toLowerCase();

const registerHandler = (key: string, handler: FallbackHandler): void => {
  if (typeof key !== 'string' || !key.trim() || typeof handler !== 'function') {
    return;
  }
  registry.set(normalizeKey(key), handler);
};

const ensureArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) {
    return value as T[];
  }
  return [];
};

const buildLogEntry = (message: string, details?: Record<string, any>): FallbackLogEntry => ({
  message,
  ...(details ? { details } : {}),
});

const gmailPollingFallback: FallbackHandler = async ({ trigger, cursor, now, log }) => {
  const metadata = trigger.metadata ?? {};
  const mockResults = ensureArray<Record<string, any>>(metadata.mockResults);

  const items: FallbackResultItem[] = mockResults.map((entry, index) => {
    const payload = { ...entry };
    if (!payload.id) {
      payload.id = `${trigger.id}-msg-${index}`;
    }
    if (!payload.historyId) {
      payload.historyId = payload.id;
    }

    return {
      payload,
      dedupeToken: typeof payload.id === 'string' ? payload.id : undefined,
    };
  });

  const lastHistoryId =
    items.length > 0 ? items[items.length - 1]?.payload?.historyId : cursor?.historyId;

  const nextCursor = {
    ...(cursor ?? {}),
    historyId: lastHistoryId ?? null,
    lastPolledAt: now.toISOString(),
  } as Record<string, any>;

  log('Processed Gmail fallback batch', {
    mode: 'fallback',
    handler: 'gmail.polling.new_email',
    itemCount: items.length,
  });

  return {
    items,
    cursor: nextCursor,
    logs: [buildLogEntry('gmail.polling.new_email processed items', { count: items.length })],
    diagnostics: {
      handlerKey: 'gmail.polling.new_email',
      itemCount: items.length,
      mode: 'fallback',
    },
  };
};

const googleDriveWatcherFallback: FallbackHandler = async ({ trigger, cursor, now, log }) => {
  const metadata = trigger.metadata ?? {};
  const mockFiles = ensureArray<Record<string, any>>(metadata.mockFiles ?? metadata.mockResults);

  const items: FallbackResultItem[] = mockFiles.map((file, index) => {
    const payload = { ...file };
    if (!payload.id) {
      payload.id = `${trigger.id}-file-${index}`;
    }
    if (!payload.modifiedTime) {
      payload.modifiedTime = now.toISOString();
    }

    return {
      payload,
      dedupeToken: typeof payload.id === 'string' ? payload.id : undefined,
    };
  });

  const lastSyncToken =
    items.length > 0
      ? items[items.length - 1]?.payload?.modifiedTime ?? cursor?.lastSyncToken
      : cursor?.lastSyncToken;

  const nextCursor = {
    ...(cursor ?? {}),
    lastSyncToken: lastSyncToken ?? null,
    lastPolledAt: now.toISOString(),
  } as Record<string, any>;

  log('Processed Google Drive fallback batch', {
    mode: 'fallback',
    handler: 'google_drive.files.watch',
    itemCount: items.length,
  });

  return {
    items,
    cursor: nextCursor,
    logs: [buildLogEntry('google_drive.files.watch processed items', { count: items.length })],
    diagnostics: {
      handlerKey: 'google_drive.files.watch',
      itemCount: items.length,
      mode: 'fallback',
    },
  };
};

const slackApiPollerFallback: FallbackHandler = async ({ trigger, cursor, now, log }) => {
  const metadata = trigger.metadata ?? {};
  const mockEvents = ensureArray<Record<string, any>>(metadata.mockEvents ?? metadata.mockResults);

  const items: FallbackResultItem[] = mockEvents.map((event, index) => {
    const payload = { ...event };
    if (!payload.ts) {
      payload.ts = `${now.getTime() / 1000 + index}`;
    }

    return {
      payload,
      dedupeToken:
        typeof payload.ts === 'string'
          ? payload.ts
          : typeof payload.id === 'string'
          ? payload.id
          : undefined,
    };
  });

  const lastEventToken =
    items.length > 0
      ? items[items.length - 1]?.dedupeToken ?? cursor?.lastEventTs
      : cursor?.lastEventTs;

  const nextCursor = {
    ...(cursor ?? {}),
    lastEventTs: lastEventToken ?? null,
    lastPolledAt: now.toISOString(),
  } as Record<string, any>;

  log('Processed Slack fallback batch', {
    mode: 'fallback',
    handler: 'slack.api.poller',
    itemCount: items.length,
  });

  return {
    items,
    cursor: nextCursor,
    logs: [buildLogEntry('slack.api.poller processed items', { count: items.length })],
    diagnostics: {
      handlerKey: 'slack.api.poller',
      itemCount: items.length,
      mode: 'fallback',
    },
  };
};

registerHandler('gmail.polling.new_email', gmailPollingFallback);
registerHandler('google_drive.files.watch', googleDriveWatcherFallback);
registerHandler('slack.api.poller', slackApiPollerFallback);

export function getFallbackHandler(key: string | null | undefined): FallbackHandler | undefined {
  if (typeof key !== 'string' || !key.trim()) {
    return undefined;
  }
  return registry.get(normalizeKey(key));
}

