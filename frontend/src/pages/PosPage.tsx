import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Barcode,
  FileText,
  Search,
  Trash2,
  Printer,
  Save,
  RotateCcw,
  Plus,
  Minus,
} from 'lucide-react';
import { api } from '@/lib/api';
import { listCategories } from '@/services/categories.service';
import { formatCurrency } from '@/lib/utils';
import { usePosStore } from '@/store/pos.store';
import { searchProducts, getByBarcode } from '@/services/products.service';
import {
  buildCreateInvoicePayload,
  buildPayments,
  validateCartForInvoice,
  type PaymentMode,
} from '@/lib/invoice-payload';
import { createInvoice, formatApiValidationError } from '@/services/invoices.service';
import type { Product, ProductVariant, ShopSettings } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';
import {
  buildInvoiceHtml,
  buildThermalReceiptHtml,
  openPrintWindow,
  printHtml,
} from '@/lib/invoice-print';
import { ApiError } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';

function addProductToCart(product: Product, variant?: ProductVariant | null) {
  const { addLine } = usePosStore.getState();
  if (variant) {
    addLine({
      productId: product.id,
      variantId: variant.id,
      itemCode: variant.sku,
      itemName: `${product.name} (${[variant.color, variant.size].filter(Boolean).join(' / ')})`,
      quantity: 1,
      unitPrice: Number(variant.sellingPrice),
      discount: 0,
      gstPercent: Number(product.gstPercent),
    });
  } else {
    addLine({
      productId: product.id,
      itemCode: product.code,
      itemName: product.name,
      description: product.description,
      quantity: 1,
      unitPrice: Number(product.sellingPrice),
      discount: 0,
      gstPercent: Number(product.gstPercent),
    });
  }
}

export function PosPage() {
  const searchRef = useRef<HTMLInputElement>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [barcode, setBarcode] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [mixedCash, setMixedCash] = useState('');
  const [mixedUpi, setMixedUpi] = useState('');
  const [saving, setSaving] = useState(false);

  const lines = usePosStore((s) => s.lines);
  const billDiscount = usePosStore((s) => s.billDiscount);
  const customerName = usePosStore((s) => s.customerName);
  const customerPhone = usePosStore((s) => s.customerPhone);
  const updateLine = usePosStore((s) => s.updateLine);
  const removeLine = usePosStore((s) => s.removeLine);
  const clearBill = usePosStore((s) => s.clearBill);
  const setBillDiscount = usePosStore((s) => s.setBillDiscount);
  const setCustomer = usePosStore((s) => s.setCustomer);
  const getTotals = usePosStore((s) => s.getTotals);

  const totals = getTotals();

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: listCategories,
    staleTime: 60_000,
  });

  const { data: productsData } = useQuery({
    queryKey: ['pos-products', search, categoryId],
    queryFn: () => searchProducts(search || undefined, categoryId || undefined),
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<ShopSettings>('/settings'),
  });

  const handleBarcode = useCallback(async (code: string) => {
    if (!code.trim()) return;
    try {
      const result = await getByBarcode(code.trim());
      if (result.type === 'variant' && result.variant) {
        addProductToCart(result.product, result.variant);
      } else {
        addProductToCart(result.product);
      }
      setBarcode('');
      toast('Added', result.product.name);
    } catch {
      toast('Not found', `No product for barcode ${code}`, 'error');
    }
  }, []);

  const handleSave = useCallback(async (andPrint = false, fullInvoice = false) => {
    if (lines.length === 0) {
      toast('Empty bill', 'Add items before saving', 'error');
      return;
    }

    const payments = buildPayments(paymentMode, totals.grandTotal, mixedCash, mixedUpi);
    const validationError = validateCartForInvoice(lines, payments, billDiscount);
    if (validationError) {
      toast('Cannot save bill', validationError, 'error');
      return;
    }

    const payload = buildCreateInvoicePayload(lines, {
      customerName,
      customerPhone,
      billDiscount,
      paymentMode,
      mixedCash,
      mixedUpi,
      grandTotal: totals.grandTotal,
    });

    const printWindow = andPrint ? openPrintWindow() : null;
    setSaving(true);
    try {
      const invoice = await createInvoice(payload);

      toast(
        invoice.status === 'SYNC_PENDING' ? 'Saved offline' : 'Bill saved',
        invoice.status === 'SYNC_PENDING'
          ? `${invoice.invoiceNumber} is stored on this device and will sync when online`
          : invoice.invoiceNumber
      );

      if (andPrint && settings) {
        const savedInvoice = {
          ...invoice,
          subtotal: Number(invoice.subtotal),
          gstAmount: Number(invoice.gstAmount),
          discount: Number(invoice.discount),
          grandTotal: Number(invoice.grandTotal),
        };
        if (printWindow) {
          printHtml(
            fullInvoice
              ? buildInvoiceHtml(savedInvoice, settings)
              : buildThermalReceiptHtml(savedInvoice, settings),
            printWindow
          );
        } else {
          toast(
            'Print blocked',
            `Invoice ${invoice.invoiceNumber} was saved. Allow pop-ups to print it.`,
            'error'
          );
        }
      }

      clearBill();
      setMixedCash('');
      setMixedUpi('');
      barcodeRef.current?.focus();
    } catch (err) {
      printWindow?.close();
      const msg =
        err instanceof ApiError
          ? err.details
            ? formatApiValidationError(err.details)
            : err.message
          : 'Failed to save bill';
      toast('Error', msg, 'error');
    } finally {
      setSaving(false);
    }
  }, [lines, billDiscount, customerName, customerPhone, paymentMode, mixedCash, mixedUpi, totals.grandTotal, settings, clearBill]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'F4') {
        e.preventDefault();
        barcodeRef.current?.focus();
      }
      if (e.key === 'F8' && lines.length > 0) {
        e.preventDefault();
        void handleSave(false);
      }
      if (e.key === 'Escape') {
        clearBill();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lines.length, handleSave, clearBill]);

  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);

  const products = productsData?.data ?? [];

  return (
    <div className="flex min-h-[calc(100dvh-7rem)] flex-col gap-4">
      <PageHeader
        title="Billing"
        description="F2 Search · F4 Barcode · F8 Save · Esc Clear"
      >
        <Badge variant="accent">POS</Badge>
      </PageHeader>

      <div className="grid min-w-0 flex-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
        {/* LEFT — Search & Products */}
        <Card className="flex h-[min(22rem,42vh)] min-h-60 flex-col overflow-hidden lg:h-auto">
          <CardHeader className="space-y-2 p-3 pb-2">
            <div className="relative">
              <Barcode className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--color-muted-foreground)]" />
              <Input
                ref={barcodeRef}
                placeholder="Scan barcode (F4)"
                className="pl-9 font-mono text-sm"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleBarcode(barcode);
                  }
                }}
              />
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--color-muted-foreground)]" />
              <Input
                ref={searchRef}
                placeholder="Search products (F2)"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setCategoryId('')}
                className={`min-h-9 rounded-md px-2 text-xs font-medium ${
                  !categoryId ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-muted)]'
                }`}
              >
                All
              </button>
              {categories?.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={`min-h-9 rounded-md px-2 text-xs font-medium ${
                    categoryId === c.id
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-[var(--color-muted)]'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-2 pt-0">
            <div className="space-y-1">
              {products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="min-h-11 w-full rounded-lg border border-transparent px-2 py-2 text-left transition-colors hover:border-[var(--color-border)] hover:bg-[var(--color-muted)]"
                  onClick={() => {
                    if (p.hasVariants && p.variants?.length) {
                      const v = p.variants.find((x) => x.stockQuantity > 0) ?? p.variants[0];
                      addProductToCart(p, v);
                    } else {
                      addProductToCart(p);
                    }
                  }}
                >
                  <p className="truncate text-xs font-semibold">{p.name}</p>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-[var(--color-muted-foreground)]">
                      {p.code}
                    </span>
                    <span className="text-xs font-bold">
                      {formatCurrency(Number(p.sellingPrice))}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* CENTER — Bill table */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="flex flex-row items-center gap-2 p-3 pb-2">
            <Input
              placeholder="Customer name"
              className="h-9 min-w-0 flex-1"
              value={customerName}
              onChange={(e) => setCustomer(e.target.value, customerPhone)}
            />
            <Input
              placeholder="Phone"
              className="h-9 w-28 shrink-0 sm:w-32"
              value={customerPhone}
              onChange={(e) => setCustomer(customerName, e.target.value)}
            />
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            <div className="min-w-0 flex-1 overflow-auto">
              <table className="w-full min-w-[760px] text-xs">
                <thead className="sticky top-0 bg-[var(--color-muted)]">
                  <tr className="text-left text-[10px] uppercase tracking-wide text-[var(--color-muted-foreground)]">
                    <th className="w-8 p-2">#</th>
                    <th className="p-2">Code</th>
                    <th className="p-2">Item</th>
                    <th className="w-16 p-2">Qty</th>
                    <th className="w-20 p-2">Price</th>
                    <th className="w-16 p-2">Disc</th>
                    <th className="w-14 p-2">GST</th>
                    <th className="w-20 p-2 text-right">Total</th>
                    <th className="w-8 p-2" />
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-[var(--color-muted-foreground)]">
                        Scan barcode or select product to begin billing
                      </td>
                    </tr>
                  ) : (
                    lines.map((line, idx) => (
                      <tr key={line.id} className="border-t border-[var(--color-border)]">
                        <td className="p-2">{idx + 1}</td>
                        <td className="p-2 font-mono text-[10px]">{line.itemCode}</td>
                        <td className="max-w-[140px] truncate p-2 font-medium">{line.itemName}</td>
                        <td className="p-2">
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              aria-label={`Decrease ${line.itemName} quantity`}
                              className="flex h-9 w-9 items-center justify-center rounded hover:bg-[var(--color-muted)]"
                              onClick={() =>
                                updateLine(line.id, { quantity: Math.max(1, line.quantity - 1) })
                              }
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <input
                              type="number"
                              min={1}
                              aria-label={`Quantity for ${line.itemName}`}
                              className="w-10 rounded border px-1 py-0.5 text-center"
                              value={line.quantity}
                              onChange={(e) =>
                                updateLine(line.id, {
                                  quantity: Math.max(1, parseInt(e.target.value) || 1),
                                })
                              }
                            />
                            <button
                              type="button"
                              aria-label={`Increase ${line.itemName} quantity`}
                              className="flex h-9 w-9 items-center justify-center rounded hover:bg-[var(--color-muted)]"
                              onClick={() => updateLine(line.id, { quantity: line.quantity + 1 })}
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                        <td className="p-2">{formatCurrency(line.unitPrice)}</td>
                        <td className="p-2">
                          <input
                            type="number"
                            min={0}
                            aria-label={`Discount for ${line.itemName}`}
                            className="w-14 rounded border px-1 py-0.5"
                            value={line.discount}
                            onChange={(e) =>
                              updateLine(line.id, { discount: parseFloat(e.target.value) || 0 })
                            }
                          />
                        </td>
                        <td className="p-2">{line.gstPercent}%</td>
                        <td className="p-2 text-right font-semibold">
                          {formatCurrency(line.lineTotal)}
                        </td>
                        <td className="p-2">
                          <button
                            type="button"
                            aria-label={`Remove ${line.itemName} from bill`}
                            onClick={() => removeLine(line.id)}
                            className="flex h-9 w-9 items-center justify-center text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* RIGHT — Totals & Payment */}
        <Card className="flex flex-col">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-sm">Payment</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3 p-3 pt-0">
            <div className="space-y-2 rounded-lg bg-[var(--color-muted)] p-3">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-muted-foreground)]">Subtotal</span>
                <span>{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-muted-foreground)]">GST</span>
                <span>{formatCurrency(totals.gst)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-muted-foreground)]">Bill Discount</span>
                <input
                  type="number"
                  min={0}
                  className="w-20 rounded border bg-white px-2 py-0.5 text-right text-sm"
                  value={billDiscount || ''}
                  onChange={(e) => setBillDiscount(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="border-t border-[var(--color-border)] pt-2">
                <div className="flex justify-between">
                  <span className="font-semibold">Grand Total</span>
                  <span className="text-xl font-medium text-[#1967d2]">
                    {formatCurrency(totals.grandTotal)}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {(['CASH', 'UPI', 'CARD', 'MIXED'] as PaymentMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setPaymentMode(mode)}
                  className={`min-h-11 rounded-lg border py-2 text-xs font-semibold transition-colors ${
                    paymentMode === mode
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                      : 'hover:bg-[var(--color-muted)]'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {paymentMode === 'MIXED' && (
              <div className="space-y-2">
                <Input
                  placeholder="Cash amount"
                  type="number"
                  value={mixedCash}
                  onChange={(e) => setMixedCash(e.target.value)}
                />
                <Input
                  placeholder="UPI amount"
                  type="number"
                  value={mixedUpi}
                  onChange={(e) => setMixedUpi(e.target.value)}
                />
              </div>
            )}

            <div className="mt-auto space-y-1.5">
              <Button
                className="w-full"
                variant="accent"
                disabled={saving || lines.length === 0}
                onClick={() => handleSave(false)}
              >
                <Save className="h-4 w-4" />
                Save Bill (F8)
              </Button>
              <Button
                className="w-full"
                variant="default"
                disabled={saving || lines.length === 0 || !settings}
                onClick={() => handleSave(true, true)}
              >
                <FileText className="h-4 w-4" />
                Save & Print
              </Button>
              <Button
                className="w-full"
                variant="outline"
                disabled={saving || lines.length === 0 || !settings}
                onClick={() => handleSave(true)}
              >
                <Printer className="h-4 w-4" />
                Save & Print Receipt
              </Button>
              <Button
                className="w-full"
                variant="outline"
                disabled={lines.length === 0}
                onClick={clearBill}
              >
                <RotateCcw className="h-4 w-4" />
                Clear Bill
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
