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
  const files = readdirSync(CONNECTORS_DIR).filter(f => f.endsWith('.json'));
  return files.map(f => {
    try {
      const j = JSON.parse(readFileSync(join(CONNECTORS_DIR, f), 'utf8'));
      return { id: j.id || f.replace(/\.json$/, ''), name: j.name || f, triggers: j.triggers || [] };
    } catch {
      return { id: f.replace(/\.json$/, ''), name: f, triggers: [] };
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
