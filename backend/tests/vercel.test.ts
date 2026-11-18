import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

delete process.env.DATABASE_URL;
delete process.env.JWT_SECRET;
delete process.env.GOOGLE_DRIVE_CLIENT_ID;
delete process.env.GOOGLE_DRIVE_CLIENT_SECRET;
delete process.env.GOOGLE_LOGIN_ALLOWED_EMAIL;

const { default: app } = await import('../src/server.mjs');

test('Vercel deploys the backend with the PostgreSQL client container', async () => {
  const config = JSON.parse(
    await readFile(new URL('../../vercel.json', import.meta.url), 'utf8')
  );
  const dockerfile = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');

  assert.equal(config.services.backend.runtime, 'container');
  assert.equal(config.services.backend.entrypoint, 'Dockerfile');
  assert.equal(config.rewrites[0].destination.service, 'backend');
  assert.match(dockerfile, /postgresql-client-18/);
  assert.match(dockerfile, /PG_DUMP_PATH=\/usr\/lib\/postgresql\/18\/bin\/pg_dump/);
});

test('Google login config does not require the database or JWT secret', async () => {
  const response = await app.request('/api/auth/google/config');

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    message: 'Success',
    data: { configured: false, clientId: null },
  });
});
