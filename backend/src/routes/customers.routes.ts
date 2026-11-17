import { Hono } from 'hono';
import { z } from 'zod';
import { eq, ilike, or } from 'drizzle-orm';
import type { AppEnv } from '../types/env.js';
import { createDb } from '../db/index.js';
import { customers } from '../db/schema/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { newId } from '../utils/id.js';
import { ok } from '../utils/response.js';

const customerRoutes = new Hono<AppEnv>();

customerRoutes.use('*', authMiddleware);

const customerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  gstin: z.string().optional(),
});

customerRoutes.get('/', async (c) => {
  const search = c.req.query('search');
  const db = createDb(c.env.DATABASE_URL);
  const rows = search
    ? await db
        .select()
        .from(customers)
        .where(
          or(ilike(customers.name, `%${search}%`), ilike(customers.phone, `%${search}%`))
        )
        .limit(50)
    : await db.select().from(customers).limit(50);
  return ok(c, rows);
});

customerRoutes.post('/', async (c) => {
  const body = customerSchema.parse(await c.req.json());
  const db = createDb(c.env.DATABASE_URL);
  const now = new Date();
  const id = newId();
  await db.insert(customers).values({
    id,
    name: body.name,
    phone: body.phone,
    email: body.email || undefined,
    address: body.address,
    gstin: body.gstin,
    createdAt: now,
    updatedAt: now,
  });
  const [row] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return ok(c, row, 'Customer created', 201);
});

export default customerRoutes;
