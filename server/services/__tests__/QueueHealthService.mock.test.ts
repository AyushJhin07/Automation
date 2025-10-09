import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('QueueHealthService (mock driver)', () => {
  beforeEach(() => {
    process.env.QUEUE_DRIVER = 'mock';
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.QUEUE_DRIVER;
    vi.resetModules();
  });

  it('reports a passing durable status when mock driver is active', async () => {
    const module = await import('../QueueHealthService.js');
    const status = await module.checkQueueHealth();

    expect(status.status).toBe('pass');
    expect(status.durable).toBe(true);
    expect(status.message).toContain('Mock queue driver');
  });

  it('allows readiness assertions to succeed with the mock driver', async () => {
    const module = await import('../QueueHealthService.js');
    await expect(
      module.assertQueueIsReady({ context: 'Mock driver readiness check' })
    ).resolves.toBeUndefined();
  });
});

