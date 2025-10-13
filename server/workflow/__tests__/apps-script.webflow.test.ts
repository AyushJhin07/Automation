import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REAL_OPS } from '../compile-to-appsscript';
import { runSingleFixture } from '../appsScriptDryRunHarness';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'apps-script-fixtures');

describe('Apps Script Webflow REAL_OPS', () => {
  const cases: Array<[string, Record<string, any>]> = [
    ['action.webflow:test_connection', {}],
    ['action.webflow:list_sites', {}],
    ['action.webflow:get_site', { site_id: 'site-123' }],
    ['action.webflow:list_collections', { site_id: 'site-123' }],
    ['action.webflow:get_collection', { collection_id: 'collection-123' }],
    ['action.webflow:list_collection_items', { collection_id: 'collection-123', offset: 10, limit: 25 }],
    ['action.webflow:get_collection_item', { collection_id: 'collection-123', item_id: 'item-456' }],
    [
      'action.webflow:create_collection_item',
      {
        collection_id: 'collection-123',
        fields: {
          name: '{{lead.name}}',
          slug: 'new-item'
        },
        live: true
      }
    ],
    [
      'action.webflow:update_collection_item',
      {
        collection_id: 'collection-123',
        item_id: 'item-456',
        fields: {
          name: 'Updated Title'
        },
        live: false
      }
    ],
    ['action.webflow:delete_collection_item', { collection_id: 'collection-123', item_id: 'item-456', live: true }],
    [
      'action.webflow:publish_site',
      {
        site_id: 'site-123',
        domains: ['example.com', '{{site.subdomain}}.webflow.io']
      }
    ],
    ['action.webflow:list_webhooks', { site_id: 'site-123' }],
    [
      'action.webflow:create_webhook',
      {
        site_id: 'site-123',
        triggerType: 'form_submission',
        url: 'https://hooks.example.com/webflow',
        filter: { formId: '{{form.id}}' }
      }
    ],
    ['action.webflow:delete_webhook', { site_id: 'site-123', webhook_id: 'wh_001' }],
    ['trigger.webflow:form_submission', {}],
    ['trigger.webflow:collection_item_created', {}],
    ['trigger.webflow:collection_item_changed', {}],
    ['trigger.webflow:site_published', {}]
  ];

  for (const [operation, config] of cases) {
    it(`builds ${operation}`, () => {
      const builder = REAL_OPS[operation];
      expect(builder).toBeDefined();
      expect(builder(config)).toMatchSnapshot();
    });
  }
});

describe('Apps Script Webflow dry run', () => {
  it('creates a CMS item', async () => {
    const result = await runSingleFixture('webflow-create-cms-item', fixturesDir);
    expect(result.success).toBe(true);
    expect(result.context.webflowCollectionId).toBe('collection-123');
    expect(result.context.webflowItemId).toBe('item-987');
    expect(result.context.webflowItem).toMatchObject({
      _id: 'item-987',
      collectionId: 'collection-123',
      fields: {
        name: 'Sam Customer',
        slug: 'lead-42'
      }
    });
    expect(result.context.webflowItemPublished).toBe(false);
    expect(result.httpCalls).toHaveLength(1);
    expect(result.httpCalls[0].url).toBe('https://api.webflow.com/collections/collection-123/items?live=false');
    expect(result.httpCalls[0].method).toBe('POST');
  });

  it('registers a form submission webhook', async () => {
    const result = await runSingleFixture('webflow-create-form-webhook', fixturesDir);
    expect(result.success).toBe(true);
    expect(result.context.webflowSiteId).toBe('site-123');
    expect(result.context.webflowWebhookId).toBe('wh_001');
    expect(result.context.webflowWebhook).toMatchObject({
      _id: 'wh_001',
      triggerType: 'form_submission',
      siteId: 'site-123'
    });
    expect(result.httpCalls).toHaveLength(1);
    expect(result.httpCalls[0].url).toBe('https://api.webflow.com/sites/site-123/webhooks');
    expect(result.httpCalls[0].method).toBe('POST');
  });
});
