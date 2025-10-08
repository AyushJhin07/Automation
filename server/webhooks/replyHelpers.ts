import type { APIResponse } from '../integrations/BaseAPIClient.js';

export type WebhookReplyFormat = 'json' | 'text' | 'html';

export interface WebhookReplyPayload {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  format: WebhookReplyFormat;
}

interface ReplyOptions {
  statusCode?: number;
  headers?: Record<string, string> | null;
}

function normalizeStatusCode(statusCode?: number): number {
  if (typeof statusCode !== 'number' || !Number.isFinite(statusCode)) {
    return 200;
  }

  const clamped = Math.floor(statusCode);
  if (clamped < 100) return 200;
  if (clamped > 599) return 599;
  return clamped;
}

function normalizeHeaders(
  base: Record<string, string>,
  overrides?: Record<string, string> | null
): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const [key, value] of Object.entries(base)) {
    if (typeof value === 'string' && value.length > 0) {
      headers[key.toLowerCase()] = value;
    }
  }

  if (!overrides) {
    return headers;
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (typeof key !== 'string') continue;
    if (value === undefined || value === null) continue;
    const normalizedKey = key.toLowerCase();
    headers[normalizedKey] = String(value);
  }

  return headers;
}

function buildWebhookReply(
  format: WebhookReplyFormat,
  body: unknown,
  options: ReplyOptions,
  defaultHeaders: Record<string, string>
): APIResponse<WebhookReplyPayload> {
  const statusCode = normalizeStatusCode(options.statusCode);
  const headers = normalizeHeaders(defaultHeaders, options.headers);

  return {
    success: true,
    data: {
      statusCode,
      headers,
      body,
      format,
    },
  };
}

export async function replyWithJson(
  params: { body: unknown } & ReplyOptions
): Promise<APIResponse<WebhookReplyPayload>> {
  return buildWebhookReply('json', params.body, params, {
    'content-type': 'application/json; charset=utf-8',
  });
}

export async function replyWithText(
  params: { body: string } & ReplyOptions
): Promise<APIResponse<WebhookReplyPayload>> {
  return buildWebhookReply('text', params.body, params, {
    'content-type': 'text/plain; charset=utf-8',
  });
}

export async function replyWithHtml(
  params: { body: string } & ReplyOptions
): Promise<APIResponse<WebhookReplyPayload>> {
  return buildWebhookReply('html', params.body, params, {
    'content-type': 'text/html; charset=utf-8',
  });
}
