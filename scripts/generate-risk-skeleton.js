#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

const ROOT = process.cwd();
const INPUT = join(ROOT, 'production', 'reports', 'batch1-proposal.json');
const OUT = join(ROOT, 'docs', 'phases', 'phase-0-risks.md');

function ensureDir(p){ if(!existsSync(p)) mkdirSync(p, { recursive: true }); }

function toMd(list){
  const lines = [];
  lines.push('# Phase 0 — Batch 1 Risk & Dependencies');
  lines.push('');
  lines.push('Legend: [ ] open, [x] done');
  lines.push('');
  for(const c of list){
    lines.push(`## ${c.id} (${c.name})`);
    lines.push('');
    lines.push('- [ ] Auth: OAuth scopes/app setup/API keys');
    lines.push('- [ ] Rate limits: quotas/backoff');
    lines.push('- [ ] Webhooks: signature verification, replay protection, secret rotation');
    lines.push('- [ ] SDKs/special flows: uploads, multipart, cursor pagination');
    lines.push('- [ ] Docs: setup steps, examples');
    lines.push('');
  }
  return lines.join('\n');
}

function main(){
  const raw = readFileSync(INPUT, 'utf8');
  const list = JSON.parse(raw);
  ensureDir(dirname(OUT));
  writeFileSync(OUT, toMd(list));
  console.log('Wrote', OUT);
}

main();

