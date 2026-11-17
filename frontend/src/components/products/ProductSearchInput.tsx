import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { searchProducts } from '@/services/products.service';
import type { Product, ProductVariant } from '@/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface ProductPick {
  productId: string;
  variantId?: string;
  label: string;
  stockQuantity: number;
}

interface Props {
  value: ProductPick | null;
  onChange: (pick: ProductPick | null) => void;
  label?: string;
  disabled?: boolean;
}

function variantLabel(v: ProductVariant, productName: string) {
  const attrs = [v.color, v.size].filter(Boolean).join(' / ');
  return attrs ? `${productName} — ${attrs} (${v.sku})` : `${productName} — ${v.sku}`;
}

export function ProductSearchInput({ value, onChange, label = 'Product name', disabled }: Props) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (value) {
      setQuery(value.label);
      setPendingProduct(null);
    }
  }, [value]);

  const { data, isFetching } = useQuery({
    queryKey: ['product-search', debouncedQuery],
    queryFn: () => searchProducts(debouncedQuery),
    enabled: !disabled && debouncedQuery.length >= 1 && !value,
  });

  const results = data?.data ?? [];

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const clear = () => {
    onChange(null);
    setQuery('');
    setPendingProduct(null);
    setOpen(false);
  };

  const selectProduct = (product: Product) => {
    if (product.hasVariants && product.variants && product.variants.length > 0) {
      setPendingProduct(product);
      setQuery(product.name);
      setOpen(true);
      return;
    }
    onChange({
      productId: product.id,
      label: `${product.name} (${product.code})`,
      stockQuantity: product.stockQuantity,
    });
    setQuery(`${product.name} (${product.code})`);
    setOpen(false);
    setPendingProduct(null);
  };

  const selectVariant = (product: Product, variant: ProductVariant) => {
    onChange({
      productId: product.id,
      variantId: variant.id,
      label: variantLabel(variant, product.name),
      stockQuantity: variant.stockQuantity,
    });
    setQuery(variantLabel(variant, product.name));
    setOpen(false);
    setPendingProduct(null);
  };

  const showDropdown =
    open &&
    !value &&
    (pendingProduct !== null || debouncedQuery.length >= 1);

  return (
    <div ref={containerRef} className="space-y-1">
      <Label>{label}</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--color-muted-foreground)]" />
        <Input
          className="pl-9 pr-9"
          placeholder="Type name, code, or barcode…"
          value={query}
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            setOpen(true);
            if (value) onChange(null);
            if (pendingProduct && !next.startsWith(pendingProduct.name)) {
              setPendingProduct(null);
            }
          }}
          onFocus={() => setOpen(true)}
        />
        {(value || query) && (
          <button
            type="button"
            className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
            onClick={clear}
            aria-label="Clear product"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {showDropdown && (
          <ul
            className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-[var(--color-input)] bg-white py-1 text-sm shadow-lg"
            role="listbox"
          >
            {pendingProduct ? (
              <>
                <li className="px-3 py-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">
                  Select variant for {pendingProduct.name}
                </li>
                {pendingProduct.variants?.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      role="option"
                      className="flex w-full flex-col px-3 py-2 text-left hover:bg-[var(--color-muted)]"
                      onClick={() => selectVariant(pendingProduct, v)}
                    >
                      <span className="font-medium">
                        {[v.color, v.size].filter(Boolean).join(' / ') || v.sku}
                      </span>
                      <span className="text-xs text-[var(--color-muted-foreground)]">
                        SKU {v.sku} · Stock {v.stockQuantity}
                      </span>
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
                    onClick={() => setPendingProduct(null)}
                  >
                    ← Back to search
                  </button>
                </li>
              </>
            ) : isFetching && results.length === 0 ? (
              <li className="px-3 py-2 text-[var(--color-muted-foreground)]">Searching…</li>
            ) : results.length === 0 ? (
              <li className="px-3 py-2 text-[var(--color-muted-foreground)]">No matching products</li>
            ) : (
              results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    className={cn(
                      'flex w-full flex-col px-3 py-2 text-left hover:bg-[var(--color-muted)]',
                      p.hasVariants && 'border-b border-[var(--color-muted)]/50'
                    )}
                    onClick={() => selectProduct(p)}
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      {p.code}
                      {p.serialNo ? ` · S.No ${p.serialNo}` : ''}
                      {p.hasVariants
                        ? ` · ${p.variants?.length ?? 0} variant(s)`
                        : ` · Stock ${p.stockQuantity}`}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      {value && (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Current stock: <span className="font-mono font-medium">{value.stockQuantity}</span>
        </p>
      )}
    </div>
  );
}
