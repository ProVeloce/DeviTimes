import * as jose from 'jose';
import type { AppVariables } from '../types/env.js';

export type TokenPayload = AppVariables & { authVersion: number };

function getKey(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function signToken(
  payload: TokenPayload,
  secret: string,
  expiresIn: string
): Promise<string> {
  return new jose.SignJWT({ ...payload, purpose: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience('access')
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getKey(secret));
}

export async function verifyToken(token: string, secret: string): Promise<TokenPayload> {
  const { payload } = await jose.jwtVerify(token, getKey(secret));
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (
    (payload.purpose !== undefined && payload.purpose !== 'access') ||
    (payload.aud !== undefined && !audiences.includes('access'))
  ) {
    throw new Error('Invalid access token purpose');
  }
  return {
    userId: payload.userId as string,
    email: payload.email as string,
    role: payload.role as 'ADMIN' | 'CASHIER',
    name: payload.name as string,
    authVersion: typeof payload.authVersion === 'number' ? payload.authVersion : 0,
  };
}

export async function signMfaChallengeToken(
  userId: string,
  challengeId: string,
  secret: string
): Promise<string> {
  return new jose.SignJWT({ purpose: 'mfa-login' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setJti(challengeId)
    .setAudience('mfa-login')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(getKey(secret));
}

export async function verifyMfaChallengeToken(
  token: string,
  secret: string
): Promise<{ userId: string; challengeId: string }> {
  const { payload } = await jose.jwtVerify(token, getKey(secret), {
    audience: 'mfa-login',
  });
  if (
    payload.purpose !== 'mfa-login' ||
    typeof payload.sub !== 'string' ||
    typeof payload.jti !== 'string'
  ) {
    throw new Error('Invalid MFA challenge token');
  }
  return { userId: payload.sub, challengeId: payload.jti };
}
