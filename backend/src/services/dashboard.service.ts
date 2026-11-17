import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import {
  invoices,
  invoiceItems,
  products,
  productVariants,
  customers,
  payments,
} from '../db/schema/index.js';
import { getSettingNumber } from './settings.service.js';

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export async function getDashboardStats(db: Database) {
  const todayStart = startOfDay();
  const monthStart = startOfMonth();

  const todayInvoices = await db
    .select({
      grandTotal: invoices.grandTotal,
      subtotal: invoices.subtotal,
      discount: invoices.discount,
    })
    .from(invoices)
    .where(and(gte(invoices.createdAt, todayStart), eq(invoices.status, 'COMPLETED')));

  const monthInvoices = await db
    .select({ grandTotal: invoices.grandTotal, createdAt: invoices.createdAt })
    .from(invoices)
    .where(and(gte(invoices.createdAt, monthStart), eq(invoices.status, 'COMPLETED')));

  const [{ totalOrders }] = await db
    .select({ totalOrders: sql<number>`count(*)::int` })
    .from(invoices)
    .where(eq(invoices.status, 'COMPLETED'));

  const recentRows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.status, 'COMPLETED'))
    .orderBy(desc(invoices.createdAt))
    .limit(8);

  const recentTransactions = await Promise.all(
    recentRows.map(async (inv) => {
      const paymentRows = await db.select().from(payments).where(eq(payments.invoiceId, inv.id));
      const [customer] = inv.customerId
        ? await db.select().from(customers).where(eq(customers.id, inv.customerId)).limit(1)
        : [null];
      return { ...inv, payments: paymentRows, customer };
    })
  );

  const todaySales = todayInvoices.reduce((s, i) => s + i.grandTotal, 0);
  const monthlySales = monthInvoices.reduce((s, i) => s + i.grandTotal, 0);

  const topProducts = await getTopSellingProducts(db, 5);
  const salesChart = await getSalesChart(db, 30);
  const profit = await estimateProfit(db, monthStart);
  const lowStockAlerts = await getLowStockItems(db, 10);
  const inventorySummary = await getInventorySummary(db);

  return {
    todaySales,
    monthlySales,
    totalOrders,
    profit,
    topProducts,
    lowStockAlerts,
    recentTransactions,
    salesChart,
    inventorySummary,
  };
}

async function getLowStockItems(db: Database, limit: number) {
  const threshold = await getSettingNumber(db, 'lowStockThreshold', 10);
  const allProducts = await db
    .select()
    .from(products)
    .where(eq(products.isActive, true))
    .limit(100);

  const alerts: Array<{
    id: string;
    name: string;
    code: string;
    stock: number;
    variant?: string;
  }> = [];

  for (const p of allProducts) {
    if (p.hasVariants) {
      const variants = await db
        .select()
        .from(productVariants)
        .where(and(eq(productVariants.productId, p.id), eq(productVariants.isActive, true)));
      for (const v of variants) {
        if (v.stockQuantity <= threshold) {
          alerts.push({
            id: v.id,
            name: p.name,
            code: v.sku,
            stock: v.stockQuantity,
            variant: [v.color, v.size].filter(Boolean).join(' / '),
          });
        }
      }
    } else if (p.stockQuantity <= threshold) {
      alerts.push({ id: p.id, name: p.name, code: p.code, stock: p.stockQuantity });
    }
    if (alerts.length >= limit) break;
  }

  return alerts.slice(0, limit);
}

async function getTopSellingProducts(db: Database, limit: number) {
  const rows = await db
    .select({
      itemCode: invoiceItems.itemCode,
      itemName: invoiceItems.itemName,
      quantitySold: sql<number>`sum(${invoiceItems.quantity})::int`,
    })
    .from(invoiceItems)
    .groupBy(invoiceItems.itemCode, invoiceItems.itemName)
    .orderBy(desc(sql`sum(${invoiceItems.quantity})`))
    .limit(limit);

  return rows.map((r) => ({
    code: r.itemCode,
    name: r.itemName,
    quantitySold: r.quantitySold,
  }));
}

async function getSalesChart(db: Database, days: number) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + 1);

  const invRows = await db
    .select({ grandTotal: invoices.grandTotal, createdAt: invoices.createdAt })
    .from(invoices)
    .where(
      and(
        gte(invoices.createdAt, start),
        lt(invoices.createdAt, end),
        eq(invoices.status, 'COMPLETED')
      )
    );

  const map = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    map.set(d.toISOString().slice(0, 10), 0);
  }

  for (const inv of invRows) {
    const key = inv.createdAt.toISOString().slice(0, 10);
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + inv.grandTotal);
  }

  return Array.from(map.entries()).map(([date, sales]) => ({ date, sales }));
}

async function estimateProfit(db: Database, since: Date) {
  const completedInvoices = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(gte(invoices.createdAt, since), eq(invoices.status, 'COMPLETED')));

  let revenue = 0;
  let cost = 0;

  for (const inv of completedInvoices) {
    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id));
    for (const item of items) {
      revenue += item.quantity * item.unitPrice;
      let purchasePrice = 0;

      if (item.variantId) {
        const [v] = await db
          .select({ purchasePrice: productVariants.purchasePrice, productId: productVariants.productId })
          .from(productVariants)
          .where(eq(productVariants.id, item.variantId))
          .limit(1);
        if (v) {
          const [p] = await db
            .select({ purchasePrice: products.purchasePrice })
            .from(products)
            .where(eq(products.id, v.productId))
            .limit(1);
          purchasePrice = v.purchasePrice ?? p?.purchasePrice ?? 0;
        }
      } else if (item.productId) {
        const [p] = await db
          .select({ purchasePrice: products.purchasePrice })
          .from(products)
          .where(eq(products.id, item.productId))
          .limit(1);
        purchasePrice = p?.purchasePrice ?? 0;
      }

      cost += item.quantity * purchasePrice;
    }
  }

  return Math.max(0, revenue - cost);
}

async function getInventorySummary(db: Database) {
  const [{ totalProducts }] = await db
    .select({ totalProducts: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.isActive, true));

  const [{ totalVariants }] = await db
    .select({ totalVariants: sql<number>`count(*)::int` })
    .from(productVariants)
    .where(eq(productVariants.isActive, true));

  const [{ totalUnits }] = await db
    .select({ totalUnits: sql<number>`coalesce(sum(${products.stockQuantity}), 0)::int` })
    .from(products)
    .where(and(eq(products.isActive, true), eq(products.hasVariants, false)));

  return { totalProducts, totalVariants, totalUnits };
}
