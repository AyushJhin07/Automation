import assert from 'node:assert/strict';

process.env.GENERIC_EXECUTOR_ENABLED = 'false';

const { getRuntimeCapabilities, resolveRuntime } = await import('../registry.js');

{
  const capabilities = getRuntimeCapabilities();
  const httpCapabilities = capabilities.find(entry => entry.app === 'http');

  assert.ok(httpCapabilities, 'http capabilities should be registered');
  assert.ok(
    httpCapabilities.actions.includes('request'),
    'http capabilities should include the request action',
  );
  const httpResolution = resolveRuntime({ kind: 'action', appId: 'http', operationId: 'request' });
  assert.equal(httpResolution.availability === 'native', true);
}

{
  const capabilities = getRuntimeCapabilities();
  const slackCapabilities = capabilities.find(entry => entry.app === 'slack');

  assert.ok(!slackCapabilities || !slackCapabilities.actions.includes('send_message'));
  const slackResolution = resolveRuntime({ kind: 'action', appId: 'slack', operationId: 'send_message' });
  assert.equal(slackResolution.availability === 'unavailable', true);
}

process.env.GENERIC_EXECUTOR_ENABLED = 'true';

{
  const capabilities = getRuntimeCapabilities();
  const slackCapabilities = capabilities.find(entry => entry.app === 'slack');

  assert.ok(slackCapabilities, 'slack capabilities should be available when generic executor is enabled');
  assert.ok(
    slackCapabilities.actions.includes('send_message'),
    'slack send_message action should be exposed via runtime registry when generic executor is enabled',
  );
  const slackResolutionWithFallback = resolveRuntime({
    kind: 'action',
    appId: 'slack',
    operationId: 'send_message',
  });
  assert.equal(slackResolutionWithFallback.availability, 'fallback');
  assert.equal(slackResolutionWithFallback.runtime, 'node');
}

process.env.GENERIC_EXECUTOR_ENABLED = 'false';
