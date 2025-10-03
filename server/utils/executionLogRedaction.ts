import { redactSecrets } from './redact';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type ReplacerValue = JsonValue | Record<string, unknown> | undefined;

function toSerializable(value: unknown): ReplacerValue {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (value instanceof Map) {
    return Object.fromEntries(value);
  }
  if (value instanceof Set) {
    return Array.from(value);
  }
  return value as ReplacerValue;
}

/**
 * Prepare arbitrary data for logging by making it JSON-serializable and redacting secrets.
 */
export function sanitizeLogPayload<T>(payload: T): T {
  if (payload === undefined) {
    return payload;
  }

  try {
    const json = JSON.stringify(payload, (_key, value) => toSerializable(value));
    if (!json) {
      return payload;
    }
    const parsed = JSON.parse(json) as JsonValue;
    return redactSecrets(parsed) as T;
  } catch (error) {
    // If serialization fails, attempt to redact directly
    try {
      return redactSecrets(payload) as T;
    } catch {
      return payload;
    }
  }
}

export function appendTimelineEvent<T extends Record<string, any>>(timeline: unknown, event: T): T[] {
  const existing = Array.isArray(timeline) ? [...timeline] : [];
  const sanitizedEvent = sanitizeLogPayload(event);
  existing.push(sanitizedEvent);
  return existing as T[];
}

export function coerceTimeline(timeline: unknown): any[] {
  return Array.isArray(timeline) ? timeline : [];
}
