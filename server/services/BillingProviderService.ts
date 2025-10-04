export type MeteringEventType = 'api_calls' | 'tokens' | 'workflow_runs' | 'storage' | 'overage';

export interface MeteringEvent {
  eventId: string;
  userId: string;
  organizationId?: string;
  planCode: string;
  usageType: MeteringEventType;
  quantity: number;
  unitPriceCents: number;
  occurredAt: Date;
  metadata?: Record<string, unknown>;
}

export interface InvoiceAdjustment {
  invoiceId: string;
  amountDueCents: number;
  description: string;
  createdAt: Date;
  userId?: string;
  organizationId?: string;
  relatedEvents?: string[];
}

export interface BillingProviderAdapter {
  sendMeteringEvent(event: MeteringEvent): Promise<void>;
  fetchInvoiceAdjustments(since: Date): Promise<InvoiceAdjustment[]>;
}

export class InMemoryBillingProviderAdapter implements BillingProviderAdapter {
  private readonly events: MeteringEvent[] = [];
  private readonly adjustments: InvoiceAdjustment[] = [];

  async sendMeteringEvent(event: MeteringEvent): Promise<void> {
    this.events.push(event);
  }

  async fetchInvoiceAdjustments(since: Date): Promise<InvoiceAdjustment[]> {
    return this.adjustments.filter((adjustment) => adjustment.createdAt >= since);
  }

  public recordAdjustment(adjustment: InvoiceAdjustment): void {
    this.adjustments.push(adjustment);
  }

  public getEvents(): MeteringEvent[] {
    return [...this.events];
  }
}

export class BillingProviderService {
  private readonly listeners = new Set<(event: MeteringEvent) => void>();
  private lastReconciliationAt = new Date(0);

  constructor(private adapter: BillingProviderAdapter = new InMemoryBillingProviderAdapter()) {}

  public setAdapter(adapter: BillingProviderAdapter): void {
    this.adapter = adapter;
  }

  public onMeteringEvent(listener: (event: MeteringEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public async emitMeteringEvent(event: MeteringEvent): Promise<void> {
    await this.adapter.sendMeteringEvent(event);
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('❌ BillingProviderService listener error:', error);
      }
    }
  }

  public async reconcileInvoices(now = new Date()): Promise<InvoiceAdjustment[]> {
    const adjustments = await this.adapter.fetchInvoiceAdjustments(this.lastReconciliationAt);
    this.lastReconciliationAt = now;
    return adjustments;
  }
}

export const billingProviderService = new BillingProviderService();
