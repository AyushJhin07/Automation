import { describe, expect, it } from 'vitest';

import { buildCoverageReport } from '../connector-runtime-status.js';
import type {
  RuntimeCapabilityOperationSummary,
  RuntimeCapabilitySummary,
} from '../../server/runtime/registry.js';

const operation = (
  config: Omit<RuntimeCapabilityOperationSummary, 'issues'>,
): RuntimeCapabilityOperationSummary => ({
  ...config,
  issues: [],
});

describe('connector runtime status coverage CSV', () => {
  it('matches the expected schema', () => {
    const capabilities: RuntimeCapabilitySummary[] = [
      {
        app: 'Alpha CRM',
        normalizedAppId: 'alpha_crm',
        actions: ['createRecord'],
        triggers: [],
        actionDetails: {
          create_record: operation({
            id: 'createRecord',
            normalizedId: 'create_record',
            kind: 'action',
            nativeRuntimes: ['node', 'appsScript'],
            fallbackRuntimes: [],
            resolvedRuntime: 'node',
            availability: 'native',
            enabledNativeRuntimes: ['node', 'appsScript'],
            enabledFallbackRuntimes: [],
            disabledNativeRuntimes: [],
            disabledFallbackRuntimes: [],
          }),
        },
        triggerDetails: {},
      },
      {
        app: 'Beta Support',
        normalizedAppId: 'beta_support',
        actions: ['createTicket'],
        triggers: ['onTicket'],
        actionDetails: {
          create_ticket: operation({
            id: 'createTicket',
            normalizedId: 'create_ticket',
            kind: 'action',
            nativeRuntimes: ['node'],
            fallbackRuntimes: [],
            resolvedRuntime: 'node',
            availability: 'native',
            enabledNativeRuntimes: ['node'],
            enabledFallbackRuntimes: [],
            disabledNativeRuntimes: [],
            disabledFallbackRuntimes: [],
          }),
        },
        triggerDetails: {
          on_ticket: operation({
            id: 'onTicket',
            normalizedId: 'on_ticket',
            kind: 'trigger',
            nativeRuntimes: ['node'],
            fallbackRuntimes: ['appsScript'],
            resolvedRuntime: 'node',
            availability: 'fallback',
            enabledNativeRuntimes: ['node'],
            enabledFallbackRuntimes: [],
            disabledNativeRuntimes: [],
            disabledFallbackRuntimes: ['appsScript'],
          }),
        },
      },
    ];

    const report = buildCoverageReport(capabilities);

    expect(report.csv).toMatchInlineSnapshot(`
"type,connector,normalized_connector,operation,normalized_operation,kind,node_available,node_enabled,apps_script_available,apps_script_enabled,apps_script_disabled,total_operations,apps_script_available_count,apps_script_enabled_count,apps_script_disabled_count\noperation,Alpha CRM,alpha_crm,createRecord,create_record,action,TRUE,TRUE,TRUE,TRUE,FALSE,,,,\nconnector_summary,Alpha CRM,alpha_crm,,,,,,,,,1,1,1,0\noperation,Beta Support,beta_support,createTicket,create_ticket,action,TRUE,TRUE,FALSE,FALSE,FALSE,,,,\noperation,Beta Support,beta_support,onTicket,on_ticket,trigger,TRUE,TRUE,TRUE,FALSE,TRUE,,,,\nconnector_summary,Beta Support,beta_support,,,,,,,,,2,1,0,1\n"`);
  });
});
