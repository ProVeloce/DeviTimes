import { z } from 'zod';

/** Treat empty strings as absent optional IDs (common from JSON/forms). */
const optionalId = z.preprocess(
  (val) => (val === '' || val === null || val === undefined ? undefined : val),
  z.string().min(1).optional()
);

const invoiceItemSchema = z.object({
  productId: optionalId,
  variantId: optionalId,
  itemCode: z.string().min(1, 'Item code is required'),
  itemName: z.string().min(1, 'Item name is required'),
  description: z.string().optional(),
  quantity: z.coerce.number().int('Quantity must be a whole number').positive('Quantity must be at least 1'),
  unitPrice: z.coerce.number().min(0, 'Unit price cannot be negative'),
  discount: z.coerce.number().min(0).optional().default(0),
  gstPercent: z.coerce.number().min(0).max(100).optional().default(5),
});

const paymentSchema = z.object({
  mode: z.enum(['CASH', 'UPI', 'CARD', 'MIXED'], {
    errorMap: () => ({ message: 'Payment mode must be CASH, UPI, CARD, or MIXED' }),
  }),
  amount: z.coerce.number().min(0, 'Payment amount cannot be negative'),
  reference: z.string().optional(),
});

export const createInvoiceSchema = z
  .object({
    clientRequestId: z.string().uuid().optional(),
    customerId: optionalId,
    customerName: z.string().trim().min(1).optional(),
    customerPhone: z.string().trim().optional(),
    items: z.array(invoiceItemSchema).min(1, 'At least one line item is required'),
    discount: z.coerce.number().min(0).optional().default(0),
    notes: z.string().optional(),
    payments: z.array(paymentSchema).min(1, 'At least one payment is required'),
  })
  .superRefine((data, ctx) => {
    const lineSubtotal = data.items.reduce((sum, item) => {
      const gross = item.quantity * item.unitPrice;
      const afterDisc = Math.max(0, gross - (item.discount ?? 0));
      const gst = Math.round(((afterDisc * (item.gstPercent ?? 5)) / 100) * 100) / 100;
      return sum + afterDisc + gst;
    }, 0);

    const grandTotal = Math.round((lineSubtotal - (data.discount ?? 0)) * 100) / 100;
    const payTotal = Math.round(data.payments.reduce((s, p) => s + p.amount, 0) * 100) / 100;

    if (grandTotal > 0 && payTotal <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Payment total must be greater than zero',
        path: ['payments'],
      });
    }

    if (Math.abs(payTotal - grandTotal) > 0.02) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Payment total (${payTotal}) must match bill total (${grandTotal})`,
        path: ['payments'],
      });
    }
  });

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
