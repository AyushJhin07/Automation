#!/usr/bin/env tsx
import { spawn } from 'node:child_process';
import process from 'node:process';

const baseEnv = {
  ...process.env,
  ENABLE_INLINE_WORKER: process.env.ENABLE_INLINE_WORKER ?? 'true',
  DISABLE_VITE: 'true',
  SKIP_WORKER_HEARTBEAT_CHECK: 'true',
  NODE_ENV: 'development',
  GENERIC_EXECUTOR_ENABLED: process.env.GENERIC_EXECUTOR_ENABLED ?? 'true',
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

async function runCommand(cmd: string, args: string[], envOverrides: Record<string, string | undefined> = {}) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', env: { ...baseEnv, ...envOverrides } });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`));
    });
    child.on('error', reject);
  });
}

async function ensureSmokeCredentials(): Promise<{ token: string; orgId: string; userId: string }> {
  const email = process.env.DEV_BOOTSTRAP_EMAIL || 'developer@local.test';
  const password = process.env.DEV_BOOTSTRAP_PASSWORD || 'Devpassw0rd!';

  const authModule = await import('../server/services/AuthService.js');
  const authService = authModule.authService;

  let auth = await authService.login({ email, password });
  if (!auth.success) {
    const registration = await authService.register({ email, password, name: 'Local Developer' });
    if (!registration.success) {
      throw new Error(`Failed to register smoke user: ${registration.error ?? 'unknown error'}`);
    }
    auth = await authService.login({ email, password });
    if (!auth.success) {
      throw new Error(`Failed to login smoke user: ${auth.error ?? 'unknown error'}`);
    }
  }

  const token = auth.token;
  const userId = auth.user?.id;
  const orgId = auth.activeOrganization?.id;

  if (!token || !userId || !orgId) {
    throw new Error('Smoke user login did not return token or organization context');
  }

  return { token, orgId, userId };
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
    const { token, orgId, userId } = await ensureSmokeCredentials();
    const smokeBaseUrl = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:5000';
    await runCommand(
      'npm',
      ['run', 'smoke:supported'],
      {
        SMOKE_AUTH_TOKEN: token,
        SMOKE_ORGANIZATION_ID: orgId,
        SMOKE_USER_ID: userId,
        SMOKE_BASE_URL: smokeBaseUrl,
        GENERIC_EXECUTOR_ENABLED: 'true',
      },
    );
  } finally {
    devProcess.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('❌ CI smoke failed:', err?.message || err);
  process.exit(1);
});
