import { api } from '@/lib/api';
import { getPendingMutations, queueMutation, readCachedResponse } from '@/lib/offline-sync';
import { useAuthStore } from '@/store/auth.store';
import type { Product, ProductVariant } from '@/types';

interface ProductWriteData {
  id?: string;
  serialNo?: string | null;
  code?: string;
  name?: string;
  description?: string;
  categoryId?: string | null;
  brand?: string;
  purchasePrice?: number;
  sellingPrice?: number;
  stockQuantity?: number;
  barcode?: string | null;
  gstPercent?: number;
  supplierId?: string | null;
  hasVariants?: boolean;
}

interface CachedInvoiceForStock {
  id: string;
  items?: Array<{ productId?: string | null; variantId?: string | null; quantity: number }>;
}

export async function searchProducts(search?: string, categoryId?: string) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (categoryId) params.set('categoryId', categoryId);
  params.set('limit', '100');
  const path = `/products?${params}`;
  let result: { data: Product[] };
  try {
    result = await api<{ data: Product[] }>(path);
  } catch (error) {
    if (navigator.onLine && !(error instanceof TypeError)) throw error;
    const fallback = await api<{ data: Product[] }>('/products?limit=100');
    const term = search?.toLocaleLowerCase();
    result = {
      data: fallback.data.filter((product) => {
        const matchesSearch =
          !term ||
          [product.name, product.code, product.serialNo, product.barcode, product.brand]
            .some((value) => value?.toLocaleLowerCase().includes(term));
        return matchesSearch && (!categoryId || product.categoryId === categoryId);
      }),
    };
  }

  const products = new Map(result.data.map((product) => [product.id, product]));
  const currentUserId = useAuthStore.getState().user?.id;
  const pendingMutations = (await getPendingMutations()).filter((item) => item.userId === currentUserId);
  const cachedInvoices = pendingMutations.some((item) => item.path.endsWith('/cancel'))
    ? await readCachedResponse<{ data: CachedInvoiceForStock[] }>('/invoices?')
    : null;
  for (const mutation of pendingMutations) {
    if (mutation.path === '/products' && mutation.method === 'POST') {
      const body = mutation.body as ProductWriteData;
      if (!body.id || !body.code || !body.name) continue;
      const product: Product = {
        id: body.id,
        serialNo: body.serialNo,
        code: body.code,
        name: body.name,
        description: body.description,
        categoryId: body.categoryId || undefined,
        brand: body.brand,
        purchasePrice: body.purchasePrice ?? 0,
        sellingPrice: body.sellingPrice ?? 0,
        stockQuantity: body.stockQuantity ?? 0,
        barcode: body.barcode ?? undefined,
        gstPercent: body.gstPercent ?? 5,
        hasVariants: body.hasVariants ?? false,
        syncStatus: 'pending',
      };
      if (mutation.userId === null || product.hasVariants) continue;
      products.set(product.id, product);
    } else if (mutation.method === 'PUT' && mutation.path.startsWith('/products/')) {
      const id = mutation.path.slice('/products/'.length);
      const existing = products.get(id);
      if (existing) {
        const body = mutation.body as Partial<ProductWriteData>;
        products.set(id, {
          ...existing,
          ...body,
          categoryId: body.categoryId === null ? undefined : body.categoryId ?? existing.categoryId,
          barcode: body.barcode === null ? undefined : body.barcode ?? existing.barcode,
          syncStatus: 'pending',
        });
      }
    } else if (mutation.method === 'POST' && mutation.path === '/inventory/adjust') {
      const adjustment = mutation.body as { productId?: string; variantId?: string; quantity: number };
      if (adjustment.productId) {
        const existing = products.get(adjustment.productId);
        if (existing) products.set(existing.id, {
          ...existing,
          stockQuantity: existing.stockQuantity + adjustment.quantity,
          syncStatus: 'pending',
        });
      } else if (adjustment.variantId) {
        for (const [id, existing] of products) {
          const variants = existing.variants?.map((variant) =>
            variant.id === adjustment.variantId
              ? { ...variant, stockQuantity: variant.stockQuantity + adjustment.quantity }
              : variant
          );
          if (variants?.some((variant) => variant.id === adjustment.variantId)) {
            products.set(id, { ...existing, variants, syncStatus: 'pending' });
          }
        }
      }
    } else if (mutation.method === 'POST' && mutation.path === '/invoices') {
      const body = mutation.body as { items?: Array<{ productId?: string; variantId?: string; quantity: number }> };
      for (const item of body.items ?? []) {
        if (item.productId && !item.variantId) {
          const existing = products.get(item.productId);
          if (existing) products.set(existing.id, {
            ...existing,
            stockQuantity: existing.stockQuantity - item.quantity,
            syncStatus: 'pending',
          });
        } else if (item.variantId) {
          for (const [id, existing] of products) {
            const variants = existing.variants?.map((variant) =>
              variant.id === item.variantId
                ? { ...variant, stockQuantity: variant.stockQuantity - item.quantity }
                : variant
            );
            if (variants?.some((variant) => variant.id === item.variantId)) {
              products.set(id, { ...existing, variants, syncStatus: 'pending' });
            }
          }
        }
      }
    } else if (mutation.method === 'POST' && mutation.path.startsWith('/invoices/') && mutation.path.endsWith('/cancel')) {
      const invoiceId = mutation.path.slice('/invoices/'.length, -'/cancel'.length);
      const invoice = cachedInvoices?.data.find((entry) => entry.id === invoiceId);
      const body = mutation.body as { invoice?: CachedInvoiceForStock };
      for (const saleItem of body.invoice?.items ?? invoice?.items ?? []) {
        const quantity = saleItem.quantity ?? 0;
        if (saleItem.productId && !saleItem.variantId) {
          const existing = products.get(saleItem.productId);
          if (existing) products.set(existing.id, {
            ...existing,
            stockQuantity: existing.stockQuantity + quantity,
            syncStatus: 'pending',
          });
        } else if (saleItem.variantId) {
          for (const [id, existing] of products) {
            const variants = existing.variants?.map((variant) =>
              variant.id === saleItem.variantId
                ? { ...variant, stockQuantity: variant.stockQuantity + quantity }
                : variant
            );
            if (variants?.some((variant) => variant.id === saleItem.variantId)) {
              products.set(id, { ...existing, variants, syncStatus: 'pending' });
            }
          }
        }
      }
    } else if (mutation.method === 'DELETE' && mutation.path.startsWith('/products/')) {
      products.delete(mutation.path.slice('/products/'.length));
    }
  }

  const term = search?.toLocaleLowerCase();
  return {
    ...result,
    data: [...products.values()].filter((product) => {
      const matchesSearch =
        !term ||
        [product.name, product.code, product.serialNo, product.barcode, product.brand]
          .some((value) => value?.toLocaleLowerCase().includes(term));
      return matchesSearch && (!categoryId || product.categoryId === categoryId);
    }),
  };
}

export async function getByBarcode(code: string) {
  try {
    return await api<{
    type: 'product' | 'variant';
    product: Product;
    variant: ProductVariant | null;
    }>(`/products/barcode/${encodeURIComponent(code)}`);
  } catch (error) {
    if (navigator.onLine && !(error instanceof TypeError)) throw error;
    const products = await searchProducts();
    const product = products.data.find((item) =>
      item.barcode === code ||
      item.variants?.some((variant) => variant.barcode === code || variant.sku === code)
    );
    if (!product) throw error;
    const variant = product.variants?.find((item) => item.barcode === code || item.sku === code) ?? null;
    return { type: variant ? 'variant' as const : 'product' as const, product, variant };
  }
}

export async function createProduct(data: ProductWriteData & { code: string; name: string }) {
  const body = { ...data, id: data.id ?? crypto.randomUUID() };
  try {
    return await api<Product>('/products', { method: 'POST', body: JSON.stringify(body) });
  } catch (error) {
    if (error instanceof TypeError) {
      await queueMutation('POST', '/products', body);
      const tempProduct: Product = {
        id: body.id,
        code: body.code,
        name: body.name,
        purchasePrice: body.purchasePrice ?? 0,
        sellingPrice: body.sellingPrice ?? 0,
        stockQuantity: body.stockQuantity ?? 0,
        gstPercent: body.gstPercent ?? 5,
        hasVariants: body.hasVariants ?? false,
        syncStatus: 'pending',
      };
      return tempProduct;
    }
    throw error;
  }
}

export async function updateProduct(id: string, data: Partial<ProductWriteData>): Promise<Product | undefined> {
  try {
    return await api<Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  } catch (error) {
    if (error instanceof TypeError) {
      await queueMutation('PUT', `/products/${id}`, data);
      return undefined;
    }
    throw error;
  }
}

export async function deleteProduct(id: string) {
  try {
    return await api(`/products/${id}`, { method: 'DELETE' });
  } catch (error) {
    if (error instanceof TypeError) {
      await queueMutation('DELETE', `/products/${id}`);
      return undefined;
    }
    throw error;
  }
}
