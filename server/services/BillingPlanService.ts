import fs from 'node:fs/promises';
import path from 'node:path';

import {
  billingPlans,
  type BillingPlanUsageQuotas,
  type OrganizationLimits,
  db,
} from '../database/schema';

export interface BillingPlanDefinition {
  id?: string;
  code: string;
  name: string;
  priceCents: number;
  currency: string;
  features: string[];
  usageQuotas: BillingPlanUsageQuotas;
  organizationLimits?: OrganizationLimits | null;
  metadata?: Record<string, unknown> | null;
  billingProviderProductId?: string | null;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface BillingPlanProvider {
  getPlan(code: string): Promise<BillingPlanDefinition | null>;
  getUsagePlan(code: string): Promise<BillingPlanDefinition>;
  listPlans(includeInactive?: boolean): Promise<BillingPlanDefinition[]>;
  refresh(force?: boolean): Promise<void>;
}

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

export class BillingPlanService implements BillingPlanProvider {
  private readonly db = db;
  private cache = new Map<string, BillingPlanDefinition>();
  private lastLoaded = 0;
  private loading: Promise<void> | null = null;

  constructor(private readonly cacheTtlMs: number = DEFAULT_CACHE_TTL_MS) {}

  public async getPlan(code: string): Promise<BillingPlanDefinition | null> {
    await this.loadPlans();
    return this.cache.get(code) ?? null;
  }

  public async getUsagePlan(code: string): Promise<BillingPlanDefinition> {
    await this.loadPlans();
    const plan = this.cache.get(code) ?? this.cache.get('free');
    if (!plan) {
      throw new Error(`No billing plan definitions are available for code: ${code}`);
    }
    return plan;
  }

  public async listPlans(includeInactive = false): Promise<BillingPlanDefinition[]> {
    await this.loadPlans();
    return Array.from(this.cache.values()).filter((plan) => includeInactive || plan.isActive);
  }

  public async refresh(force = false): Promise<void> {
    await this.loadPlans(force);
  }

  private async loadPlans(force = false): Promise<void> {
    if (!force && this.cache.size > 0 && Date.now() - this.lastLoaded < this.cacheTtlMs) {
      return;
    }

    if (this.loading) {
      return this.loading;
    }

    this.loading = (async () => {
      await this.ensureSeedData();
      const rows = await this.db.select().from(billingPlans);
      this.cache = new Map(rows.map((row) => [row.code, this.mapRow(row)]));
      this.lastLoaded = Date.now();
      this.loading = null;
    })();

    return this.loading;
  }

  private mapRow(row: typeof billingPlans.$inferSelect): BillingPlanDefinition {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      priceCents: row.priceCents,
      currency: row.currency,
      features: Array.isArray(row.features) ? row.features : [],
      usageQuotas: row.usageQuotas as BillingPlanUsageQuotas,
      organizationLimits: (row.organizationLimits as OrganizationLimits | null) ?? undefined,
      metadata: row.metadata ?? undefined,
      billingProviderProductId: row.billingProviderProductId ?? undefined,
      isActive: row.isActive,
      createdAt: row.createdAt ?? undefined,
      updatedAt: row.updatedAt ?? undefined,
    } satisfies BillingPlanDefinition;
  }

  private async ensureSeedData(): Promise<void> {
    const [existing] = await this.db.select({ id: billingPlans.id }).from(billingPlans).limit(1);
    if (existing) {
      return;
    }

    const configPath = path.resolve(process.cwd(), 'configs/billing-plans.json');
    let contents: string;
    try {
      contents = await fs.readFile(configPath, 'utf-8');
    } catch (error) {
      console.warn(`⚠️ Billing plan configuration not found at ${configPath}.`);
      return;
    }

    const parsed = JSON.parse(contents) as Array<Omit<BillingPlanDefinition, 'isActive'>>;
    for (const plan of parsed) {
      await this.db.insert(billingPlans).values({
        code: plan.code,
        name: plan.name,
        priceCents: plan.priceCents,
        currency: plan.currency,
        features: plan.features,
        usageQuotas: plan.usageQuotas,
        organizationLimits: plan.organizationLimits ?? null,
        metadata: plan.metadata ?? null,
        billingProviderProductId: plan.billingProviderProductId ?? null,
        isActive: true,
      }).onConflictDoUpdate({
        target: billingPlans.code,
        set: {
          name: plan.name,
          priceCents: plan.priceCents,
          currency: plan.currency,
          features: plan.features,
          usageQuotas: plan.usageQuotas,
          organizationLimits: plan.organizationLimits ?? null,
          metadata: plan.metadata ?? null,
          billingProviderProductId: plan.billingProviderProductId ?? null,
          updatedAt: new Date(),
        },
      });
    }
  }
}

export const billingPlanService = new BillingPlanService();
