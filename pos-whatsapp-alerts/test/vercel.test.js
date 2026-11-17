import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.ALERTS_AUTH_TOKEN = 'a'.repeat(32);
process.env.CRON_SECRET = 'c'.repeat(16);
process.env.GREEN_API_ID_INSTANCE = 'test-instance';
process.env.GREEN_API_TOKEN_INSTANCE = 'test-token';
process.env.RECIPIENT_PHONE_NUMBER = '6385099015';

const { default: app } = await import('../src/vercel.js');

test('scheduled alert endpoint requires the Vercel Cron secret', async () => {
  const response = await app.request('/alerts/cron');

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'Unauthorized',
  });
});

test('manual alert endpoint requires its configured bearer token', async () => {
  const response = await app.request('/alerts/run', { method: 'POST' });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'Unauthorized',
  });
});
