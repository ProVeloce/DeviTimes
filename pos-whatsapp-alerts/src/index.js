import 'dotenv/config';
import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import pg from 'pg';
import { createAlertService, nextDailyRun } from './alerts.js';

const { Pool } = pg;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const env = {
  DATABASE_URL: requiredEnv('DATABASE_URL'),
  ALERTS_AUTH_TOKEN: requiredEnv('ALERTS_AUTH_TOKEN'),
  GREEN_API_ID_INSTANCE: requiredEnv('GREEN_API_ID_INSTANCE'),
  GREEN_API_TOKEN_INSTANCE: requiredEnv('GREEN_API_TOKEN_INSTANCE'),
  RECIPIENT_PHONE_NUMBER: requiredEnv('RECIPIENT_PHONE_NUMBER'),
};
if (env.ALERTS_AUTH_TOKEN.length < 32) {
  throw new Error('ALERTS_AUTH_TOKEN must be at least 32 characters long.');
}
const port = Number(process.env.PORT ?? 8788);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const pool = new Pool({ connectionString: env.DATABASE_URL });
const checkAndSendLowStockAlerts = createAlertService({ db: pool, env });

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function hasValidToken(request) {
  const expected = Buffer.from(`Bearer ${env.ALERTS_AUTH_TOKEN}`);
  const provided = Buffer.from(request.headers.authorization ?? '');
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { success: true });
    return;
  }

  if (request.method !== 'POST' || url.pathname !== '/run') {
    sendJson(response, 404, { success: false, error: 'Not found' });
    return;
  }

  if (!hasValidToken(request)) {
    sendJson(response, 401, { success: false, error: 'Unauthorized' });
    return;
  }

  try {
    sendJson(response, 200, { success: true, ...(await checkAndSendLowStockAlerts()) });
  } catch (error) {
    console.error('[alerts] manual run failed', error);
    sendJson(response, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Alert run failed',
    });
  }
});

let scheduledRun;

function scheduleDailyRun() {
  const delay = Math.max(0, nextDailyRun().getTime() - Date.now());
  scheduledRun = setTimeout(async () => {
    try {
      await checkAndSendLowStockAlerts();
    } catch (error) {
      console.error('[alerts] scheduled run failed', error);
    } finally {
      scheduleDailyRun();
    }
  }, delay);
  scheduledRun.unref();
}

async function shutdown() {
  clearTimeout(scheduledRun);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

await pool.query('SELECT 1');
server.listen(port, process.env.HOST ?? '0.0.0.0', () => {
  console.log(`Low-stock alerts service listening on port ${port}`);
});
scheduleDailyRun();
