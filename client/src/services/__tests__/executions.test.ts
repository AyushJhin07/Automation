import assert from 'node:assert/strict';

import { authStore } from '@/store/authStore';
import { enqueueExecution, ExecutionEnqueueError } from '../executions';

const originalAuthFetch = authStore.getState().authFetch;

const resetAuthFetch = () => {
  authStore.setState({ authFetch: originalAuthFetch } as any);
};

try {
  await (async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    authStore.setState({
      authFetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ input, init });
        return new Response(
          JSON.stringify({ success: true, executionId: 'exec-123' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    } as any);

    const result = await enqueueExecution({
      workflowId: 'wf-1',
      triggerType: 'manual',
      initialData: { payload: true },
    });

    assert.equal(result.executionId, 'exec-123');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.input, '/api/executions');
    const body = calls[0]?.init?.body as string | undefined;
    assert.ok(body, 'request body should be defined');
    const parsed = JSON.parse(body ?? '{}');
    assert.deepEqual(parsed, {
      workflowId: 'wf-1',
      triggerType: 'manual',
      initialData: { payload: true },
    });
  })();

  await (async () => {
    authStore.setState({
      authFetch: async () =>
        new Response(
          JSON.stringify({
            success: false,
            error: 'EXECUTION_QUOTA_EXCEEDED',
            message: 'Quota reached',
            details: { quotaType: 'TASKS' },
          }),
          { status: 429, headers: { 'Content-Type': 'application/json' } },
        ),
    } as any);

    await assert.rejects(
      () =>
        enqueueExecution({
          workflowId: 'wf-2',
          triggerType: 'manual',
          initialData: null,
        }),
      (error: unknown) => {
        assert.ok(error instanceof ExecutionEnqueueError, 'error should be ExecutionEnqueueError');
        const enqueueError = error as ExecutionEnqueueError;
        assert.equal(enqueueError.status, 429);
        assert.equal(enqueueError.code, 'EXECUTION_QUOTA_EXCEEDED');
        assert.equal(enqueueError.message, 'Quota reached');
        assert.deepEqual(enqueueError.details, { quotaType: 'TASKS' });
        return true;
      },
    );
  })();
} finally {
  resetAuthFetch();
}

