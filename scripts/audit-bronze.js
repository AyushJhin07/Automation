#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const CONNECTORS_DIR = join(ROOT, 'connectors');
const REPORT_DIR = join(ROOT, 'production', 'reports');
const BATCH1 = new Set(['slack','hubspot','stripe','typeform','trello','zendesk','github']);

function load(id){
  try { return JSON.parse(readFileSync(join(CONNECTORS_DIR, `${id}.json`), 'utf8')); } catch { return null; }
}

function inspect(def){
  const missing = [];
  const checkList = (arr, kind) => {
    for (const fn of arr || []) {
      const has = typeof fn.endpoint === 'string' && typeof fn.method === 'string';
      if (!has && fn.id !== 'test_connection') missing.push({ type: kind, id: fn.id, name: fn.name });
    }
  };
  checkList(def.actions, 'action');
  checkList(def.triggers, 'trigger');
  return missing;
}

function main(){
  if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });
  const results = [];
  for (const id of BATCH1) {
    const def = load(id);
    if (!def) { results.push({ id, error: 'missing connector json' }); continue; }
    const missing = inspect(def);
    results.push({ id, missingCount: missing.length, missing });
  }
  const out = { generatedAt: new Date().toISOString(), results };
  writeFileSync(join(REPORT_DIR, 'bronze-audit.json'), JSON.stringify(out, null, 2));
  const lines = ['# Bronze Coverage Audit',''];
  for (const r of results) {
    lines.push(`## ${r.id}`);
    if (r.error) { lines.push(`- Error: ${r.error}`); continue; }
    lines.push(`- Missing endpoint/method: ${r.missingCount}`);
    for (const m of r.missing || []) lines.push(`  - ${m.type}.${m.id} (${m.name})`);
    lines.push('');
  }
  writeFileSync(join(REPORT_DIR, 'bronze-audit.md'), lines.join('\n'));
  console.log('Wrote bronze-audit.json and .md to production/reports');
}

main();

