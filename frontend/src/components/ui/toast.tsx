import * as Toast from '@radix-ui/react-toast';
import { cn } from '@/lib/utils';
import { create } from 'zustand';

type ToastItem = { id: string; title: string; description?: string; variant?: 'default' | 'error' };

type ToastStore = {
  toasts: ToastItem[];
  add: (t: Omit<ToastItem, 'id'>) => void;
  remove: (id: string) => void;
};

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (t) =>
    set((s) => ({
      toasts: [...s.toasts, { ...t, id: crypto.randomUUID() }],
    })),
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export function toast(title: string, description?: string, variant: 'default' | 'error' = 'default') {
  useToastStore.getState().add({ title, description, variant });
}

export function Toaster() {
  const { toasts, remove } = useToastStore();

  return (
    <Toast.Provider swipeDirection="right">
      {toasts.map((t) => (
        <Toast.Root
          key={t.id}
          className={cn(
            'rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 shadow-[var(--shadow-md)]',
            t.variant === 'error' && 'border-red-200'
          )}
          onOpenChange={(open) => !open && remove(t.id)}
          open
          duration={4000}
        >
          <Toast.Title className="text-sm font-semibold">{t.title}</Toast.Title>
          {t.description && (
            <Toast.Description className="mt-1 text-xs text-[var(--color-muted-foreground)]">
              {t.description}
            </Toast.Description>
          )}
        </Toast.Root>
      ))}
      <Toast.Viewport className="fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2" />
    </Toast.Provider>
  );
}
