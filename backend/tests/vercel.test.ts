import assert from 'node:assert/strict';
import test from 'node:test';

delete process.env.DATABASE_URL;
delete process.env.JWT_SECRET;
delete process.env.GOOGLE_DRIVE_CLIENT_ID;
delete process.env.GOOGLE_DRIVE_CLIENT_SECRET;
delete process.env.GOOGLE_LOGIN_ALLOWED_EMAIL;

const { default: app } = await import('../src/vercel.js');

test('Google login config does not require the database or JWT secret', async () => {
  const response = await app.request('/api/auth/google/config');

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    message: 'Success',
    data: { configured: false, clientId: null },
  });
});
