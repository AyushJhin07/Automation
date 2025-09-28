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
  assert.equal(schemaResponse.status, 200, 'schema lookup should succeed for google-sheets alias');

  const schemaJson = await schemaResponse.json();
  assert.equal(schemaJson.success, true, 'schema endpoint should report success');
  assert.equal(schemaJson.app, 'sheets', 'response should return canonical app id');
  assert.equal(schemaJson.requestedApp, 'google-sheets', 'response should include requested alias');
  assert.ok(schemaJson.parameters, 'schema should include parameters');
  assert.ok(schemaJson.parameters.spreadsheetUrl, 'schema should expose spreadsheetUrl field');
  assert.ok(schemaJson.parameters.values, 'schema should expose row values field');

  const validationResponse = await fetch(
    `${baseUrl}/api/app-schemas/schemas/google-sheets/append_row/validate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters: {} })
    }
  );

  assert.equal(validationResponse.status, 200, 'validation endpoint should succeed for alias');
  const validationJson = await validationResponse.json();
  assert.equal(validationJson.app, 'sheets', 'validation should resolve canonical app');
  assert.equal(validationJson.operation, 'append_row', 'validation should resolve canonical operation');
  assert.ok(Array.isArray(validationJson.validation?.errors), 'validation should include errors array');
  assert.ok(
    validationJson.validation.errors.some((error: any) => error.field === 'spreadsheetUrl'),
    'validation should report missing spreadsheetUrl'
  );

  console.log('App schema routes resolve google-sheets alias to canonical sheets definitions.');
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}
