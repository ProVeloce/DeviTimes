import { Hono } from 'hono';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import type { AppEnv } from '../types/env.js';
import { createDb } from '../db/index.js';
import { users } from '../db/schema/index.js';
import * as authService from '../services/auth.service.js';
import { ensureDefaultSettings } from '../services/settings.service.js';
import { ensureDefaultCategories } from '../services/category.service.js';
import { ok, fail } from '../utils/response.js';

/** One-time database initialization (admin user + default settings). */
const setup = new Hono<AppEnv>();

const initializeSchema = z.object({
  setupKey: z.string().min(1),
  adminUsername: z.string().trim().min(1).max(100),
  adminPassword: z.string().min(6).max(128),
});

setup.post('/initialize', async (c) => {
  const body = initializeSchema.parse(await c.req.json());
  const expected = c.env.SETUP_KEY;

  if (!expected) {
    return fail(c, 'Setup is not configured on the server', 500);
  }

  if (body.setupKey !== expected) {
    return fail(c, 'Invalid setup key', 403);
  }

  const db = createDb(c.env.DATABASE_URL);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);

  if (count > 0) {
    return fail(c, 'Database already initialized', 409);
  }

  await ensureDefaultSettings(db);
  await ensureDefaultCategories(db);

  await authService.createUser(db, {
    email: body.adminUsername,
    password: body.adminPassword,
    name: 'Store Admin',
    role: 'ADMIN',
  });

  return ok(c, {
    adminUsername: body.adminUsername,
  }, 'Database initialized');
});

export default setup;
