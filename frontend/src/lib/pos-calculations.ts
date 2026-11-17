export function calcLineTotal(
  qty: number,
  unitPrice: number,
  discount: number,
  gstPercent: number
) {
  const gross = qty * unitPrice;
  const afterDiscount = Math.max(0, gross - discount);
  const gstAmount = Math.round(((afterDiscount * gstPercent) / 100) * 100) / 100;
  const lineTotal = Math.round((afterDiscount + gstAmount) * 100) / 100;
  return { gstAmount, lineTotal, lineSubtotal: afterDiscount };
}
