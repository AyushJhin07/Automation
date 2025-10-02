import assert from 'node:assert/strict';

import { compileToAppsScript } from '../compile-to-appsscript';
import { WorkflowGraph } from '../../../common/workflow-types';

const graph: WorkflowGraph = {
  id: 'ref-regression-workflow',
  name: 'Reference Regression Workflow',
  nodes: [
    {
      id: 'node-1',
      type: 'action.sheets',
      app: 'sheets',
      name: 'Lookup candidate row',
      op: 'action.sheets:getRow',
      params: {},
      data: {
        operation: 'getRow',
        config: {
          spreadsheetId: 'spreadsheet-123',
          sheetName: 'Candidates'
        }
      }
    },
    {
      id: 'node-2',
      type: 'action.gmail',
      app: 'gmail',
      name: 'Email candidate',
      op: 'action.gmail:sendEmail',
      params: {},
      data: {
        operation: 'sendEmail',
        config: {
          to: { mode: 'ref', nodeId: 'node-1', path: 'candidate_email' },
          subject: 'Interview update',
          body: 'Hello from automation'
        }
      }
    }
  ],
  edges: [
    { id: 'edge-1', from: 'node-1', to: 'node-2', source: 'node-1', target: 'node-2' }
  ],
  meta: {
    prompt: 'Regression reference workflow'
  }
};

const result = compileToAppsScript(graph);
const codeFile = result.files.find(file => file.path === 'Code.gs');

assert.ok(codeFile, 'Code.gs should be emitted for Apps Script compilation');

const code = codeFile!.content;

assert.ok(
  code.includes("var __nodeOutputs = {}"),
  'compiled script should initialise node output tracking map'
);

assert.ok(
  code.includes("__storeNodeOutput('node-1', ctx)"),
  'main execution should store outputs for the upstream node'
);

assert.ok(
  code.includes("__getNodeOutputValue('node-1', 'candidate_email')"),
  'downstream node parameter should resolve via node output helper'
);

assert.ok(
  !code.includes('__APPSSCRIPT_REF__'),
  'no raw reference placeholders should remain in the generated Apps Script'
);

console.log('Reference parameter compilation regression checks passed.');

const commerceGraph: WorkflowGraph = {
  id: 'commerce-sync-workflow',
  name: 'Commerce Sync Workflow',
  nodes: [
    {
      id: 'node-bc',
      type: 'action.bigcommerce',
      app: 'bigcommerce',
      name: 'Create BigCommerce Product',
      op: 'action.bigcommerce:create_product',
      params: {
        name: 'Automation Test Product',
        type: 'physical',
        price: 29.99,
        sku: 'AUTO-001',
      },
      data: {
        operation: 'create_product',
        config: {
          name: 'Automation Test Product',
          type: 'physical',
          price: 29.99,
          sku: 'AUTO-001'
        }
      }
    },
    {
      id: 'node-wc',
      type: 'action.woocommerce',
      app: 'woocommerce',
      name: 'Create WooCommerce Order',
      op: 'action.woocommerce:create_order',
      params: {
        payment_method: 'stripe',
        billing: {
          first_name: 'Test',
          last_name: 'Buyer',
          email: 'customer@example.com'
        },
        line_items: [
          {
            product_id: { mode: 'ref', nodeId: 'node-bc', path: 'productId' },
            quantity: 1
          }
        ]
      },
      data: {
        operation: 'create_order',
        config: {
          payment_method: 'stripe',
          billing: {
            first_name: 'Test',
            last_name: 'Buyer',
            email: 'customer@example.com'
          },
          line_items: [
            {
              product_id: { mode: 'ref', nodeId: 'node-bc', path: 'productId' },
              quantity: 1
            }
          ]
        }
      }
    },
    {
      id: 'node-mg',
      type: 'action.magento',
      app: 'magento',
      name: 'Create Magento Order',
      op: 'action.magento:create_order',
      params: {
        entity: {
          customer_email: 'customer@example.com',
          customer_firstname: 'Test',
          customer_lastname: 'Buyer',
          items: [
            {
              sku: { mode: 'ref', nodeId: 'node-bc', path: 'sku' },
              qty: 1,
              price: 34.99
            }
          ]
        }
      },
      data: {
        operation: 'create_order',
        config: {
          entity: {
            customer_email: 'customer@example.com',
            customer_firstname: 'Test',
            customer_lastname: 'Buyer',
            items: [
              {
                sku: { mode: 'ref', nodeId: 'node-bc', path: 'sku' },
                qty: 1,
                price: 34.99
              }
            ]
          }
        }
      }
    },
    {
      id: 'node-sq',
      type: 'action.square',
      app: 'square',
      name: 'Capture Payment in Square',
      op: 'action.square:create_payment',
      params: {
        source_id: 'cnon:card-nonce-ok',
        idempotency_key: 'commerce-sync-payment',
        amount_money: { amount: 3499, currency: 'USD' },
        note: { mode: 'ref', nodeId: 'node-mg', path: 'orderNumber' }
      },
      data: {
        operation: 'create_payment',
        config: {
          source_id: 'cnon:card-nonce-ok',
          idempotency_key: 'commerce-sync-payment',
          amount_money: { amount: 3499, currency: 'USD' },
          note: { mode: 'ref', nodeId: 'node-mg', path: 'orderNumber' }
        }
      }
    }
  ],
  edges: [
    { id: 'edge-bc-wc', from: 'node-bc', to: 'node-wc', source: 'node-bc', target: 'node-wc' },
    { id: 'edge-wc-mg', from: 'node-wc', to: 'node-mg', source: 'node-wc', target: 'node-mg' },
    { id: 'edge-mg-sq', from: 'node-mg', to: 'node-sq', source: 'node-mg', target: 'node-sq' }
  ],
  meta: {
    prompt: 'Commerce workflow exercising product sync, order creation, and payment capture'
  }
};

const commerceCompileResult = compileToAppsScript(commerceGraph);
const commerceCodeFile = commerceCompileResult.files.find(file => file.path === 'Code.gs');

assert.ok(commerceCodeFile, 'Code.gs should be generated for commerce workflow compilation');

const commerceCode = commerceCodeFile!.content;

assert.ok(
  commerceCode.includes('handleCreateBigCommerceProduct'),
  'Compiled Apps Script should include BigCommerce product helper'
);

assert.ok(
  commerceCode.includes('handleCreateWooCommerceOrder'),
  'Compiled Apps Script should include WooCommerce order helper'
);

assert.ok(
  commerceCode.includes('handleCreateMagentoOrder'),
  'Compiled Apps Script should include Magento order helper'
);

assert.ok(
  commerceCode.includes('handleCreateSquarePayment'),
  'Compiled Apps Script should include Square payment helper'
);

console.log('Commerce connector compilation coverage checks passed.');
