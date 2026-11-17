import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import {
  decryptRefreshToken,
  encryptRefreshToken,
  getGoogleDriveConfigurationStatus,
} from '../src/services/google-drive-backup.service.js';
import { buildPgDumpInvocation } from '../src/services/postgres-backup.service.js';

const encryptionKey = randomBytes(32).toString('base64');

test('Google Drive refresh tokens can be encrypted and decrypted', () => {
  const encrypted = encryptRefreshToken('refresh-token-value', encryptionKey);

  assert.notEqual(encrypted, 'refresh-token-value');
  assert.equal(decryptRefreshToken(encrypted, encryptionKey), 'refresh-token-value');
});

test('tampered or incorrectly keyed refresh tokens are rejected', () => {
  const encrypted = encryptRefreshToken('refresh-token-value', encryptionKey);
  const wrongKey = randomBytes(32).toString('base64');

  assert.throws(() => decryptRefreshToken(encrypted, wrongKey), /Could not decrypt/);
});

test('Google Drive is not reported configured unless all server credentials exist', () => {
  assert.deepEqual(
    getGoogleDriveConfigurationStatus({ clientId: 'client-id', clientSecret: 'client-secret' }),
    { configured: false, clientId: null }
  );
  assert.deepEqual(
    getGoogleDriveConfigurationStatus({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      tokenEncryptionKey: encryptionKey,
    }),
    { configured: true, clientId: 'client-id' }
  );
  assert.deepEqual(
    getGoogleDriveConfigurationStatus({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      tokenEncryptionKey: 'invalid-key',
    }),
    { configured: false, clientId: null }
  );
});

test('database dump uses the configured database and keeps credentials out of process arguments', () => {
  const certificatePath = 'C:\\certs\\prod-ca-2021.crt';
  const invocation = buildPgDumpInvocation(
    'postgresql://backup%40user:secret%3Avalue@db.example.test:5432/devitimes?sslmode=require',
    'C:\\PostgreSQL\\bin\\pg_dump.exe',
    certificatePath
  );

  assert.equal(invocation.executable, 'C:\\PostgreSQL\\bin\\pg_dump.exe');
  assert.deepEqual(invocation.args, [
    '--format=custom',
    '--schema=public',
    '--no-password',
    '--host',
    'db.example.test',
    '--port',
    '5432',
    '--username',
    'backup@user',
    '--dbname',
    'devitimes',
  ]);
  assert.equal(invocation.args.some((argument) => argument.includes('secret')), false);
  assert.equal(invocation.env.PGPASSWORD, 'secret:value');
  assert.equal(invocation.env.PGSSLMODE, 'verify-full');
  assert.equal(invocation.env.PGSSLROOTCERT, certificatePath);
});

test('database dump rejects malformed connection URLs without invoking a process', () => {
  assert.throws(
    () => buildPgDumpInvocation('not-a-postgres-url'),
    /DATABASE_URL must be a valid PostgreSQL connection URL/
  );
});
