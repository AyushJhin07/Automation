const truthyValues = new Set(['1', 'true', 'yes', 'on']);

let override: boolean | null = null;

const getImportMetaEnv = (): Partial<ImportMetaEnv> | undefined => {
  try {
    return typeof import.meta !== 'undefined' ? import.meta.env : undefined;
  } catch {
    return undefined;
  }
};

type ProcessEnvLike = Record<string, string | undefined>;

const getProcessEnv = (): ProcessEnvLike | undefined => {
  try {
    if (typeof process !== 'undefined' && process.env) {
      return process.env;
    }
  } catch {}
  return undefined;
};

const normalize = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return '';
};

function isDevelopmentEnvironment(): boolean {
  const env = getImportMetaEnv();
  if (env) {
    if (typeof env.DEV === 'boolean') {
      return env.DEV;
    }
    if (typeof env.MODE === 'string') {
      return env.MODE === 'development';
    }
  }

  const procEnv = getProcessEnv();
  if (procEnv?.NODE_ENV) {
    return procEnv.NODE_ENV === 'development';
  }

  return false;
}

function resolveRawFlag(): string {
  const env = getImportMetaEnv();
  if (env && typeof env.VITE_ENABLE_DEV_IGNORE_QUEUE !== 'undefined') {
    return normalize(env.VITE_ENABLE_DEV_IGNORE_QUEUE);
  }

  const procEnv = getProcessEnv();
  if (procEnv) {
    if (typeof procEnv.VITE_ENABLE_DEV_IGNORE_QUEUE === 'string') {
      return normalize(procEnv.VITE_ENABLE_DEV_IGNORE_QUEUE);
    }
    if (typeof procEnv.ENABLE_DEV_IGNORE_QUEUE === 'string') {
      return normalize(procEnv.ENABLE_DEV_IGNORE_QUEUE);
    }
  }

  return '';
}

export function isDevIgnoreQueueEnabled(): boolean {
  if (override !== null) {
    return override;
  }

  if (!isDevelopmentEnvironment()) {
    return false;
  }

  const raw = resolveRawFlag().toLowerCase();
  return truthyValues.has(raw);
}

/**
 * Test helper to override the computed value.
 * Do not use outside of test environments.
 */
export function __setDevIgnoreQueueOverride(value: boolean | null): void {
  override = value;
}
