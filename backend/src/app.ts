import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv } from './types/env.js';
import { errorHandler } from './middleware/error.js';
import { createDb } from './db/index.js';
import { ensureDefaultSettings } from './services/settings.service.js';
import { ok } from './utils/response.js';

import authRoutes from './routes/auth.routes.js';
import productsRoutes from './routes/products.routes.js';
import invoicesRoutes from './routes/invoices.routes.js';
import inventoryRoutes from './routes/inventory.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import categoriesRoutes from './routes/categories.routes.js';
import customersRoutes from './routes/customers.routes.js';
import setupRoutes from './routes/setup.routes.js';
import backupRoutes from './routes/backup.routes.js';

const app = new Hono<AppEnv>();

app.use('*', logger());
app.use('*', secureHeaders());

app.use('*', async (c, next) => {
  const origins = (c.env.CORS_ORIGIN ?? 'http://localhost:5173,app://-').split(',');
  return cors({
    origin: (origin) => {
      if (!origin) return origins[0] ?? '*';
      if (origins.includes(origin) || origins.includes('*')) return origin;
      if (origin.startsWith('app://') || origin.startsWith('file://')) return origin;
      return origins[0] ?? origin;
    },
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  })(c, next);
});

app.onError(errorHandler);

// ─── Root & health (no /api prefix) ───────────────────────────────────────────
app.get('/', (c) =>
  c.json({
    success: true,
    message: 'Billing API Running Successfully',
    data: null,
  })
);

app.get('/health', (c) =>
  c.json({
    success: true,
    message: 'API Healthy',
    data: { status: 'running' },
  })
);

// ─── API route groups ─────────────────────────────────────────────────────────
app.get('/api/health', (c) =>
  ok(c, {
    status: 'running',
    service: 'Devi Times API',
    runtime: 'node',
  })
);

app.route('/api/auth', authRoutes);
app.route('/api/products', productsRoutes);
app.route('/api/invoices', invoicesRoutes);
app.route('/api/inventory', inventoryRoutes);
app.route('/api/reports', reportsRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/categories', categoriesRoutes);
app.route('/api/customers', customersRoutes);
app.route('/api/setup', setupRoutes);
app.route('/api/backup', backupRoutes);

app.notFound((c) =>
  c.json({ success: false, message: 'Route not found', data: null }, 404)
);

export default app;

const databaseIndependentPaths = new Set([
  '/',
  '/health',
  '/api/health',
  '/api/auth/test',
  '/api/auth/google/config',
  '/api/auth/google/email-verification/config',
]);

export function shouldWarmDb(method: string, path: string): boolean {
  return method !== 'OPTIONS' && !databaseIndependentPaths.has(path);
}

let settingsReady: Promise<void> | null = null;

export async function warmDb(env: AppEnv['Bindings']) {
  if (!settingsReady) {
    const db = createDb(env.DATABASE_URL);
    settingsReady = ensureDefaultSettings(db)
      .catch((error: unknown) => {
        settingsReady = null;
        throw error;
      });
  }
  await settingsReady;
}
