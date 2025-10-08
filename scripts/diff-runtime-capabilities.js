#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadJson(path) {
  try {
    const fullPath = resolve(process.cwd(), path);
    const content = readFileSync(fullPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Failed to load JSON from ${path}: ${error.message}`);
    process.exit(1);
  }
}

function extractCatalogOperations(catalogJson) {
  const nodes = [];
  const categories = catalogJson?.catalog?.categories ?? {};

  for (const category of Object.values(categories)) {
    const items = Array.isArray(category?.nodes) ? category.nodes : [];
    for (const node of items) {
      const type = typeof node?.type === 'string' ? node.type : '';
      if (!type) continue;

      const match = type.match(/^(action|trigger)\.([^.]+)\.(.+)$/);
      if (!match) continue;

      const [, categoryType, app, op] = match;
      nodes.push({
        type: categoryType,
        app,
        operation: op.replace(/\./g, '_'),
      });
    }
  }

  return nodes;
}

function buildCapabilityMap(capabilitiesJson) {
  const map = new Map();
  const entries = Array.isArray(capabilitiesJson?.capabilities) ? capabilitiesJson.capabilities : [];

  for (const entry of entries) {
    const app = typeof entry?.app === 'string' ? entry.app : '';
    if (!app) continue;

    const actions = new Set(Array.isArray(entry?.actions) ? entry.actions : []);
    const triggers = new Set(Array.isArray(entry?.triggers) ? entry.triggers : []);
    map.set(app, { actions, triggers });
  }

  return map;
}

function main() {
  const catalogPath = process.argv[2] ?? 'catalog_test.json';
  const capabilitiesPath = process.argv[3] ?? 'capabilities.json';

  const catalog = loadJson(catalogPath);
  const capabilities = loadJson(capabilitiesPath);

  const operations = extractCatalogOperations(catalog);
  const capabilityMap = buildCapabilityMap(capabilities);

  let missing = 0;

  for (const op of operations) {
    const appCapabilities = capabilityMap.get(op.app);
    const set = op.type === 'trigger' ? appCapabilities?.triggers : appCapabilities?.actions;
    const supported = Boolean(set && set.has(op.operation));

    if (!supported) {
      console.log(`MISSING ${op.app}.${op.operation} (${op.type})`);
      missing += 1;
    }
  }

  if (missing > 0) {
    console.error(`\n${missing} operation(s) missing runtime support.`);
    process.exit(2);
  }

  console.log('All catalog operations are implemented in the runtime.');
}

main();
