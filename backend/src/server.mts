import { Hono } from 'hono';
import app, { shouldWarmDb, warmDb } from './app.js';
import { errorHandler } from './middleware/error.js';
import { readRuntimeEnv } from './runtime-env.js';
import type { AppEnv } from './types/env.js';

const env = readRuntimeEnv();
const vercelApp = new Hono<AppEnv>();

vercelApp.all('*', async (c) => {
  if (shouldWarmDb(c.req.method, c.req.path)) await warmDb(env);
  return app.fetch(c.req.raw, env);
});

vercelApp.onError(errorHandler);

export default vercelApp;
