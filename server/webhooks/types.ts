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
  webhookId: string;
  appId: string;
  triggerId: string;
  payload: any;
  headers: Record<string, string>;
  timestamp: Date;
  signature?: string;
  processed: boolean;
  workflowId?: string;
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

export interface TriggerDedupeState {
  tokens: string[];
  cursor?: string;
  lastEventAt?: string;
}
