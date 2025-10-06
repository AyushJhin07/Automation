module.exports = {
  apps: [
    {
      name: 'api',
      script: './dist/index.js',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 5,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'worker',
      script: './dist/workers/execution.js',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 5,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'scheduler',
      script: './dist/workers/scheduler.js',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 5,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'timers',
      script: './dist/workers/timerDispatcher.js',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 5,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'encryption-rotation',
      script: './dist/workers/encryption-rotation.js',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 5,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
