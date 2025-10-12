#!/usr/bin/env tsx
import process from 'node:process';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import '../server/env.js';
import { env } from '../server/env';
import { runAppsScriptFixtures } from '../server/workflow/appsScriptDryRunHarness';
import { healthMonitoringService } from '../server/services/HealthMonitoringService';
import {
  recordAppsScriptDryRunExecution,
  recordAppsScriptDryRunFixtureResult,
} from '../server/observability/index.js';

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000;

let connectorInventory: string[] = [];

function parseCsv(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/[\n,]/)
    .map(token => token.trim())
    .filter(token => token.length > 0);
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

async function ensureConnectorInventory(): Promise<void> {
  if (connectorInventory.length > 0) {
    return;
  }

  try {
    const connectorDir = resolve(process.cwd(), 'connectors');
    const entries = await readdir(connectorDir, { withFileTypes: true });
    connectorInventory = entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort((a, b) => b.length - a.length);
  } catch (error) {
    console.warn('⚠️ Unable to enumerate connector inventory. Connector IDs in metrics may fall back to heuristics.', error);
    connectorInventory = [];
  }
}

function inferConnectorId(fixtureId: string): string {
  if (!fixtureId) {
    return 'unknown';
  }

  const normalized = fixtureId.replace(/\.json$/i, '');
  const base = normalized.split(':')[0] ?? normalized;

  for (const connectorId of connectorInventory) {
    if (base === connectorId || base.startsWith(`${connectorId}-`)) {
      return connectorId;
    }
  }

  const dashIndex = base.indexOf('-');
  if (dashIndex > 0) {
    return base.slice(0, dashIndex);
  }

  return base || 'unknown';
}

async function runSmokeCycle(options: {
  fixturesDir?: string;
  filterIds?: string[];
  environment: string;
}): Promise<void> {
  const { fixturesDir, filterIds, environment } = options;
  const startedAt = Date.now();
  console.log(`🚀 Running Apps Script dry-run smoke (${environment})...`);

  try {
    const summary = await runAppsScriptFixtures({ fixturesDir, filterIds });
    const durationMs = Date.now() - startedAt;
    const failedResults = summary.results.filter(result => !result.success);
    const status: 'success' | 'failure' = failedResults.length > 0 ? 'failure' : 'success';

    recordAppsScriptDryRunExecution({
      environment,
      status,
      totalFixtures: summary.results.length,
      failedFixtures: failedResults.length,
      durationMs,
    });

    for (const result of summary.results) {
      recordAppsScriptDryRunFixtureResult({
        environment,
        fixtureId: result.id,
        connectorId: inferConnectorId(result.id),
        success: result.success,
        durationMs: result.durationMs,
      });
    }

    if (summary.results.length === 0) {
      console.warn('ℹ️  No fixtures matched the configured filters.');
    }

    console.log(
      `📊 Apps Script dry-run summary: ${summary.passed}/${summary.results.length} passed in ${formatDuration(durationMs)}.`
    );

    if (failedResults.length > 0) {
      const failingIds = failedResults.map(result => result.id);
      const message = `Apps Script ${environment} dry-run failed for ${failingIds.length} fixture(s).`;
      const trackerUrl = process.env.APPS_SCRIPT_ROLLOUT_TRACKER_URL;
      healthMonitoringService.createAlert(
        'error',
        `Apps Script ${environment} dry-run failures`,
        `${message} ${trackerUrl ? `Tracker: ${trackerUrl}` : ''}`.trim(),
        {
          environment,
          durationMs,
          totalFixtures: summary.results.length,
          failedFixtures: failingIds,
          trackerUrl,
          pageQaSupport: true,
        }
      );
    }
  } catch (error: any) {
    const durationMs = Date.now() - startedAt;
    const message = error?.message ?? 'Apps Script dry-run harness failed';
    console.error('❌ Apps Script dry-run smoke cycle crashed:', message);
    if (error?.stack) {
      console.error(error.stack);
    }

    recordAppsScriptDryRunExecution({
      environment,
      status: 'failure',
      totalFixtures: 0,
      failedFixtures: 0,
      durationMs,
    });

    const trackerUrl = process.env.APPS_SCRIPT_ROLLOUT_TRACKER_URL;
    healthMonitoringService.createAlert(
      'error',
      `Apps Script ${environment} dry-run exception`,
      trackerUrl ? `${message} Tracker: ${trackerUrl}` : message,
      {
        environment,
        durationMs,
        error: message,
        stack: error?.stack,
        trackerUrl,
        pageQaSupport: true,
      }
    );
  }
}

async function main(): Promise<void> {
  await ensureConnectorInventory();

  const environmentName = process.env.APPS_SCRIPT_DRY_RUN_ENVIRONMENT?.trim() || 'staging';
  const fixturesDir = process.env.APPS_SCRIPT_DRY_RUN_FIXTURES_DIR?.trim() || undefined;
  const filterIds = parseCsv(process.env.APPS_SCRIPT_DRY_RUN_FILTERS || process.env.APPS_SCRIPT_DRY_RUN_FIXTURE_IDS);
  const distinctFilters = filterIds.length > 0 ? Array.from(new Set(filterIds)) : undefined;
  const runOnce = process.argv.includes('--once') || process.env.APPS_SCRIPT_DRY_RUN_RUN_ONCE === 'true';

  const configuredInterval = Number.parseInt(
    process.env.APPS_SCRIPT_DRY_RUN_INTERVAL_MS ?? `${DEFAULT_INTERVAL_MS}`,
    10
  );
  const intervalMs = Number.isFinite(configuredInterval)
    ? Math.max(MIN_INTERVAL_MS, configuredInterval)
    : DEFAULT_INTERVAL_MS;

  console.log('🕒 Apps Script smoke cron configuration', {
    environment: environmentName,
    fixturesDir: fixturesDir ?? 'default',
    filters: distinctFilters ?? [],
    intervalMs,
    runOnce,
    observabilityEnabled: env.OBSERVABILITY_ENABLED,
  });

  if (runOnce) {
    await runSmokeCycle({ fixturesDir, filterIds: distinctFilters, environment: environmentName });
    return;
  }

  let shuttingDown = false;
  let timer: NodeJS.Timeout | null = null;
  let pending: Promise<void> | null = null;
  let resolveShutdown: (() => void) | null = null;

  const waitForShutdown = new Promise<void>((resolve) => {
    resolveShutdown = resolve;
  });

  const scheduleNext = () => {
    if (shuttingDown) {
      return;
    }

    timer = setTimeout(async () => {
      try {
        if (pending) {
          await pending;
        }
      } catch (error) {
        console.error('❌ Previous Apps Script smoke cycle rejected:', error);
      }

      pending = runSmokeCycle({ fixturesDir, filterIds: distinctFilters, environment: environmentName })
        .catch((error) => {
          console.error('❌ Apps Script smoke cycle error:', error);
        })
        .then(() => {
          pending = null;
        });

      try {
        await pending;
      } finally {
        scheduleNext();
      }
    }, intervalMs);
  };

  pending = runSmokeCycle({ fixturesDir, filterIds: distinctFilters, environment: environmentName })
    .catch((error) => {
      console.error('❌ Apps Script smoke cycle error:', error);
    })
    .then(() => {
      pending = null;
      scheduleNext();
    });

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`⚙️ Received ${signal}. Shutting down Apps Script smoke cron...`);

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    if (pending) {
      try {
        await pending;
      } catch (error) {
        console.error('❌ Apps Script smoke cycle failed during shutdown:', error);
      } finally {
        pending = null;
      }
    }

    resolveShutdown?.();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  await waitForShutdown;
}

main().catch((error) => {
  console.error('❌ Apps Script smoke cron failed to start:', error);
  process.exitCode = 1;
});
