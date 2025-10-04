import assert from 'node:assert/strict';

import { ProcessSandboxExecutor } from '../ProcessSandboxExecutor';
import { SandboxResourceLimitError } from '../SandboxShared';

const executor = new ProcessSandboxExecutor();

const runSandbox = (code: string, limits: { maxCpuMs?: number; maxMemoryBytes?: number }) =>
  executor.run({
    code,
    entryPoint: 'run',
    params: null,
    context: null,
    timeoutMs: 5_000,
    secrets: [],
    resourceLimits: limits,
  });

{
  const busyLoop = `export async function run() {
  let value = 0;
  while (true) {
    value += Math.random();
  }
}`;

  await assert.rejects(
    () => runSandbox(busyLoop, { maxCpuMs: 150 }),
    (error: unknown) => {
      assert.ok(error instanceof SandboxResourceLimitError, 'should raise SandboxResourceLimitError');
      assert.equal(error.resource, 'cpu');
      return true;
    },
  );
}

{
  const memoryStress = `export async function run() {
  const allocations = [];
  while (true) {
    allocations.push(Buffer.alloc(8 * 1024 * 1024));
    await new Promise((resolve) => setImmediate(resolve));
  }
}`;

  await assert.rejects(
    () => runSandbox(memoryStress, { maxMemoryBytes: 64 * 1024 * 1024 }),
    (error: unknown) => {
      assert.ok(error instanceof SandboxResourceLimitError, 'should raise SandboxResourceLimitError');
      assert.equal(error.resource, 'memory');
      return true;
    },
  );
}
