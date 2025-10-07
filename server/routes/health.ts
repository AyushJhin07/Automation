import { Router } from 'express';

export const health = Router();

health.get('/health/app', (_req, res) => {
  res.json({
    success: true,
    app: {
      status: 'pass',
      build: process.env.GIT_SHA || 'dev',
    },
  });
});
