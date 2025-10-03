import { redactSecrets } from './redact';

const MAX_STRING_LENGTH = 2000;
const MAX_ARRAY_LENGTH = 100;

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}…`;
}

function sanitizeValue(value: unknown): unknown {
  if (value == null) {
    return value;
  }

  if (typeof value === 'string') {
    return truncateString(value);
  }

  if (Array.isArray(value)) {
    const limited = value.slice(0, MAX_ARRAY_LENGTH).map(sanitizeValue);
    if (value.length > MAX_ARRAY_LENGTH) {
      return [...limited, `…omitted ${value.length - MAX_ARRAY_LENGTH} items`];
    }
    return limited;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = sanitizeValue(child);
    }
    return result;
  }

  return value;
}

export function sanitizeExecutionPayload<T>(payload: T): T {
  if (payload == null) {
    return payload;
  }

  const redacted = redactSecrets(payload);
  return sanitizeValue(redacted) as T;
}

export type TimelineEvent<TData extends Record<string, any> = Record<string, any>> = {
  timestamp: string;
  type: string;
  data?: TData;
};

export function createTimelineEvent<TData extends Record<string, any>>(
  type: string,
  data: TData | undefined,
): TimelineEvent<TData> {
  return {
    timestamp: new Date().toISOString(),
    type,
    data: data ? sanitizeExecutionPayload(data) : undefined,
  };
}
