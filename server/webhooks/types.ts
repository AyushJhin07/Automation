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
}

export interface PollingTrigger {
  id: string;
  appId: string;
  triggerId: string;
  workflowId: string;
  interval: number;
  lastPoll?: Date;
  nextPoll: Date;
  isActive: boolean;
  dedupeKey?: string;
  metadata: Record<string, any>;
}
