import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types/env.js';
import { createDb } from '../db/index.js';
import {
  loginSchema,
  createUserSchema,
  changeEmailSchema,
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

auth.get('/google/email-verification/config', (c) =>
  ok(c, authService.getGoogleEmailVerificationConfiguration({
    clientId: c.env.GOOGLE_DRIVE_CLIENT_ID,
    clientSecret: c.env.GOOGLE_DRIVE_CLIENT_SECRET,
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
  return ok(
    c,
    result,
    'mfaRequired' in result ? 'MFA verification required' : 'Google sign-in successful'
  );
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
  return ok(c, result, 'mfaRequired' in result ? 'MFA verification required' : 'Login successful');
});

auth.post('/mfa/verify', async (c) => {
  if (!c.env.JWT_SECRET) {
    return fail(c, 'Server configuration error: JWT_SECRET is not set', 500);
  }
  const body = z.object({
    challengeToken: z.string().min(1).max(4096),
    code: z.string().min(1).max(64),
  }).parse(await c.req.json());
  const db = createDb(c.env.DATABASE_URL);
  const result = await authService.completeMfaLogin(
    db,
    body.challengeToken,
    body.code,
    c.env.JWT_SECRET,
    c.env.JWT_EXPIRES_IN ?? '7d',
    c.env.MFA_ENCRYPTION_KEY
  );
  return ok(c, result, 'MFA verification successful');
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

auth.post('/mfa/enrollment', authMiddleware, adminOnly, async (c) => {
  const body = z.object({ currentPassword: z.string().min(1).max(128) }).parse(await c.req.json());
  const db = createDb(c.env.DATABASE_URL);
  const enrollment = await authService.beginMfaEnrollment(
    db,
    c.get('userId'),
    body.currentPassword,
    c.env.MFA_ENCRYPTION_KEY
  );
  return ok(c, enrollment, 'MFA setup started');
});

auth.post('/mfa/enable', authMiddleware, adminOnly, async (c) => {
  const body = z.object({ code: z.string().length(6) }).parse(await c.req.json());
  const db = createDb(c.env.DATABASE_URL);
  const result = await authService.confirmMfaEnrollment(
    db,
    c.get('userId'),
    body.code,
    c.env.JWT_SECRET,
    c.env.JWT_EXPIRES_IN ?? '7d',
    c.env.MFA_ENCRYPTION_KEY
  );
  return ok(c, result, 'MFA enabled. Save your recovery codes now.');
});

auth.post('/mfa/disable', authMiddleware, adminOnly, async (c) => {
  const body = z.object({
    currentPassword: z.string().min(1).max(128),
    code: z.string().length(6),
  }).parse(await c.req.json());
  const db = createDb(c.env.DATABASE_URL);
  if (!c.env.JWT_SECRET) {
    return fail(c, 'Server configuration error: JWT_SECRET is not set', 500);
  }
  const result = await authService.disableMfa(
    db,
    c.get('userId'),
    body.currentPassword,
    body.code,
    c.env.JWT_SECRET,
    c.env.JWT_EXPIRES_IN ?? '7d',
    c.env.MFA_ENCRYPTION_KEY
  );
  return ok(c, result, 'MFA disabled');
});

auth.put('/me/email', authMiddleware, async (c) => {
  if (!c.env.JWT_SECRET) {
    return fail(c, 'Server configuration error: JWT_SECRET is not set', 500);
  }
  const body = changeEmailSchema.parse(await c.req.json());
  const db = createDb(c.env.DATABASE_URL);
  const result = await authService.changeOwnEmail(
    db,
    c.get('userId'),
    {
      clientId: c.env.GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: c.env.GOOGLE_DRIVE_CLIENT_SECRET,
    },
    body,
    c.env.JWT_SECRET,
    c.env.JWT_EXPIRES_IN ?? '7d'
  );
  return ok(c, result, 'Login email updated');
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
