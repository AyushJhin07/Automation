export type RuntimeKey = 'node' | 'appsScript' | 'cloudWorker';

export const ALL_RUNTIMES: RuntimeKey[] = ['node', 'appsScript', 'cloudWorker'];

export const DEFAULT_RUNTIME: RuntimeKey = 'appsScript';

export const RUNTIME_DISPLAY_NAMES: Record<RuntimeKey, string> = {
  node: 'Node.js',
  appsScript: 'Apps Script',
  cloudWorker: 'Cloud Worker',
};
