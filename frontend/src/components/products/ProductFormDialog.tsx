import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createProduct, updateProduct } from '@/services/products.service';
import { createCategory, listCategories } from '@/services/categories.service';
import type { Product } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onSuccess: () => void;
}

export function ProductFormDialog({ open, onOpenChange, product, onSuccess }: Props) {
  const qc = useQueryClient();
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [form, setForm] = useState({
    serialNo: '',
    code: '',
    name: '',
    description: '',
    categoryId: '',
    brand: '',
    purchasePrice: '',
    sellingPrice: '',
    stockQuantity: '0',
    barcode: '',
    gstPercent: '5',
    hasVariants: false,
  });

  const {
    data: categories = [],
    isLoading: categoriesLoading,
    isError: categoriesError,
    refetch: refetchCategories,
  } = useQuery({
    queryKey: ['categories'],
    queryFn: listCategories,
    enabled: open,
    staleTime: 60_000,
  });

  const addCategoryMutation = useMutation({
    mutationFn: (name: string) => createCategory(name),
    onSuccess: (cat) => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      setForm((f) => ({ ...f, categoryId: cat.id }));
      setNewCategoryName('');
      toast(cat.syncStatus ? 'Saved on this device' : 'Category added', cat.name);
    },
    onError: () => toast('Error', 'Could not add category', 'error'),
  });

  useEffect(() => {
    if (!open) return;
    if (product) {
      setForm({
        serialNo: product.serialNo ?? '',
        code: product.code,
        name: product.name,
        description: product.description ?? '',
        categoryId: product.categoryId ?? '',
        brand: product.brand ?? '',
        purchasePrice: String(product.purchasePrice),
        sellingPrice: String(product.sellingPrice),
        stockQuantity: String(product.stockQuantity),
        barcode: product.barcode ?? '',
        gstPercent: String(product.gstPercent),
        hasVariants: product.hasVariants,
      });
    } else {
      setForm({
        serialNo: '',
        code: '',
        name: '',
        description: '',
        categoryId: '',
        brand: '',
        purchasePrice: '',
        sellingPrice: '',
        stockQuantity: '0',
        barcode: '',
        gstPercent: '5',
        hasVariants: false,
      });
    }
    setNewCategoryName('');
    setConfirmSaveOpen(false);
  }, [product, open]);

  const buildPayload = () => ({
    serialNo: form.serialNo.trim() || null,
    code: form.code.trim(),
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    categoryId: form.categoryId || null,
    brand: form.brand.trim() || undefined,
    purchasePrice: Number(form.purchasePrice),
    sellingPrice: Number(form.sellingPrice),
    stockQuantity: Number.parseInt(form.stockQuantity, 10) || 0,
    barcode: form.barcode.trim() || null,
    gstPercent: Number(form.gstPercent),
    hasVariants: form.hasVariants,
  });

  const saveProduct = async () => {
    const payload = buildPayload();
    setSaving(true);
    try {
      if (product) {
        const result = await updateProduct(product.id, payload);
        toast(result ? 'Updated' : 'Saved on this device', result ? 'Product saved' : 'Will sync when online');
      } else {
        const result = await createProduct(payload);
        toast(result.syncStatus ? 'Saved on this device' : 'Created', result.syncStatus ? 'Will sync when online' : 'Product added');
      }
      setConfirmSaveOpen(false);
      onSuccess();
    } catch {
      toast('Error', 'Could not save product', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (product) {
      setConfirmSaveOpen(true);
      return;
    }
    void saveProduct();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? 'Edit Product' : 'Add Product'}</DialogTitle>
          <DialogDescription>
            {product
              ? 'Update product details, pricing, and stock information.'
              : 'Enter product details below. Categories are used for filtering in Products and POS.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="serialNo">S.No</Label>
            <Input
              id="serialNo"
              value={form.serialNo}
              onChange={(e) => setForm({ ...form, serialNo: e.target.value })}
              placeholder="e.g. 101"
              className="font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="code">Product Code</Label>
            <Input
              id="code"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="categoryId">Category</Label>
            <select
              id="categoryId"
              className="flex h-9 w-full rounded-lg border border-[var(--color-input)] bg-white px-3 text-sm"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              disabled={categoriesLoading}
            >
              <option value="">
                {categoriesLoading ? 'Loading categories…' : '— Select category —'}
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {categoriesError && (
              <p className="text-xs text-red-600">
                Could not load categories.{' '}
                <button type="button" className="underline" onClick={() => refetchCategories()}>
                  Retry
                </button>
              </p>
            )}
            {!categoriesLoading && categories.length === 0 && !categoriesError && (
              <p className="text-xs text-[var(--color-muted-foreground)]">
                No categories yet — add one below.
              </p>
            )}
            <div className="mt-2 flex gap-2">
              <Input
                placeholder="New category name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="h-8 text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!newCategoryName.trim() || addCategoryMutation.isPending}
                onClick={() => addCategoryMutation.mutate(newCategoryName.trim())}
              >
                Add
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="brand">Brand</Label>
            <Input
              id="brand"
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="purchasePrice">Purchase Price</Label>
            <Input
              id="purchasePrice"
              type="number"
              step="0.01"
              value={form.purchasePrice}
              onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sellingPrice">Selling Price</Label>
            <Input
              id="sellingPrice"
              type="number"
              step="0.01"
              value={form.sellingPrice}
              onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="stockQuantity">Stock</Label>
            <Input
              id="stockQuantity"
              type="number"
              value={form.stockQuantity}
              onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })}
              disabled={form.hasVariants}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="gstPercent">GST %</Label>
            <Input
              id="gstPercent"
              type="number"
              value={form.gstPercent}
              onChange={(e) => setForm({ ...form, gstPercent: e.target.value })}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="barcode">Barcode</Label>
            <Input
              id="barcode"
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              className="font-mono"
            />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" variant="accent" className="flex-1" disabled={saving}>
              Save Product
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>

      <ConfirmDialog
        open={confirmSaveOpen}
        onOpenChange={setConfirmSaveOpen}
        title="Save product changes?"
        description={
          <>
            You are about to update <strong>{product?.name}</strong> ({product?.code}). This will
            change pricing, stock, and catalogue details.
          </>
        }
        confirmLabel="Save changes"
        loading={saving}
        onConfirm={() => void saveProduct()}
      />
    </Dialog>
  );
}
