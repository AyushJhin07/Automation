import assert from 'node:assert/strict';

import { getAllowlistForMode } from '../PromptBuilder.js';

const gasOnly = getAllowlistForMode('gas-only');
assert.equal(gasOnly.has('time'), true, 'gas-only allowlist should include the built-in time trigger app');
assert.equal(gasOnly.has('core'), true, 'gas-only allowlist should retain core utilities');

const allMode = getAllowlistForMode('all');
assert.equal(allMode.has('core'), true, 'all connectors mode should include core utilities');

console.log('PromptBuilder getAllowlistForMode includes time trigger support.');
