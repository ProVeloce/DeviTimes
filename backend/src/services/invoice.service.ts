import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import {
  invoices,
  invoiceItems,
  payments,
  customers,
  users,
  products,
  productVariants,
  stockHistory,
} from '../db/schema/index.js';
import { calcLineTotal, roundMoney } from '../utils/decimal.js';
import { generateInvoiceNumber } from './invoice-number.service.js';
import { newId } from '../utils/id.js';
import { AppError } from '../utils/response.js';
import type { CreateInvoiceInput } from '../validators/invoice.js';

export async function createInvoice(db: Database, userId: string, input: CreateInvoiceInput) {
  if (input.clientRequestId) {
    const [existing] = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.clientRequestId, input.clientRequestId), eq(invoices.userId, userId)))
      .limit(1);
    if (existing) return getInvoice(db, existing.id);
  }

  let customerId = input.customerId ?? null;

  if (!customerId && input.customerName) {
    const cid = newId();
    const now = new Date();
    await db.insert(customers).values({
      id: cid,
      name: input.customerName,
      phone: input.customerPhone,
      createdAt: now,
      updatedAt: now,
    });
    customerId = cid;
  }

  const lineItems = input.items.map((item) => {
    const discount = item.discount ?? 0;
    const gstPercent = item.gstPercent ?? 5;
    const { gstAmount, lineTotal } = calcLineTotal(
      item.quantity,
      item.unitPrice,
      discount,
      gstPercent
    );
    return { ...item, discount, gstPercent, gstAmount, lineTotal };
  });

  const subtotal = roundMoney(lineItems.reduce((s, i) => s + i.lineTotal - i.gstAmount, 0));
  const gstAmount = roundMoney(lineItems.reduce((s, i) => s + i.gstAmount, 0));
  const billDiscount = input.discount ?? 0;
  const grandTotal = roundMoney(subtotal + gstAmount - billDiscount);

  const paymentTotal = roundMoney(input.payments.reduce((s, p) => s + p.amount, 0));
  if (Math.abs(paymentTotal - grandTotal) > 0.01) {
    throw new AppError(
      `Payment total (${paymentTotal}) must equal grand total (${grandTotal})`,
      400
    );
  }

  const invoiceNumber = await generateInvoiceNumber(db);
  const invoiceId = newId();
  const now = new Date();

  await db.insert(invoices).values({
    id: invoiceId,
    invoiceNumber,
    customerId,
    userId,
    subtotal,
    discount: billDiscount,
    gstAmount,
    grandTotal,
    status: 'COMPLETED',
    clientRequestId: input.clientRequestId,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  });

  for (const item of lineItems) {
    await db.insert(invoiceItems).values({
      id: newId(),
      invoiceId,
      productId: item.productId ?? null,
      variantId: item.variantId ?? null,
      itemCode: item.itemCode,
      itemName: item.itemName,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount,
      gstPercent: item.gstPercent,
      gstAmount: item.gstAmount,
      lineTotal: item.lineTotal,
    });
  }

  for (const p of input.payments) {
    await db.insert(payments).values({
      id: newId(),
      invoiceId,
      mode: p.mode,
      amount: p.amount,
      reference: p.reference,
      createdAt: now,
    });
  }

  for (const item of lineItems) {
    if (item.variantId) {
      const [variant] = await db
        .select()
        .from(productVariants)
        .where(eq(productVariants.id, item.variantId))
        .limit(1);
      if (!variant) continue;
      const newQty = variant.stockQuantity - item.quantity;
      if (newQty < 0) throw new AppError(`Insufficient stock for ${item.itemName}`, 400);

      await db
        .update(productVariants)
        .set({ stockQuantity: newQty, updatedAt: now })
        .where(eq(productVariants.id, item.variantId));

      await db.insert(stockHistory).values({
        id: newId(),
        variantId: item.variantId,
        productId: item.productId ?? variant.productId,
        type: 'SALE',
        quantity: -item.quantity,
        previousQty: variant.stockQuantity,
        newQty,
        reference: invoiceNumber,
        userId,
        createdAt: now,
      });
    } else if (item.productId) {
      const [product] = await db.select().from(products).where(eq(products.id, item.productId)).limit(1);
      if (!product || product.hasVariants) continue;
      const newQty = product.stockQuantity - item.quantity;
      if (newQty < 0) throw new AppError(`Insufficient stock for ${item.itemName}`, 400);

      await db
        .update(products)
        .set({ stockQuantity: newQty, updatedAt: now })
        .where(eq(products.id, item.productId));

      await db.insert(stockHistory).values({
        id: newId(),
        productId: item.productId,
        type: 'SALE',
        quantity: -item.quantity,
        previousQty: product.stockQuantity,
        newQty,
        reference: invoiceNumber,
        userId,
        createdAt: now,
      });
    }
  }

  return getInvoice(db, invoiceId);
}

export async function getInvoice(db: Database, id: string) {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!invoice) throw new AppError('Invoice not found', 404);

  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id));
  const paymentRows = await db.select().from(payments).where(eq(payments.invoiceId, id));
  const [customer] = invoice.customerId
    ? await db.select().from(customers).where(eq(customers.id, invoice.customerId)).limit(1)
    : [null];
  const [user] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, invoice.userId))
    .limit(1);

  return { ...invoice, items, payments: paymentRows, customer, user };
}

export async function listInvoices(
  db: Database,
  params: { page?: number; limit?: number; from?: string; to?: string; search?: string }
) {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  const conditions = [];
  if (params.from) {
    conditions.push(gte(invoices.createdAt, new Date(params.from)));
  }
  if (params.to) {
    const end = new Date(params.to);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(invoices.createdAt, end));
  }
  if (params.search) {
    const term = `%${params.search}%`;
    const matchingCustomerIds = db
      .select({ id: customers.id })
      .from(customers)
      .where(ilike(customers.name, term));
    conditions.push(
      or(ilike(invoices.invoiceNumber, term), inArray(invoices.customerId, matchingCustomerIds))!
    );
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(invoices)
    .where(whereClause)
    .orderBy(desc(invoices.createdAt))
    .limit(limit)
    .offset(offset);

  const data = await Promise.all(
    rows.map(async (inv) => {
      const paymentRows = await db.select().from(payments).where(eq(payments.invoiceId, inv.id));
      const [customer] = inv.customerId
        ? await db.select().from(customers).where(eq(customers.id, inv.customerId)).limit(1)
        : [null];
      const [user] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, inv.userId))
        .limit(1);
      const items = await db
        .select()
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, inv.id));
      return { ...inv, items, payments: paymentRows, customer, user, _count: { items: items.length } };
    })
  );

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(invoices)
    .where(whereClause);

  return { data, total: count, page, limit, totalPages: Math.ceil(count / limit) };
}

export async function cancelInvoice(db: Database, id: string, userId: string) {
  const invoice = await getInvoice(db, id);
  if (invoice.status === 'CANCELLED') return invoice;

  const now = new Date();

  for (const item of invoice.items) {
    if (item.variantId) {
      const [variant] = await db
        .select()
        .from(productVariants)
        .where(eq(productVariants.id, item.variantId))
        .limit(1);
      if (!variant) continue;
      const newQty = variant.stockQuantity + item.quantity;
      await db
        .update(productVariants)
        .set({ stockQuantity: newQty, updatedAt: now })
        .where(eq(productVariants.id, item.variantId));
      await db.insert(stockHistory).values({
        id: newId(),
        variantId: item.variantId,
        productId: item.productId,
        type: 'RETURN',
        quantity: item.quantity,
        previousQty: variant.stockQuantity,
        newQty,
        reference: invoice.invoiceNumber,
        userId,
        notes: 'Invoice cancelled',
        createdAt: now,
      });
    } else if (item.productId) {
      const [product] = await db.select().from(products).where(eq(products.id, item.productId)).limit(1);
      if (!product) continue;
      const newQty = product.stockQuantity + item.quantity;
      await db
        .update(products)
        .set({ stockQuantity: newQty, updatedAt: now })
        .where(eq(products.id, item.productId));
      await db.insert(stockHistory).values({
        id: newId(),
        productId: item.productId,
        type: 'RETURN',
        quantity: item.quantity,
        previousQty: product.stockQuantity,
        newQty,
        reference: invoice.invoiceNumber,
        userId,
        notes: 'Invoice cancelled',
        createdAt: now,
      });
    }
  }

  await db
    .update(invoices)
    .set({ status: 'CANCELLED', updatedAt: now })
    .where(eq(invoices.id, id));

  const [updated] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  return updated;
}
