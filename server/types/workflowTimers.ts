export interface WorkflowResumeState {
  nodeOutputs: Record<string, any>;
  prevOutput: any;
  remainingNodeIds?: string[];
  nextNodeId?: string | null;
  startedAt?: string;
}

export interface WorkflowTimerMetadata {
  reason: 'delay' | string;
  nodeId: string;
  delayMs: number;
}

export interface WorkflowTimerPayload {
  workflowId: string;
  organizationId?: string;
  userId?: string;
  executionId: string;
  initialData: any;
  resumeState: WorkflowResumeState;
  triggerType?: string;
  metadata: WorkflowTimerMetadata;
}
