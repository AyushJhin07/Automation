export const APP_SCHEMA_ALIAS_MAP: Record<string, string> = {
  // Google Sheets aliases
  'sheets': 'sheets',
  'google-sheets': 'sheets',
  'google_sheets': 'sheets',
  'google-sheet': 'sheets',
  'google-sheets-enhanced': 'sheets',
  'gsheets': 'sheets',
  'sheet': 'sheets',

  // Time/delay helpers
  'time': 'time',
  'delay': 'time',
  'scheduler': 'time',
  'timer': 'time'
};

export function resolveAppSchemaKey(appName: string): string {
  const normalized = appName.toLowerCase();
  return APP_SCHEMA_ALIAS_MAP[normalized] ?? normalized;
}

export function resolveOperationSchemaKey(operation: string): string {
  if (!operation) return operation;
  const segments = operation.split('.');
  return segments[segments.length - 1] ?? operation;
}
