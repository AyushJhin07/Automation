import { connectorRegistry } from '../server/ConnectorRegistry.js';
import {
  getRuntimeCapabilities,
  type RuntimeCapabilityOperationSummary,
} from '../server/runtime/registry.js';

type RuntimeTotals = {
  operations: number;
  nodeSupported: number;
  appsScriptSupported: number;
  bothRuntimes: number;
  neitherRuntime: number;
  nodeDisabled: number;
  appsScriptDisabled: number;
};

const totals: RuntimeTotals = {
  operations: 0,
  nodeSupported: 0,
  appsScriptSupported: 0,
  bothRuntimes: 0,
  neitherRuntime: 0,
  nodeDisabled: 0,
  appsScriptDisabled: 0,
};

const describeRuntimeSupport = (
  detail: RuntimeCapabilityOperationSummary,
): { summary: string; category: 'both' | 'node' | 'appsScript' | 'neither' } => {
  const includesRuntime = (runtime: 'node' | 'appsScript'): boolean =>
    detail.nativeRuntimes.includes(runtime) || detail.fallbackRuntimes.includes(runtime);

  const runtimeEnabled = (runtime: 'node' | 'appsScript'): boolean =>
    detail.enabledNativeRuntimes.includes(runtime) ||
    detail.enabledFallbackRuntimes.includes(runtime);

  const nodeEnabled = runtimeEnabled('node');
  const appsScriptEnabled = runtimeEnabled('appsScript');
  const nodeAvailable = includesRuntime('node');
  const appsScriptAvailable = includesRuntime('appsScript');

  const parts: string[] = [];

  if (nodeEnabled) {
    parts.push('Node.js ✅');
  } else if (nodeAvailable) {
    parts.push('Node.js (disabled)');
  } else {
    parts.push('Node.js ❌');
  }

  if (appsScriptEnabled) {
    parts.push('Apps Script ✅');
  } else if (appsScriptAvailable) {
    parts.push('Apps Script (disabled)');
  } else {
    parts.push('Apps Script ❌');
  }

  let category: 'both' | 'node' | 'appsScript' | 'neither' = 'neither';
  if (nodeEnabled && appsScriptEnabled) {
    category = 'both';
  } else if (nodeEnabled) {
    category = 'node';
  } else if (appsScriptEnabled) {
    category = 'appsScript';
  }

  if (!nodeEnabled && nodeAvailable) {
    totals.nodeDisabled += 1;
  }
  if (!appsScriptEnabled && appsScriptAvailable) {
    totals.appsScriptDisabled += 1;
  }

  if (nodeEnabled) {
    totals.nodeSupported += 1;
  }
  if (appsScriptEnabled) {
    totals.appsScriptSupported += 1;
  }

  switch (category) {
    case 'both':
      totals.bothRuntimes += 1;
      break;
    case 'node':
    case 'appsScript':
      // handled via per-runtime counters
      break;
    case 'neither':
      totals.neitherRuntime += 1;
      break;
  }

  return { summary: parts.join(' | '), category };
};

const run = async (): Promise<void> => {
  process.env.NODE_ENV ??= 'development';

  await connectorRegistry.init();

  const capabilities = getRuntimeCapabilities();

  console.log('🔌 Connector Runtime Support Report');
  console.log('===================================');

  for (const app of capabilities) {
    const operations: RuntimeCapabilityOperationSummary[] = [
      ...Object.values(app.actionDetails),
      ...Object.values(app.triggerDetails),
    ].sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind.localeCompare(b.kind);
      }
      return a.id.localeCompare(b.id);
    });

    if (operations.length === 0) {
      continue;
    }

    console.log(`\n${app.app} (${operations.length} operations)`);

    for (const op of operations) {
      totals.operations += 1;
      const { summary } = describeRuntimeSupport(op);
      console.log(`  [${op.kind}] ${op.id}: ${summary}`);
    }
  }

  console.log('\nSummary');
  console.log('-------');
  console.log(`Total operations: ${totals.operations}`);
  console.log(`Node.js enabled: ${totals.nodeSupported}`);
  console.log(`Apps Script enabled: ${totals.appsScriptSupported}`);
  console.log(`Both runtimes enabled: ${totals.bothRuntimes}`);
  console.log(`Neither runtime enabled: ${totals.neitherRuntime}`);
  if (totals.nodeDisabled > 0 || totals.appsScriptDisabled > 0) {
    console.log('\nRuntimes available but disabled by flag:');
    if (totals.nodeDisabled > 0) {
      console.log(`  Node.js disabled operations: ${totals.nodeDisabled}`);
    }
    if (totals.appsScriptDisabled > 0) {
      console.log(`  Apps Script disabled operations: ${totals.appsScriptDisabled}`);
    }
  }
};

run().catch(error => {
  console.error('Failed to generate runtime support report.');
  console.error(error);
  process.exitCode = 1;
});
