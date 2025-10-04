import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  ConnectorSimulator,
  type ConnectorContractDefinitionInput,
  type ConnectorContractTestResult,
} from '../server/testing/ConnectorSimulator';

const CONNECTORS_DIR = path.resolve(process.cwd(), 'connectors');

interface ContractTestSummary {
  passed: number;
  failed: number;
}

const indent = (value: string, spaces = 2) => value.split('\n').map((line) => `${' '.repeat(spaces)}${line}`).join('\n');

async function loadConnectorDefinitions(): Promise<ConnectorContractDefinitionInput[]> {
  const entries = await safeReadDir(CONNECTORS_DIR);
  const definitions: ConnectorContractDefinitionInput[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const definitionPath = path.join(CONNECTORS_DIR, entry.name, 'definition.json');
    const raw = await safeReadFile(definitionPath);
    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw);
      const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
      const triggers = Array.isArray(parsed.triggers) ? parsed.triggers : [];

      definitions.push({
        appId: (parsed.id || entry.name).toString().toLowerCase(),
        actions: actions.map((action: any) => ({ id: action.id })),
        triggers: triggers.map((trigger: any) => ({ id: trigger.id })),
      });
    } catch (error) {
      console.warn(`[connector-contracts] Skipping ${definitionPath}: ${(error as Error).message}`);
    }
  }

  return definitions.sort((a, b) => a.appId.localeCompare(b.appId));
}

async function safeReadDir(dir: string) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      console.warn(`[connector-contracts] Connectors directory not found at ${dir}`);
      return [];
    }
    throw error;
  }
}

async function safeReadFile(filePath: string) {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      console.warn(`[connector-contracts] Missing definition at ${filePath}`);
      return null;
    }
    throw error;
  }
}

function printResult(result: ConnectorContractTestResult): void {
  const statusIcon = result.passed ? '✅' : '❌';
  console.log(`${statusIcon} ${result.appId} (${result.scenarios.length} scenarios)`);

  if (!result.passed) {
    for (const scenario of result.scenarios) {
      if (scenario.passed) {
        continue;
      }
      const heading = `• ${scenario.type.toUpperCase()} ${scenario.id}`;
      console.log(indent(heading));
      if (!scenario.hasFixture) {
        console.log(indent('Missing fixture', 4));
      }
      scenario.errors.forEach((error) => console.log(indent(`Error: ${error}`, 4)));
      scenario.warnings.forEach((warning) => console.log(indent(`Warning: ${warning}`, 4)));
    }
  } else {
    const warnings = result.scenarios.filter((scenario) => scenario.warnings.length > 0);
    warnings.forEach((scenario) => {
      console.log(indent(`⚠️ ${scenario.type} ${scenario.id}`));
      scenario.warnings.forEach((warning) => console.log(indent(warning, 4)));
    });
  }
}

function summarize(results: ConnectorContractTestResult[]): ContractTestSummary {
  return results.reduce<ContractTestSummary>((acc, result) => {
    if (result.passed) {
      acc.passed += 1;
    } else {
      acc.failed += 1;
    }
    return acc;
  }, { passed: 0, failed: 0 });
}

async function main(): Promise<void> {
  const definitions = await loadConnectorDefinitions();
  if (definitions.length === 0) {
    console.log('[connector-contracts] No connector definitions found. Skipping contract tests.');
    return;
  }

  const simulator = new ConnectorSimulator({ enabled: true, strict: true });
  const results = await simulator.runContractSuite(definitions, { requireFixtures: true });

  const summary = summarize(results);
  console.log(`\nContract test summary: ${summary.passed} passed, ${summary.failed} failed.`);

  results.forEach(printResult);

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[connector-contracts] Unexpected failure:', error);
  process.exitCode = 1;
});
