import { api, ApiError } from '@/lib/api';
import {
  getPendingMutations,
  queueMutation,
  readCachedResponse,
  removeMutation,
  updateCachedInvoiceLists,
  writeCachedResponse,
} from '@/lib/offline-sync';
import { calcLineTotal } from '@/lib/pos-calculations';
import { searchProducts } from '@/services/products.service';
import { useAuthStore } from '@/store/auth.store';
import type { CreateInvoicePayload } from '@/lib/invoice-payload';
import type { Invoice } from '@/types';

export async function createInvoice(payload: CreateInvoicePayload) {
  const requestId = payload.clientRequestId ?? crypto.randomUUID();
  const requestPayload = { ...payload, clientRequestId: requestId };
  if (import.meta.env.DEV) {
    console.log('[createInvoice] POST /invoices', requestPayload);
  }

  try {
    return await api<Invoice>('/invoices', {
      method: 'POST',
      body: JSON.stringify(requestPayload),
    });
  } catch (err) {
    if (err instanceof TypeError) {
      let catalog: Awaited<ReturnType<typeof searchProducts>>;
      try {
        catalog = await searchProducts();
      } catch (catalogError) {
        if (catalogError instanceof TypeError) {
          throw new ApiError('The offline product catalogue is unavailable. Reconnect and load products before creating a bill.', 503);
        }
        throw catalogError;
      }
      for (const item of requestPayload.items) {
        if (!item.productId) continue;
        const product = catalog.data.find((entry) => entry.id === item.productId);
        const variant = item.variantId
          ? product?.variants?.find((entry) => entry.id === item.variantId)
          : undefined;
        const available = variant?.stockQuantity ?? product?.stockQuantity;
        if (available === undefined) {
          throw new ApiError(`Cannot verify offline stock for ${item.itemName}. Refresh the catalogue while online before selling it.`, 409);
        }
        if (available < item.quantity) {
          throw new ApiError(`Not enough offline stock for ${item.itemName}. Available: ${available}.`, 409);
        }
      }

      const queued = await queueMutation('POST', '/invoices', requestPayload);
      const items = requestPayload.items.map((item) => {
        const totals = calcLineTotal(item.quantity, item.unitPrice, item.discount, item.gstPercent);
        return { ...item, ...totals };
      });
      const subtotal = items.reduce((sum, item) => sum + item.lineSubtotal, 0);
      const gstAmount = items.reduce((sum, item) => sum + item.gstAmount, 0);
      const discount = Number(requestPayload.discount) || 0;
      const offlineInvoice: Invoice = {
        id: `offline-${queued.id}`,
        invoiceNumber: `OFFLINE-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${requestId.slice(0, 8)}`,
        subtotal,
        discount,
        gstAmount,
        grandTotal: Math.round((subtotal + gstAmount - discount) * 100) / 100,
        status: 'SYNC_PENDING',
        createdAt: new Date().toISOString(),
        customer: requestPayload.customerName
          ? { name: requestPayload.customerName, phone: requestPayload.customerPhone }
          : null,
        payments: requestPayload.payments,
        items,
      };

      const cached = await readCachedResponse<{ data: Invoice[]; total: number }>('/invoices?');
      const existing = cached?.data ?? [];
      await writeCachedResponse('/invoices?', {
        data: [offlineInvoice, ...existing],
        total: (cached?.total ?? existing.length) + 1,
      });
      return offlineInvoice;
    }

    if (import.meta.env.DEV && err instanceof ApiError) {
      console.error('[createInvoice] failed', err.status, err.message, err.details);
    }
    throw err;
  }
}

export async function listInvoices(params?: { page?: number; search?: string }) {
  const q = new URLSearchParams();
  if (params?.page) q.set('page', String(params.page));
  if (params?.search) q.set('search', params.search);
  return api<{ data: Invoice[]; total: number }>(`/invoices?${q}`);
}

export async function getInvoice(id: string) {
  return api<Invoice>(`/invoices/${id}`);
}

export async function cancelInvoice(invoice: Invoice) {
  if (invoice.id.startsWith('offline-')) {
    const mutationId = invoice.id.slice('offline-'.length);
    const pending = (await getPendingMutations()).find(
      (mutation) =>
        mutation.id === mutationId &&
        mutation.path === '/invoices' &&
        mutation.userId === useAuthStore.getState().user?.id
    );
    if (!pending) throw new ApiError('This offline bill is no longer waiting to sync.', 404);
    await removeMutation(pending.id);
    await updateCachedInvoiceLists(invoice.id, { remove: true });
    return { pending: false, removedLocally: true };
  }

  const path = `/invoices/${encodeURIComponent(invoice.id)}/cancel`;
  try {
    await api(path, { method: 'POST' });
    await updateCachedInvoiceLists(invoice.id, { status: 'CANCELLED' });
    return { pending: false, removedLocally: false };
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;

    await queueMutation('POST', path, { invoice: { id: invoice.id, items: invoice.items } });
    await updateCachedInvoiceLists(invoice.id, { status: 'CANCELLED' });
    return { pending: true, removedLocally: false };
  }
}

export function downloadInvoiceHtml(filename: string, html: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function formatApiValidationError(details: unknown): string {
  if (!details || typeof details !== 'object') return 'Request failed';
  const fieldErrors = (details as { fieldErrors?: Record<string, string[]> }).fieldErrors;
  if (!fieldErrors) return 'Validation failed';
  const parts = Object.entries(fieldErrors).flatMap(([key, msgs]) =>
    (msgs ?? []).map((m) => `${key}: ${m}`)
  );
  return parts.length ? parts.join('; ') : 'Validation failed';
}
