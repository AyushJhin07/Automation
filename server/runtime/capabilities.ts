import { ALL_RUNTIMES, type RuntimeKey } from '@shared/runtimes';

export type RuntimeIdentifier = RuntimeKey;

export type EnabledRuntimeSet = Record<RuntimeKey, boolean>;

export interface RuntimeFlagSummary {
  runtime: RuntimeKey;
  enabled: boolean;
  defaultEnabled: boolean;
  source: 'default' | 'env';
  rawValue?: string;
}

const RUNTIME_FLAG_DEFAULTS: EnabledRuntimeSet = {
  node: true,
  // Apps Script now defaults to enabled; set RUNTIME_APPS_SCRIPT_ENABLED=false to disable per environment.
  appsScript: true,
  cloudWorker: false,
};

const RUNTIME_ENV_MAP: Record<RuntimeKey, string> = {
  node: 'RUNTIME_NODE_ENABLED',
  appsScript: 'RUNTIME_APPS_SCRIPT_ENABLED',
  cloudWorker: 'RUNTIME_CLOUD_WORKER_ENABLED',
};

const normalizeRuntimeFlag = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === null) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on', 'enabled'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'off', 'disabled'].includes(normalized)) {
    return false;
  }

  return fallback;
};

const readEnabledRuntimeSet = (): EnabledRuntimeSet => {
  const flags: EnabledRuntimeSet = {
    node: RUNTIME_FLAG_DEFAULTS.node,
    appsScript: RUNTIME_FLAG_DEFAULTS.appsScript,
    cloudWorker: RUNTIME_FLAG_DEFAULTS.cloudWorker,
  };

  for (const runtime of ALL_RUNTIMES) {
    const envKey = RUNTIME_ENV_MAP[runtime];
    const rawValue = process.env[envKey];
    if (rawValue !== undefined) {
      flags[runtime] = normalizeRuntimeFlag(rawValue, RUNTIME_FLAG_DEFAULTS[runtime]);
    }
  }

  return flags;
};

export const enabledRuntimes = (): EnabledRuntimeSet => readEnabledRuntimeSet();

export const enabledRuntimeSet = enabledRuntimes;

export const DEFAULT_RUNTIME_ENV = RUNTIME_FLAG_DEFAULTS;

export const getRuntimeFlagSummaries = (): Record<RuntimeKey, RuntimeFlagSummary> => {
  const defaults = RUNTIME_FLAG_DEFAULTS;
  const result: Record<RuntimeKey, RuntimeFlagSummary> = {
    node: {
      runtime: 'node',
      enabled: defaults.node,
      defaultEnabled: defaults.node,
      source: 'default',
    },
    appsScript: {
      runtime: 'appsScript',
      enabled: defaults.appsScript,
      defaultEnabled: defaults.appsScript,
      source: 'default',
    },
    cloudWorker: {
      runtime: 'cloudWorker',
      enabled: defaults.cloudWorker,
      defaultEnabled: defaults.cloudWorker,
      source: 'default',
    },
  };

  for (const runtime of ALL_RUNTIMES) {
    const envKey = RUNTIME_ENV_MAP[runtime];
    const rawValue = process.env[envKey];
    if (rawValue !== undefined) {
      result[runtime] = {
        runtime,
        enabled: normalizeRuntimeFlag(rawValue, defaults[runtime]),
        defaultEnabled: defaults[runtime],
        source: 'env',
        rawValue,
      };
    }
  }

  return result;
};
