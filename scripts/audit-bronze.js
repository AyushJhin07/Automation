#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const CONNECTORS_DIR = join(ROOT, 'connectors');
const REPORT_DIR = join(ROOT, 'production', 'reports');
const FALLBACK_BATCH1 = new Set(['slack','hubspot','stripe','typeform','trello','zendesk','github']);

function loadBatchTargets() {
  const proposalPath = join(ROOT, 'production', 'reports', 'batch1-proposal.md');
  if (!existsSync(proposalPath)) {
    return Array.from(FALLBACK_BATCH1);
  }

  try {
    const lines = readFileSync(proposalPath, 'utf8').split(/\r?\n/);
    const ids = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('- ')) continue;
      const body = trimmed.slice(2);
      if (!body.includes('(')) continue;
      const candidate = body.split('(')[0].trim();
      if (candidate) ids.push(candidate);
    }
    const unique = Array.from(new Set(ids));
    return unique.length ? unique : Array.from(FALLBACK_BATCH1);
  } catch (error) {
    console.warn('Failed to read batch1-proposal.md:', error);
    return Array.from(FALLBACK_BATCH1);
  }
}

function load(id){
  const candidates = [id];
  if (id.endsWith('-enhanced')) {
    candidates.push(id.replace(/-enhanced$/, ''));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(readFileSync(join(CONNECTORS_DIR, `${candidate}.json`), 'utf8'));
    } catch {}
  }
  return null;
}

function inspect(def){
  const missing = [];
  const checkList = (arr, kind) => {
    for (const fn of arr || []) {
      if (kind === 'trigger' && (fn.type === 'webhook' || fn.webhook === true)) continue;
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
  const targets = loadBatchTargets();
  for (const id of targets) {
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

