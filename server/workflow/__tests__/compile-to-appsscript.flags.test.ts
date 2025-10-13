import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { WorkflowGraph } from '../../../common/workflow-types';
import { compileToAppsScript } from '../compile-to-appsscript';
import { resetAppsScriptConnectorFlagCache } from '../../runtime/appsScriptConnectorFlags.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'fixtures', 'apps-script');
const tier0FixturePath = path.join(fixturesDir, 'tier-0-critical.workflow.json');

function loadTier0Graph(): WorkflowGraph {
  const raw = readFileSync(tier0FixturePath, 'utf-8');
  return JSON.parse(raw) as WorkflowGraph;
}

describe('compile-to-appsscript connector gating', () => {
  afterEach(() => {
    delete process.env.APPS_SCRIPT_ENABLED_SLACK;
    delete process.env.APPS_SCRIPT_ENABLED_GMAIL;
    delete process.env.APPS_SCRIPT_ENABLED_SALESFORCE;
    resetAppsScriptConnectorFlagCache();
  });

  it('throws when any connector is disabled for Apps Script', () => {
    process.env.APPS_SCRIPT_ENABLED_SLACK = 'false';
    resetAppsScriptConnectorFlagCache();

    const graph = loadTier0Graph();

    expect(() => compileToAppsScript(graph)).toThrowError(/APPS_SCRIPT_ENABLED_SLACK/i);
  });
});
