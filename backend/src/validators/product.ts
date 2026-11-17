import { z } from 'zod';

const num = z.coerce.number();

const optionalId = z.preprocess(
  (val) => (val === '' || val === null || val === undefined ? null : val),
  z.string().min(1).nullable().optional()
);

export const productSchema = z.object({
  id: z.string().uuid().optional(),
  serialNo: z.string().trim().max(50).optional().nullable(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  categoryId: optionalId,
  brand: z.string().optional(),
  purchasePrice: num.min(0),
  sellingPrice: num.min(0),
  stockQuantity: z.coerce.number().int().min(0).optional(),
  barcode: z.string().optional().nullable(),
  gstPercent: num.min(0).optional(),
  supplierId: optionalId,
  hasVariants: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const variantSchema = z.object({
  size: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  sku: z.string().min(1),
  barcode: z.string().optional().nullable(),
  purchasePrice: num.min(0).optional().nullable(),
  sellingPrice: num.min(0),
  stockQuantity: z.coerce.number().int().min(0).optional(),
});

const adjustId = z.preprocess(
  (val) => (val === '' || val === null || val === undefined ? undefined : val),
  z.string().min(1).optional()
);

export const stockAdjustSchema = z
  .object({
    clientRequestId: z.string().uuid().optional(),
    productId: adjustId,
    variantId: adjustId,
    quantity: z.coerce
      .number({ invalid_type_error: 'Quantity is required' })
      .int('Quantity must be a whole number')
      .refine((n) => Number.isFinite(n), 'Quantity is required'),
    type: z.enum(['ADJUSTMENT', 'PURCHASE', 'RETURN']),
    notes: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.productId && !data.variantId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select a product',
        path: ['productId'],
      });
    }
  });
