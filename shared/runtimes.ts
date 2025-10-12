export type RuntimeKey = 'node' | 'appsScript' | 'cloudWorker';

export const ALL_RUNTIMES: RuntimeKey[] = ['node', 'appsScript', 'cloudWorker'];

export const DEFAULT_RUNTIME: RuntimeKey = 'node';

export const RUNTIME_DISPLAY_NAMES: Record<RuntimeKey, string> = {
  node: 'Node.js',
  appsScript: 'Apps Script',
  cloudWorker: 'Cloud Worker',
};

export const EXECUTION_RUNTIME_REQUESTS = ['appsScript', 'nodeJs'] as const;

export type ExecutionRuntimeRequest = (typeof EXECUTION_RUNTIME_REQUESTS)[number];

export const EXECUTION_RUNTIME_DEFAULT: ExecutionRuntimeRequest = 'appsScript';

export const mapExecutionRuntimeToRuntimeKey = (
  runtime: ExecutionRuntimeRequest | RuntimeKey | null | undefined,
): RuntimeKey => {
  if (!runtime) {
    return DEFAULT_RUNTIME;
  }

  if (runtime === 'nodeJs') {
    return 'node';
  }

  if (runtime === 'node' || runtime === 'appsScript' || runtime === 'cloudWorker') {
    return runtime;
  }

  return DEFAULT_RUNTIME;
};
