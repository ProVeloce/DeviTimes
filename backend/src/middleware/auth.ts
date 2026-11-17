import { createMiddleware } from 'hono/factory';
import { eq } from 'drizzle-orm';
import type { AppEnv } from '../types/env.js';
import { verifyToken, type TokenPayload } from '../auth/jwt.js';
import { createDb } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { fail } from '../utils/response.js';

export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return fail(c, 'Authentication required', 401);
  }

  const token = header.slice(7);
  const secret = c.env.JWT_SECRET;
  if (!secret) {
    return fail(c, 'Server configuration error', 500);
  }

  let payload: TokenPayload;
  try {
    payload = await verifyToken(token, secret);
  } catch {
    return fail(c, 'Invalid or expired token', 401);
  }

  const db = createDb(c.env.DATABASE_URL);
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      name: users.name,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1);
  if (!user || !user.isActive) {
    return fail(c, 'Account is inactive or no longer exists', 401);
  }
  if (payload.role !== user.role) {
    return fail(c, 'Your account role changed. Please sign in again.', 401);
  }

  c.set('userId', user.id);
  c.set('email', user.email);
  c.set('role', user.role);
  c.set('name', user.name);
  await next();
});

export const adminOnly = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('role') !== 'ADMIN') {
    return fail(c, 'Insufficient permissions', 403);
  }
  await next();
});
