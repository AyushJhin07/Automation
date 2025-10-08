import { authStore } from '@/store/authStore';

export type ExecutionTriggerType = string;

export type EnqueueExecutionParams = {
  workflowId: string;
  triggerType: ExecutionTriggerType;
  initialData: unknown;
};

export type EnqueueExecutionResult = {
  executionId: string;
};

export type ExecutionEnqueueErrorDetails = Record<string, any> | undefined;

export class ExecutionEnqueueError extends Error {
  status: number;
  code?: string;
  details?: ExecutionEnqueueErrorDetails;

  constructor(
    status: number,
    message: string,
    code?: string,
    details?: ExecutionEnqueueErrorDetails,
  ) {
    super(message);
    this.name = 'ExecutionEnqueueError';
    this.status = status;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, ExecutionEnqueueError.prototype);
  }
}

const extractExecutionId = (payload: Record<string, any>): string | undefined => {
  if (typeof payload?.executionId === 'string') {
    return payload.executionId;
  }

  if (typeof payload?.data?.executionId === 'string') {
    return payload.data.executionId;
  }

  return undefined;
};

export const enqueueExecution = async ({
  workflowId,
  triggerType,
  initialData,
}: EnqueueExecutionParams): Promise<EnqueueExecutionResult> => {
  const { authFetch } = authStore.getState();

  const response = await authFetch('/api/executions', {
    method: 'POST',
    body: JSON.stringify({ workflowId, triggerType, initialData }),
  });

  const result = (await response.json().catch(() => ({}))) as Record<string, any>;
  const executionId = extractExecutionId(result);

  if (!response.ok || result?.success === false || !executionId) {
    const message =
      typeof result?.message === 'string'
        ? result.message
        : typeof result?.error === 'string'
          ? result.error
          : `Failed to enqueue workflow execution (status ${response.status}).`;

    const code = typeof result?.error === 'string' ? result.error : undefined;
    const details = result?.details as ExecutionEnqueueErrorDetails;

    throw new ExecutionEnqueueError(response.status, message, code, details);
  }

  return { executionId };
};

