#!/usr/bin/env node
// Inventory connectors: counts, availability, pairs, and implementation status
// Outputs JSON and Markdown reports under production/reports/

import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const CONNECTORS_DIR = join(ROOT, 'connectors');
const REPORT_DIR = join(ROOT, 'production', 'reports');
const TS_SUPPORTED_APPS = join(ROOT, 'server', 'integrations', 'supportedApps.ts');

function loadImplementedSet() {
  try {
    const src = readFileSync(TS_SUPPORTED_APPS, 'utf8');
    const ids = [];
    const m = src.match(/IMPLEMENTED_CONNECTOR_IDS\s*=\s*\[([^\]]+)\]/m);
    if (m) {
      const inner = m[1];
      const re = /'([^']+)'/g;
      let mm;
      while ((mm = re.exec(inner))) ids.push(mm[1]);
    }
    return new Set(ids);
  } catch (e) {
    return new Set();
  }
}

function loadConnectors() {
  const directories = readdirSync(CONNECTORS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();

  const list = [];

  for (const dir of directories) {
    const definitionPath = join(CONNECTORS_DIR, dir, 'definition.json');

    if (!existsSync(definitionPath)) {
      list.push({
        file: join(dir, 'definition.json'),
        id: dir,
        name: dir,
        category: 'Unknown',
        availability: 'unknown',
        authType: 'unknown',
        actions: 0,
        triggers: 0,
        error: 'Missing definition.json'
      });
      continue;
    }

    try {
      const json = JSON.parse(readFileSync(definitionPath, 'utf8'));
      const id = json.id || dir;
      const actions = Array.isArray(json.actions) ? json.actions.length : 0;
      const triggers = Array.isArray(json.triggers) ? json.triggers.length : 0;
      list.push({
        file: join(dir, 'definition.json'),
        id,
        name: json.name || id,
        category: json.category || 'Uncategorized',
        availability: json.availability || 'stable',
        authType: json.authentication?.type || 'none',
        actions,
        triggers
      });
    } catch (e) {
      list.push({
        file: join(dir, 'definition.json'),
        id: dir,
        name: dir,
        category: 'Unknown',
        availability: 'unknown',
        authType: 'unknown',
        actions: 0,
        triggers: 0,
        error: String(e.message || e)
      });
    }
  }

  return list;
}

function analyze(list, implementedSet) {
  const byCategory = new Map();
  const pairs = new Map(); // baseId => { standard, enhanced }
  const enhancedSuffix = '-enhanced';

  for (const c of list) {
    const base = c.id.endsWith(enhancedSuffix) ? c.id.slice(0, -enhancedSuffix.length) : c.id;
    const isEnhanced = c.id.endsWith(enhancedSuffix);
    if (!pairs.has(base)) pairs.set(base, { standard: null, enhanced: null });
    const entry = pairs.get(base);
    if (isEnhanced) entry.enhanced = c; else entry.standard = c;

    const catKey = c.category || 'Uncategorized';
    byCategory.set(catKey, (byCategory.get(catKey) || 0) + 1);

    c.implemented = implementedSet.has(c.id);
  }

  const summary = {
    total: list.length,
    categories: Object.fromEntries([...byCategory.entries()].sort((a,b)=>b[1]-a[1])),
    availabilityCounts: list.reduce((acc, c) => { acc[c.availability] = (acc[c.availability]||0)+1; return acc; }, {}),
    authTypes: list.reduce((acc, c) => { acc[c.authType] = (acc[c.authType]||0)+1; return acc; }, {}),
    implementedCount: list.filter(c => c.implemented).length
  };

  const pairList = [];
  for (const [base, { standard, enhanced }] of pairs.entries()) {
    if (enhanced || standard) {
      pairList.push({ base, hasStandard: !!standard, hasEnhanced: !!enhanced });
    }
  }

  return { summary, pairs: pairList, connectors: list.sort((a,b)=> a.id.localeCompare(b.id)) };
}

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function toMarkdown(report) {
  const lines = [];
  lines.push(`# Connector Inventory Report`);
  lines.push(``);
  lines.push(`Total connectors: ${report.summary.total}`);
  lines.push(`Implemented now (server): ${report.summary.implementedCount}`);
  lines.push(``);
  lines.push(`## Availability`);
  for (const [k,v] of Object.entries(report.summary.availabilityCounts)) lines.push(`- ${k}: ${v}`);
  lines.push(``);
  lines.push(`## Auth Types`);
  for (const [k,v] of Object.entries(report.summary.authTypes)) lines.push(`- ${k}: ${v}`);
  lines.push(``);
  lines.push(`## Categories (count)`);
  for (const [k,v] of Object.entries(report.summary.categories)) lines.push(`- ${k}: ${v}`);
  lines.push(``);
  lines.push(`## Enhanced/Standard Pairs`);
  for (const p of report.pairs.sort((a,b)=> a.base.localeCompare(b.base))) {
    if (p.hasEnhanced || p.hasStandard) lines.push(`- ${p.base}: standard=${p.hasStandard ? 'yes':'no'}, enhanced=${p.hasEnhanced ? 'yes':'no'}`);
  }
  lines.push(``);
  lines.push(`## Implemented Connectors (server)`);
  for (const c of report.connectors.filter(c=>c.implemented)) lines.push(`- ${c.id} (${c.name})`);
  lines.push(``);
  lines.push(`## All Connectors`);
  for (const c of report.connectors) lines.push(`- ${c.id} | ${c.availability} | ${c.authType} | actions=${c.actions} | triggers=${c.triggers}`);
  return lines.join('\n');
}

function main() {
  const implementedSet = loadImplementedSet();
  const list = loadConnectors();
  const report = analyze(list, implementedSet);
  ensureDir(REPORT_DIR);
  writeFileSync(join(REPORT_DIR, 'connector-inventory.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(REPORT_DIR, 'connector-inventory.md'), toMarkdown(report));
  console.log(`Wrote ${join('production','reports','connector-inventory.json')} and .md`);
}

main();

