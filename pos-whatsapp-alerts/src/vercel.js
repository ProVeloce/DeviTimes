import { timingSafeEqual } from 'node:crypto';
import pg from 'pg';
import { Hono } from 'hono';
import { createAlertService } from './alerts.js';

const { Pool } = pg;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function isAuthorized(authorization, token) {
  const expected = Buffer.from(`Bearer ${token}`);
  const provided = Buffer.from(authorization ?? '');
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

const env = {
  DATABASE_URL: requiredEnv('DATABASE_URL'),
  ALERTS_AUTH_TOKEN: requiredEnv('ALERTS_AUTH_TOKEN'),
  GREEN_API_ID_INSTANCE: requiredEnv('GREEN_API_ID_INSTANCE'),
  GREEN_API_TOKEN_INSTANCE: requiredEnv('GREEN_API_TOKEN_INSTANCE'),
  RECIPIENT_PHONE_NUMBER: requiredEnv('RECIPIENT_PHONE_NUMBER'),
};
const cronSecret = requiredEnv('CRON_SECRET');

if (env.ALERTS_AUTH_TOKEN.length < 32) {
  throw new Error('ALERTS_AUTH_TOKEN must be at least 32 characters long.');
}
if (cronSecret.length < 16) {
  throw new Error('CRON_SECRET must be at least 16 characters long.');
}

const pool = new Pool({ connectionString: env.DATABASE_URL });
const checkAndSendLowStockAlerts = createAlertService({ db: pool, env });
const app = new Hono();

app.get('/alerts/health', (c) => c.json({ success: true }));

app.get('/alerts/cron', async (c) => {
  if (!isAuthorized(c.req.header('authorization'), cronSecret)) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  try {
    return c.json({ success: true, ...(await checkAndSendLowStockAlerts()) });
  } catch (error) {
    console.error('[alerts] scheduled run failed', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Alert run failed',
    }, 500);
  }
});

app.post('/alerts/run', async (c) => {
  if (!isAuthorized(c.req.header('authorization'), env.ALERTS_AUTH_TOKEN)) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  try {
    return c.json({ success: true, ...(await checkAndSendLowStockAlerts()) });
  } catch (error) {
    console.error('[alerts] manual run failed', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Alert run failed',
    }, 500);
  }
});

export default app;
