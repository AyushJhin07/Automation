import type { Request } from 'express';

const PREVIEW_TOKENS = new Set([
  'preview',
  'dry-run',
  'dryrun',
  'manual',
  'manual-preview',
  'manualpreview',
  'manual-run',
  'manualrun',
  'manual-dry-run',
  'manualdryrun',
  'action-only',
  'actiononly',
  'action-preview',
  'sandbox',
  'simulation',
  'simulated',
  'test',
]);

const TRUEISH_TOKENS = new Set(['true', '1', 'yes', 'y', 'on']);

const HEADER_PREVIEW_KEYS = [
  'x-workflow-preview',
  'x-workflow-validation-mode',
  'x-execution-mode',
  'x-run-mode',
  'x-workflow-run-mode',
  'x-deployment-mode',
];

const QUERY_PREVIEW_KEYS = ['mode', 'runMode', 'validationMode', 'preview', 'executionMode'];

const OBJECT_PREVIEW_FIELDS = [
  'mode',
  'runMode',
  'validationMode',
  'executionMode',
  'previewMode',
];

function normalizeToken(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.replace(/[_\s]+/g, '-');
}

function matchesPreviewToken(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  if (typeof value === 'string') {
    const normalized = normalizeToken(value);
    if (!normalized) {
      return false;
    }

    if (TRUEISH_TOKENS.has(normalized)) {
      return true;
    }

    if (PREVIEW_TOKENS.has(normalized)) {
      return true;
    }

    if (normalized.includes('preview')) {
      return true;
    }

    if (normalized.includes('dry-run') || normalized.includes('dryrun')) {
      return true;
    }

    if (normalized.includes('manual') && normalized.includes('run')) {
      return true;
    }
  }

  return false;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(toStringArray);
  }
  if (typeof value === 'string') {
    return [value];
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }
  return [];
}

function extractPreviewFlagFromObject(source: unknown): boolean {
  if (!source || typeof source !== 'object') {
    return false;
  }

  const record = source as Record<string, any>;

  if (matchesPreviewToken(record.preview)) {
    return true;
  }

  if (matchesPreviewToken(record.dryRun)) {
    return true;
  }

  if (matchesPreviewToken(record.manual)) {
    return true;
  }

  for (const field of OBJECT_PREVIEW_FIELDS) {
    if (matchesPreviewToken(record[field])) {
      return true;
    }
  }

  return false;
}

export function resolveAllowActionOnlyFlag(req: Request, graphPayload?: unknown): boolean {
  const headerValues = HEADER_PREVIEW_KEYS.flatMap((key) => {
    const value = req.headers[key];
    return toStringArray(value as any);
  });

  const headerFlag = headerValues.some((value) => matchesPreviewToken(value));

  const queryFlag = QUERY_PREVIEW_KEYS.some((key) => matchesPreviewToken((req.query as Record<string, any>)[key]));

  const requestBody = typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, any>) : {};
  const bodyFlag = extractPreviewFlagFromObject(requestBody);
  const optionsFlag = extractPreviewFlagFromObject(requestBody.options);

  const metadata = graphPayload && typeof graphPayload === 'object' && (graphPayload as any).metadata
    ? (graphPayload as any).metadata
    : undefined;
  const metadataFlag = extractPreviewFlagFromObject(metadata);

  return headerFlag || queryFlag || bodyFlag || optionsFlag || metadataFlag;
}

export function matchesPreviewOrManualToken(value: unknown): boolean {
  return matchesPreviewToken(value);
}
