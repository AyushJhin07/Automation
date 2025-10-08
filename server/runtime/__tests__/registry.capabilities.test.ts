import assert from 'node:assert/strict';

import { getRuntimeCapabilities, hasRuntimeImplementation } from '../registry.js';

{
  const capabilities = getRuntimeCapabilities();
  const httpCapabilities = capabilities.find(entry => entry.app === 'http');

  assert.ok(httpCapabilities, 'http capabilities should be registered');
  assert.ok(
    httpCapabilities.actions.includes('request'),
    'http capabilities should include the request action',
  );
  assert.equal(hasRuntimeImplementation('action', 'http', 'request'), true);
}
