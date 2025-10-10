const sharedQueueEnv = (() => {
  const base = {
    NODE_ENV: 'production',
    QUEUE_REDIS_HOST: process.env.QUEUE_REDIS_HOST ?? '127.0.0.1',
    QUEUE_REDIS_PORT: process.env.QUEUE_REDIS_PORT ?? '6379',
    QUEUE_REDIS_DB: process.env.QUEUE_REDIS_DB ?? '0',
    RUNTIME_APPS_SCRIPT_ENABLED: process.env.RUNTIME_APPS_SCRIPT_ENABLED ?? 'true',
  };

  if (process.env.QUEUE_REDIS_USERNAME) {
    base.QUEUE_REDIS_USERNAME = process.env.QUEUE_REDIS_USERNAME;
  }

  if (process.env.QUEUE_REDIS_PASSWORD) {
    base.QUEUE_REDIS_PASSWORD = process.env.QUEUE_REDIS_PASSWORD;
  }

  if (process.env.QUEUE_REDIS_TLS) {
    base.QUEUE_REDIS_TLS = process.env.QUEUE_REDIS_TLS;
  }

  return base;
})();

module.exports = {
  apps: [
    {
      name: 'api',
      script: './dist/index.js',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 5,
      env: {
        ...sharedQueueEnv,
      },
    },
    {
      name: 'worker',
      script: './dist/workers/execution.js',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 5,
      env: {
        ...sharedQueueEnv,
      },
    },
    {
      name: 'scheduler',
      script: './dist/workers/scheduler.js',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 5,
      env: {
        ...sharedQueueEnv,
      },
    },
    {
      name: 'timers',
      script: './dist/workers/timerDispatcher.js',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 5,
      env: {
        ...sharedQueueEnv,
      },
    },
    {
      name: 'encryption-rotation',
      script: './dist/workers/encryption-rotation.js',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 5,
      env: {
        ...sharedQueueEnv,
      },
    },
  ],
};
