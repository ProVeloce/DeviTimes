import { api } from '@/lib/api';
import { queueMutation } from '@/lib/offline-sync';

export type StockAdjustType = 'ADJUSTMENT' | 'PURCHASE' | 'RETURN';

export interface StockAdjustPayload {
  clientRequestId?: string;
  productId?: string;
  variantId?: string;
  quantity: number;
  type: StockAdjustType;
  notes?: string;
}

export async function adjustStock(payload: StockAdjustPayload): Promise<{ newQty: number; pending?: true }> {
  const requestPayload = { ...payload, clientRequestId: payload.clientRequestId ?? crypto.randomUUID() };
  try {
    return await api<{ newQty: number }>('/inventory/adjust', {
      method: 'POST',
      body: JSON.stringify(requestPayload),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      await queueMutation('POST', '/inventory/adjust', requestPayload);
      return { newQty: 0, pending: true };
    }
    throw error;
  }
}

export async function listStockHistory(params?: { page?: number; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.page) q.set('page', String(params.page));
  if (params?.limit) q.set('limit', String(params.limit));
  return api<{
    data: Array<{
      id: string;
      type: string;
      quantity: number;
      previousQty: number;
      newQty: number;
      reference?: string;
      notes?: string;
      createdAt: string;
      product?: { name: string; code: string };
      variant?: { sku: string; color?: string; size?: string };
    }>;
    total: number;
  }>(`/inventory/history?${q}`);
}
