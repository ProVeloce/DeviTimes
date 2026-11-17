import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api, downloadBlob } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import {
  getCachedCancelledInvoiceIds,
  getPendingMutations,
} from '@/lib/offline-sync';
import { useAuthStore } from '@/store/auth.store';
import { calcLineTotal } from '@/lib/pos-calculations';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import * as Tabs from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/layout/PageHeader';

interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  createdAt: string | Date;
  customer?: { name: string } | null;
  subtotal: number;
  gstAmount: number;
  discount: number;
  grandTotal: number;
  payments: Array<{ mode: string; amount: number }>;
  status: string;
}

interface SalesReport {
  invoices: SalesInvoice[];
  summary: { count: number; totalSales: number; totalGst: number; byPayment: Record<string, number> };
}

async function applyPendingSalesChanges(report: SalesReport, from: string, to: string) {
  const currentUserId = useAuthStore.getState().user?.id;
  const mutations = (await getPendingMutations()).filter((item) => item.userId === currentUserId);
  const cancelledIds = new Set([
    ...mutations
      .filter((item) => item.method === 'POST' && item.path.endsWith('/cancel'))
      .map((item) => decodeURIComponent(item.path.slice('/invoices/'.length, -'/cancel'.length))),
    ...await getCachedCancelledInvoiceIds(),
  ]);
  const result = {
    ...report,
    invoices: [...report.invoices],
    summary: { ...report.summary, byPayment: { ...report.summary.byPayment } },
  };
  const isInRange = (value: string | Date) => {
    const date = new Date(value).toISOString().slice(0, 10);
    return (!from || date >= from) && (!to || date <= to);
  };

  for (const invoiceId of cancelledIds) {
    const cancelled = result.invoices.find((invoice) => invoice.id === invoiceId);
    if (!cancelled) continue;
    result.invoices = result.invoices.filter((invoice) => invoice.id !== invoiceId);
    result.summary.count -= 1;
    result.summary.totalSales -= Number(cancelled.grandTotal);
    result.summary.totalGst -= Number(cancelled.gstAmount);
    for (const payment of cancelled.payments) {
      result.summary.byPayment[payment.mode] =
        (result.summary.byPayment[payment.mode] ?? 0) - Number(payment.amount);
    }
  }

  for (const mutation of mutations) {
    if (mutation.method === 'POST' && mutation.path === '/invoices') {
      const body = mutation.body as {
        customerName?: string;
        items?: Array<{ quantity: number; unitPrice: number; discount?: number; gstPercent?: number }>;
        discount?: number;
        payments?: Array<{ mode: string; amount: number }>;
        clientRequestId?: string;
      };
      if (!isInRange(mutation.createdAt)) continue;
      const totals = (body.items ?? []).map((item) =>
        calcLineTotal(item.quantity, item.unitPrice, item.discount ?? 0, item.gstPercent ?? 5)
      );
      const subtotal = totals.reduce((sum, item) => sum + item.lineSubtotal, 0);
      const gstAmount = totals.reduce((sum, item) => sum + item.gstAmount, 0);
      const discount = Number(body.discount) || 0;
      const payments = body.payments ?? [];
      result.invoices.push({
        id: `offline-${mutation.id}`,
        invoiceNumber: `OFFLINE-${new Date(mutation.createdAt).toISOString().slice(0, 10).replace(/-/g, '')}-${body.clientRequestId?.slice(0, 8) ?? mutation.id.slice(-8)}`,
        createdAt: mutation.createdAt,
        customer: body.customerName ? { name: body.customerName } : null,
        subtotal,
        gstAmount,
        discount,
        grandTotal: Math.round((subtotal + gstAmount - discount) * 100) / 100,
        payments,
        status: 'SYNC_PENDING',
      });
      result.summary.count += 1;
      result.summary.totalSales += result.invoices[result.invoices.length - 1].grandTotal;
      result.summary.totalGst += gstAmount;
      for (const payment of payments) {
        result.summary.byPayment[payment.mode] =
          (result.summary.byPayment[payment.mode] ?? 0) + Number(payment.amount);
      }
    }
  }
  return result;
}

export function ReportsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString() ? `?${params}` : '';

  const { data: sales } = useQuery({
    queryKey: ['report-sales', from, to],
    queryFn: async () => applyPendingSalesChanges(
      await api<SalesReport>(`/reports/sales${qs}`),
      from,
      to
    ),
  });

  const { data: gst } = useQuery({
    queryKey: ['report-gst', from, to],
    queryFn: () => api<{ byRate: Record<string, { taxable: number; gst: number }>; totalGst: number }>(
      `/reports/gst${qs}`
    ),
  });

  const { data: inventory } = useQuery({
    queryKey: ['report-inventory'],
    queryFn: () =>
      api<
        Array<{
          code: string;
          name: string;
          variant: string;
          stock: number;
          value: number;
        }>
      >('/reports/inventory'),
  });

  const handleExportCsv = async () => {
    try {
      const report = await api<{
        invoices: Array<{
          id: string;
          invoiceNumber: string;
          createdAt: string | Date;
          customer?: { name: string } | null;
          subtotal: number;
          gstAmount: number;
          discount: number;
          grandTotal: number;
          payments: Array<{ mode: string }>;
          status: string;
        }>;
      }>(`/reports/sales${qs}`);
      const currentUserId = useAuthStore.getState().user?.id;
      const mutations = (await getPendingMutations()).filter((item) => item.userId === currentUserId);
      const cancelledIds = new Set(
        [
          ...mutations
            .filter((item) => item.method === 'POST' && item.path.endsWith('/cancel'))
            .map((item) => decodeURIComponent(item.path.slice('/invoices/'.length, -'/cancel'.length))),
          ...await getCachedCancelledInvoiceIds(),
        ]
      );
      const rows = report.invoices
        .filter((invoice) => invoice.status === 'COMPLETED' && !cancelledIds.has(invoice.id))
        .map((invoice) => ({
          invoice: invoice.invoiceNumber,
          date: new Date(invoice.createdAt).toISOString(),
          customer: invoice.customer?.name ?? 'Walk-in',
          subtotal: Number(invoice.subtotal),
          gst: Number(invoice.gstAmount),
          discount: Number(invoice.discount),
          total: Number(invoice.grandTotal),
          payment: invoice.payments.map((payment) => payment.mode).join(';'),
        }));

      for (const mutation of mutations) {
        if (mutation.method !== 'POST' || mutation.path !== '/invoices') continue;
        const body = mutation.body as {
          customerName?: string;
          items?: Array<{
            quantity: number;
            unitPrice: number;
            discount?: number;
            gstPercent?: number;
          }>;
          discount?: number;
          payments?: Array<{ mode: string }>;
          clientRequestId?: string;
        };
        const items = body.items ?? [];
        const totals = items.map((item) =>
          calcLineTotal(item.quantity, item.unitPrice, item.discount ?? 0, item.gstPercent ?? 5)
        );
        const subtotal = totals.reduce((sum, item) => sum + item.lineSubtotal, 0);
        const gst = totals.reduce((sum, item) => sum + item.gstAmount, 0);
        const discount = Number(body.discount) || 0;
        const createdAt = new Date(mutation.createdAt);
        const dateOnly = createdAt.toISOString().slice(0, 10);
        if ((from && dateOnly < from) || (to && dateOnly > to)) continue;
        rows.push({
          invoice: `OFFLINE-${dateOnly.replace(/-/g, '')}-${body.clientRequestId?.slice(0, 8) ?? mutation.id.slice(-8)}`,
          date: createdAt.toISOString(),
          customer: body.customerName ?? 'Walk-in',
          subtotal,
          gst,
          discount,
          total: Math.round((subtotal + gst - discount) * 100) / 100,
          payment: (body.payments ?? []).map((payment) => payment.mode).join(';'),
        });
      }

      rows.sort((a, b) => a.date.localeCompare(b.date));
      const escapeCsv = (value: string | number) => {
        let text = String(value);
        if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
      };
      const header = ['Invoice', 'Date', 'Customer', 'Subtotal', 'GST', 'Discount', 'Total', 'Payment'];
      const csv = [header, ...rows.map((row) => [
        row.invoice, row.date, row.customer, row.subtotal, row.gst,
        row.discount, row.total, row.payment,
      ])].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
      downloadBlob(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), 'sales-report.csv');
    } catch (error) {
      toast('Export failed', error instanceof Error ? error.message : 'Sales report is not available offline', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Sales, GST, and inventory analytics">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-[10px] text-[var(--color-muted-foreground)]">From</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8" />
          </div>
          <div>
            <label className="text-[10px] text-[var(--color-muted-foreground)]">To</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8" />
          </div>
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </PageHeader>

      <Tabs.Root defaultValue="sales">
        <Tabs.List className="flex w-fit gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)] p-1">
          {['sales', 'gst', 'inventory'].map((tab) => (
            <Tabs.Trigger
              key={tab}
              value={tab}
              className={cn(
                'rounded-md px-4 py-1.5 text-sm font-medium capitalize data-[state=active]:bg-white data-[state=active]:shadow-sm'
              )}
            >
              {tab}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="sales" className="mt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-[var(--color-muted-foreground)]">Invoices</p>
                <p className="text-2xl font-bold">{sales?.summary.count ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-[var(--color-muted-foreground)]">Total Sales</p>
                <p className="text-2xl font-bold">{formatCurrency(sales?.summary.totalSales ?? 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-[var(--color-muted-foreground)]">Total GST</p>
                <p className="text-2xl font-bold">{formatCurrency(sales?.summary.totalGst ?? 0)}</p>
              </CardContent>
            </Card>
          </div>
          {sales?.summary.byPayment && (
            <Card className="mt-3">
              <CardHeader><CardTitle className="text-sm">By Payment Mode</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(sales.summary.byPayment).map(([mode, amt]) => (
                  <div key={mode} className="flex justify-between text-sm">
                    <span>{mode}</span>
                    <span className="font-semibold">{formatCurrency(amt)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </Tabs.Content>

        <Tabs.Content value="gst" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">GST Summary — Total {formatCurrency(gst?.totalGst ?? 0)}</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--color-muted-foreground)]">
                    <th className="pb-2">Rate</th>
                    <th className="pb-2">Taxable</th>
                    <th className="pb-2">GST</th>
                  </tr>
                </thead>
                <tbody>
                  {gst &&
                    Object.entries(gst.byRate).map(([rate, vals]) => (
                      <tr key={rate} className="border-t">
                        <td className="py-2">{rate}%</td>
                        <td className="py-2">{formatCurrency(vals.taxable)}</td>
                        <td className="py-2 font-semibold">{formatCurrency(vals.gst)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </Tabs.Content>

        <Tabs.Content value="inventory" className="mt-4">
          <Card>
            <CardContent className="max-h-[500px] overflow-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-[var(--color-muted)] text-left text-xs uppercase text-[var(--color-muted-foreground)]">
                  <tr>
                    <th className="p-3">Code</th>
                    <th className="p-3">Name</th>
                    <th className="p-3">Variant</th>
                    <th className="p-3">Stock</th>
                    <th className="p-3">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory?.map((row, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-3 font-mono text-xs">{row.code}</td>
                      <td className="p-3">{row.name}</td>
                      <td className="p-3">{row.variant}</td>
                      <td className="p-3">{row.stock}</td>
                      <td className="p-3 font-semibold">{formatCurrency(row.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
