import assert from 'node:assert/strict';
import { test } from 'node:test';

import { UsageMeteringService, type PlanLimits } from '../UsageMeteringService';
import type { BillingPlanProvider, BillingPlanDefinition } from '../BillingPlanService';
import { BillingProviderService, InMemoryBillingProviderAdapter, type MeteringEvent } from '../BillingProviderService';

type MinimalPlan = BillingPlanDefinition & { organizationLimits?: any };

const basePlan: MinimalPlan = {
  id: 'plan-pro',
  code: 'pro',
  name: 'Pro',
  priceCents: 10000,
  currency: 'usd',
  features: ['Priority support'],
  usageQuotas: {
    apiCalls: 1000,
    tokens: 10000,
    workflowRuns: 100,
    storage: 1024 * 1024,
  },
  organizationLimits: {
    maxWorkflows: 100,
    maxExecutions: 50000,
    maxUsers: 25,
    maxStorage: 25600,
    maxConcurrentExecutions: 10,
    maxExecutionsPerMinute: 300,
  },
  isActive: true,
};

class RecordingAdapter extends InMemoryBillingProviderAdapter {
  public getRecordedEvents(): MeteringEvent[] {
    return this.getEvents();
  }
}

const createService = () => {
  const plans: MinimalPlan[] = [basePlan];
  const planProvider: BillingPlanProvider = {
    async getPlan(code) {
      return plans.find((plan) => plan.code === code) ?? null;
    },
    async getUsagePlan(code) {
      return plans.find((plan) => plan.code === code) ?? basePlan;
    },
    async listPlans() {
      return plans;
    },
    async refresh() {
      return;
    },
  };

  const adapter = new RecordingAdapter();
  const billingProvider = new BillingProviderService(adapter);
  const dbStub = {
    update: () => ({
      set: () => ({
        where: async () => [],
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
        limit: async () => [],
        groupBy: () => ({
          orderBy: () => ({
            limit: async () => [],
          }),
        }),
      }),
    }),
    insert: () => ({
      values: async () => [],
    }),
  } as any;

  const service = new UsageMeteringService({
    planProvider,
    billingProvider,
    db: dbStub,
    now: () => new Date('2024-01-15T00:00:00Z'),
  });

  return { service, adapter };
};

test('calculateProratedCharge returns prorated cents based on activation date', async () => {
  const { service } = createService();
  const cents = await service.calculateProratedCharge({
    planCode: 'pro',
    activationDate: new Date('2024-01-16T00:00:00Z'),
    periodStart: new Date('2024-01-01T00:00:00Z'),
    periodEnd: new Date('2024-01-31T23:59:59Z'),
  });

  // Half-month usage should charge approximately half the monthly price.
  assert.equal(cents, 5000);
});

test('detectOverages emits metering events when usage exceeds plan limits', async () => {
  const { service, adapter } = createService();
  const plan = await (service as any).getPlanByCode('pro') as PlanLimits;

  await (service as any).detectOverages(
    {
      id: 'user-123',
      monthlyApiCalls: plan.apiCalls + 25,
      monthlyTokensUsed: plan.tokens + 4000,
    },
    plan,
    'org-1'
  );

  const events = adapter.getRecordedEvents().filter((event) => event.usageType === 'overage');
  assert.equal(events.length, 2);
  const apiEvent = events.find((event) => event.metadata?.resource === 'api_calls');
  const tokenEvent = events.find((event) => event.metadata?.resource === 'tokens');
  assert.ok(apiEvent);
  assert.ok(tokenEvent);
  assert.equal(apiEvent?.quantity, 25);
  assert.equal(tokenEvent?.quantity, 4000);
});

test('reconcileInvoices delegates to billing provider adapter', async () => {
  const { service, adapter } = createService();
  adapter.recordAdjustment({
    invoiceId: 'inv-1',
    amountDueCents: 1234,
    description: 'Overage adjustment',
    createdAt: new Date('2024-01-15T12:00:00Z'),
  });

  const adjustments = await service.reconcileInvoices();
  assert.equal(adjustments.length, 1);
  assert.equal(adjustments[0]?.amountDueCents, 1234);
});
