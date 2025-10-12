import { beforeAll, describe, expect, it } from 'vitest';

import { GENERATED_REAL_OPS } from '../../server/workflow/realOps.generated';
import { buildGeneratedRealOps, type GeneratedOperation } from '../generate-apps-script-builders';

interface SnapshotEntry {
  key: string;
  code: string;
}

let operations: GeneratedOperation[] = [];
let operationCodeByKey: Map<string, string>;

beforeAll(async () => {
  const result = await buildGeneratedRealOps();
  operations = result.operations;
  operationCodeByKey = new Map(result.operations.map(operation => [operation.key, operation.code]));
});

function collectSnapshotData(connectorId: string): SnapshotEntry[] {
  return operations
    .filter(operation => operation.connectorId === connectorId)
    .map(operation => ({ key: operation.key, code: operationCodeByKey.get(operation.key) ?? '' }));
}

describe('generate-apps-script-builders', () => {
  it('produces stable CRM stubs for hubspot', () => {
    const snapshotEntries = collectSnapshotData('hubspot');
    expect(snapshotEntries.length).toBeGreaterThan(0);

    const snapshotChunks: string[] = [];
    for (const entry of snapshotEntries) {
      const generatorCode = entry.code;

      const exportedBuilder = GENERATED_REAL_OPS[entry.key];
      expect(exportedBuilder, `missing exported builder for ${entry.key}`).toBeTypeOf('function');
      expect(exportedBuilder(undefined)).toEqual(generatorCode);

      snapshotChunks.push(`${entry.key}\n${generatorCode}`);
    }

    const snapshotString = snapshotChunks.join('\n\n');
    expect(snapshotString).toMatchInlineSnapshot(`
"action.hubspot:create_company
function step_action_hubspot_create_company(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#hubspot): Implement action.hubspot:create_company Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'hubspot', operation: 'action.hubspot:create_company' });
  throw new Error('TODO[apps-script-backlog]: Implement action.hubspot:create_company. See docs/apps-script-rollout/backlog.md.');
}

action.hubspot:create_contact
function step_action_hubspot_create_contact(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#hubspot): Implement action.hubspot:create_contact Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'hubspot', operation: 'action.hubspot:create_contact' });
  throw new Error('TODO[apps-script-backlog]: Implement action.hubspot:create_contact. See docs/apps-script-rollout/backlog.md.');
}

action.hubspot:create_deal
function step_action_hubspot_create_deal(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#hubspot): Implement action.hubspot:create_deal Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'hubspot', operation: 'action.hubspot:create_deal' });
  throw new Error('TODO[apps-script-backlog]: Implement action.hubspot:create_deal. See docs/apps-script-rollout/backlog.md.');
}

action.hubspot:create_note
function step_action_hubspot_create_note(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#hubspot): Implement action.hubspot:create_note Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'hubspot', operation: 'action.hubspot:create_note' });
  throw new Error('TODO[apps-script-backlog]: Implement action.hubspot:create_note. See docs/apps-script-rollout/backlog.md.');
}

action.hubspot:create_ticket
function step_action_hubspot_create_ticket(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#hubspot): Implement action.hubspot:create_ticket Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'hubspot', operation: 'action.hubspot:create_ticket' });
  throw new Error('TODO[apps-script-backlog]: Implement action.hubspot:create_ticket. See docs/apps-script-rollout/backlog.md.');
}

action.hubspot:get_contact
function step_action_hubspot_get_contact(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#hubspot): Implement action.hubspot:get_contact Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'hubspot', operation: 'action.hubspot:get_contact' });
  throw new Error('TODO[apps-script-backlog]: Implement action.hubspot:get_contact. See docs/apps-script-rollout/backlog.md.');
}

action.hubspot:get_deal
function step_action_hubspot_get_deal(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#hubspot): Implement action.hubspot:get_deal Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'hubspot', operation: 'action.hubspot:get_deal' });
  throw new Error('TODO[apps-script-backlog]: Implement action.hubspot:get_deal. See docs/apps-script-rollout/backlog.md.');
}

action.hubspot:list_deals
function step_action_hubspot_list_deals(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#hubspot): Implement action.hubspot:list_deals Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'hubspot', operation: 'action.hubspot:list_deals' });
  throw new Error('TODO[apps-script-backlog]: Implement action.hubspot:list_deals. See docs/apps-script-rollout/backlog.md.');
}

action.hubspot:search_contacts
function step_action_hubspot_search_contacts(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#hubspot): Implement action.hubspot:search_contacts Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'hubspot', operation: 'action.hubspot:search_contacts' });
  throw new Error('TODO[apps-script-backlog]: Implement action.hubspot:search_contacts. See docs/apps-script-rollout/backlog.md.');
}

action.hubspot:search_deals
function step_action_hubspot_search_deals(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#hubspot): Implement action.hubspot:search_deals Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'hubspot', operation: 'action.hubspot:search_deals' });
  throw new Error('TODO[apps-script-backlog]: Implement action.hubspot:search_deals. See docs/apps-script-rollout/backlog.md.');
}

action.hubspot:send_email
function step_action_hubspot_send_email(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#hubspot): Implement action.hubspot:send_email Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'hubspot', operation: 'action.hubspot:send_email' });
  throw new Error('TODO[apps-script-backlog]: Implement action.hubspot:send_email. See docs/apps-script-rollout/backlog.md.');
}

action.hubspot:test_connection
function step_action_hubspot_test_connection(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#hubspot): Implement action.hubspot:test_connection Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'hubspot', operation: 'action.hubspot:test_connection' });
  throw new Error('TODO[apps-script-backlog]: Implement action.hubspot:test_connection. See docs/apps-script-rollout/backlog.md.');
}

action.hubspot:update_contact
function step_action_hubspot_update_contact(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#hubspot): Implement action.hubspot:update_contact Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'hubspot', operation: 'action.hubspot:update_contact' });
  throw new Error('TODO[apps-script-backlog]: Implement action.hubspot:update_contact. See docs/apps-script-rollout/backlog.md.');
}

action.hubspot:update_deal
function step_action_hubspot_update_deal(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#hubspot): Implement action.hubspot:update_deal Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'hubspot', operation: 'action.hubspot:update_deal' });
  throw new Error('TODO[apps-script-backlog]: Implement action.hubspot:update_deal. See docs/apps-script-rollout/backlog.md.');
}

action.hubspot:update_deal_stage
function step_action_hubspot_update_deal_stage(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#hubspot): Implement action.hubspot:update_deal_stage Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'hubspot', operation: 'action.hubspot:update_deal_stage' });
  throw new Error('TODO[apps-script-backlog]: Implement action.hubspot:update_deal_stage. See docs/apps-script-rollout/backlog.md.');
}

trigger.hubspot:contact_created
function trigger_trigger_hubspot_contact_created(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#hubspot): Implement trigger.hubspot:contact_created Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'hubspot', operation: 'trigger.hubspot:contact_created' });
  throw new Error('TODO[apps-script-backlog]: Implement trigger.hubspot:contact_created. See docs/apps-script-rollout/backlog.md.');
}

trigger.hubspot:contact_updated
function trigger_trigger_hubspot_contact_updated(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#hubspot): Implement trigger.hubspot:contact_updated Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'hubspot', operation: 'trigger.hubspot:contact_updated' });
  throw new Error('TODO[apps-script-backlog]: Implement trigger.hubspot:contact_updated. See docs/apps-script-rollout/backlog.md.');
}

trigger.hubspot:deal_created
function trigger_trigger_hubspot_deal_created(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#hubspot): Implement trigger.hubspot:deal_created Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'hubspot', operation: 'trigger.hubspot:deal_created' });
  throw new Error('TODO[apps-script-backlog]: Implement trigger.hubspot:deal_created. See docs/apps-script-rollout/backlog.md.');
}

trigger.hubspot:deal_stage_changed
function trigger_trigger_hubspot_deal_stage_changed(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#hubspot): Implement trigger.hubspot:deal_stage_changed Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'hubspot', operation: 'trigger.hubspot:deal_stage_changed' });
  throw new Error('TODO[apps-script-backlog]: Implement trigger.hubspot:deal_stage_changed. See docs/apps-script-rollout/backlog.md.');
}"
    `);
  });

  it('produces stable communication stubs for slack', () => {
    const snapshotEntries = collectSnapshotData('slack');
    expect(snapshotEntries.length).toBeGreaterThan(0);

    const snapshotChunks: string[] = [];
    for (const entry of snapshotEntries) {
      const generatorCode = entry.code;

      const exportedBuilder = GENERATED_REAL_OPS[entry.key];
      expect(exportedBuilder, `missing exported builder for ${entry.key}`).toBeTypeOf('function');
      expect(exportedBuilder(undefined)).toEqual(generatorCode);

      snapshotChunks.push(`${entry.key}\n${generatorCode}`);
    }

    const snapshotString = snapshotChunks.join('\n\n');
    expect(snapshotString).toMatchInlineSnapshot(`
"action.slack:add_reaction
function step_action_slack_add_reaction(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#slack): Implement action.slack:add_reaction Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'slack', operation: 'action.slack:add_reaction' });
  throw new Error('TODO[apps-script-backlog]: Implement action.slack:add_reaction. See docs/apps-script-rollout/backlog.md.');
}

action.slack:conversations_history
function step_action_slack_conversations_history(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#slack): Implement action.slack:conversations_history Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'slack', operation: 'action.slack:conversations_history' });
  throw new Error('TODO[apps-script-backlog]: Implement action.slack:conversations_history. See docs/apps-script-rollout/backlog.md.');
}

action.slack:create_channel
function step_action_slack_create_channel(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#slack): Implement action.slack:create_channel Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'slack', operation: 'action.slack:create_channel' });
  throw new Error('TODO[apps-script-backlog]: Implement action.slack:create_channel. See docs/apps-script-rollout/backlog.md.');
}

action.slack:get_channel_info
function step_action_slack_get_channel_info(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#slack): Implement action.slack:get_channel_info Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'slack', operation: 'action.slack:get_channel_info' });
  throw new Error('TODO[apps-script-backlog]: Implement action.slack:get_channel_info. See docs/apps-script-rollout/backlog.md.');
}

action.slack:get_user_info
function step_action_slack_get_user_info(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#slack): Implement action.slack:get_user_info Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'slack', operation: 'action.slack:get_user_info' });
  throw new Error('TODO[apps-script-backlog]: Implement action.slack:get_user_info. See docs/apps-script-rollout/backlog.md.');
}

action.slack:invite_to_channel
function step_action_slack_invite_to_channel(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#slack): Implement action.slack:invite_to_channel Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'slack', operation: 'action.slack:invite_to_channel' });
  throw new Error('TODO[apps-script-backlog]: Implement action.slack:invite_to_channel. See docs/apps-script-rollout/backlog.md.');
}

action.slack:list_channels
function step_action_slack_list_channels(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#slack): Implement action.slack:list_channels Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'slack', operation: 'action.slack:list_channels' });
  throw new Error('TODO[apps-script-backlog]: Implement action.slack:list_channels. See docs/apps-script-rollout/backlog.md.');
}

action.slack:list_files
function step_action_slack_list_files(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#slack): Implement action.slack:list_files Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'slack', operation: 'action.slack:list_files' });
  throw new Error('TODO[apps-script-backlog]: Implement action.slack:list_files. See docs/apps-script-rollout/backlog.md.');
}

action.slack:list_users
function step_action_slack_list_users(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#slack): Implement action.slack:list_users Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'slack', operation: 'action.slack:list_users' });
  throw new Error('TODO[apps-script-backlog]: Implement action.slack:list_users. See docs/apps-script-rollout/backlog.md.');
}

action.slack:schedule_message
function step_action_slack_schedule_message(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#slack): Implement action.slack:schedule_message Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'slack', operation: 'action.slack:schedule_message' });
  throw new Error('TODO[apps-script-backlog]: Implement action.slack:schedule_message. See docs/apps-script-rollout/backlog.md.');
}

action.slack:send_message
function step_action_slack_send_message(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#slack): Implement action.slack:send_message Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'slack', operation: 'action.slack:send_message' });
  throw new Error('TODO[apps-script-backlog]: Implement action.slack:send_message. See docs/apps-script-rollout/backlog.md.');
}

action.slack:test_connection
function step_action_slack_test_connection(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#slack): Implement action.slack:test_connection Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'slack', operation: 'action.slack:test_connection' });
  throw new Error('TODO[apps-script-backlog]: Implement action.slack:test_connection. See docs/apps-script-rollout/backlog.md.');
}

action.slack:upload_file
function step_action_slack_upload_file(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#slack): Implement action.slack:upload_file Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'slack', operation: 'action.slack:upload_file' });
  throw new Error('TODO[apps-script-backlog]: Implement action.slack:upload_file. See docs/apps-script-rollout/backlog.md.');
}

trigger.slack:message_received
function trigger_trigger_slack_message_received(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#slack): Implement trigger.slack:message_received Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'slack', operation: 'trigger.slack:message_received' });
  throw new Error('TODO[apps-script-backlog]: Implement trigger.slack:message_received. See docs/apps-script-rollout/backlog.md.');
}

trigger.slack:reaction_added
function trigger_trigger_slack_reaction_added(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#slack): Implement trigger.slack:reaction_added Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'slack', operation: 'trigger.slack:reaction_added' });
  throw new Error('TODO[apps-script-backlog]: Implement trigger.slack:reaction_added. See docs/apps-script-rollout/backlog.md.');
}

trigger.slack:user_joined_channel
function trigger_trigger_slack_user_joined_channel(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#slack): Implement trigger.slack:user_joined_channel Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'slack', operation: 'trigger.slack:user_joined_channel' });
  throw new Error('TODO[apps-script-backlog]: Implement trigger.slack:user_joined_channel. See docs/apps-script-rollout/backlog.md.');
}"
    `);
  });

  it('produces stable e-commerce stubs for shopify', () => {
    const snapshotEntries = collectSnapshotData('shopify');
    expect(snapshotEntries.length).toBeGreaterThan(0);

    const snapshotChunks: string[] = [];
    for (const entry of snapshotEntries) {
      const generatorCode = entry.code;

      const exportedBuilder = GENERATED_REAL_OPS[entry.key];
      expect(exportedBuilder, `missing exported builder for ${entry.key}`).toBeTypeOf('function');
      expect(exportedBuilder(undefined)).toEqual(generatorCode);

      snapshotChunks.push(`${entry.key}\n${generatorCode}`);
    }

    const snapshotString = snapshotChunks.join('\n\n');
    expect(snapshotString).toMatchInlineSnapshot(`
"action.shopify:create_customer
function step_action_shopify_create_customer(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#shopify): Implement action.shopify:create_customer Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'shopify', operation: 'action.shopify:create_customer' });
  throw new Error('TODO[apps-script-backlog]: Implement action.shopify:create_customer. See docs/apps-script-rollout/backlog.md.');
}

action.shopify:create_order
function step_action_shopify_create_order(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#shopify): Implement action.shopify:create_order Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'shopify', operation: 'action.shopify:create_order' });
  throw new Error('TODO[apps-script-backlog]: Implement action.shopify:create_order. See docs/apps-script-rollout/backlog.md.');
}

action.shopify:create_product
function step_action_shopify_create_product(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#shopify): Implement action.shopify:create_product Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'shopify', operation: 'action.shopify:create_product' });
  throw new Error('TODO[apps-script-backlog]: Implement action.shopify:create_product. See docs/apps-script-rollout/backlog.md.');
}

action.shopify:fulfill_order
function step_action_shopify_fulfill_order(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#shopify): Implement action.shopify:fulfill_order Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'shopify', operation: 'action.shopify:fulfill_order' });
  throw new Error('TODO[apps-script-backlog]: Implement action.shopify:fulfill_order. See docs/apps-script-rollout/backlog.md.');
}

action.shopify:get_order
function step_action_shopify_get_order(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#shopify): Implement action.shopify:get_order Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'shopify', operation: 'action.shopify:get_order' });
  throw new Error('TODO[apps-script-backlog]: Implement action.shopify:get_order. See docs/apps-script-rollout/backlog.md.');
}

action.shopify:get_product
function step_action_shopify_get_product(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#shopify): Implement action.shopify:get_product Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'shopify', operation: 'action.shopify:get_product' });
  throw new Error('TODO[apps-script-backlog]: Implement action.shopify:get_product. See docs/apps-script-rollout/backlog.md.');
}

action.shopify:list_orders
function step_action_shopify_list_orders(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#shopify): Implement action.shopify:list_orders Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'shopify', operation: 'action.shopify:list_orders' });
  throw new Error('TODO[apps-script-backlog]: Implement action.shopify:list_orders. See docs/apps-script-rollout/backlog.md.');
}

action.shopify:list_products
function step_action_shopify_list_products(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#shopify): Implement action.shopify:list_products Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'shopify', operation: 'action.shopify:list_products' });
  throw new Error('TODO[apps-script-backlog]: Implement action.shopify:list_products. See docs/apps-script-rollout/backlog.md.');
}

action.shopify:test_connection
function step_action_shopify_test_connection(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#shopify): Implement action.shopify:test_connection Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'shopify', operation: 'action.shopify:test_connection' });
  throw new Error('TODO[apps-script-backlog]: Implement action.shopify:test_connection. See docs/apps-script-rollout/backlog.md.');
}

action.shopify:update_customer
function step_action_shopify_update_customer(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#shopify): Implement action.shopify:update_customer Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'shopify', operation: 'action.shopify:update_customer' });
  throw new Error('TODO[apps-script-backlog]: Implement action.shopify:update_customer. See docs/apps-script-rollout/backlog.md.');
}

action.shopify:update_inventory
function step_action_shopify_update_inventory(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#shopify): Implement action.shopify:update_inventory Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'shopify', operation: 'action.shopify:update_inventory' });
  throw new Error('TODO[apps-script-backlog]: Implement action.shopify:update_inventory. See docs/apps-script-rollout/backlog.md.');
}

action.shopify:update_order
function step_action_shopify_update_order(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#shopify): Implement action.shopify:update_order Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'shopify', operation: 'action.shopify:update_order' });
  throw new Error('TODO[apps-script-backlog]: Implement action.shopify:update_order. See docs/apps-script-rollout/backlog.md.');
}

action.shopify:update_product
function step_action_shopify_update_product(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#shopify): Implement action.shopify:update_product Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'shopify', operation: 'action.shopify:update_product' });
  throw new Error('TODO[apps-script-backlog]: Implement action.shopify:update_product. See docs/apps-script-rollout/backlog.md.');
}

trigger.shopify:customer_created
function trigger_trigger_shopify_customer_created(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#shopify): Implement trigger.shopify:customer_created Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'shopify', operation: 'trigger.shopify:customer_created' });
  throw new Error('TODO[apps-script-backlog]: Implement trigger.shopify:customer_created. See docs/apps-script-rollout/backlog.md.');
}

trigger.shopify:order_created
function trigger_trigger_shopify_order_created(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#shopify): Implement trigger.shopify:order_created Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'shopify', operation: 'trigger.shopify:order_created' });
  throw new Error('TODO[apps-script-backlog]: Implement trigger.shopify:order_created. See docs/apps-script-rollout/backlog.md.');
}

trigger.shopify:order_paid
function trigger_trigger_shopify_order_paid(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#shopify): Implement trigger.shopify:order_paid Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'shopify', operation: 'trigger.shopify:order_paid' });
  throw new Error('TODO[apps-script-backlog]: Implement trigger.shopify:order_paid. See docs/apps-script-rollout/backlog.md.');
}

trigger.shopify:order_updated
function trigger_trigger_shopify_order_updated(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#shopify): Implement trigger.shopify:order_updated Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'shopify', operation: 'trigger.shopify:order_updated' });
  throw new Error('TODO[apps-script-backlog]: Implement trigger.shopify:order_updated. See docs/apps-script-rollout/backlog.md.');
}

trigger.shopify:product_created
function trigger_trigger_shopify_product_created(ctx) {
  // TODO(APPS_SCRIPT_BACKLOG#shopify): Implement trigger.shopify:product_created Apps Script handler.
  logWarn('apps_script_builder_todo', { connector: 'shopify', operation: 'trigger.shopify:product_created' });
  throw new Error('TODO[apps-script-backlog]: Implement trigger.shopify:product_created. See docs/apps-script-rollout/backlog.md.');
}"
    `);
  });
});
