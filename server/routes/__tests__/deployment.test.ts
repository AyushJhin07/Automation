import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'development';

const { registerDeploymentPrerequisiteRoutes } = await import('../deployment-prerequisites.js');
const { productionDeployer } = await import('../../core/ProductionDeployer.js');

const stubResult = {
  valid: false,
  issues: ['Clasp is not installed', 'Node.js version is too old'],
  recommendations: ['Install @google/clasp globally', 'Upgrade to Node.js 18 or later'],
};

const originalValidate = productionDeployer.validatePrerequisites.bind(productionDeployer);
let callCount = 0;
(productionDeployer as any).validatePrerequisites = async () => {
  callCount += 1;
  return stubResult;
};

const app = express();
app.use(express.json());
registerDeploymentPrerequisiteRoutes(app);

const server: Server = await new Promise((resolve) => {
  const listener = app.listen(0, () => resolve(listener));
});

try {
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  for (const path of ['/api/deployment/prerequisites', '/api/ai/deployment/prerequisites']) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200, `${path} should respond with 200`);
    const body = await response.json();
    assert.equal(body.success, true, `${path} should report success`);
    assert.deepEqual(body.data, stubResult, `${path} should return the stubbed prerequisite payload`);
  }

  assert.equal(callCount, 2, 'validatePrerequisites should be invoked once per endpoint');
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });

  (productionDeployer as any).validatePrerequisites = originalValidate;

  if (originalNodeEnv) {
    process.env.NODE_ENV = originalNodeEnv;
  } else {
    delete process.env.NODE_ENV;
  }
}
