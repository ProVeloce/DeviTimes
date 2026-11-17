import { Hono } from 'hono';
import app, { warmDb } from './app.js';
import { errorHandler } from './middleware/error.js';
import { readRuntimeEnv } from './runtime-env.js';
import type { AppEnv } from './types/env.js';

const env = readRuntimeEnv();
const vercelApp = new Hono<AppEnv>();
const databaseIndependentPaths = new Set([
  '/',
  '/health',
  '/api/health',
  '/api/auth/test',
  '/api/auth/google/config',
  '/api/auth/google/email-verification/config',
]);

vercelApp.all('*', async (c) => {
  if (c.req.method !== 'OPTIONS' && !databaseIndependentPaths.has(c.req.path)) {
    await warmDb(env);
  }
  return app.fetch(c.req.raw, env);
});

vercelApp.onError(errorHandler);

export default vercelApp;
