import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkerHeartbeat } from '../useWorkerHeartbeat';

const authFetchMock = vi.fn();

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: any) => any) =>
    selector({
      authFetch: (...args: unknown[]) => authFetchMock(...args),
    }),
}));

const jsonResponse = (body: unknown, init?: ResponseInit): Response => {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
};

describe('useWorkerHeartbeat fallback handling', () => {
  beforeEach(() => {
    authFetchMock.mockReset();
  });

  it('falls back to the queue heartbeat endpoint on 403 and surfaces warnings', async () => {
    const staleHeartbeat = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    authFetchMock
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: { status: 'warn', message: 'Detected stale heartbeat' },
          worker: { id: 'exec-1', latestHeartbeatAt: staleHeartbeat },
          queueDepths: {
            default: { waiting: 2, delayed: 1, active: 0, paused: 0 },
          },
        }),
      );

    const { result } = renderHook(() => useWorkerHeartbeat({ poll: false }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(authFetchMock).toHaveBeenNthCalledWith(1, '/api/admin/workers/status');
    expect(authFetchMock).toHaveBeenNthCalledWith(2, '/api/production/queue/heartbeat');
    expect(result.current.error).toBeNull();
    expect(result.current.workers).toHaveLength(1);
    expect(result.current.workers[0].id).toBe('exec-1');
    expect(result.current.workers[0].queueDepth).toBe(3);
    expect(result.current.workers[0].isHeartbeatStale).toBe(true);
    expect(result.current.environmentWarnings).toHaveLength(1);
    expect(result.current.environmentWarnings[0].message).toBe('Detected stale heartbeat');
    expect(result.current.summary.staleWorkers).toBe(1);
    expect(result.current.summary.usesPublicHeartbeat).toBe(true);
    expect(result.current.summary.queueStatus).toBe('warn');
    expect(result.current.summary.queueDurable).toBeNull();
  });

  it('adds a stale heartbeat warning when the fallback reports a pass status', async () => {
    const staleHeartbeat = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    authFetchMock
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: { status: 'pass', message: 'Execution worker healthy' },
          worker: { id: 'exec-2', latestHeartbeatAt: staleHeartbeat },
          durable: true,
          queueDepths: {
            default: { waiting: 0, delayed: 0, active: 0, paused: 0 },
          },
        }),
      );

    const { result } = renderHook(() => useWorkerHeartbeat({ poll: false }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(authFetchMock).toHaveBeenNthCalledWith(1, '/api/admin/workers/status');
    expect(authFetchMock).toHaveBeenNthCalledWith(2, '/api/production/queue/heartbeat');
    expect(result.current.error).toBeNull();
    expect(result.current.workers).toHaveLength(1);
    expect(result.current.workers[0].id).toBe('exec-2');
    expect(result.current.workers[0].isHeartbeatStale).toBe(true);
    expect(result.current.environmentWarnings).toHaveLength(1);
    expect(result.current.environmentWarnings[0].id).toBe('queue-heartbeat-stale');
    expect(result.current.environmentWarnings[0].message).toBe(
      'Execution worker heartbeat is stale; check that the worker process is running.',
    );
    expect(result.current.summary.staleWorkers).toBe(1);
    expect(result.current.summary.queueStatus).toBe('pass');
    expect(result.current.summary.queueDurable).toBe(true);
    expect(result.current.summary.queueMessage).toBe('Execution worker healthy');
  });
});
