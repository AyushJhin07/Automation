export const APP_SCHEMA_CANONICAL_KEYS = new Set([
  'sheets',
  'gmail',
  'slack',
  'microsoft-teams',
  'salesforce',
  'hubspot',
  'shopify',
  'stripe',
  'time'
]);

const normalize = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');

const aliasEntries: Array<[string, string]> = [
  ['sheets', 'sheets'],
  ['sheet', 'sheets'],
  ['google-sheets', 'sheets'],
  ['google sheet', 'sheets'],
  ['googlesheets', 'sheets'],
  ['google_sheets', 'sheets'],
  ['gsheets', 'sheets'],
  ['g-sheets', 'sheets'],
  ['google-sheets-enhanced', 'sheets'],
  ['gmail', 'gmail'],
  ['gmail-enhanced', 'gmail'],
  ['google-gmail', 'gmail'],
  ['google mail', 'gmail'],
  ['google-mail', 'gmail'],
  ['slack', 'slack'],
  ['slack-enhanced', 'slack'],
  ['microsoft-teams', 'microsoft-teams'],
  ['microsoft teams', 'microsoft-teams'],
  ['msteams', 'microsoft-teams'],
  ['ms-teams', 'microsoft-teams'],
  ['teams', 'microsoft-teams'],
  ['salesforce', 'salesforce'],
  ['salesforce-enhanced', 'salesforce'],
  ['sf', 'salesforce'],
  ['hubspot', 'hubspot'],
  ['hubspot-enhanced', 'hubspot'],
  ['shopify', 'shopify'],
  ['shopify-enhanced', 'shopify'],
  ['stripe', 'stripe'],
  ['time', 'time'],
  ['time-based', 'time'],
  ['time trigger', 'time'],
  ['time-trigger', 'time'],
  ['scheduler', 'time'],
  ['schedule', 'time']
];

const aliasMap = new Map<string, string>();
aliasEntries.forEach(([alias, canonical]) => {
  aliasMap.set(normalize(alias), canonical);
});

export function resolveAppSchemaKey(app?: string): string {
  if (!app) return '';
  const normalized = normalize(app);
  return aliasMap.get(normalized) || (APP_SCHEMA_CANONICAL_KEYS.has(normalized) ? normalized : normalized);
}

const sanitizeOperation = (value: string): string => value.replace(/[-\s]+/g, '_');

const stripPrefix = (value: string): string => value.replace(/^(?:action|trigger)[.:]/i, '');

function buildOperationCandidates(operation?: string, appKey?: string): string[] {
  const raw = (operation ?? '').trim();
  if (!raw) return [''];

  const candidates: string[] = [];
  const seen = new Set<string>();
  const pushCandidate = (candidate: string) => {
    if (!candidate) return;
    if (seen.has(candidate)) return;
    seen.add(candidate);
    candidates.push(candidate);
  };

  pushCandidate(raw);

  const withoutPrefix = stripPrefix(raw);
  pushCandidate(withoutPrefix);

  const parts = withoutPrefix.split(/[.:]/).filter(Boolean);
  if (parts.length > 1) {
    pushCandidate(parts.slice(1).join('.'));
  }

  if (parts.length) {
    pushCandidate(parts[parts.length - 1]);
  }

  if (appKey) {
    const normalizedApp = appKey.replace(/[-\s]+/g, '[-_.]?');
    const appPattern = new RegExp(`^${normalizedApp}[.:]`, 'i');
    const withoutApp = withoutPrefix.replace(appPattern, '');
    pushCandidate(withoutApp);
  }

  candidates
    .slice()
    .forEach((candidate) => {
      const sanitized = sanitizeOperation(candidate);
      if (sanitized !== candidate) {
        pushCandidate(sanitized);
      }
    });

  return candidates.filter(Boolean);
}

export function resolveOperationSchemaKey(
  operation?: string,
  availableKeys?: string[] | undefined,
  appKey?: string
): string {
  const candidates = buildOperationCandidates(operation, appKey);
  if (!availableKeys || availableKeys.length === 0) {
    return candidates[candidates.length - 1] || '';
  }

  for (const candidate of candidates) {
    if (availableKeys.includes(candidate)) {
      return candidate;
    }
  }

  const normalizedCandidates = candidates.map((candidate) => sanitizeOperation(candidate).toLowerCase());
  const normalizedAvailable = availableKeys.map((key) => sanitizeOperation(key).toLowerCase());

  for (const candidate of normalizedCandidates) {
    const matchIndex = normalizedAvailable.indexOf(candidate);
    if (matchIndex !== -1) {
      return availableKeys[matchIndex];
    }
  }

  return candidates[candidates.length - 1] || (operation ?? '');
}

export function mapAppOperationToSchema(app?: string, operation?: string, availableKeys?: string[]): {
  appKey: string;
  operationKey: string;
} {
  const appKey = resolveAppSchemaKey(app);
  const operationKey = resolveOperationSchemaKey(operation, availableKeys, appKey);
  return { appKey, operationKey };
}
