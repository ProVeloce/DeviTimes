import { Hono } from 'hono';
import type { AppEnv } from '../types/env.js';
import { createDb } from '../db/index.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import { stockAdjustSchema } from '../validators/product.js';
import * as productService from '../services/product.service.js';
import { ok, fail } from '../utils/response.js';

const inventory = new Hono<AppEnv>();

inventory.use('*', authMiddleware);

inventory.get('/history', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const result = await productService.listStockHistory(
    db,
    Number(c.req.query('page')) || 1,
    Number(c.req.query('limit')) || 50
  );
  return ok(c, result);
});

inventory.post('/adjust', adminOnly, async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return fail(c, 'Invalid JSON body', 400);
  }

  const parsed = stockAdjustSchema.safeParse(raw);
  if (!parsed.success) {
    const flattened = parsed.error.flatten();
    return c.json(
      {
        success: false,
        message: 'Validation failed',
        data: null,
        errors: flattened,
        details: flattened.fieldErrors,
      },
      400
    );
  }

  const db = createDb(c.env.DATABASE_URL);
  const payload = parsed.data;
  const newQty = await productService.adjustStock(
    db,
    {
      productId: payload.variantId ? undefined : payload.productId,
      variantId: payload.variantId,
      quantity: payload.quantity,
      type: payload.type,
      notes: payload.notes,
      clientRequestId: payload.clientRequestId,
    },
    c.get('userId')
  );
  return ok(c, { newQty }, 'Stock adjusted');
});

export default inventory;
