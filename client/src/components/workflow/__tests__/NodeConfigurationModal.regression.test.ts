import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import appSchemasRouter from '../../../../../server/routes/app-schemas.js';
import { buildSchemaRequestPaths } from '@shared/appSchemaAlias';

const app = express();
app.use(express.json());
app.use('/api/app-schemas', appSchemasRouter);

const server: Server = await new Promise((resolve) => {
  const listener = app.listen(0, () => resolve(listener));
});

try {
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const { schemaPath, validationPath, resolvedApp, resolvedOperation } = buildSchemaRequestPaths(
    'google-sheets',
    'action.google-sheets.append_row'
  );

  const schemaResponse = await fetch(`${baseUrl}${schemaPath}`);
  assert.equal(schemaResponse.status, 200, 'schema endpoint should resolve the sheets alias');
  const schemaPayload = await schemaResponse.json();
  assert.equal(schemaPayload.app, resolvedApp, 'response should return the canonical app id');
  assert.equal(
    schemaPayload.operation,
    resolvedOperation,
    'response should return the canonical operation id'
  );
  assert.ok(schemaPayload.parameters, 'schema payload should include parameters');
  assert.ok(
    Object.prototype.hasOwnProperty.call(schemaPayload.parameters, 'spreadsheetUrl'),
    'append row schema should expose spreadsheetUrl field'
  );
  assert.ok(
    Object.prototype.hasOwnProperty.call(schemaPayload.parameters, 'values'),
    'append row schema should expose values field'
  );

  const validationResponse = await fetch(`${baseUrl}${validationPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parameters: { spreadsheetUrl: 'https://example.com', values: 'one,two' } })
  });

  assert.equal(
    validationResponse.status,
    200,
    'validation endpoint should respect the sheets alias without 404s'
  );
  const validationPayload = await validationResponse.json();
  assert.equal(validationPayload.app, resolvedApp, 'validation should report canonical app id');
  assert.equal(
    validationPayload.operation,
    resolvedOperation,
    'validation should report canonical operation id'
  );
  assert.ok(validationPayload.validation, 'validation payload should include validation results');
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}
