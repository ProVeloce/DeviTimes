import { Hono } from 'hono';
import type { AppEnv } from '../types/env.js';
import { createDb } from '../db/index.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import { getSettings, updateSettings } from '../services/settings.service.js';
import { ok } from '../utils/response.js';

const settingsRoutes = new Hono<AppEnv>();

settingsRoutes.use('*', authMiddleware);

settingsRoutes.get('/', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const data = await getSettings(db);
  return ok(c, data);
});

settingsRoutes.put('/', adminOnly, async (c) => {
  const body = await c.req.json();
  const db = createDb(c.env.DATABASE_URL);
  const data = await updateSettings(db, body);
  return ok(c, data, 'Settings updated');
});

export default settingsRoutes;
