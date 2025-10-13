import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileToAppsScript } from '../compile-to-appsscript';
import type { WorkflowGraph } from '../../../common/workflow-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'fixtures', 'apps-script');
const snapshotsDir = path.join(fixturesDir, '__snapshots__');

const UPDATE_FLAG = process.env.UPDATE_APPSSCRIPT_SNAPSHOTS === '1';

interface FixtureConfig {
  name: string;
  description: string;
}

const FIXTURES: FixtureConfig[] = [
  {
    name: 'tier-0-critical',
    description: 'sev0 Gmail → Slack/Salesforce escalation with branching fallbacks'
  },
  {
    name: 'tier-1-growth',
    description: 'high-volume Sheets → Airtable/HubSpot sync'
  },
  {
    name: 'tier-1-storage',
    description: 'Dropbox and Box uploads with shared file references'
  },
  {
    name: 'tier-2-long-tail',
    description: 'scheduled Asana orchestration with Trello fallback'
  }
];

function ensureSnapshotsDir(): void {
  if (!existsSync(snapshotsDir)) {
    mkdirSync(snapshotsDir, { recursive: true });
  }
}

function loadWorkflowGraph(fixtureName: string): WorkflowGraph {
  const workflowPath = path.join(fixturesDir, `${fixtureName}.workflow.json`);
  const raw = readFileSync(workflowPath, 'utf-8');
  return JSON.parse(raw) as WorkflowGraph;
}

function readOrWriteSnapshot(snapshotPath: string, actual: string): string {
  if (UPDATE_FLAG) {
    ensureSnapshotsDir();
    writeFileSync(snapshotPath, actual);
    return actual;
  }

  if (!existsSync(snapshotPath)) {
    throw new Error(
      `Missing snapshot at ${snapshotPath}. Run UPDATE_APPSSCRIPT_SNAPSHOTS=1 vitest run ` +
      'server/workflow/__tests__/compile-to-appsscript.snapshots.test.ts to refresh.'
    );
  }

  return readFileSync(snapshotPath, 'utf-8');
}

describe('compile-to-appsscript snapshots', () => {
  for (const fixture of FIXTURES) {
    it(`matches generated Apps Script for ${fixture.name} (${fixture.description})`, () => {
      const graph = loadWorkflowGraph(fixture.name);
      const result = compileToAppsScript(graph);

      expect(result.workflowId).toBe(graph.id);
      expect(result.stats.nodes).toBe(graph.nodes.length);

      const codeFile = result.files.find(file => file.path === 'Code.gs');
      const manifestFile = result.files.find(file => file.path === 'appsscript.json');

      expect(codeFile, 'compiled output should include Code.gs').toBeDefined();
      expect(manifestFile, 'compiled output should include appsscript.json').toBeDefined();

      const codeSnapshotPath = path.join(snapshotsDir, `${fixture.name}.Code.gs.snap`);
      const manifestSnapshotPath = path.join(snapshotsDir, `${fixture.name}.appsscript.json.snap`);

      const expectedCode = readOrWriteSnapshot(codeSnapshotPath, codeFile!.content);
      const expectedManifest = readOrWriteSnapshot(manifestSnapshotPath, manifestFile!.content);

      expect(codeFile!.content).toBe(expectedCode);
      expect(manifestFile!.content).toBe(expectedManifest);
    });
  }
});
