import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { Product } from '@/types';
import { searchProducts, deleteProduct } from '@/services/products.service';
import { listCategories } from '@/services/categories.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';
import { useAuthStore } from '@/store/auth.store';
import { ProductFormDialog } from '@/components/products/ProductFormDialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PageHeader } from '@/components/layout/PageHeader';

export function ProductsPage() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const qc = useQueryClient();

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: listCategories,
    staleTime: 60_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['products', search, categoryFilter],
    queryFn: () => searchProducts(search || undefined, categoryFilter || undefined),
  });

  const removeMutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      toast('Deleted', 'Product deactivated');
      setProductToDelete(null);
    },
    onError: () => toast('Error', 'Could not delete product', 'error'),
  });

  const products = data?.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description="Manage catalogue, variants, and barcodes"
      >
        {isAdmin() && (
          <Button variant="accent" onClick={() => { setEditProduct(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" />
            Add Product
          </Button>
        )}
      </PageHeader>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-2 p-4 pb-2">
          <div className="relative min-w-[200px] flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--color-muted-foreground)]" />
            <Input
              className="pl-9"
              placeholder="Search by name, code, barcode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="flex h-9 min-w-[160px] rounded-lg border border-[var(--color-input)] bg-white px-3 text-sm"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <table className="data-table w-full text-sm">
              <thead className="text-left">
                <tr>
                  <th className="p-3">S.No</th>
                  <th className="p-3">Code</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Stock</th>
                  <th className="p-3">MRP</th>
                  <th className="p-3">GST</th>
                  <th className="p-3">Barcode</th>
                  {isAdmin() && <th className="p-3 w-24" />}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-[var(--color-muted-foreground)]">
                      Loading...
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-[var(--color-muted-foreground)]">
                      No products found
                    </td>
                  </tr>
                ) : (
                  products.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="p-3 font-mono text-xs">{p.serialNo ?? '—'}</td>
                      <td className="p-3 font-mono text-xs">{p.code}</td>
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3">{p.category?.name ?? '—'}</td>
                      <td className="p-3">
                        {p.hasVariants ? (
                          <Badge variant="default">
                            {p.variants?.reduce((s, v) => s + v.stockQuantity, 0) ?? 0} units
                          </Badge>
                        ) : (
                          p.stockQuantity
                        )}
                      </td>
                      <td className="p-3 font-semibold">{formatCurrency(Number(p.sellingPrice))}</td>
                      <td className="p-3">{Number(p.gstPercent)}%</td>
                      <td className="p-3 font-mono text-xs">{p.barcode ?? '—'}</td>
                      {isAdmin() && (
                        <td className="p-3">
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => { setEditProduct(p); setDialogOpen(true); }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setProductToDelete(p)}
                              aria-label={`Delete ${p.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {isAdmin() && (
        <>
          <ProductFormDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            product={editProduct}
            onSuccess={() => {
              qc.invalidateQueries({ queryKey: ['products'] });
              qc.invalidateQueries({ queryKey: ['categories'] });
              setDialogOpen(false);
            }}
          />

          <ConfirmDialog
            open={productToDelete !== null}
            onOpenChange={(open) => !open && setProductToDelete(null)}
            title="Delete product?"
            description={
              productToDelete ? (
                <>
                  Remove <strong>{productToDelete.name}</strong> ({productToDelete.code}) from the
                  catalogue? The product will be deactivated and hidden from POS and search.
                </>
              ) : (
                ''
              )
            }
            confirmLabel="Delete"
            destructive
            loading={removeMutation.isPending}
            onConfirm={() => {
              if (productToDelete) removeMutation.mutate(productToDelete.id);
            }}
          />
        </>
      )}
    </div>
  );
}
