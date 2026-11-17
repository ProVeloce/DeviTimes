import { create } from 'zustand';
import { useAuthStore } from '@/store/auth.store';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';
const LEGACY_MUTATIONS_KEY = 'devi-times-offline-mutations';
const CACHE_DB_NAME = 'devi-times-offline-cache';
const CACHE_STORE = 'responses';
const MUTATION_STORE = 'mutations';

export type OfflineMethod = 'POST' | 'PUT' | 'DELETE';

export interface OfflineMutation {
  id: string;
  method: OfflineMethod;
  path: string;
  body?: unknown;
  createdAt: string;
  userId: string | null;
}

interface SyncStatus {
  online: boolean;
  pendingCount: number;
  syncing: boolean;
  error: string | null;
  set: (status: Partial<Omit<SyncStatus, 'set'>>) => void;
}

export const useSyncStatus = create<SyncStatus>((set) => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pendingCount: 0,
  syncing: false,
  error: null,
  set: (status) => set(status),
}));

function normalizeCacheKey(path: string) {
  const userId = useAuthStore.getState().user?.id ?? 'anonymous';
  return `${userId}:${path.startsWith('/') ? path : `/${path}`}`;
}

let cacheDbPromise: Promise<IDBDatabase> | null = null;

function openCacheDb(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('This browser does not support offline storage.'));
  }
  if (cacheDbPromise) return cacheDbPromise;

  let legacyMutations: OfflineMutation[] = [];
  const legacyRaw = window.localStorage.getItem(LEGACY_MUTATIONS_KEY);
  if (legacyRaw) {
    try {
      legacyMutations = JSON.parse(legacyRaw) as OfflineMutation[];
    } catch (error) {
      console.warn('[offline-sync] could not migrate legacy pending changes', error);
    }
  }

  cacheDbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(CACHE_DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(CACHE_STORE)) {
        request.result.createObjectStore(CACHE_STORE);
      }
      if (!request.result.objectStoreNames.contains(MUTATION_STORE)) {
        request.result.createObjectStore(MUTATION_STORE, { keyPath: 'id' });
      }
      if (legacyMutations.length) {
        const store = request.transaction?.objectStore(MUTATION_STORE);
        for (const mutation of legacyMutations) store?.put(mutation);
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        cacheDbPromise = null;
      };
      if (legacyMutations.length) window.localStorage.removeItem(LEGACY_MUTATIONS_KEY);
      resolve(request.result);
    };
    request.onerror = () => {
      cacheDbPromise = null;
      reject(request.error ?? new Error('Could not open offline storage.'));
    };
    request.onblocked = () => {
      cacheDbPromise = null;
      reject(new Error('Offline storage is blocked by another app tab.'));
    };
  });
  return cacheDbPromise;
}

export async function getPendingMutations(): Promise<OfflineMutation[]> {
  const database = await openCacheDb();
  return new Promise((resolve, reject) => {
    const request = database.transaction(MUTATION_STORE, 'readonly').objectStore(MUTATION_STORE).getAll();
    request.onsuccess = () => resolve(
      (request.result as OfflineMutation[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    );
    request.onerror = () => reject(request.error ?? new Error('Could not read pending offline changes.'));
  });
}

export async function getPendingMutationCount() {
  const userId = useAuthStore.getState().user?.id;
  const mutations = await getPendingMutations();
  const count = mutations.filter((mutation) => mutation.userId === userId).length;
  useSyncStatus.getState().set({ pendingCount: count });
  return count;
}

export async function queueMutation(method: OfflineMethod, path: string, body?: unknown): Promise<OfflineMutation> {
  const mutation: OfflineMutation = {
    id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    method,
    path,
    body,
    createdAt: new Date().toISOString(),
    userId: useAuthStore.getState().user?.id ?? null,
  };

  const database = await openCacheDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(MUTATION_STORE, 'readwrite');
    transaction.objectStore(MUTATION_STORE).add(mutation);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not queue offline change.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not queue offline change.'));
  });
  await getPendingMutationCount();
  if (navigator.onLine) void syncPendingMutations();
  return mutation;
}

export async function removeMutation(id: string) {
  const database = await openCacheDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(MUTATION_STORE, 'readwrite');
    transaction.objectStore(MUTATION_STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not remove synced change.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not remove synced change.'));
  });
  await getPendingMutationCount();
}

export async function readCachedResponse<T>(path: string): Promise<T | null> {
  const database = await openCacheDb();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(CACHE_STORE, 'readonly');
    const request = transaction.objectStore(CACHE_STORE).get(normalizeCacheKey(path));
    request.onsuccess = () => resolve(request.result === undefined ? null : (request.result as T));
    request.onerror = () => reject(request.error ?? new Error('Could not read offline data.'));
  });
}

export async function writeCachedResponse(path: string, value: unknown) {
  const database = await openCacheDb();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(CACHE_STORE, 'readwrite');
    transaction.objectStore(CACHE_STORE).put(value, normalizeCacheKey(path));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save offline data.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Offline data save was cancelled.'));
  });
}

export async function updateCachedInvoiceLists(
  invoiceId: string,
  update: { status?: string; remove?: boolean }
) {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return;

  const database = await openCacheDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(CACHE_STORE, 'readwrite');
    const store = transaction.objectStore(CACHE_STORE);
    const prefix = `${userId}:/invoices?`;
    const keysRequest = store.getAllKeys();

    keysRequest.onsuccess = () => {
      for (const key of keysRequest.result) {
        if (typeof key !== 'string' || !key.startsWith(prefix)) continue;
        const getRequest = store.get(key);
        getRequest.onsuccess = () => {
          const cached = getRequest.result as
            | { data?: Array<{ id: string; status?: string }>; total?: number }
            | undefined;
          if (!cached || !Array.isArray(cached.data)) return;
          const exists = cached.data.some((invoice) => invoice.id === invoiceId);
          if (!exists) return;

          const data = update.remove
            ? cached.data.filter((invoice) => invoice.id !== invoiceId)
            : cached.data.map((invoice) =>
                invoice.id === invoiceId ? { ...invoice, status: update.status ?? invoice.status } : invoice
              );
          store.put({
            ...cached,
            data,
            ...(update.remove && typeof cached.total === 'number'
              ? { total: Math.max(0, cached.total - 1) }
              : {}),
          }, key);
        };
        getRequest.onerror = () => {
          transaction.abort();
        };
      }
    };
    keysRequest.onerror = () => transaction.abort();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not update cached invoices.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not update cached invoices.'));
  });
}

export async function getCachedCancelledInvoiceIds(): Promise<string[]> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return [];

  const database = await openCacheDb();
  return new Promise<string[]>((resolve, reject) => {
    const transaction = database.transaction(CACHE_STORE, 'readonly');
    const store = transaction.objectStore(CACHE_STORE);
    const prefix = `${userId}:/invoices?`;
    const cancelled = new Set<string>();
    const keysRequest = store.getAllKeys();

    keysRequest.onsuccess = () => {
      for (const key of keysRequest.result) {
        if (typeof key !== 'string' || !key.startsWith(prefix)) continue;
        const getRequest = store.get(key);
        getRequest.onsuccess = () => {
          const cached = getRequest.result as
            | { data?: Array<{ id: string; status?: string }> }
            | undefined;
          for (const invoice of cached?.data ?? []) {
            if (invoice.status === 'CANCELLED') cancelled.add(invoice.id);
          }
        };
        getRequest.onerror = () => transaction.abort();
      }
    };
    keysRequest.onerror = () => transaction.abort();
    transaction.oncomplete = () => resolve([...cancelled]);
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not read cached invoice statuses.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not read cached invoice statuses.'));
  });
}

let syncInProgress: Promise<number> | null = null;

async function performSync(): Promise<number> {
  const status = useSyncStatus.getState();
  status.set({ online: navigator.onLine });
  if (!navigator.onLine) return 0;

  const userId = useAuthStore.getState().user?.id;
  const token = window.localStorage.getItem('devi_token');
  if (!userId || !token) return 0;

  const queue = (await getPendingMutations()).filter((mutation) => mutation.userId === userId);
  if (!queue.length) {
    status.set({ syncing: false, error: null });
    return 0;
  }

  status.set({ syncing: true, error: null });
  let synced = 0;
  for (const mutation of queue) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    headers.Authorization = `Bearer ${token}`;

    try {
      const request: RequestInit = {
        method: mutation.method,
        headers,
      };

      if (mutation.method !== 'DELETE' && mutation.body !== undefined) {
        request.body = JSON.stringify(mutation.body);
      }

      const response = await fetch(`${API_BASE}${mutation.path}`, request);
      const contentType = response.headers.get('content-type') ?? '';

      if (contentType.includes('application/json')) {
        const payload = await response.json().catch(() => null);
        if (!response.ok || payload?.success === false) {
          const message = payload?.message ?? payload?.error ?? 'Sync failed';
          if (response.status >= 400 && response.status < 500) {
            status.set({ error: `A saved change needs attention: ${message}` });
            break;
          }
          throw new Error(message);
        }

        if (payload?.success === true && 'data' in payload) {
          await writeCachedResponse(mutation.path, payload.data);
          if (mutation.path === '/invoices') {
            const cached = await readCachedResponse<{ data: Array<{ id: string }>; total: number }>('/invoices?');
            if (cached) {
              const localId = `offline-${mutation.id}`;
              const data = cached.data.filter((invoice) => invoice.id !== localId);
              data.unshift(payload.data);
              await writeCachedResponse('/invoices?', { data, total: Math.max(cached.total, data.length) });
            }
          }
        }
      } else if (!response.ok) {
        throw new Error(`Sync failed with status ${response.status}`);
      }

      await removeMutation(mutation.id);
      synced += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed';
      console.warn('[offline-sync] failed to sync queued mutation', mutation.id, error);
      status.set({ error: message });
      break;
    }
  }

  status.set({ syncing: false, pendingCount: await getPendingMutationCount() });
  if (synced > 0) window.dispatchEvent(new Event('offline-sync-complete'));
  return synced;
}

export function syncPendingMutations(): Promise<number> {
  if (!syncInProgress) {
    syncInProgress = performSync().finally(() => {
      syncInProgress = null;
    });
  }
  return syncInProgress;
}
