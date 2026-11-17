import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { Secret, TOTP } from 'otpauth';
import { signMfaChallengeToken, verifyMfaChallengeToken, verifyToken } from '../src/auth/jwt.js';
import {
  consumeRecoveryCode,
  createRecoveryCodes,
  createTotpEnrollment,
  decryptMfaSecret,
  encryptMfaSecret,
  hashRecoveryCode,
  nextMfaFailure,
  verifyTotp,
} from '../src/security/mfa.js';

test('encrypted TOTP secrets round-trip and reject a changed key', () => {
  const key = randomBytes(32).toString('base64');
  const otherKey = randomBytes(32).toString('base64');
  const encrypted = encryptMfaSecret('JBSWY3DPEHPK3PXP', key);

  assert.notEqual(encrypted, 'JBSWY3DPEHPK3PXP');
  assert.equal(decryptMfaSecret(encrypted, key), 'JBSWY3DPEHPK3PXP');
  assert.throws(() => decryptMfaSecret(encrypted, otherKey), /MFA_ENCRYPTION_KEY/);
  assert.throws(() => encryptMfaSecret('secret', 'not-a-32-byte-key'), /32-byte key/);
});

test('TOTP verification enforces six digits and rejects replayed time steps', () => {
  const now = 1_800_000_000_000;
  const secret = new Secret({ size: 20 });
  const code = TOTP.generate({ secret, timestamp: now });
  const acceptedStep = verifyTotp(secret.base32, code, now);

  assert.equal(acceptedStep, Math.floor(now / 30_000));
  assert.equal(verifyTotp(secret.base32, code, now, acceptedStep ?? -1), null);
  assert.equal(verifyTotp(secret.base32, 'not-a-code', now), null);
  assert.equal(verifyTotp(secret.base32, '123', now), null);
});

test('recovery codes are hashed and consumed once', () => {
  const [code, unused] = createRecoveryCodes(2);
  const hashes = [hashRecoveryCode(code), hashRecoveryCode(unused)];

  assert.notEqual(hashes[0], code);
  assert.deepEqual(consumeRecoveryCode(hashes, ` ${code.toLowerCase()} `), [hashes[1]]);
  assert.equal(consumeRecoveryCode([hashes[1]], code), null);
});

test('MFA failures lock verification for fifteen minutes after five attempts', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  assert.deepEqual(nextMfaFailure(3, now), { attempts: 4, lockedUntil: null });
  assert.deepEqual(nextMfaFailure(4, now), {
    attempts: 5,
    lockedUntil: new Date('2026-01-01T00:15:00.000Z'),
  });
});

test('Google Authenticator enrollment URI and MFA challenge token are purpose-bound', async () => {
  const { secret, otpauthUrl } = createTotpEnrollment('admin@example.com');
  assert.match(otpauthUrl, /^otpauth:\/\/totp\//);
  assert.equal(Secret.fromBase32(secret).base32, secret);

  const signingKey = 'a-long-test-signing-secret-that-is-at-least-32-characters';
  const challenge = await signMfaChallengeToken('admin-id', 'challenge-id', signingKey);
  assert.deepEqual(await verifyMfaChallengeToken(challenge, signingKey), {
    userId: 'admin-id',
    challengeId: 'challenge-id',
  });
  await assert.rejects(verifyToken(challenge, signingKey), /purpose|audience/i);
});
