import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type DevStackResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..', '..');
const scriptPath = join(repoRoot, 'scripts', 'dev-stack.ts');

async function runDevStack(env: NodeJS.ProcessEnv): Promise<DevStackResult> {
  const child = spawn(process.execPath, ['--loader', 'tsx', scriptPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  child.stdout?.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const [code, signal] = (await once(child, 'exit')) as [number | null, NodeJS.Signals | null];
  const exitCode = typeof code === 'number' ? code : signal ? 1 : 0;

  return { exitCode, stdout, stderr };
}

describe('dev-stack queue guard', () => {
  it('exits with guidance when QUEUE_DRIVER resolves to inmemory', async () => {
    const result = await runDevStack({
      NODE_ENV: 'development',
      QUEUE_DRIVER: 'inmemory',
      SKIP_DB_VALIDATION: 'true',
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('QUEUE_DRIVER=inmemory');
    expect(result.stderr).toContain('dev:stack requires a durable BullMQ queue driver');
    expect(result.stderr).toContain('Resolved Redis target');
  });
});
