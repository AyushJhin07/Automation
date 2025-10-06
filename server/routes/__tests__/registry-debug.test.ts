import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const originalDatabaseUrl = process.env.DATABASE_URL;
if (!originalDatabaseUrl) {
  process.env.DATABASE_URL = 'postgresql://automation:test@localhost:5432/automation';
}

const { connectorRegistry } = await import('../../ConnectorRegistry.js');

await connectorRegistry.init();

const app = express();
app.use(express.json());
app.get('/api/registry/debug', (_req, res) => {
  const stats = connectorRegistry.getStats();
  res.json({ success: true, ...stats });
});

const server: Server = await new Promise(resolve => {
  const listener = app.listen(0, () => resolve(listener));
});

try {
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const response = await fetch(`${baseUrl}/api/registry/debug`);
  assert.equal(response.status, 200, 'registry debug endpoint should respond with 200');

  const body = await response.json();
  assert.equal(body.success, true, 'registry debug endpoint should return success');
  assert.ok(Array.isArray(body.stableWithoutImplementation), 'stats should include stableWithoutImplementation array');
  assert.ok(Array.isArray(body.stableWithoutClient), 'stats should include stableWithoutClient array');
  assert.equal(body.stableWithoutImplementation.length, 0, 'all stable connectors must report an implementation');
  assert.equal(body.stableWithoutClient.length, 0, 'all stable connectors must have registered API clients');
  assert.equal(
    body.implementedStableCount,
    body.stableCount,
    'implementedStableCount should match the total number of stable connectors'
  );
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()));
  });

  if (originalDatabaseUrl) {
    process.env.DATABASE_URL = originalDatabaseUrl;
  } else {
    delete process.env.DATABASE_URL;
  }
}
process.exit(0);
