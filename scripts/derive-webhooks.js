#!/usr/bin/env node
// Derive webhook-capability for connectors based on known vendors and trigger presence

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const CONNECTORS_DIR = join(ROOT, 'connectors');
const REPORT_DIR = join(ROOT, 'production', 'reports');

const WEBHOOK_CAPABLE = new Set([
  'slack','stripe','github','gitlab','shopify','zendesk','typeform','mailchimp','intercom','dropbox','pipedrive','hubspot','salesforce','jira','jira-service-management','trello','asana','twilio','zoom','webex','google-drive','google-calendar'
]);

function ensureDir(p) { if (!existsSync(p)) mkdirSync(p, { recursive: true }); }

function loadConnectors() {
  const directories = readdirSync(CONNECTORS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();

  return directories.map(dir => {
    const definitionPath = join(CONNECTORS_DIR, dir, 'definition.json');

    if (!existsSync(definitionPath)) {
      return { id: dir, name: dir, triggers: [] };
    }

    try {
      const j = JSON.parse(readFileSync(definitionPath, 'utf8'));
      return { id: j.id || dir, name: j.name || dir, triggers: j.triggers || [] };
    } catch {
      return { id: dir, name: dir, triggers: [] };
    }
  });
}

function toMarkdown(rows) {
  const lines = ['# Webhook Capability (Derived)','',`Total: ${rows.length}`,'','## Connectors`webhook-capable=true`'];
  for (const r of rows.filter(r=>r.webhookCapable)) {
    lines.push(`- ${r.id} (${r.name})`);
  }
  lines.push('', '## Connectors `webhook-capable=false`');
  for (const r of rows.filter(r=>!r.webhookCapable)) {
    lines.push(`- ${r.id} (${r.name})`);
  }
  return lines.join('\n');
}

function main() {
  const list = loadConnectors();
  const rows = list.map(c => ({
    id: c.id,
    name: c.name,
    webhookCapable: WEBHOOK_CAPABLE.has(c.id) || (c.triggers || []).some(t => t && t.webhookSupport)
  }));
  ensureDir(REPORT_DIR);
  writeFileSync(join(REPORT_DIR, 'webhook-capability.json'), JSON.stringify(rows, null, 2));
  writeFileSync(join(REPORT_DIR, 'webhook-capability.md'), toMarkdown(rows));
  console.log('Wrote production/reports/webhook-capability.json and .md');
}

main();
