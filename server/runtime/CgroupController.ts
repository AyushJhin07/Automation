import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { SandboxResourceLimits } from './SandboxShared';

export interface ExecutionCgroup {
  readonly path: string;
  addProcess(pid: number): Promise<void>;
  cleanup(): Promise<void>;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

async function writeIfPresent(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, { encoding: 'utf8' });
}

export class CgroupController {
  private readonly root: string;
  private readonly cpuPeriodMicros: number;

  constructor(root: string, cpuPeriodMicros = 100_000) {
    this.root = path.resolve(root);
    this.cpuPeriodMicros = cpuPeriodMicros;
  }

  static isSupported(): boolean {
    return process.platform === 'linux';
  }

  static create(root: string | undefined | null, cpuPeriodMicros?: number): CgroupController | null {
    if (!root || !CgroupController.isSupported()) {
      return null;
    }
    const trimmed = root.trim();
    if (!trimmed) {
      return null;
    }
    return new CgroupController(trimmed, cpuPeriodMicros);
  }

  async createExecutionGroup(limits: SandboxResourceLimits): Promise<ExecutionCgroup | null> {
    if (!limits) {
      return null;
    }

    const hasCpuQuota = isFiniteNumber(limits.cpuQuotaMs) && limits.cpuQuotaMs! > 0;
    const hasMemoryLimit = isFiniteNumber(limits.maxMemoryBytes) && limits.maxMemoryBytes! > 0;

    if (!hasCpuQuota && !hasMemoryLimit) {
      return null;
    }

    const groupPath = path.join(this.root, `exec-${Date.now().toString(36)}-${randomUUID()}`);

    try {
      await fs.mkdir(groupPath, { recursive: true, mode: 0o755 });

      if (hasMemoryLimit) {
        const memoryMax = path.join(groupPath, 'memory.max');
        await writeIfPresent(memoryMax, `${Math.max(1, Math.floor(limits.maxMemoryBytes!))}`);
      }

      if (hasCpuQuota) {
        const quotaMicros = Math.max(1, Math.floor(limits.cpuQuotaMs! * 1000));
        const cpuMax = path.join(groupPath, 'cpu.max');
        await writeIfPresent(cpuMax, `${quotaMicros} ${this.cpuPeriodMicros}`);
      }

      const executionGroup: ExecutionCgroup = {
        path: groupPath,
        addProcess: async (pid: number) => {
          if (!Number.isInteger(pid) || pid <= 0) {
            return;
          }
          try {
            await writeIfPresent(path.join(groupPath, 'cgroup.procs'), `${pid}\n`);
          } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
              throw error;
            }
          }
        },
        cleanup: async () => {
          try {
            await fs.rm(groupPath, { recursive: true, force: true });
          } catch {
            // ignore cleanup failures
          }
        },
      };

      return executionGroup;
    } catch (error) {
      try {
        await fs.rm(groupPath, { recursive: true, force: true });
      } catch {
        // ignore cleanup failures when initialization fails
      }
      console.warn('[Sandbox] Failed to initialize cgroup', error);
      return null;
    }
  }
}
