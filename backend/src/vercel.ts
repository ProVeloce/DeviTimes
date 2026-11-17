import { Hono } from 'hono';
import app, { warmDb } from './app.js';
import { errorHandler } from './middleware/error.js';
import { getRuntimeEnv } from './runtime-env.js';
import type { AppEnv } from './types/env.js';

const env = getRuntimeEnv();
const vercelApp = new Hono<AppEnv>();

vercelApp.all('*', async (c) => {
  await warmDb(env);
  return app.fetch(c.req.raw, env);
});

vercelApp.onError(errorHandler);

export default vercelApp;
