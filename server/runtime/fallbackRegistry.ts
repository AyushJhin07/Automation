import type { APICredentials } from '../integrations/BaseAPIClient.js';
import type { PollingTrigger } from '../webhooks/types.js';

export interface FallbackHandlerContext {
  trigger: PollingTrigger;
  cursor: Record<string, any> | null;
  now: Date;
  log: (message: string, details?: Record<string, any>) => void;
  credentials?: APICredentials | null;
  parameters?: Record<string, any> | null;
  additionalConfig?: Record<string, any> | null;
  httpClient?: HttpClient | null;
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

export type HttpResponseLike = {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
};

export type HttpClient = (url: string, init?: Record<string, any>) => Promise<HttpResponseLike>;

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

const registerAliases = (keys: string[], handler: FallbackHandler): void => {
  for (const key of keys) {
    registerHandler(key, handler);
  }
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

const safeJson = async (response: any): Promise<any> => {
  if (!response || typeof response.json !== 'function') {
    return {};
  }
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const extractAccessToken = (
  credentials?: APICredentials | null,
  additionalConfig?: Record<string, any> | null,
): string | null => {
  const candidates: Array<unknown> = [];
  if (credentials) {
    candidates.push(
      credentials.accessToken,
      (credentials as any).access_token,
      credentials.token,
      (credentials as any).oauthToken,
      (credentials as any).botToken,
      (credentials as any).bearerToken,
    );
  }
  if (additionalConfig) {
    candidates.push(
      additionalConfig.accessToken,
      (additionalConfig as any).botToken,
      (additionalConfig as any).token,
    );
  }

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return null;
};

const resolveHttpClient = (context: FallbackHandlerContext): HttpClient | null => {
  if (typeof context.httpClient === 'function') {
    return context.httpClient;
  }
  if (typeof globalThis.fetch === 'function') {
    return (url, init) => globalThis.fetch(url, init as any) as unknown as Promise<HttpResponseLike>;
  }
  return null;
};

const mergeParameters = (
  trigger: PollingTrigger,
  parameters?: Record<string, any> | null,
): Record<string, any> => {
  const merged: Record<string, any> = {};
  const triggerParams =
    trigger.metadata && typeof trigger.metadata.parameters === 'object'
      ? (trigger.metadata.parameters as Record<string, any>)
      : {};
  Object.assign(merged, triggerParams);
  if (parameters && typeof parameters === 'object') {
    Object.assign(merged, parameters);
  }
  return merged;
};

const gmailMessagesListFallback: FallbackHandler = async context => {
  const start = Date.now();
  const httpClient = resolveHttpClient(context);
  const handlerKey = 'gmail.messages.list';

  if (!httpClient) {
    context.log('Gmail fallback skipped: HTTP client unavailable', { handler: handlerKey });
    return {
      items: [],
      cursor: context.cursor ?? null,
      logs: [buildLogEntry('gmail.messages.list skipped - missing HTTP client')],
      diagnostics: { handlerKey, mode: 'fallback', reason: 'missing_http_client' },
    };
  }

  const token = extractAccessToken(context.credentials, context.additionalConfig);
  if (!token) {
    context.log('Gmail fallback skipped: missing access token', { handler: handlerKey });
    return {
      items: [],
      cursor: context.cursor ?? null,
      logs: [buildLogEntry('gmail.messages.list skipped - missing credentials')],
      diagnostics: { handlerKey, mode: 'fallback', reason: 'missing_credentials' },
    };
  }

  const params = mergeParameters(context.trigger, context.parameters);
  const searchParams = new URLSearchParams();

  const maxResultsCandidate = params.maxResults ?? params.limit;
  const maxResults = Number.parseInt(String(maxResultsCandidate ?? '25'), 10);
  if (Number.isFinite(maxResults) && maxResults > 0) {
    searchParams.set('maxResults', String(maxResults));
  }

  if (params.q) {
    searchParams.set('q', String(params.q));
  }

  const labelIds = ensureArray<string>(params.labelIds ?? params.labels)
    .map(value => String(value).trim())
    .filter(value => value.length > 0);
  for (const label of labelIds) {
    searchParams.append('labelIds', label);
  }

  if (params.includeSpamTrash) {
    searchParams.set('includeSpamTrash', 'true');
  }

  if (context.cursor?.pageToken) {
    searchParams.set('pageToken', String(context.cursor.pageToken));
  }

  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages${
    searchParams.size > 0 ? `?${searchParams.toString()}` : ''
  }`;

  const response = await httpClient(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await safeJson(response);
    context.log('Gmail fallback request failed', {
      handler: handlerKey,
      status: response.status,
      body,
    });
    return {
      items: [],
      cursor: context.cursor ?? null,
      logs: [
        buildLogEntry('gmail.messages.list request failed', {
          status: response.status,
        }),
      ],
      diagnostics: {
        handlerKey,
        mode: 'fallback',
        status: response.status,
        error: body?.error ?? 'http_error',
      },
      latencyMs: Date.now() - start,
    };
  }

  const data = await safeJson(response);
  const messages = ensureArray<any>(data.messages);

  const items: FallbackResultItem[] = messages.map((entry, index) => {
    const payload = { ...entry };
    if (!payload.id) {
      payload.id = payload.threadId ?? `${context.trigger.id}-msg-${index}`;
    }

    return {
      payload,
      dedupeToken:
        typeof payload.id === 'string'
          ? payload.id
          : typeof payload.threadId === 'string'
          ? payload.threadId
          : undefined,
    };
  });

  const historyId =
    typeof data.historyId === 'string'
      ? data.historyId
      : typeof data.historyId === 'number'
      ? String(data.historyId)
      : context.cursor?.historyId ?? null;

  const nextCursor: Record<string, any> = {
    ...(context.cursor ?? {}),
    pageToken: typeof data.nextPageToken === 'string' ? data.nextPageToken : null,
    historyId,
    lastPolledAt: context.now.toISOString(),
  };

  context.log('Processed Gmail fallback batch', {
    mode: 'fallback',
    handler: handlerKey,
    itemCount: items.length,
    pageToken: nextCursor.pageToken ?? undefined,
  });

  return {
    items,
    cursor: nextCursor,
    logs: [buildLogEntry('gmail.messages.list fetched messages', { count: items.length })],
    diagnostics: {
      handlerKey,
      mode: 'fallback',
      itemCount: items.length,
      nextPageToken: nextCursor.pageToken ?? undefined,
    },
    latencyMs: Date.now() - start,
  };
};

const driveFilesPollingFallback: FallbackHandler = async context => {
  const start = Date.now();
  const httpClient = resolveHttpClient(context);
  const handlerKey = 'google_drive.files.watch';

  if (!httpClient) {
    context.log('Google Drive fallback skipped: HTTP client unavailable', { handler: handlerKey });
    return {
      items: [],
      cursor: context.cursor ?? null,
      logs: [buildLogEntry('google_drive.files.watch skipped - missing HTTP client')],
      diagnostics: { handlerKey, mode: 'fallback', reason: 'missing_http_client' },
    };
  }

  const token = extractAccessToken(context.credentials, context.additionalConfig);
  if (!token) {
    context.log('Google Drive fallback skipped: missing access token', { handler: handlerKey });
    return {
      items: [],
      cursor: context.cursor ?? null,
      logs: [buildLogEntry('google_drive.files.watch skipped - missing credentials')],
      diagnostics: { handlerKey, mode: 'fallback', reason: 'missing_credentials' },
    };
  }

  const params = mergeParameters(context.trigger, context.parameters);
  const searchParams = new URLSearchParams();

  const pageSizeCandidate = params.pageSize ?? params.limit ?? 50;
  const pageSize = Number.parseInt(String(pageSizeCandidate), 10);
  searchParams.set('pageSize', Number.isFinite(pageSize) && pageSize > 0 ? String(pageSize) : '50');
  searchParams.set(
    'fields',
    'files(id,name,mimeType,createdTime,modifiedTime,owners,webViewLink),nextPageToken',
  );
  searchParams.set('spaces', String(params.spaces ?? 'drive'));

  if (context.cursor?.pageToken) {
    searchParams.set('pageToken', String(context.cursor.pageToken));
  }

  const queryParts: string[] = ['trashed = false'];
  if (params.folderId) {
    queryParts.push(`'${String(params.folderId).replace(/'/g, "\\'")}' in parents`);
  }
  if (params.mimeType) {
    queryParts.push(`mimeType = '${String(params.mimeType)}'`);
  } else {
    queryParts.push("mimeType contains 'application/vnd.google-apps.document'");
  }
  if (params.modifiedAfter) {
    queryParts.push(`modifiedTime > '${String(params.modifiedAfter)}'`);
  } else if (context.cursor?.lastSyncToken) {
    queryParts.push(`modifiedTime > '${String(context.cursor.lastSyncToken)}'`);
  }

  if (queryParts.length > 0) {
    searchParams.set('q', queryParts.join(' and '));
  }

  const url = `https://www.googleapis.com/drive/v3/files?${searchParams.toString()}`;

  const response = await httpClient(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await safeJson(response);
    context.log('Google Drive fallback request failed', {
      handler: handlerKey,
      status: response.status,
      body,
    });
    return {
      items: [],
      cursor: context.cursor ?? null,
      logs: [buildLogEntry('google_drive.files.watch request failed', { status: response.status })],
      diagnostics: {
        handlerKey,
        mode: 'fallback',
        status: response.status,
        error: body?.error ?? 'http_error',
      },
      latencyMs: Date.now() - start,
    };
  }

  const data = await safeJson(response);
  const files = ensureArray<any>(data.files);

  const items: FallbackResultItem[] = files.map((entry, index) => {
    const payload = { ...entry };
    if (!payload.id) {
      payload.id = `${context.trigger.id}-file-${index}`;
    }
    if (!payload.modifiedTime && payload.createdTime) {
      payload.modifiedTime = payload.createdTime;
    }

    return {
      payload,
      dedupeToken: typeof payload.id === 'string' ? payload.id : undefined,
    };
  });

  const lastModified =
    items.length > 0
      ? items[items.length - 1].payload?.modifiedTime ?? items[items.length - 1].payload?.createdTime ?? null
      : context.cursor?.lastSyncToken ?? null;

  const nextCursor: Record<string, any> = {
    ...(context.cursor ?? {}),
    pageToken: typeof data.nextPageToken === 'string' ? data.nextPageToken : null,
    lastSyncToken: lastModified,
    lastPolledAt: context.now.toISOString(),
  };

  context.log('Processed Google Drive fallback batch', {
    mode: 'fallback',
    handler: handlerKey,
    itemCount: items.length,
    pageToken: nextCursor.pageToken ?? undefined,
  });

  return {
    items,
    cursor: nextCursor,
    logs: [buildLogEntry('google_drive.files.watch fetched files', { count: items.length })],
    diagnostics: {
      handlerKey,
      mode: 'fallback',
      itemCount: items.length,
      nextPageToken: nextCursor.pageToken ?? undefined,
    },
    latencyMs: Date.now() - start,
  };
};

const slackConversationsHistoryFallback: FallbackHandler = async context => {
  const start = Date.now();
  const httpClient = resolveHttpClient(context);
  const handlerKey = 'slack.conversations.history';

  if (!httpClient) {
    context.log('Slack fallback skipped: HTTP client unavailable', { handler: handlerKey });
    return {
      items: [],
      cursor: context.cursor ?? null,
      logs: [buildLogEntry('slack.conversations.history skipped - missing HTTP client')],
      diagnostics: { handlerKey, mode: 'fallback', reason: 'missing_http_client' },
    };
  }

  const token = extractAccessToken(context.credentials, context.additionalConfig);
  if (!token) {
    context.log('Slack fallback skipped: missing access token', { handler: handlerKey });
    return {
      items: [],
      cursor: context.cursor ?? null,
      logs: [buildLogEntry('slack.conversations.history skipped - missing credentials')],
      diagnostics: { handlerKey, mode: 'fallback', reason: 'missing_credentials' },
    };
  }

  const params = mergeParameters(context.trigger, context.parameters);
  const channel = typeof params.channel === 'string' ? params.channel.trim() : '';
  if (!channel) {
    context.log('Slack fallback skipped: missing channel parameter', { handler: handlerKey });
    return {
      items: [],
      cursor: context.cursor ?? null,
      logs: [buildLogEntry('slack.conversations.history skipped - missing channel')],
      diagnostics: { handlerKey, mode: 'fallback', reason: 'missing_channel' },
    };
  }

  const searchParams = new URLSearchParams();
  searchParams.set('channel', channel);

  const limitCandidate = params.limit ?? params.pageSize ?? 50;
  const limit = Number.parseInt(String(limitCandidate), 10);
  if (Number.isFinite(limit) && limit > 0) {
    searchParams.set('limit', String(limit));
  }

  if (context.cursor?.nextCursor) {
    searchParams.set('cursor', String(context.cursor.nextCursor));
  }

  if (params.inclusive) {
    searchParams.set('inclusive', String(Boolean(params.inclusive)));
  }
  if (params.oldest) {
    searchParams.set('oldest', String(params.oldest));
  }
  if (params.latest) {
    searchParams.set('latest', String(params.latest));
  }

  const url = `https://slack.com/api/conversations.history?${searchParams.toString()}`;

  const response = await httpClient(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await safeJson(response);
    context.log('Slack fallback request failed', {
      handler: handlerKey,
      status: response.status,
      body,
    });
    return {
      items: [],
      cursor: context.cursor ?? null,
      logs: [buildLogEntry('slack.conversations.history request failed', { status: response.status })],
      diagnostics: {
        handlerKey,
        mode: 'fallback',
        status: response.status,
        error: body?.error ?? 'http_error',
      },
      latencyMs: Date.now() - start,
    };
  }

  const data = await safeJson(response);
  if (data && data.ok === false) {
    context.log('Slack fallback reported API error', {
      handler: handlerKey,
      error: data.error ?? 'unknown_error',
    });
    return {
      items: [],
      cursor: context.cursor ?? null,
      logs: [
        buildLogEntry('slack.conversations.history API error', {
          error: data.error ?? 'unknown_error',
        }),
      ],
      diagnostics: {
        handlerKey,
        mode: 'fallback',
        error: data.error ?? 'api_error',
      },
      latencyMs: Date.now() - start,
    };
  }

  const events = ensureArray<any>(data?.messages);
  const items: FallbackResultItem[] = events.map(entry => ({
    payload: { ...entry },
    dedupeToken:
      typeof entry.ts === 'string'
        ? entry.ts
        : typeof entry.event_ts === 'string'
        ? entry.event_ts
        : undefined,
  }));

  const nextCursorValue = data?.response_metadata?.next_cursor;
  const nextCursor: Record<string, any> = {
    ...(context.cursor ?? {}),
    nextCursor: typeof nextCursorValue === 'string' && nextCursorValue.length > 0 ? nextCursorValue : null,
    lastEventTs:
      items.length > 0
        ? items[items.length - 1].dedupeToken ?? context.cursor?.lastEventTs ?? null
        : context.cursor?.lastEventTs ?? null,
    lastPolledAt: context.now.toISOString(),
  };

  context.log('Processed Slack fallback batch', {
    mode: 'fallback',
    handler: handlerKey,
    itemCount: items.length,
    nextCursor: nextCursor.nextCursor ?? undefined,
  });

  return {
    items,
    cursor: nextCursor,
    logs: [buildLogEntry('slack.conversations.history fetched events', { count: items.length })],
    diagnostics: {
      handlerKey,
      mode: 'fallback',
      itemCount: items.length,
      nextCursor: nextCursor.nextCursor ?? undefined,
    },
    latencyMs: Date.now() - start,
  };
};

registerAliases(['gmail.messages.list', 'gmail.polling.new_email'], gmailMessagesListFallback);
registerAliases(
  [
    'google_drive.files.watch',
    'google_docs.drive.polling',
    'google_docs.documents.watch',
    'google_docs.document_updated',
  ],
  driveFilesPollingFallback,
);
registerAliases(['slack.conversations.history', 'slack.api.poller'], slackConversationsHistoryFallback);

export function getFallbackHandler(key: string | null | undefined): FallbackHandler | undefined {
  if (typeof key !== 'string' || !key.trim()) {
    return undefined;
  }
  return registry.get(normalizeKey(key));
}
