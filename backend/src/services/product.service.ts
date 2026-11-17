import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import {
  products,
  productVariants,
  stockHistory,
  categories,
  suppliers,
} from '../db/schema/index.js';
import { newId } from '../utils/id.js';
import { AppError } from '../utils/response.js';
import { getSettingNumber } from './settings.service.js';

export async function listProducts(
  db: Database,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    categoryId?: string;
    lowStock?: boolean;
  }
) {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = (page - 1) * limit;

  const conditions = [eq(products.isActive, true)];
  if (params.categoryId) conditions.push(eq(products.categoryId, params.categoryId));
  if (params.search) {
    const term = `%${params.search}%`;
    conditions.push(
      or(
        ilike(products.name, term),
        ilike(products.code, term),
        ilike(products.serialNo, term),
        ilike(products.barcode, term),
        ilike(products.brand, term)
      )!
    );
  }

  const rows = await db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(products.name)
    .limit(limit)
    .offset(offset);

  const enriched = await Promise.all(
    rows.map(async (p) => {
      const [category] = p.categoryId
        ? await db.select().from(categories).where(eq(categories.id, p.categoryId)).limit(1)
        : [null];
      const [supplier] = p.supplierId
        ? await db.select().from(suppliers).where(eq(suppliers.id, p.supplierId)).limit(1)
        : [null];
      const variants = await db
        .select()
        .from(productVariants)
        .where(and(eq(productVariants.productId, p.id), eq(productVariants.isActive, true)));
      return { ...p, category, supplier, variants };
    })
  );

  let data = enriched;
  if (params.lowStock) {
    const threshold = await getSettingNumber(db, 'lowStockThreshold', 10);
    data = enriched.filter((p) => {
      if (p.hasVariants) return p.variants.some((v) => v.stockQuantity <= threshold);
      return p.stockQuantity <= threshold;
    });
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(and(...conditions));

  return { data, total: count, page, limit };
}

export async function getProductByBarcode(db: Database, barcode: string) {
  const [variant] = await db
    .select()
    .from(productVariants)
    .where(and(eq(productVariants.barcode, barcode), eq(productVariants.isActive, true)))
    .limit(1);

  if (variant) {
    const [product] = await db.select().from(products).where(eq(products.id, variant.productId)).limit(1);
    if (!product) return null;
    const [category] = product.categoryId
      ? await db.select().from(categories).where(eq(categories.id, product.categoryId)).limit(1)
      : [null];
    return { type: 'variant' as const, product: { ...product, category }, variant };
  }

  const [product] = await db
    .select()
    .from(products)
    .where(
      and(eq(products.barcode, barcode), eq(products.isActive, true), eq(products.hasVariants, false))
    )
    .limit(1);

  if (!product) return null;
  const [category] = product.categoryId
    ? await db.select().from(categories).where(eq(categories.id, product.categoryId)).limit(1)
    : [null];
  return { type: 'product' as const, product: { ...product, category }, variant: null };
}

export async function getProductById(db: Database, id: string) {
  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product) return null;
  const variants = await db.select().from(productVariants).where(eq(productVariants.productId, id));
  const [category] = product.categoryId
    ? await db.select().from(categories).where(eq(categories.id, product.categoryId)).limit(1)
    : [null];
  const [supplier] = product.supplierId
    ? await db.select().from(suppliers).where(eq(suppliers.id, product.supplierId)).limit(1)
    : [null];
  return { ...product, category, supplier, variants };
}

export async function createProduct(
  db: Database,
  data: {
    id?: string;
    serialNo?: string | null;
    code: string;
    name: string;
    description?: string;
    categoryId?: string | null;
    brand?: string;
    purchasePrice: number;
    sellingPrice: number;
    stockQuantity?: number;
    barcode?: string | null;
    gstPercent?: number;
    supplierId?: string | null;
    hasVariants?: boolean;
  },
  variants?: Array<{
    size?: string | null;
    color?: string | null;
    sku: string;
    barcode?: string | null;
    purchasePrice?: number | null;
    sellingPrice: number;
    stockQuantity?: number;
  }>
) {
  const id = data.id ?? newId();
  const [existing] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (existing) return getProductById(db, id);
  const now = new Date();
  const hasVariants = data.hasVariants ?? false;

  await db.insert(products).values({
    id,
    serialNo: data.serialNo?.trim() || null,
    code: data.code,
    name: data.name,
    description: data.description,
    categoryId: data.categoryId ?? null,
    brand: data.brand,
    purchasePrice: data.purchasePrice,
    sellingPrice: data.sellingPrice,
    stockQuantity: hasVariants ? 0 : (data.stockQuantity ?? 0),
    barcode: hasVariants ? null : (data.barcode ?? null),
    gstPercent: data.gstPercent ?? 5,
    supplierId: data.supplierId ?? null,
    hasVariants,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  if (variants?.length) {
    for (const v of variants) {
      await db.insert(productVariants).values({
        id: newId(),
        productId: id,
        size: v.size ?? null,
        color: v.color ?? null,
        sku: v.sku,
        barcode: v.barcode ?? null,
        purchasePrice: v.purchasePrice ?? null,
        sellingPrice: v.sellingPrice,
        stockQuantity: v.stockQuantity ?? 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  if (!hasVariants && (data.stockQuantity ?? 0) > 0) {
    await db.insert(stockHistory).values({
      id: newId(),
      productId: id,
      type: 'INITIAL',
      quantity: data.stockQuantity ?? 0,
      previousQty: 0,
      newQty: data.stockQuantity ?? 0,
      notes: 'Initial stock',
      createdAt: now,
    });
  }

  return getProductById(db, id);
}

export async function updateProduct(
  db: Database,
  id: string,
  data: Partial<{
    serialNo: string | null;
    code: string;
    name: string;
    description: string;
    categoryId: string | null;
    brand: string;
    purchasePrice: number;
    sellingPrice: number;
    barcode: string | null;
    gstPercent: number;
    supplierId: string | null;
    isActive: boolean;
  }>
) {
  await db
    .update(products)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(products.id, id));
  return getProductById(db, id);
}

export async function deleteProduct(db: Database, id: string) {
  await db.update(products).set({ isActive: false, updatedAt: new Date() }).where(eq(products.id, id));
}

export async function adjustStock(
  db: Database,
  data: {
    clientRequestId?: string;
    productId?: string;
    variantId?: string;
    quantity: number;
    type: 'ADJUSTMENT' | 'PURCHASE' | 'RETURN';
    notes?: string;
  },
  userId: string
) {
  if (data.clientRequestId) {
    const [existing] = await db
      .select({ newQty: stockHistory.newQty })
      .from(stockHistory)
      .where(and(
        eq(stockHistory.clientRequestId, data.clientRequestId),
        eq(stockHistory.userId, userId)
      ))
      .limit(1);
    if (existing) return existing.newQty;
  }

  const now = new Date();

  if (data.variantId) {
    const [variant] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, data.variantId))
      .limit(1);
    if (!variant) throw new AppError('Variant not found', 404);
    const newQty = variant.stockQuantity + data.quantity;
    if (newQty < 0) throw new AppError('Stock cannot be negative', 400);

    await db
      .update(productVariants)
      .set({ stockQuantity: newQty, updatedAt: now })
      .where(eq(productVariants.id, data.variantId));

    await db.insert(stockHistory).values({
      id: newId(),
      variantId: data.variantId,
      productId: variant.productId,
      type: data.type,
      quantity: data.quantity,
      previousQty: variant.stockQuantity,
      newQty,
      clientRequestId: data.clientRequestId,
      notes: data.notes,
      userId,
      createdAt: now,
    });
    return newQty;
  }

  if (!data.productId) throw new AppError('productId or variantId required', 400);

  const [product] = await db.select().from(products).where(eq(products.id, data.productId)).limit(1);
  if (!product) throw new AppError('Product not found', 404);
  if (product.hasVariants) throw new AppError('Adjust stock on variants for this product', 400);

  const newQty = product.stockQuantity + data.quantity;
  if (newQty < 0) throw new AppError('Stock cannot be negative', 400);

  await db
    .update(products)
    .set({ stockQuantity: newQty, updatedAt: now })
    .where(eq(products.id, data.productId));

  await db.insert(stockHistory).values({
    id: newId(),
    productId: data.productId,
    type: data.type,
    quantity: data.quantity,
    previousQty: product.stockQuantity,
    newQty,
    clientRequestId: data.clientRequestId,
    notes: data.notes,
    userId,
    createdAt: now,
  });

  return newQty;
}

export async function listStockHistory(db: Database, page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const data = await db
    .select()
    .from(stockHistory)
    .orderBy(desc(stockHistory.createdAt))
    .limit(limit)
    .offset(offset);

  const enriched = await Promise.all(
    data.map(async (row) => {
      const [product] = row.productId
        ? await db
            .select({ name: products.name, code: products.code })
            .from(products)
            .where(eq(products.id, row.productId))
            .limit(1)
        : [null];
      const [variant] = row.variantId
        ? await db
            .select({
              sku: productVariants.sku,
              color: productVariants.color,
              size: productVariants.size,
            })
            .from(productVariants)
            .where(eq(productVariants.id, row.variantId))
            .limit(1)
        : [null];
      return { ...row, product, variant };
    })
  );

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(stockHistory);
  return { data: enriched, total: count, page, limit };
}
