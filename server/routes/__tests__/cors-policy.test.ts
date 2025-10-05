import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const originalNodeEnv = process.env.NODE_ENV;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalEncryptionKey = process.env.ENCRYPTION_MASTER_KEY;
const originalJwtSecret = process.env.JWT_SECRET;
const originalCorsOrigin = process.env.CORS_ORIGIN;

process.env.NODE_ENV = 'development';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://user:password@localhost:5432/testdb';
process.env.ENCRYPTION_MASTER_KEY =
  process.env.ENCRYPTION_MASTER_KEY ?? '0123456789abcdef0123456789abcdef';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';

type RunningServer = { server: Server; baseUrl: string };

const { registerRoutes } = await import('../../routes.ts');

async function startServer(nodeEnv: 'development' | 'production', corsOrigin?: string): Promise<RunningServer> {
  process.env.NODE_ENV = nodeEnv;

  if (corsOrigin === undefined) {
    delete process.env.CORS_ORIGIN;
  } else {
    process.env.CORS_ORIGIN = corsOrigin;
  }

  const app = express();
  app.use(express.json());

  await registerRoutes(app);

  const server = createServer(app);

  await new Promise<void>((resolve, reject) =>
    server.listen(0, (err?: Error) => (err ? reject(err) : resolve())),
  );

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return { server, baseUrl };
}

async function stopServer(instance: RunningServer | null): Promise<void> {
  if (!instance) {
    return;
  }

  await new Promise<void>((resolve, reject) =>
    instance.server.close((err) => (err ? reject(err) : resolve())),
  );
}

let devServer: RunningServer | null = null;
let prodServer: RunningServer | null = null;
let exitCode = 0;

try {
  devServer = await startServer('development');

  const devAllowedOrigin = 'http://localhost:5173';
  const devBlockedOrigin = 'https://malicious.example.com';
  const devTargetUrl = `${devServer.baseUrl}/api/app-schemas/schemas`;

  const devPreflightAllowed = await fetch(devTargetUrl, {
    method: 'OPTIONS',
    headers: {
      Origin: devAllowedOrigin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'Authorization,Content-Type',
    },
  });

  assert.equal(devPreflightAllowed.status, 204, 'allowed dev preflight should succeed');
  assert.equal(
    devPreflightAllowed.headers.get('access-control-allow-origin'),
    devAllowedOrigin,
    'allowed dev preflight should echo origin',
  );
  assert.equal(
    devPreflightAllowed.headers.get('access-control-allow-credentials'),
    'true',
    'allowed dev preflight should permit credentials',
  );
  const devAllowedMethods = devPreflightAllowed.headers.get('access-control-allow-methods');
  assert.ok(devAllowedMethods?.includes('GET'), 'allowed dev preflight should expose GET method');

  const devPreflightBlocked = await fetch(devTargetUrl, {
    method: 'OPTIONS',
    headers: {
      Origin: devBlockedOrigin,
      'Access-Control-Request-Method': 'GET',
    },
  });
  assert.equal(devPreflightBlocked.status, 403, 'blocked dev preflight should fail');

  const devAllowedResponse = await fetch(devTargetUrl, {
    headers: {
      Origin: devAllowedOrigin,
      Authorization: 'Bearer test',
    },
  });
  assert.equal(devAllowedResponse.status, 200, 'allowed dev request should succeed');
  assert.equal(
    devAllowedResponse.headers.get('access-control-allow-origin'),
    devAllowedOrigin,
    'allowed dev request should echo origin',
  );
  assert.equal(
    devAllowedResponse.headers.get('access-control-allow-credentials'),
    'true',
    'allowed dev request should allow credentials',
  );

  const devBlockedResponse = await fetch(devTargetUrl, {
    headers: {
      Origin: devBlockedOrigin,
      Authorization: 'Bearer test',
    },
  });
  assert.equal(devBlockedResponse.status, 403, 'blocked dev request should be rejected');

  await stopServer(devServer);
  devServer = null;

  const prodAllowedOrigin = 'https://app.example.com';
  const prodBlockedOrigin = 'https://unauthorized.example.com';

  prodServer = await startServer('production', prodAllowedOrigin);
  const prodTargetUrl = `${prodServer.baseUrl}/api/app-schemas/schemas`;

  const prodPreflightAllowed = await fetch(prodTargetUrl, {
    method: 'OPTIONS',
    headers: {
      Origin: prodAllowedOrigin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'Authorization,Content-Type',
    },
  });
  assert.equal(prodPreflightAllowed.status, 204, 'allowed prod preflight should succeed');
  assert.equal(
    prodPreflightAllowed.headers.get('access-control-allow-origin'),
    prodAllowedOrigin,
    'allowed prod preflight should echo origin',
  );
  assert.equal(
    prodPreflightAllowed.headers.get('access-control-allow-credentials'),
    'true',
    'allowed prod preflight should permit credentials',
  );

  const prodPreflightBlocked = await fetch(prodTargetUrl, {
    method: 'OPTIONS',
    headers: {
      Origin: prodBlockedOrigin,
      'Access-Control-Request-Method': 'GET',
    },
  });
  assert.equal(prodPreflightBlocked.status, 403, 'blocked prod preflight should fail');

  const prodAllowedResponse = await fetch(prodTargetUrl, {
    headers: {
      Origin: prodAllowedOrigin,
      Authorization: 'Bearer production-token',
    },
  });
  assert.equal(prodAllowedResponse.status, 200, 'allowed prod request should succeed');
  assert.equal(
    prodAllowedResponse.headers.get('access-control-allow-origin'),
    prodAllowedOrigin,
    'allowed prod request should echo origin',
  );
  assert.equal(
    prodAllowedResponse.headers.get('access-control-allow-credentials'),
    'true',
    'allowed prod request should allow credentials',
  );

  const prodBlockedResponse = await fetch(prodTargetUrl, {
    headers: {
      Origin: prodBlockedOrigin,
      Authorization: 'Bearer production-token',
    },
  });
  assert.equal(prodBlockedResponse.status, 403, 'blocked prod request should be rejected');

  console.log('CORS policy allows approved origins and rejects unauthorized cross-origin access.');
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  await stopServer(devServer);
  await stopServer(prodServer);

  const restore = (
    key: 'NODE_ENV' | 'DATABASE_URL' | 'ENCRYPTION_MASTER_KEY' | 'JWT_SECRET' | 'CORS_ORIGIN',
    value: string | undefined,
  ) => {
    if (value) {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  };

  restore('NODE_ENV', originalNodeEnv);
  restore('DATABASE_URL', originalDatabaseUrl);
  restore('ENCRYPTION_MASTER_KEY', originalEncryptionKey);
  restore('JWT_SECRET', originalJwtSecret);
  restore('CORS_ORIGIN', originalCorsOrigin);

  process.exit(exitCode);
}
