import * as jose from 'jose';
import type { AppVariables } from '../types/env.js';

export type TokenPayload = AppVariables;

export async function signToken(
  payload: TokenPayload,
  secret: string,
  expiresIn: string
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

export async function verifyToken(token: string, secret: string): Promise<TokenPayload> {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jose.jwtVerify(token, key);
  return {
    userId: payload.userId as string,
    email: payload.email as string,
    role: payload.role as 'ADMIN' | 'CASHIER',
    name: payload.name as string,
  };
}
