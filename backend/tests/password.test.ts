import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import {
  getDatabaseConnectionString,
  resolveCaCertificatePath,
} from '../src/db/connection.js';
import { hashPassword, needsPasswordRehash, verifyPassword } from '../src/utils/password.js';

test('hashes new passwords with Argon2id and verifies them', async () => {
  const hash = await hashPassword('7418956115');

  assert.match(hash, /^\$argon2id\$/);
  assert.equal(await verifyPassword('7418956115', hash), true);
  assert.equal(await verifyPassword('wrong-password', hash), false);
  assert.equal(needsPasswordRehash(hash), false);
});

test('requires full TLS verification and adds the configured CA file', () => {
  const connectionString = getDatabaseConnectionString(
    'postgresql://postgres:encoded%40password@db.example.com:5432/postgres?sslmode=require',
    'D:\\certs\\supabase-ca.crt'
  );
  const url = new URL(connectionString);

  assert.equal(url.searchParams.get('sslmode'), 'verify-full');
  assert.equal(url.searchParams.get('sslrootcert'), 'D:\\certs\\supabase-ca.crt');
  assert.equal(decodeURIComponent(url.password), 'encoded@password');
});

test('resolves a Windows CA path to the bundled Supabase certificate on Linux', () => {
  const certificatePath = resolveCaCertificatePath(
    'D:\\Billing\\DeviTimes\\backend\\certs\\prod-ca-2021.crt',
    'linux'
  );
  const connectionString = getDatabaseConnectionString(
    'postgresql://postgres:password@db.example.com:5432/postgres?sslmode=require',
    certificatePath
  );

  assert.equal(existsSync(certificatePath), true);
  assert.equal(new URL(connectionString).searchParams.get('sslmode'), 'verify-full');
  assert.equal(new URL(connectionString).searchParams.get('sslrootcert'), certificatePath);
});
