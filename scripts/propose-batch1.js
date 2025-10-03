#!/usr/bin/env node
// Propose Batch 1 connectors based on presence in connectors/, market-critical categories,
// and supported auth flows. Writes JSON and Markdown.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const CONNECTORS_DIR = join(ROOT, 'connectors');
const REPORT_DIR = join(ROOT, 'production', 'reports');

const DEFAULT_TARGETS = [
  'slack', 'mailchimp', 'hubspot', 'pipedrive', 'trello', 'asana-enhanced',
  'typeform', 'stripe', 'twilio', 'zendesk', 'dropbox', 'google-drive',
  'google-calendar', 'jira', 'salesforce', 'github', 'github-enhanced'
];

function loadConnectors() {
  const directories = readdirSync(CONNECTORS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
  const map = new Map();

  for (const dir of directories) {
    const definitionPath = join(CONNECTORS_DIR, dir, 'definition.json');

    if (!existsSync(definitionPath)) continue;

    try {
      const json = JSON.parse(readFileSync(definitionPath, 'utf8'));
      const id = json.id || dir;
      map.set(id, {
        id,
        name: json.name || id,
        category: json.category || 'Uncategorized',
        availability: json.availability || 'stable',
        authType: json.authentication?.type || 'none',
        actions: Array.isArray(json.actions) ? json.actions.length : 0,
        triggers: Array.isArray(json.triggers) ? json.triggers.length : 0,
      });
    } catch {}
  }

  return map;
}

function prioritize(c) {
  // Higher score = more priority
  let score = 0;
  const cat = (c.category || '').toLowerCase();
  if (['communication','crm','project management','file storage','payments','email','customer support','analytics','development','developer tools'].includes(cat)) score += 3;
  if (['oauth2','api_key'].includes(c.authType)) score += 2; else score -= 1;
  score += Math.min(10, c.actions) * 0.2;
  score += Math.min(4, c.triggers) * 0.5;
  return score;
}

function propose() {
  const connectors = loadConnectors();
  const found = [];

  // Seed with defaults that exist
  for (const id of DEFAULT_TARGETS) {
    if (connectors.has(id)) found.push(connectors.get(id));
  }

  // Add top candidates beyond defaults until ~20
  if (found.length < 20) {
    const remaining = [...connectors.values()]
      .filter(c => !found.find(f => f.id === c.id))
      .sort((a,b) => prioritize(b) - prioritize(a));
    for (const c of remaining) {
      if (found.length >= 20) break;
      found.push(c);
    }
  }

  // Deduplicate any enhanced/standard conflicts by preferring enhanced where both exist
  const byBase = new Map();
  for (const c of found) {
    const base = c.id.endsWith('-enhanced') ? c.id.replace(/-enhanced$/, '') : c.id;
    if (!byBase.has(base)) byBase.set(base, c);
    else {
      const existing = byBase.get(base);
      if (c.id.endsWith('-enhanced')) byBase.set(base, c);
    }
  }
  const result = [...byBase.values()].slice(0, 20);

  return result.sort((a,b) => prioritize(b) - prioritize(a));
}

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function toMarkdown(list) {
  const lines = [];
  lines.push('# Batch 1 Proposal');
  lines.push('');
  lines.push(`Count: ${list.length}`);
  lines.push('');
  lines.push('## Connectors');
  for (const c of list) {
    lines.push(`- ${c.id} (${c.name}) — ${c.category} | auth=${c.authType} | actions=${c.actions} | triggers=${c.triggers}`);
  }
  lines.push('');
  lines.push('## Assumptions & Next Steps');
  lines.push('- Verify webhook capability and signature requirements for each.');
  lines.push('- Confirm OAuth scopes and setup steps.');
  lines.push('- Lock Bronze/Silver/Gold target per connector.');
  return lines.join('\n');
}

function main() {
  const list = propose();
  ensureDir(REPORT_DIR);
  writeFileSync(join(REPORT_DIR, 'batch1-proposal.json'), JSON.stringify(list, null, 2));
  writeFileSync(join(REPORT_DIR, 'batch1-proposal.md'), toMarkdown(list));
  console.log('Wrote production/reports/batch1-proposal.json and .md');
}

main();

