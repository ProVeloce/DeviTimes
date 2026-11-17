import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileDown, FileText, Printer, Search } from 'lucide-react';
import { cancelInvoice, listInvoices, downloadInvoiceHtml } from '@/services/invoices.service';
import { api } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import type { Invoice, ShopSettings } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  buildInvoiceHtml,
  buildThermalReceiptHtml,
  openPrintWindow,
  printHtml,
} from '@/lib/invoice-print';
import { useAuthStore } from '@/store/auth.store';
import { toast } from '@/components/ui/toast';
import { PageHeader } from '@/components/layout/PageHeader';

export function InvoicesPage() {
  const [search, setSearch] = useState('');
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<ShopSettings>('/settings'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', search],
    queryFn: () => listInvoices(search ? { search } : undefined),
  });

  const fetchInvoice = async (inv: Invoice) => {
    const full = inv.items && inv.payments ? inv : await api<Invoice>(`/invoices/${inv.id}`);
    return {
      ...full,
      subtotal: Number(full.subtotal),
      gstAmount: Number(full.gstAmount),
      discount: Number(full.discount),
      grandTotal: Number(full.grandTotal),
    };
  };

  const handlePrint = async (inv: Invoice) => {
    if (!settings) {
      toast('Cannot print', 'Shop settings are still loading', 'error');
      return;
    }
    const printWindow = openPrintWindow();
    if (!printWindow) {
      toast('Print blocked', 'Allow pop-ups to print this invoice', 'error');
      return;
    }
    try {
      const full = await fetchInvoice(inv);
      printHtml(buildThermalReceiptHtml(full, settings), printWindow);
    } catch (error) {
      printWindow.close();
      toast('Print failed', error instanceof Error ? error.message : 'Unable to load invoice data', 'error');
    }
  };

  const handlePrintFullInvoice = async (inv: Invoice) => {
    if (!settings) {
      toast('Cannot print', 'Shop settings are still loading', 'error');
      return;
    }
    const printWindow = openPrintWindow();
    if (!printWindow) {
      toast('Print blocked', 'Allow pop-ups to print this invoice', 'error');
      return;
    }
    try {
      const full = await fetchInvoice(inv);
      printHtml(buildInvoiceHtml(full, settings), printWindow);
    } catch (error) {
      printWindow.close();
      toast('Print failed', error instanceof Error ? error.message : 'Unable to load invoice data', 'error');
    }
  };

  const handleDownload = async (inv: Invoice) => {
    if (!settings) {
      toast('Cannot download', 'Shop settings are still loading', 'error');
      return;
    }
    try {
      const html = buildInvoiceHtml(await fetchInvoice(inv), settings);
      downloadInvoiceHtml(`${inv.invoiceNumber}.html`, html);
      toast('Downloaded full invoice', `${inv.invoiceNumber}.html`);
    } catch (error) {
      toast('Download failed', error instanceof Error ? error.message : 'Unable to load invoice data', 'error');
    }
  };

  const handleCancel = async (invoice: Invoice) => {
    const offlineBill = invoice.status === 'SYNC_PENDING';
    const confirmation = offlineBill
      ? 'Remove this bill from this device? It has not synced yet.'
      : 'Cancel this invoice and restore stock?';
    if (!confirm(confirmation)) return;
    try {
      const result = await cancelInvoice(invoice);
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      if (result.removedLocally) {
        toast('Bill removed', 'The unsynced bill was removed from this device');
      } else if (result.pending) {
        toast('Cancellation saved offline', 'It will sync and restore stock when online');
      } else {
        toast('Cancelled', 'Invoice cancelled and stock restored');
      }
    } catch (error) {
      toast('Cancellation failed', error instanceof Error ? error.message : 'Unable to cancel invoice', 'error');
    }
  };

  const invoices = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Invoices" description="View, reprint, and manage bills">
        <div className="relative w-full min-w-[220px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--color-muted-foreground)]" />
          <Input
            className="pl-9"
            placeholder="Search invoice #"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="data-table w-full min-w-[720px] text-sm">
              <thead className="bg-[var(--color-muted)] text-left text-xs uppercase text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="p-3">Invoice #</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Total</th>
                  <th className="p-3">Status</th>
                  <th className="w-44 p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="p-8 text-center">Loading...</td></tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id} className="border-t">
                      <td className="p-3 font-mono text-xs font-medium">{inv.invoiceNumber}</td>
                      <td className="p-3 text-xs">{formatDateTime(inv.createdAt)}</td>
                      <td className="p-3">{inv.customer?.name ?? 'Walk-in'}</td>
                      <td className="p-3 font-semibold">{formatCurrency(Number(inv.grandTotal))}</td>
                      <td className="p-3">
                        <Badge variant={inv.status === 'COMPLETED' ? 'success' : 'destructive'}>
                          {inv.status}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => handlePrint(inv)} title="Print thermal receipt">
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handlePrintFullInvoice(inv)} title="Print full A4 invoice">
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDownload(inv)}
                            title="Download full invoice (HTML)"
                          >
                            <FileDown className="h-3.5 w-3.5" />
                          </Button>
                          {isAdmin() && (inv.status === 'COMPLETED' || inv.status === 'SYNC_PENDING') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs text-red-500"
                              onClick={() => handleCancel(inv)}
                            >
                              {inv.status === 'SYNC_PENDING' ? 'Remove' : 'Cancel'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
