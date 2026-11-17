import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Secret, TOTP } from 'otpauth';
import { AppError } from '../utils/response.js';

const TOTP_PERIOD_SECONDS = 30;
export const MAX_MFA_FAILURES = 5;
export const MFA_LOCKOUT_MS = 15 * 60 * 1000;

export function nextMfaFailure(failureCount: number, now: Date) {
  const attempts = failureCount + 1;
  return {
    attempts,
    lockedUntil: attempts >= MAX_MFA_FAILURES
      ? new Date(now.getTime() + MFA_LOCKOUT_MS)
      : null,
  };
}

function getEncryptionKey(encodedKey: string | undefined): Buffer {
  const value = encodedKey?.trim();
  if (!value) {
    throw new AppError('MFA_ENCRYPTION_KEY is not configured on the server.', 503);
  }

  const key = Buffer.from(value, 'base64');
  if (
    key.length !== 32 ||
    key.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')
  ) {
    throw new AppError('MFA_ENCRYPTION_KEY must be a base64-encoded 32-byte key.', 503);
  }
  return key;
}

export function encryptMfaSecret(secret: string, encodedKey: string | undefined): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(encodedKey), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptMfaSecret(encryptedSecret: string, encodedKey: string | undefined): string {
  const [encodedIv, encodedTag, encodedData, ...extra] = encryptedSecret.split('.');
  if (!encodedIv || !encodedTag || !encodedData || extra.length > 0) {
    throw new AppError('The stored MFA secret is invalid. Contact an administrator.', 503);
  }

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      getEncryptionKey(encodedKey),
      Buffer.from(encodedIv, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedData, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      'The MFA secret could not be decrypted. Check that MFA_ENCRYPTION_KEY has not changed.',
      503
    );
  }
}

export function createTotpEnrollment(label: string) {
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer: 'Devi Times',
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: TOTP_PERIOD_SECONDS,
    secret,
  });
  return { secret: secret.base32, otpauthUrl: totp.toString() };
}

export function verifyTotp(
  secretBase32: string,
  code: string,
  now = Date.now(),
  lastUsedStep = -1
): number | null {
  if (!/^\d{6}$/.test(code)) return null;

  const delta = new TOTP({
    issuer: 'Devi Times',
    algorithm: 'SHA1',
    digits: 6,
    period: TOTP_PERIOD_SECONDS,
    secret: Secret.fromBase32(secretBase32),
  }).validate({
    token: code,
    window: 1,
    timestamp: now,
    afterCounter: lastUsedStep,
  });
  if (delta === null) return null;

  const step = Math.floor(now / (TOTP_PERIOD_SECONDS * 1000)) + delta;
  return step > lastUsedStep ? step : null;
}

export function createRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () =>
    randomBytes(10).toString('hex').toUpperCase().match(/.{1,4}/g)!.join('-')
  );
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256')
    .update(code.replace(/[\s-]/g, '').toUpperCase())
    .digest('hex');
}

export function consumeRecoveryCode(
  storedHashes: string[],
  code: string
): string[] | null {
  const candidate = Buffer.from(hashRecoveryCode(code), 'hex');
  let matchedIndex = -1;

  storedHashes.forEach((hash, index) => {
    const stored = Buffer.from(hash, 'hex');
    const matches =
      stored.length === candidate.length && timingSafeEqual(stored, candidate);
    if (matches) matchedIndex = index;
  });

  if (matchedIndex < 0) return null;
  return storedHashes.filter((_, index) => index !== matchedIndex);
}
