import assert from 'node:assert/strict';

import { connectorRegistry } from '../ConnectorRegistry.js';

const catalog = connectorRegistry.getNodeCatalog();
const summary = connectorRegistry.getImplementationSummary();

assert(summary.totalConnectors >= summary.implementedConnectors, 'implemented connectors should not exceed total');
assert(summary.implementedConnectors > 0, 'at least one connector should be implemented');

const kustomer = catalog.connectors['kustomer'];
assert(kustomer, 'kustomer connector should be present in catalog');
assert.equal(kustomer.hasImplementation, true, 'kustomer should be marked implemented');
assert.equal(kustomer.implementation, 'generic', 'kustomer should use generic execution');

console.log('ConnectorRegistry summary:', summary);
