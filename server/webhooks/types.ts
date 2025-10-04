import type { DataRegion } from '../database/schema';

export interface WebhookTrigger {
  id: string;
  appId: string;
  triggerId: string;
  workflowId: string;
  endpoint: string;
  secret?: string;
  isActive: boolean;
  lastTriggered?: Date;
  metadata: Record<string, any>;
  organizationId?: string;
  userId?: string;
  region?: DataRegion;
}

export interface TriggerEvent {
  id?: string;
  webhookId: string;
  appId: string;
  triggerId: string;
  workflowId: string;
  payload: any;
  headers: Record<string, string>;
  timestamp: Date;
  signature?: string;
  processed: boolean;
  source: 'webhook' | 'polling';
  dedupeToken?: string;
  organizationId: string;
  userId?: string;
  region?: DataRegion;
}

export interface PollingTrigger {
  id: string;
  appId: string;
  triggerId: string;
  workflowId: string;
  interval: number;
  lastPoll?: Date;
  nextPoll: Date;
  nextPollAt: Date;
  isActive: boolean;
  dedupeKey?: string;
  metadata: Record<string, any>;
  cursor?: Record<string, any> | null;
  backoffCount?: number;
  lastStatus?: string | null;
  organizationId?: string;
  userId?: string;
  region?: DataRegion;
}
