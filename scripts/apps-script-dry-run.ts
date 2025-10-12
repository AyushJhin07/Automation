#!/usr/bin/env tsx
import process from 'node:process';

import { runAppsScriptFixtures, type RunFixturesOptions } from '../server/workflow/appsScriptDryRunHarness';

interface CliOptions {
  filters: string[];
  fixturesDir?: string;
  json: boolean;
  stopOnError: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    filters: [],
    json: false,
    stopOnError: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--json') {
      options.json = true;
      continue;
    }

    if (token === '--stop-on-error') {
      options.stopOnError = true;
      continue;
    }

    if (token.startsWith('--filter=')) {
      const value = token.split('=')[1];
      if (value) {
        options.filters.push(...value.split(',').map(v => v.trim()).filter(Boolean));
      }
      continue;
    }

    if (token === '--filter' || token === '--fixture') {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        options.filters.push(...next.split(',').map(v => v.trim()).filter(Boolean));
        i += 1;
      }
      continue;
    }

    if (token.startsWith('--fixtures-dir=')) {
      const value = token.split('=')[1];
      if (value) {
        options.fixturesDir = value;
      }
      continue;
    }

    if (token === '--fixtures-dir') {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        options.fixturesDir = next;
        i += 1;
      }
      continue;
    }

    console.warn(`⚠️  Unknown argument: ${token}`);
  }

  return options;
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const harnessOptions: RunFixturesOptions = {
    fixturesDir: options.fixturesDir,
    filterIds: options.filters,
    stopOnError: options.stopOnError,
  };

  const summary = await runAppsScriptFixtures(harnessOptions);

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    if (summary.results.length === 0) {
      console.log('ℹ️  No Apps Script fixtures matched the provided filters.');
    }

    for (const result of summary.results) {
      const prefix = result.success ? '✅' : '❌';
      const duration = formatDuration(result.durationMs);
      if (result.success) {
        console.log(`${prefix} ${result.id} (${duration})`);
      } else {
        console.error(`${prefix} ${result.id}: ${result.error ?? 'Unknown failure'}`);
        if (result.failedExpectations?.length) {
          for (const failure of result.failedExpectations) {
            console.error(`   • ${failure}`);
          }
        }
      }
    }

    console.log(`\nSummary: ${summary.passed}/${summary.results.length} fixtures passed in ${formatDuration(summary.durationMs)}.`);
  }

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error('❌ Apps Script dry run crashed:', error?.message ?? error);
  if (error?.stack) {
    console.error(error.stack);
  }
  process.exitCode = 1;
});
