import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'development';

const stubApp = {
  post: () => stubApp,
  get: () => stubApp,
  delete: () => stubApp,
  use: () => stubApp,
  put: () => stubApp,
  patch: () => stubApp,
  options: () => stubApp,
};

(globalThis as any).app = stubApp;

const { registerRoutes } = await import('../../routes.ts');
const { productionDeployer } = await import('../../core/ProductionDeployer.js');

delete (globalThis as any).app;

const originalDeploy = productionDeployer.deploy;
let deployCallCount = 0;

(productionDeployer as any).deploy = async (files: unknown, options: unknown) => {
  deployCallCount += 1;
  return {
    success: true,
    files,
    options,
  };
};

const app = express();
app.use(express.json());

let server: Server | undefined;
let exitCode = 0;

try {
  server = await registerRoutes(app);

  await new Promise<void>((resolve) => {
    server!.listen(0, () => resolve());
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const optionsResponse = await fetch(`${baseUrl}/api/workflow/deploy`, {
    method: 'OPTIONS',
  });

  assert.equal(optionsResponse.status, 204, 'OPTIONS should respond with 204');
  assert.equal(optionsResponse.headers.get('allow'), 'POST', 'OPTIONS should advertise POST via Allow header');

  const payload = {
    files: [
      {
        path: 'main.ts',
        content: 'export const handler = () => "ok";',
      },
    ],
    options: {
      dryRun: true,
    },
  };

  const postResponse = await fetch(`${baseUrl}/api/workflow/deploy`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  assert.equal(postResponse.status, 200, 'POST should respond with 200');
  const body = await postResponse.json();
  assert.deepEqual(body, {
    success: true,
    files: payload.files,
    options: payload.options,
  }, 'POST should return the mocked deploy payload');

  assert.equal(deployCallCount, 1, 'deploy should be invoked exactly once');

  console.log('Workflow deploy endpoint responds to OPTIONS preflight and POST requests.');
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server!.close((err) => (err ? reject(err) : resolve()));
    });
  }

  (productionDeployer as any).deploy = originalDeploy;

  if (originalNodeEnv) {
    process.env.NODE_ENV = originalNodeEnv;
  } else {
    delete process.env.NODE_ENV;
  }

  process.exit(exitCode);
}
