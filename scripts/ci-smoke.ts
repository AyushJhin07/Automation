#!/usr/bin/env tsx
import { spawn } from 'node:child_process';
import process from 'node:process';

const baseEnv = {
  ...process.env,
  ENABLE_INLINE_WORKER: process.env.ENABLE_INLINE_WORKER ?? 'true',
  DISABLE_VITE: 'true',
  SKIP_WORKER_HEARTBEAT_CHECK: 'true',
  NODE_ENV: 'development',
};

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForHealth(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let lastError: Error | null = null;

  while (Date.now() < deadline) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        return;
      }
      lastError = new Error(`HTTP ${resp.status}`);
    } catch (err: any) {
      lastError = err;
    }
    await wait(1000);
  }
  throw lastError ?? new Error('Timed out waiting for health check');
}

async function runCommand(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', env: baseEnv });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

async function main() {
  const devProcess = spawn('npm', ['run', 'dev'], {
    env: baseEnv,
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  try {
    await waitForHealth('http://127.0.0.1:5000/api/production/queue/heartbeat', 60_000);
    await runCommand('npm', ['run', 'dev:bootstrap']);
    await runCommand('npm', ['run', 'dev:smoke']);
    await runCommand('npm', ['run', 'dev:webhook']);
    await runCommand('npm', ['run', 'dev:oauth']);
  } finally {
    devProcess.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('❌ CI smoke failed:', err?.message || err);
  process.exit(1);
});
