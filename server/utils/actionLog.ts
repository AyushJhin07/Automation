import { logs, SeverityNumber } from '@opentelemetry/api-logs';

const DEFAULT_SCOPE = 'automation.action-log';
const DEFAULT_VERSION = '1.0.0';
const DEFAULT_SEVERITY: SeverityLevel = 'info';
const RESERVED_KEYS = new Set([
  'type',
  'message',
  'severity',
  'level',
  'component',
  'attributes',
  'timestamp',
  'ts',
  'scope',
  'version',
]);

const loggerCache = new Map<string, ReturnType<typeof logs.getLogger>>();

const severityMap: Record<SeverityLevel, { number: SeverityNumber; text: string }> = {
  trace: { number: SeverityNumber.TRACE, text: 'TRACE' },
  debug: { number: SeverityNumber.DEBUG, text: 'DEBUG' },
  info: { number: SeverityNumber.INFO, text: 'INFO' },
  warn: { number: SeverityNumber.WARN, text: 'WARN' },
  error: { number: SeverityNumber.ERROR, text: 'ERROR' },
  fatal: { number: SeverityNumber.FATAL, text: 'FATAL' },
};

type SeverityLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

type AttributeValue = string | number | boolean;

type ActionEvent = {
  type: string;
  message?: string;
  severity?: SeverityLevel;
  level?: SeverityLevel;
  component?: string;
  attributes?: Record<string, unknown>;
  timestamp?: Date | string | number;
  ts?: Date | string | number;
  scope?: string;
  version?: string;
  [key: string]: unknown;
};

type LogActionOptions = {
  severity?: SeverityLevel;
  scope?: string;
  version?: string;
  timestamp?: Date | string | number;
  component?: string;
  attributes?: Record<string, unknown>;
};

function getLogger(scope: string, version: string): ReturnType<typeof logs.getLogger> {
  const cacheKey = `${scope}@${version}`;
  const cached = loggerCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const logger = logs.getLogger(scope, version);
  loggerCache.set(cacheKey, logger);
  return logger;
}

function normalizeTimestamp(input?: Date | string | number): number | undefined {
  if (!input) {
    return undefined;
  }

  if (input instanceof Date) {
    const time = input.getTime();
    return Number.isNaN(time) ? undefined : time;
  }

  if (typeof input === 'number') {
    return Number.isFinite(input) ? input : undefined;
  }

  if (typeof input === 'string') {
    const parsed = Date.parse(input);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

function sanitizeAttributeKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) {
    return 'event.unknown';
  }

  const sanitized = trimmed.replace(/[^a-zA-Z0-9_.:-]/g, '_');
  if (sanitized.startsWith('event.')) {
    return sanitized;
  }

  return `event.${sanitized}`;
}

function sanitizeAttributeValue(value: unknown): AttributeValue | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    const iso = value.toISOString();
    return iso;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function collectAttributes(event: ActionEvent, options: LogActionOptions): Record<string, AttributeValue> {
  const attributes: Record<string, AttributeValue> = {
    'event.type': event.type,
  };

  const component = options.component ?? event.component;
  if (component) {
    const value = sanitizeAttributeValue(component);
    if (value !== undefined) {
      attributes['event.component'] = value;
    }
  }

  const applyEntries = (entries: Record<string, unknown> | undefined) => {
    if (!entries) {
      return;
    }

    for (const [key, raw] of Object.entries(entries)) {
      const value = sanitizeAttributeValue(raw);
      if (value === undefined) {
        continue;
      }
      const attrKey = sanitizeAttributeKey(key);
      attributes[attrKey] = value;
    }
  };

  applyEntries(options.attributes);
  applyEntries(event.attributes && typeof event.attributes === 'object' ? (event.attributes as Record<string, unknown>) : undefined);

  for (const [key, raw] of Object.entries(event)) {
    if (RESERVED_KEYS.has(key)) {
      continue;
    }

    const value = sanitizeAttributeValue(raw);
    if (value === undefined) {
      continue;
    }

    const attrKey = sanitizeAttributeKey(key);
    attributes[attrKey] = value;
  }

  return attributes;
}

function resolveSeverity(event: ActionEvent, options: LogActionOptions): { number: SeverityNumber; text: string } {
  const severity = options.severity ?? event.severity ?? event.level ?? DEFAULT_SEVERITY;
  return severityMap[severity] ?? severityMap[DEFAULT_SEVERITY];
}

export function logAction(event: ActionEvent, options: LogActionOptions = {}): void {
  if (!event || typeof event.type !== 'string' || event.type.trim() === '') {
    console.warn('⚠️ logAction called without a valid event.type');
    return;
  }

  const scope = options.scope ?? event.scope ?? DEFAULT_SCOPE;
  const version = options.version ?? event.version ?? DEFAULT_VERSION;
  const timestamp = normalizeTimestamp(options.timestamp ?? event.timestamp ?? event.ts);
  const message = event.message ?? `Action recorded: ${event.type}`;
  const severity = resolveSeverity(event, options);

  const attributes = collectAttributes(event, options);

  try {
    const logger = getLogger(scope, version);
    logger.emit({
      severityNumber: severity.number,
      severityText: severity.text,
      body: message,
      attributes,
      timestamp: timestamp ?? Date.now(),
    });
  } catch (error) {
    try {
      const fallbackMessage = `⚠️ Failed to emit OTEL action log for ${event.type}: ${error instanceof Error ? error.message : String(error)}`;
      if (severity.number >= SeverityNumber.ERROR) {
        console.error(fallbackMessage, { message, attributes });
      } else if (severity.number >= SeverityNumber.WARN) {
        console.warn(fallbackMessage, { message, attributes });
      } else {
        console.debug(fallbackMessage, { message, attributes });
      }
    } catch {
      console.error('❌ Failed to emit OTEL action log and fallback logging threw an error');
    }
  }
}
