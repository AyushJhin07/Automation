import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

type VerificationFailureStub = {
  id: string;
  webhookId: string;
  workflowId: string;
  status: string;
  reason: string;
  message: string;
  provider?: string | null;
  timestamp: Date;
  metadata?: {
    signatureHeader?: string | null;
    providedSignature?: string | null;
    timestampSkewSeconds?: number | null;
  };
};

const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'development';

const triggerPersistenceModule = await import('../../services/TriggerPersistenceService.js');

const originalListFailures = triggerPersistenceModule.triggerPersistenceService.listVerificationFailures;
(triggerPersistenceModule.triggerPersistenceService as any).listVerificationFailures = async () => [
  {
    id: 'fail-1',
    webhookId: 'hook-1',
    workflowId: 'wf-1',
    status: 'failed',
    reason: 'SIGNATURE_MISMATCH',
    message: 'Signature mismatch',
    provider: 'slack',
    timestamp: new Date('2024-01-01T00:00:00Z'),
    metadata: {
      signatureHeader: 'x-signature',
      providedSignature: 'abc123',
      timestampSkewSeconds: 45,
    },
  },
] satisfies VerificationFailureStub[];

const app = express();
app.use(express.json());

const { registerRoutes } = await import('../../routes.ts');

let server: Server | undefined;
let exitCode = 0;

try {
  server = await registerRoutes(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const response = await fetch(
    `${baseUrl}/api/webhooks/hook-1/verification-failures?workflowId=wf-1&limit=5`
  );

  assert.equal(response.status, 200, 'verification failures endpoint should return 200');
  const body = await response.json();
  assert.equal(body.success, true, 'response should indicate success');
  assert.ok(Array.isArray(body.failures), 'failures should be an array');
  assert.equal(body.failures.length, 1, 'one failure should be returned');

  const entry = body.failures[0];
  assert.equal(entry.webhookId, 'hook-1');
  assert.equal(entry.workflowId, 'wf-1');
  assert.equal(entry.reason, 'SIGNATURE_MISMATCH');
  assert.equal(entry.status, 'failed');
  assert.equal(entry.provider, 'slack');
  assert.ok(entry.timestamp, 'timestamp should be serialized');

  console.log('Webhook verification failure endpoint returns structured failure entries.');
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  if (server) {
    await new Promise<void>((resolve, reject) => server!.close((err) => (err ? reject(err) : resolve())));
  }
  (triggerPersistenceModule.triggerPersistenceService as any).listVerificationFailures = originalListFailures;
  process.env.NODE_ENV = originalNodeEnv;
  process.exit(exitCode);
}
