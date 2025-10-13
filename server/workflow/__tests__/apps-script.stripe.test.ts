import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REAL_OPS } from '../compile-to-appsscript';
import { runSingleFixture } from '../appsScriptDryRunHarness';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'apps-script-fixtures');

describe('Apps Script Stripe REAL_OPS', () => {
  it('builds action.stripe:create_payment', () => {
    const builder = REAL_OPS['action.stripe:create_payment'];
    expect(builder).toBeDefined();
    expect(
      builder({
        amount: '55',
        currency: 'usd'
      })
    ).toMatchSnapshot();
  });
});

describe('Apps Script Stripe Tier-0 dry run', () => {
  it('creates a PaymentIntent with metadata persisted to context', async () => {
    const result = await runSingleFixture('stripe-create-payment-intent', fixturesDir);
    expect(result.success).toBe(true);
    expect(result.context.stripePaymentId).toBe('pi_12345');
    expect(result.context.stripePaymentMetadata).toEqual({
      order_id: 'ORD-55',
      customer: 'cus_123'
    });
    expect(result.context.stripePaymentIntent).toMatchObject({
      id: 'pi_12345',
      status: 'requires_payment_method',
      client_secret: 'pi_12345_secret_abc'
    });

    expect(result.httpCalls).toHaveLength(1);
    const call = result.httpCalls[0];
    expect(call.url).toBe('https://api.stripe.com/v1/payment_intents');
    expect(call.method).toBe('POST');
    expect(call.headers['authorization']).toBe('Bearer sk_test_fixture');
    expect(call.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(call.headers['stripe-account']).toBe('acct_12345');
    expect(call.headers['idempotency-key']).toMatch(/^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}$/i);
    expect(call.payload).toBe('amount=5500&currency=usd&payment_method_types[]=card');

    expect(result.context.stripePaymentIdempotencyKey).toBe(call.headers['idempotency-key']);
    expect(result.context.stripeAccountOverride).toBe('acct_12345');
  });
});
