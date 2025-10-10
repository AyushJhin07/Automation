import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const originalNodeEnv = process.env.NODE_ENV;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalEncryptionKey = process.env.ENCRYPTION_MASTER_KEY;
const originalJwtSecret = process.env.JWT_SECRET;

process.env.NODE_ENV = 'production';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://user:password@localhost:5432/testdb';
process.env.ENCRYPTION_MASTER_KEY =
  process.env.ENCRYPTION_MASTER_KEY ?? '0123456789abcdef0123456789abcdef';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';

const { registerRoutes } = await import('../../routes.ts');
const registryModule = await import('../../ConnectorRegistry.ts');
const connectorRegistry = registryModule.connectorRegistry;
await connectorRegistry.init();

const app = express();
app.use(express.json());
await registerRoutes(app);

const server: Server = await new Promise((resolve, reject) => {
  const listener = app.listen(0, (err?: Error) => (err ? reject(err) : resolve(listener)));
});
server.unref?.();

let exitCode = 0;

try {
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const response = await fetch(`${baseUrl}/api/registry/catalog`);
  assert.equal(response.status, 200, 'registry catalog endpoint should respond with 200');

  const body = await response.json();
  assert.equal(body.success, true, 'registry catalog endpoint should return success');
  const connectorsRecord = body?.catalog?.connectors ?? {};
  const connectorEntries: any[] = Object.values(connectorsRecord);
  assert.ok(connectorEntries.length > 0, 'registry catalog should include connectors');

  const withActions = connectorEntries.find(connector => Array.isArray(connector.actions) && connector.actions.length > 0);
  assert.ok(withActions, 'registry catalog should expose actions with runtime support');
  const actionSupport = withActions.actions[0]?.runtimeSupport;
  assert.equal(typeof actionSupport?.appsScript, 'boolean', 'catalog actions should include appsScript runtime flag');
  assert.equal(typeof actionSupport?.nodeJs, 'boolean', 'catalog actions should include nodeJs runtime flag');

  const withTriggers = connectorEntries.find(connector => Array.isArray(connector.triggers) && connector.triggers.length > 0);
  if (withTriggers) {
    const triggerSupport = withTriggers.triggers[0]?.runtimeSupport;
    assert.equal(typeof triggerSupport?.appsScript, 'boolean', 'catalog triggers should include appsScript runtime flag');
    assert.equal(typeof triggerSupport?.nodeJs, 'boolean', 'catalog triggers should include nodeJs runtime flag');
  }

  const nodeSupported = connectorEntries.some(connector => {
    const actionHasNode = Array.isArray(connector.actions)
      ? connector.actions.some((action: any) => action?.runtimeSupport?.nodeJs === true)
      : false;
    const triggerHasNode = Array.isArray(connector.triggers)
      ? connector.triggers.some((trigger: any) => trigger?.runtimeSupport?.nodeJs === true)
      : false;
    return actionHasNode || triggerHasNode;
  });
  assert.ok(nodeSupported, 'registry catalog should report at least one node-capable operation');

  console.log('Registry catalog endpoint exposes runtime support metadata for connector operations.');
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()));
  });

  if (originalNodeEnv) {
    process.env.NODE_ENV = originalNodeEnv;
  } else {
    delete process.env.NODE_ENV;
  }
  if (originalDatabaseUrl) {
    process.env.DATABASE_URL = originalDatabaseUrl;
  } else {
    delete process.env.DATABASE_URL;
  }
  if (originalEncryptionKey) {
    process.env.ENCRYPTION_MASTER_KEY = originalEncryptionKey;
  } else {
    delete process.env.ENCRYPTION_MASTER_KEY;
  }
  if (originalJwtSecret) {
    process.env.JWT_SECRET = originalJwtSecret;
  } else {
    delete process.env.JWT_SECRET;
  }
}

process.exit(exitCode);
