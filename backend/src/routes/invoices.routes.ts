import { Hono } from 'hono';
import type { AppEnv } from '../types/env.js';
import { createDb } from '../db/index.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import { createInvoiceSchema } from '../validators/invoice.js';
import * as invoiceService from '../services/invoice.service.js';
import { ok, fail } from '../utils/response.js';

const invoices = new Hono<AppEnv>();

invoices.use('*', authMiddleware);

invoices.get('/', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const result = await invoiceService.listInvoices(db, {
    page: Number(c.req.query('page')) || 1,
    limit: Number(c.req.query('limit')) || 20,
    from: c.req.query('from'),
    to: c.req.query('to'),
    search: c.req.query('search'),
  });
  return ok(c, result);
});

invoices.get('/:id/pdf', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const invoice = await invoiceService.getInvoice(db, c.req.param('id'));
  return ok(c, invoice, 'Use Electron client for PDF/thermal generation');
});

invoices.get('/:id', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const invoice = await invoiceService.getInvoice(db, c.req.param('id'));
  return ok(c, invoice);
});

invoices.post('/', async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return fail(c, 'Invalid JSON body', 400);
  }

  console.log('[POST /api/invoices] payload received');

  const parsed = createInvoiceSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn('[POST /api/invoices] validation failed', parsed.error.flatten().fieldErrors);
    return c.json(
      {
        success: false,
        message: 'Validation failed',
        data: null,
        errors: parsed.error.flatten(),
        details: parsed.error.flatten().fieldErrors,
      },
      400
    );
  }

  const db = createDb(c.env.DATABASE_URL);
  const invoice = await invoiceService.createInvoice(db, c.get('userId'), parsed.data);
  return ok(c, invoice, 'Invoice created', 201);
});

invoices.post('/:id/cancel', adminOnly, async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const invoice = await invoiceService.cancelInvoice(db, c.req.param('id'), c.get('userId'));
  return ok(c, invoice, 'Invoice cancelled');
});

export default invoices;
