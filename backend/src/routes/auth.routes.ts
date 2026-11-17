import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types/env.js';
import { createDb } from '../db/index.js';
import {
  loginSchema,
  createUserSchema,
  updateProfileSchema,
  updateUserSchema,
} from '../validators/auth.js';
import * as authService from '../services/auth.service.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import { ok, fail } from '../utils/response.js';

const auth = new Hono<AppEnv>();

// ─── Public routes (this router has NO global authMiddleware) ───────────────
auth.get('/test', (c) => ok(c, { module: 'auth', status: 'ok' }, 'Auth routes working'));

auth.get('/google/config', (c) =>
  ok(c, authService.getGoogleLoginConfiguration({
    clientId: c.env.GOOGLE_DRIVE_CLIENT_ID,
    clientSecret: c.env.GOOGLE_DRIVE_CLIENT_SECRET,
    allowedEmail: c.env.GOOGLE_LOGIN_ALLOWED_EMAIL,
  }))
);

auth.post('/google', async (c) => {
  if (!c.env.JWT_SECRET) {
    return fail(c, 'Server configuration error: JWT_SECRET is not set', 500);
  }
  const body = z.object({ code: z.string().min(1).max(4096) }).parse(await c.req.json());
  const db = createDb(c.env.DATABASE_URL);
  const result = await authService.loginWithGoogle(
    db,
    {
      clientId: c.env.GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: c.env.GOOGLE_DRIVE_CLIENT_SECRET,
      allowedEmail: c.env.GOOGLE_LOGIN_ALLOWED_EMAIL,
    },
    body.code,
    c.env.JWT_SECRET,
    c.env.JWT_EXPIRES_IN ?? '7d'
  );
  return ok(c, result, 'Google sign-in successful');
});

auth.post('/login', async (c) => {
  if (!c.env.JWT_SECRET) {
    return fail(c, 'Server configuration error: JWT_SECRET is not set', 500);
  }
  const body = loginSchema.parse(await c.req.json());
  const db = createDb(c.env.DATABASE_URL);
  const result = await authService.login(
    db,
    body.username,
    body.password,
    c.env.JWT_SECRET,
    c.env.JWT_EXPIRES_IN ?? '7d'
  );
  return ok(c, result, 'Login successful');
});

// ─── Protected routes (per-route authMiddleware) ────────────────────────────
auth.get('/me', authMiddleware, async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const user = await authService.getUserProfile(db, c.get('userId'));
  return ok(c, { user });
});

auth.put('/me', authMiddleware, async (c) => {
  const body = updateProfileSchema.parse(await c.req.json());
  const db = createDb(c.env.DATABASE_URL);
  const user = await authService.updateOwnProfile(db, c.get('userId'), body);
  return ok(c, { user }, 'Profile updated');
});

auth.post('/logout', authMiddleware, (c) => ok(c, null, 'Logged out'));

auth.get('/users', authMiddleware, adminOnly, async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const users = await authService.listUsers(db);
  return ok(c, users);
});

auth.post('/users', authMiddleware, adminOnly, async (c) => {
  const body = createUserSchema.parse(await c.req.json());
  const db = createDb(c.env.DATABASE_URL);
  const user = await authService.createUser(db, body);
  return ok(c, user, 'User created', 201);
});

auth.put('/users/:id', authMiddleware, adminOnly, async (c) => {
  const body = updateUserSchema.parse(await c.req.json());
  const db = createDb(c.env.DATABASE_URL);
  const user = await authService.updateUser(db, c.req.param('id'), c.get('userId'), body);
  return ok(c, user, 'User updated');
});

auth.delete('/users/:id', authMiddleware, adminOnly, async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const result = await authService.deleteUser(db, c.req.param('id'), c.get('userId'));
  return ok(c, result, result.deleted ? 'User deleted' : 'User deactivated to preserve history');
});

export default auth;
