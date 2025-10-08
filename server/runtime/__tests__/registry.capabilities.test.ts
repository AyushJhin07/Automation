import assert from 'node:assert/strict';

process.env.GENERIC_EXECUTOR_ENABLED = 'false';

const { getRuntimeCapabilities, hasRuntimeImplementation } = await import('../registry.js');

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

{
  const capabilities = getRuntimeCapabilities();
  const slackCapabilities = capabilities.find(entry => entry.app === 'slack');

  assert.ok(!slackCapabilities || !slackCapabilities.actions.includes('send_message'));
  assert.equal(hasRuntimeImplementation('action', 'slack', 'send_message'), false);
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
  assert.equal(hasRuntimeImplementation('action', 'slack', 'send_message'), true);
}

process.env.GENERIC_EXECUTOR_ENABLED = 'false';
