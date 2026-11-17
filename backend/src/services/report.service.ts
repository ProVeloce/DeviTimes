import { and, eq, gte, lte } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import {
  invoices,
  invoiceItems,
  payments,
  customers,
  products,
  productVariants,
  categories,
} from '../db/schema/index.js';

function parseRange(from?: string, to?: string) {
  const start = from ? new Date(from) : undefined;
  let end: Date | undefined;
  if (to) {
    end = new Date(to);
    end.setHours(23, 59, 59, 999);
  }
  return { start, end };
}

export async function getSalesReport(db: Database, from?: string, to?: string) {
  const { start, end } = parseRange(from, to);
  const conditions = [eq(invoices.status, 'COMPLETED')];
  if (start) conditions.push(gte(invoices.createdAt, start));
  if (end) conditions.push(lte(invoices.createdAt, end));

  const invRows = await db
    .select()
    .from(invoices)
    .where(and(...conditions))
    .orderBy(invoices.createdAt);

  const enriched = await Promise.all(
    invRows.map(async (inv) => {
      const paymentRows = await db.select().from(payments).where(eq(payments.invoiceId, inv.id));
      const [customer] = inv.customerId
        ? await db.select().from(customers).where(eq(customers.id, inv.customerId)).limit(1)
        : [null];
      return { ...inv, payments: paymentRows, customer };
    })
  );

  const totalSales = enriched.reduce((s, i) => s + i.grandTotal, 0);
  const totalGst = enriched.reduce((s, i) => s + i.gstAmount, 0);
  const totalDiscount = enriched.reduce((s, i) => s + i.discount, 0);

  const byPayment: Record<string, number> = {};
  for (const inv of enriched) {
    for (const p of inv.payments) {
      byPayment[p.mode] = (byPayment[p.mode] ?? 0) + p.amount;
    }
  }

  return {
    invoices: enriched,
    summary: {
      count: enriched.length,
      totalSales,
      totalGst,
      totalDiscount,
      byPayment,
    },
  };
}

export async function getGstReport(db: Database, from?: string, to?: string) {
  const { start, end } = parseRange(from, to);
  const invRows = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.status, 'COMPLETED'),
        ...(start ? [gte(invoices.createdAt, start)] : []),
        ...(end ? [lte(invoices.createdAt, end)] : [])
      )
    );

  const byRate: Record<number, { taxable: number; gst: number }> = {};
  let totalGst = 0;

  for (const inv of invRows) {
    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id));
    for (const item of items) {
      const rate = item.gstPercent;
      if (!byRate[rate]) byRate[rate] = { taxable: 0, gst: 0 };
      byRate[rate].gst += item.gstAmount;
      byRate[rate].taxable += item.lineTotal - item.gstAmount;
      totalGst += item.gstAmount;
    }
  }

  return { byRate, totalGst };
}

export async function getInventoryReport(db: Database) {
  const allProducts = await db
    .select()
    .from(products)
    .where(eq(products.isActive, true))
    .orderBy(products.name);

  const rows: Array<{
    code: string;
    name: string;
    variant: string;
    category?: string;
    stock: number;
    purchasePrice: number;
    sellingPrice: number;
    value: number;
  }> = [];

  for (const p of allProducts) {
    const [cat] = p.categoryId
      ? await db.select().from(categories).where(eq(categories.id, p.categoryId)).limit(1)
      : [null];

    if (p.hasVariants) {
      const variants = await db
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, p.id));
      for (const v of variants) {
        const pp = v.purchasePrice ?? p.purchasePrice;
        rows.push({
          code: v.sku,
          name: p.name,
          variant: [v.color, v.size].filter(Boolean).join(' / ') || '-',
          category: cat?.name,
          stock: v.stockQuantity,
          purchasePrice: pp,
          sellingPrice: v.sellingPrice,
          value: v.stockQuantity * pp,
        });
      }
    } else {
      rows.push({
        code: p.code,
        name: p.name,
        variant: '-',
        category: cat?.name,
        stock: p.stockQuantity,
        purchasePrice: p.purchasePrice,
        sellingPrice: p.sellingPrice,
        value: p.stockQuantity * p.purchasePrice,
      });
    }
  }

  return rows;
}

export function salesReportToCsv(
  invoices: Awaited<ReturnType<typeof getSalesReport>>['invoices']
): string {
  const header = 'Invoice,Date,Customer,Subtotal,GST,Discount,Total,Payment\n';
  const lines = invoices.map((inv) => {
    const date = inv.createdAt.toISOString();
    const customer = inv.customer?.name ?? 'Walk-in';
    const payment = inv.payments.map((p) => p.mode).join(';');
    return [
      inv.invoiceNumber,
      date,
      `"${customer}"`,
      inv.subtotal,
      inv.gstAmount,
      inv.discount,
      inv.grandTotal,
      payment,
    ].join(',');
  });
  return header + lines.join('\n');
}
