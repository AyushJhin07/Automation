import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REAL_OPS } from '../compile-to-appsscript';
import { runSingleFixture } from '../appsScriptDryRunHarness';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'apps-script-fixtures');

describe('Apps Script HubSpot REAL_OPS', () => {
  const cases: Array<[string, Record<string, any>]> = [
    ['action.hubspot:create_contact', { email: '{{lead.email}}', firstname: '{{lead.firstName}}', lastname: 'Customer' }],
    ['action.hubspot:update_contact', { contactId: '12345', phone: '{{lead.phone}}' }],
    ['action.hubspot:get_contact', { email: '{{lead.email}}', properties: ['firstname', 'lastname'] }],
    ['action.hubspot:create_deal', { dealname: 'Q4 Renewal', amount: '15000' }],
    ['action.hubspot:update_deal', { dealId: '98765', dealstage: 'closedwon', amount: '17500' }],
    ['action.hubspot:update_deal_stage', { dealId: '98765', properties: { dealstage: 'presentationscheduled' } }],
    ['action.hubspot:get_deal', { dealId: '98765', properties: ['dealname', 'amount'] }],
    ['action.hubspot:create_company', { name: 'Acme Corp', domain: 'acme.example.com' }],
    ['action.hubspot:create_ticket', { subject: 'Onboarding help', content: 'Customer requested assistance.' }],
    [
      'action.hubspot:create_note',
      {
        hs_note_body: 'Follow up with {{lead.owner}}',
        associations: [
          {
            to: { id: '12345', type: 'contact' },
            types: [
              {
                associationCategory: 'HUBSPOT_DEFINED',
                associationTypeId: 280
              }
            ]
          }
        ]
      }
    ]
  ];

  for (const [operation, config] of cases) {
    it(`builds ${operation}`, () => {
      const builder = REAL_OPS[operation];
      expect(builder).toBeDefined();
      expect(builder(config)).toMatchSnapshot();
    });
  }
});

describe('Apps Script HubSpot Tier-0 dry run', () => {
  it('creates a contact and records the HubSpot contact details', async () => {
    const result = await runSingleFixture('hubspot-create-contact', fixturesDir);
    expect(result.success).toBe(true);
    expect(result.context.hubspotContactId).toBe('12345');
    expect(result.context.hubspotContact).toMatchObject({
      id: '12345',
      properties: {
        email: 'sam@example.com',
        firstname: 'Sam',
        lastname: 'Customer'
      }
    });

    expect(result.httpCalls).toHaveLength(1);
    const call = result.httpCalls[0];
    expect(call.url).toBe('https://api.hubapi.com/crm/v3/objects/contacts');
    expect(call.method).toBe('POST');
    expect(call.headers['authorization']).toBe('Bearer hs-access-token');
    expect(call.headers['accept']).toBe('application/json');
    expect(call.headers['content-type']).toBe('application/json');
    expect(call.payload).toEqual({
      properties: {
        email: 'sam@example.com',
        firstname: 'Sam',
        lastname: 'Customer'
      }
    });
  });
});
