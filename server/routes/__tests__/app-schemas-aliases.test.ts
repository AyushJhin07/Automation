import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import appSchemasRouter from '../app-schemas.js';

const app = express();
app.use(express.json());
app.use('/api/app-schemas', appSchemasRouter);

const server: Server = await new Promise((resolve) => {
  const listener = app.listen(0, () => resolve(listener));
});

try {
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const schemaResponse = await fetch(`${baseUrl}/api/app-schemas/schemas/google-sheets/append_row`);
  assert.equal(schemaResponse.status, 200, 'should resolve schema aliases without 404');
  const schemaPayload = await schemaResponse.json();
  assert.equal(schemaPayload.success, true, 'schema response should indicate success');
  assert.equal(schemaPayload.canonicalApp, 'sheets', 'canonical app should be sheets');
  assert.equal(schemaPayload.canonicalOperation, 'append_row', 'operation should resolve to append_row');
  assert.ok(schemaPayload.parameters?.spreadsheetUrl, 'schema response should include spreadsheetUrl field');
  assert.ok(schemaPayload.parameters?.values, 'schema response should include values field');

  const validationResponse = await fetch(`${baseUrl}/api/app-schemas/schemas/google-sheets/append_row/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parameters: { spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/test', values: 'Alice,Example' } })
  });
  assert.equal(validationResponse.status, 200, 'validation should resolve alias path');
  const validationPayload = await validationResponse.json();
  assert.equal(validationPayload.canonicalApp, 'sheets', 'validation payload should report canonical app');
  assert.equal(validationPayload.canonicalOperation, 'append_row', 'validation payload should report canonical operation');
  assert.ok(validationPayload.validation, 'validation payload should be present');
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}
