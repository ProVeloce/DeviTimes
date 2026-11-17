import type { CartLine } from '@/types';

export type PaymentMode = 'CASH' | 'UPI' | 'CARD' | 'MIXED';

export interface InvoicePaymentInput {
  mode: PaymentMode;
  amount: number;
  reference?: string;
}

export interface CreateInvoicePayload {
  clientRequestId?: string;
  customerName?: string;
  customerPhone?: string;
  items: Array<{
    productId?: string;
    variantId?: string;
    itemCode: string;
    itemName: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    gstPercent: number;
  }>;
  discount: number;
  payments: InvoicePaymentInput[];
  notes?: string;
}

function cleanId(id?: string | null): string | undefined {
  if (id == null || String(id).trim() === '') return undefined;
  return String(id).trim();
}

export function mapCartLineToInvoiceItem(line: CartLine) {
  return {
    productId: cleanId(line.productId),
    variantId: cleanId(line.variantId),
    itemCode: String(line.itemCode).trim(),
    itemName: String(line.itemName).trim(),
    description: line.description?.trim() || undefined,
    quantity: Number(line.quantity),
    unitPrice: Number(line.unitPrice),
    discount: Number(line.discount) || 0,
    gstPercent: Number(line.gstPercent) ?? 5,
  };
}

export function buildPayments(
  paymentMode: PaymentMode,
  grandTotal: number,
  mixedCash: string,
  mixedUpi: string
): InvoicePaymentInput[] {
  const total = Math.round(Number(grandTotal) * 100) / 100;

  if (total <= 0) {
    return [{ mode: 'CASH', amount: 0 }];
  }

  if (paymentMode === 'MIXED') {
    const cash = Math.round((Number(mixedCash) || 0) * 100) / 100;
    const upi = Math.round((Number(mixedUpi) || 0) * 100) / 100;
    const payments: InvoicePaymentInput[] = [];
    if (cash > 0) payments.push({ mode: 'CASH', amount: cash });
    if (upi > 0) payments.push({ mode: 'UPI', amount: upi });
    const paid = cash + upi;
    const remainder = Math.round((total - paid) * 100) / 100;
    if (remainder > 0.01) {
      payments.push({ mode: 'CARD', amount: remainder });
    }
    if (payments.length === 0) {
      payments.push({ mode: 'CASH', amount: total });
    }
    return payments;
  }

  return [{ mode: paymentMode, amount: total }];
}

export function validateCartForInvoice(
  lines: CartLine[],
  payments: InvoicePaymentInput[],
  billDiscount: number
): string | null {
  if (!lines.length) {
    return 'Add at least one item to the bill';
  }

  for (const [i, line] of lines.entries()) {
    if (!line.itemCode?.trim() || !line.itemName?.trim()) {
      return `Line ${i + 1}: item code and name are required`;
    }
    if (!Number.isFinite(Number(line.quantity)) || Number(line.quantity) < 1) {
      return `Line ${i + 1}: quantity must be at least 1`;
    }
    if (!Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) < 0) {
      return `Line ${i + 1}: invalid price`;
    }
  }

  const payTotal = payments.reduce((s, p) => s + Number(p.amount), 0);
  const lineTotal = lines.reduce((s, l) => s + Number(l.lineTotal), 0);
  const grandTotal = Math.round((lineTotal - Number(billDiscount || 0)) * 100) / 100;

  if (grandTotal > 0 && payTotal <= 0) {
    return 'Enter payment amount';
  }

  if (Math.abs(payTotal - grandTotal) > 0.02) {
    return `Payment (${payTotal.toFixed(2)}) must equal bill total (${grandTotal.toFixed(2)})`;
  }

  return null;
}

export function buildCreateInvoicePayload(
  lines: CartLine[],
  options: {
    customerName: string;
    customerPhone: string;
    billDiscount: number;
    paymentMode: PaymentMode;
    mixedCash: string;
    mixedUpi: string;
    grandTotal: number;
  }
): CreateInvoicePayload {
  const items = lines.map(mapCartLineToInvoiceItem);
  const payments = buildPayments(
    options.paymentMode,
    options.grandTotal,
    options.mixedCash,
    options.mixedUpi
  );

  const payload: CreateInvoicePayload = {
    items,
    discount: Number(options.billDiscount) || 0,
    payments,
  };

  const name = options.customerName.trim();
  const phone = options.customerPhone.trim();
  if (name) payload.customerName = name;
  if (phone) payload.customerPhone = phone;

  return payload;
}
