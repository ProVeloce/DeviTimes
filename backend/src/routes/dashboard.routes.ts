import { Hono } from 'hono';
import type { AppEnv } from '../types/env.js';
import { createDb } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { getDashboardStats } from '../services/dashboard.service.js';
import { ok } from '../utils/response.js';

const dashboard = new Hono<AppEnv>();

dashboard.use('*', authMiddleware);

dashboard.get('/stats', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const stats = await getDashboardStats(db);
  return ok(c, stats);
});

export default dashboard;
