const TRUE_LITERALS = new Set(['true', '1', 'yes', 'y', 'on', 'enabled']);
const FALSE_LITERALS = new Set(['false', '0', 'no', 'n', 'off', 'disabled']);

export interface AppsScriptConnectorFlag {
  connectorId: string;
  normalizedId: string;
  envKey: string;
  enabled: boolean;
  source: 'default' | 'env';
  rawValue?: string;
}

const flagCache = new Map<string, AppsScriptConnectorFlag>();

const normalizeConnectorId = (value: string): string => value.trim().toLowerCase();

const sanitizeEnvSuffix = (value: string): string => {
  const sanitized = value.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toUpperCase();
  return sanitized.length > 0 ? sanitized : 'UNKNOWN';
};

const buildEnvKey = (normalizedConnectorId: string): string =>
  `APPS_SCRIPT_ENABLED_${sanitizeEnvSuffix(normalizedConnectorId)}`;

const normalizeBoolean = (rawValue: string | undefined, fallback: boolean): boolean => {
  if (rawValue === undefined || rawValue === null) {
    return fallback;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (TRUE_LITERALS.has(normalized)) {
    return true;
  }
  if (FALSE_LITERALS.has(normalized)) {
    return false;
  }
  return fallback;
};

export const DEFAULT_CONNECTOR_APPS_SCRIPT_ENABLED = true;

export function getAppsScriptConnectorFlag(connectorIdRaw: string): AppsScriptConnectorFlag {
  const normalizedId = normalizeConnectorId(connectorIdRaw);

  if (!normalizedId) {
    return {
      connectorId: connectorIdRaw,
      normalizedId,
      envKey: 'APPS_SCRIPT_ENABLED_',
      enabled: DEFAULT_CONNECTOR_APPS_SCRIPT_ENABLED,
      source: 'default',
    };
  }

  const cached = flagCache.get(normalizedId);
  if (cached) {
    return cached;
  }

  const envKey = buildEnvKey(normalizedId);
  const rawValue = process.env[envKey];
  const enabled = normalizeBoolean(rawValue, DEFAULT_CONNECTOR_APPS_SCRIPT_ENABLED);
  const entry: AppsScriptConnectorFlag = {
    connectorId: connectorIdRaw,
    normalizedId,
    envKey,
    enabled,
    source: rawValue === undefined ? 'default' : 'env',
    rawValue,
  };

  flagCache.set(normalizedId, entry);
  return entry;
}

export function isAppsScriptEnabledForConnector(connectorIdRaw: string): boolean {
  const flag = getAppsScriptConnectorFlag(connectorIdRaw);
  return flag.enabled;
}

export function resetAppsScriptConnectorFlagCache(): void {
  flagCache.clear();
}
