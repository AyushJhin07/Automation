import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const { ConnectorRegistry } = await import('../../ConnectorRegistry.ts');
const registryRouterModule = await import('../registry.ts');
const registryRouter = registryRouterModule.default;

const registry = ConnectorRegistry.getInstance();
await registry.init();

const app = express();
app.use(express.json());
app.use(registryRouter);

const server: Server = await new Promise((resolve, reject) => {
  const listener = app.listen(0, (err?: Error) => (err ? reject(err) : resolve(listener)));
});

try {
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const response = await fetch(`${baseUrl}/api/registry/connectors`);
  assert.equal(response.status, 200, 'registry connectors endpoint should respond with 200');

  const body = await response.json();
  assert.equal(body.success, true, 'registry connectors endpoint should return success');
  const connectors: any[] = Array.isArray(body.connectors) ? body.connectors : [];
  assert.ok(connectors.length > 0, 'registry connectors should include at least one connector');

  const withActions = connectors.find(connector => Array.isArray(connector.actions) && connector.actions.length > 0);
  assert.ok(withActions, 'registry connectors should expose actions with runtime support metadata');
  const actionSupport = withActions.actions[0]?.runtimeSupport;
  assert.equal(typeof actionSupport?.appsScript, 'boolean', 'actions should include appsScript runtime flag');
  assert.equal(typeof actionSupport?.nodeJs, 'boolean', 'actions should include nodeJs runtime flag');

  const withTriggers = connectors.find(connector => Array.isArray(connector.triggers) && connector.triggers.length > 0);
  if (withTriggers) {
    const triggerSupport = withTriggers.triggers[0]?.runtimeSupport;
    assert.equal(typeof triggerSupport?.appsScript, 'boolean', 'triggers should include appsScript runtime flag');
    assert.equal(typeof triggerSupport?.nodeJs, 'boolean', 'triggers should include nodeJs runtime flag');
  }

  const nodeSupported = connectors.some(connector => {
    const actionHasNode = Array.isArray(connector.actions)
      ? connector.actions.some((action: any) => action?.runtimeSupport?.nodeJs === true)
      : false;
    const triggerHasNode = Array.isArray(connector.triggers)
      ? connector.triggers.some((trigger: any) => trigger?.runtimeSupport?.nodeJs === true)
      : false;
    return actionHasNode || triggerHasNode;
  });
  assert.ok(nodeSupported, 'registry connectors should report at least one node-capable operation');

  console.log('Registry connectors endpoint exposes runtime support metadata for actions and triggers.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()));
  });
}

process.exit(process.exitCode ?? 0);
