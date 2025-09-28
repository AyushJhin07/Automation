export type AppSchemaAliasKey = 'sheets' | 'time';

const ALIAS_GROUPS: Record<AppSchemaAliasKey, string[]> = {
  sheets: [
    'sheets',
    'sheet',
    'google-sheets',
    'google_sheets',
    'google sheets',
    'googlesheets',
    'gsheets',
    'g-sheets',
    'google-sheets-enhanced'
  ],
  time: [
    'time',
    'delay',
    'wait',
    'timer',
    'schedule',
    'time-delay'
  ]
};

const aliasMap = new Map<string, AppSchemaAliasKey>();

const normalizeKey = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '-');
};

for (const [canonical, aliases] of Object.entries(ALIAS_GROUPS)) {
  for (const alias of aliases) {
    aliasMap.set(normalizeKey(alias), canonical as AppSchemaAliasKey);
  }
}

export const resolveAppSchemaKey = (app?: string | null): string | null => {
  if (!app) return null;
  const normalized = normalizeKey(app);
  if (aliasMap.has(normalized)) {
    return aliasMap.get(normalized)!;
  }

  const rawSegments = String(app)
    .trim()
    .toLowerCase()
    .split(/[.:/]/)
    .filter(Boolean);

  for (let i = rawSegments.length - 1; i >= 0; i--) {
    const candidate = normalizeKey(rawSegments[i]);
    if (aliasMap.has(candidate)) {
      return aliasMap.get(candidate)!;
    }
  }

  return null;
};

export const resolveSchemaOperationKey = (operation?: string | null): string => {
  if (!operation) return '';
  const trimmed = operation.trim();
  if (!trimmed) return '';

  const segments = trimmed.split(/[.:]/).filter(Boolean);
  if (segments.length === 0) {
    return trimmed;
  }

  return segments[segments.length - 1];
};

export const buildSchemaRequestPaths = (
  app: string,
  operation: string
): { resolvedApp: string; resolvedOperation: string; schemaPath: string; validationPath: string } => {
  const resolvedApp = resolveAppSchemaKey(app) ?? app;
  const resolvedOperation = resolveSchemaOperationKey(operation) || operation;
  return {
    resolvedApp,
    resolvedOperation,
    schemaPath: `/api/app-schemas/schemas/${resolvedApp}/${resolvedOperation}`,
    validationPath: `/api/app-schemas/schemas/${resolvedApp}/${resolvedOperation}/validate`
  };
};
