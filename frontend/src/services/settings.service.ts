import { api } from '@/lib/api';
import { queueMutation, readCachedResponse, writeCachedResponse } from '@/lib/offline-sync';
import type { ShopSettings } from '@/types';

export async function saveSettings(body: Partial<ShopSettings>) {
  try {
    const settings = await api<ShopSettings>('/settings', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return { settings, pending: false };
  } catch (error) {
    if (error instanceof TypeError) {
      await queueMutation('PUT', '/settings', body);
      const settings = { ...await readCachedResponse<ShopSettings>('/settings'), ...body } as ShopSettings;
      await writeCachedResponse('/settings', settings);
      return { settings, pending: true };
    }
    throw error;
  }
}
