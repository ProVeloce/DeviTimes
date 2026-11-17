import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types/env.js';
import { createDb } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { categories } from '../db/schema/index.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import { newId } from '../utils/id.js';
import { ok } from '../utils/response.js';
import * as categoryService from '../services/category.service.js';

const categoryRoutes = new Hono<AppEnv>();

categoryRoutes.use('*', authMiddleware);

const categorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
});

categoryRoutes.get('/', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const rows = await categoryService.listCategories(db);
  return ok(c, rows);
});

categoryRoutes.post('/', adminOnly, async (c) => {
  const body = categorySchema.parse(await c.req.json());
  const db = createDb(c.env.DATABASE_URL);
  const now = new Date();
  const id = body.id ?? newId();
  const [existing] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  if (existing) return ok(c, existing);
  await db.insert(categories).values({ ...body, id, createdAt: now, updatedAt: now });
  const [row] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  return ok(c, row, 'Category created', 201);
});

categoryRoutes.put('/:id', adminOnly, async (c) => {
  const body = categorySchema.parse(await c.req.json());
  const db = createDb(c.env.DATABASE_URL);
  await db
    .update(categories)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(categories.id, c.req.param('id')));
  const [row] = await db.select().from(categories).where(eq(categories.id, c.req.param('id'))).limit(1);
  return ok(c, row, 'Category updated');
});

categoryRoutes.delete('/:id', adminOnly, async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  await db.delete(categories).where(eq(categories.id, c.req.param('id')));
  return ok(c, { success: true }, 'Category deleted');
});

export default categoryRoutes;
