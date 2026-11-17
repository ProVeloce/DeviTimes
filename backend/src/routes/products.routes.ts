import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types/env.js';
import { createDb } from '../db/index.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import { productSchema, variantSchema } from '../validators/product.js';
import * as productService from '../services/product.service.js';
import { ok, fail } from '../utils/response.js';

const products = new Hono<AppEnv>();

/** Public routes — registered on parent router only (never behind authMiddleware). */
products.get('/test', (c) => ok(c, { module: 'products', status: 'ok' }, 'Products routes working'));

/** Protected routes — isolated sub-app so `use('*')` cannot affect public routes above. */
const secured = new Hono<AppEnv>();
secured.use('*', authMiddleware);

secured.get('/', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const result = await productService.listProducts(db, {
    page: Number(c.req.query('page')) || 1,
    limit: Number(c.req.query('limit')) || 50,
    search: c.req.query('search'),
    categoryId: c.req.query('categoryId'),
    lowStock: c.req.query('lowStock') === 'true',
  });
  return ok(c, result);
});

secured.get('/barcode/:code', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const result = await productService.getProductByBarcode(db, c.req.param('code'));
  if (!result) return fail(c, 'Product not found', 404);
  return ok(c, result);
});

secured.get('/:id', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const product = await productService.getProductById(db, c.req.param('id'));
  if (!product) return fail(c, 'Not found', 404);
  return ok(c, product);
});

secured.post('/', adminOnly, async (c) => {
  const raw = await c.req.json();
  const body = productSchema.parse(raw);
  const variants = raw.variants ? z.array(variantSchema).parse(raw.variants) : undefined;
  const db = createDb(c.env.DATABASE_URL);
  const product = await productService.createProduct(db, body, variants);
  return ok(c, product, 'Product created', 201);
});

secured.put('/:id', adminOnly, async (c) => {
  const body = productSchema.partial().parse(await c.req.json());
  const db = createDb(c.env.DATABASE_URL);
  const product = await productService.updateProduct(db, c.req.param('id'), body);
  return ok(c, product, 'Product updated');
});

secured.delete('/:id', adminOnly, async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  await productService.deleteProduct(db, c.req.param('id'));
  return ok(c, { success: true }, 'Product deactivated');
});

products.route('/', secured);

export default products;
