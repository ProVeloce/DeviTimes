export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcLineTotal(
  qty: number,
  unitPrice: number,
  discount: number,
  gstPercent: number
): { lineSubtotal: number; gstAmount: number; lineTotal: number } {
  const gross = qty * unitPrice;
  const afterDiscount = Math.max(0, gross - discount);
  const gstAmount = roundMoney((afterDiscount * gstPercent) / 100);
  const lineTotal = roundMoney(afterDiscount + gstAmount);
  return {
    lineSubtotal: roundMoney(afterDiscount),
    gstAmount,
    lineTotal,
  };
}
