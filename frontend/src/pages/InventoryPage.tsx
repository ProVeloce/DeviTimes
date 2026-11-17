import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDateTime } from '@/lib/utils';
import { adjustStock, listStockHistory } from '@/services/inventory.service';
import {
  ProductSearchInput,
  type ProductPick,
} from '@/components/products/ProductSearchInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';

export function InventoryPage() {
  const [productPick, setProductPick] = useState<ProductPick | null>(null);
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const qc = useQueryClient();

  const { data: history, isLoading } = useQuery({
    queryKey: ['stock-history'],
    queryFn: () => listStockHistory({ limit: 50 }),
  });

  const adjustMutation = useMutation({
    mutationFn: adjustStock,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['stock-history'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      toast('Stock updated', res.pending === true ? 'Saved on this device and will sync when online' : `New quantity: ${res.newQty}`);
      setProductPick(null);
      setQuantity('');
      setNotes('');
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'Stock adjustment failed';
      toast('Error', msg, 'error');
    },
  });

  const handleAdjust = () => {
    if (!productPick) {
      toast('Select product', 'Search and choose a product from the list', 'error');
      return;
    }

    const qty = Number.parseInt(quantity, 10);
    if (!Number.isFinite(qty) || qty === 0) {
      toast('Invalid quantity', 'Enter a non-zero whole number (+ to add, − to remove)', 'error');
      return;
    }

    adjustMutation.mutate({
      productId: productPick.variantId ? undefined : productPick.productId,
      variantId: productPick.variantId,
      quantity: qty,
      type: 'ADJUSTMENT',
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Stock history and manual adjustments"
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm">Stock Adjustment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ProductSearchInput value={productPick} onChange={setProductPick} />
            <div className="space-y-1">
              <Label htmlFor="adj-qty">Quantity (+/-)</Label>
              <Input
                id="adj-qty"
                type="number"
                placeholder="e.g. 10 or -5"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="adj-notes">Notes</Label>
              <Input
                id="adj-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional reason"
              />
            </div>
            <Button
              variant="accent"
              className="w-full"
              disabled={adjustMutation.isPending}
              onClick={handleAdjust}
            >
              {adjustMutation.isPending ? 'Applying…' : 'Apply Adjustment'}
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Stock History</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[500px] overflow-auto p-0">
            <table className="data-table w-full text-sm">
              <thead className="text-left">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Product</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Qty</th>
                  <th className="p-3">Balance</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center">
                      Loading...
                    </td>
                  </tr>
                ) : !history?.data?.length ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-[var(--color-muted-foreground)]">
                      No stock history yet
                    </td>
                  </tr>
                ) : (
                  history.data.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="p-3 text-xs">{formatDateTime(row.createdAt)}</td>
                      <td className="p-3">
                        {row.product?.name ?? row.variant?.sku}
                        {row.variant && (
                          <span className="text-[10px] text-[var(--color-muted-foreground)]">
                            {' '}
                            {[row.variant.color, row.variant.size].filter(Boolean).join('/')}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <Badge variant={row.quantity < 0 ? 'warning' : 'success'}>
                          {row.type}
                        </Badge>
                      </td>
                      <td className="p-3 font-mono">
                        {row.quantity > 0 ? '+' : ''}
                        {row.quantity}
                      </td>
                      <td className="p-3">{row.newQty}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
