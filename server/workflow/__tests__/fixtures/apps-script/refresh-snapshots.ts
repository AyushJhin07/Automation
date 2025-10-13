import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

type WorkflowGraph = {
  id: string;
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = __dirname;
const snapshotsDir = path.join(fixturesDir, '__snapshots__');

const FIXTURES = ['tier-0-critical', 'tier-1-growth', 'tier-1-storage', 'tier-2-long-tail'] as const;

type FixtureName = (typeof FIXTURES)[number];

async function loadCompileModule(): Promise<{ compileToAppsScript: (graph: WorkflowGraph) => any }> {
  const originalPath = path.join(__dirname, '../../../compile-to-appsscript.ts');
  const source = readFileSync(originalPath, 'utf-8');

  const withFsImport = source.replace(
    "import { CompileResult, WorkflowGraph, WorkflowNode } from '../../common/workflow-types';\n",
    "import { readFileSync as __readFileSync } from 'node:fs';\n"
  );

  const patched = withFsImport.replace(
    "import webhookCapabilityReport from '../../production/reports/webhook-capability.json' assert { type: 'json' };\n",
    ''
  ).replace(
    "import { GENERATED_REAL_OPS } from './realOps.generated.js';\n",
    "import { GENERATED_REAL_OPS } from './realOps.generated.ts';\nconst webhookCapabilityReport = JSON.parse(__readFileSync(new URL('../../production/reports/webhook-capability.json', import.meta.url), 'utf-8')) as any;\n"
  ).replace(
    "import { getAppsScriptConnectorFlag } from '../runtime/appsScriptConnectorFlags.js';\n",
    "import { getAppsScriptConnectorFlag } from '../runtime/appsScriptConnectorFlags.ts';\n"
  );

  const tempDir = path.dirname(originalPath);
  const tempFile = path.join(tempDir, 'compile-to-appsscript.runtime.ts');
  writeFileSync(tempFile, patched);

  try {
    const module = await import(pathToFileURL(tempFile).href);
    return module as { compileToAppsScript: (graph: WorkflowGraph) => any };
  } finally {
    try {
      unlinkSync(tempFile);
    } catch (error) {
      // ignore cleanup errors
    }
  }
}

let compileToAppsScript: ((graph: WorkflowGraph) => any) | undefined;

function ensureSnapshotsDir(): void {
  if (!existsSync(snapshotsDir)) {
    mkdirSync(snapshotsDir, { recursive: true });
  }
}

function loadWorkflowGraph(name: FixtureName): WorkflowGraph {
  const workflowPath = path.join(fixturesDir, `${name}.workflow.json`);
  const raw = readFileSync(workflowPath, 'utf-8');
  return JSON.parse(raw) as WorkflowGraph;
}

function writeSnapshot(name: FixtureName, file: string, content: string): void {
  const snapshotPath = path.join(snapshotsDir, `${name}.${file}.snap`);
  writeFileSync(snapshotPath, content);
}

async function refreshFixture(name: FixtureName): Promise<void> {
  if (!compileToAppsScript) {
    ({ compileToAppsScript } = await loadCompileModule());
  }

  const graph = loadWorkflowGraph(name);
  const result = compileToAppsScript!(graph);
  const codeFile = result.files.find(entry => entry.path === 'Code.gs');
  const manifestFile = result.files.find(entry => entry.path === 'appsscript.json');

  if (!codeFile || !manifestFile) {
    throw new Error(`Fixture ${name} did not compile to expected files`);
  }

  writeSnapshot(name, 'Code.gs', codeFile.content);
  writeSnapshot(name, 'appsscript.json', manifestFile.content);
}

export async function refreshSnapshots(): Promise<void> {
  ensureSnapshotsDir();
  for (const fixture of FIXTURES) {
    await refreshFixture(fixture);
  }
}

if (import.meta.main) {
  refreshSnapshots()
    .then(() => {
      console.log(`Updated Apps Script snapshots for ${FIXTURES.length} fixtures in ${snapshotsDir}`);
    })
    .catch(error => {
      console.error('Failed to refresh Apps Script snapshots:', error);
      process.exitCode = 1;
    });
}
