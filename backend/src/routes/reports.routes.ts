import { Hono } from 'hono';
import type { AppEnv } from '../types/env.js';
import { createDb } from '../db/index.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import * as reportService from '../services/report.service.js';
import { ok } from '../utils/response.js';

const reports = new Hono<AppEnv>();

reports.use('*', authMiddleware);
reports.use('*', adminOnly);

reports.get('/sales', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const report = await reportService.getSalesReport(
    db,
    c.req.query('from'),
    c.req.query('to')
  );
  return ok(c, report);
});

reports.get('/gst', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const report = await reportService.getGstReport(db, c.req.query('from'), c.req.query('to'));
  return ok(c, report);
});

reports.get('/inventory', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const report = await reportService.getInventoryReport(db);
  return ok(c, report);
});

reports.get('/sales/export', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const { invoices } = await reportService.getSalesReport(
    db,
    c.req.query('from'),
    c.req.query('to')
  );
  const csv = reportService.salesReportToCsv(invoices);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename=sales-report.csv',
    },
  });
});

export default reports;
