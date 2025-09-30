#!/usr/bin/env node
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'production', 'reports');
const OUT_FILE = join(OUT_DIR, 'roadmap-tasks.json');

const tasks = [
  { id: 'generic-executor', title: 'GenericExecutor core features', status: 'done' },
  { id: 'im-fallback', title: 'IntegrationManager fallback with flag', status: 'done' },
  { id: 'conn-aware-exec', title: 'Connection-aware initialize/execute', status: 'done' },
  { id: 'webhook-guidance', title: 'Webhook registration guidance', status: 'done' },
  { id: 'default-polling', title: 'Default polling triggers (typeform/trello/hubspot/zendesk)', status: 'done' },
  { id: 'oauth-validate', title: 'Validate OAuth: Slack/HubSpot/Zendesk/Google', status: 'in_progress' },
  { id: 'bronze-audit', title: 'Bronze coverage audit and endpoints fill', status: 'todo' },
  { id: 'webhook-subscribe-more', title: 'Webhook subscribe helpers for GitHub/Zendesk', status: 'todo' },
  { id: 'std-list-adapter', title: 'Standardized list response adapter for UI', status: 'todo' },
  { id: 'ci-smoke', title: 'CI smoke tests for execute/test', status: 'todo' },
  { id: 'recipes', title: 'Add more recipes (GitHub→Slack, Zendesk→Slack)', status: 'todo' }
];

function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), tasks }, null, 2));
  console.log('Wrote', OUT_FILE);
}

main();

