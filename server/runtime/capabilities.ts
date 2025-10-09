export type RuntimeIdentifier = 'node' | 'apps_script' | 'cloud_worker';

export interface EnabledRuntimeSet {
  node: boolean;
  appsScript: boolean;
  cloudWorker: boolean;
}

const RUNTIME_FLAG_DEFAULTS: EnabledRuntimeSet = {
  node: true,
  appsScript: false,
  cloudWorker: false,
};

const normalizeRuntimeFlag = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === null) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }

  return fallback;
};

export const enabledRuntimes = (): EnabledRuntimeSet => {
  return {
    node: normalizeRuntimeFlag(process.env.RUNTIME_NODE_ENABLED, RUNTIME_FLAG_DEFAULTS.node),
    appsScript: normalizeRuntimeFlag(
      process.env.RUNTIME_APPS_SCRIPT_ENABLED,
      RUNTIME_FLAG_DEFAULTS.appsScript,
    ),
    cloudWorker: normalizeRuntimeFlag(
      process.env.RUNTIME_CLOUD_WORKER_ENABLED,
      RUNTIME_FLAG_DEFAULTS.cloudWorker,
    ),
  };
};

export const enabledRuntimeSet = enabledRuntimes;

export const DEFAULT_RUNTIME_ENV = RUNTIME_FLAG_DEFAULTS;
