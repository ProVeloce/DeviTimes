import { api } from '@/lib/api';
import { getPendingMutations, queueMutation } from '@/lib/offline-sync';
import { useAuthStore } from '@/store/auth.store';
import type { Category } from '@/types';

export async function listCategories() {
  const categories = await api<Category[]>('/categories');
  const userId = useAuthStore.getState().user?.id;
  const queued = (await getPendingMutations())
    .filter((mutation) => mutation.userId === userId && mutation.method === 'POST' && mutation.path === '/categories')
    .map((mutation) => {
      const body = mutation.body as Omit<Category, 'syncStatus'>;
      return { id: body.id, name: body.name, description: body.description, syncStatus: 'pending' as const };
    });
  const merged = new Map(categories.map((category) => [category.id, category]));
  for (const category of queued) merged.set(category.id, category);
  return [...merged.values()];
}

export async function createCategory(name: string, description?: string) {
  const body = {
    id: crypto.randomUUID(),
    name: name.trim(),
    description: description?.trim() || undefined,
  };
  try {
    return await api<Category>('/categories', { method: 'POST', body: JSON.stringify(body) });
  } catch (error) {
    if (error instanceof TypeError) {
      await queueMutation('POST', '/categories', body);
      return { ...body, syncStatus: 'pending' as const };
    }
    throw error;
  }
}
