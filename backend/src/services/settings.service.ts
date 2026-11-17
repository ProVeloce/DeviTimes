import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { settings } from '../db/schema/index.js';
import { newId } from '../utils/id.js';
import { parseJson, stringifyJson } from '../utils/json.js';

export const DEFAULT_SETTINGS = {
  shopName: 'Devi Times',
  shopTagline: '',
  address: '',
  phone: '',
  email: '',
  gstin: '',
  logoUrl: '',
  currency: 'INR',
  currencySymbol: '₹',
  defaultGstPercent: 5,
  invoicePrefix: 'DEVI',
  thermalPrinterName: '',
  a4PrinterName: '',
  lowStockThreshold: 10,
  theme: 'light',
  invoiceFooter: 'Thank you for shopping with us!',
  showLogoOnInvoice: true,
};

export type ShopSettings = typeof DEFAULT_SETTINGS;

export async function getSettings(db: Database): Promise<ShopSettings> {
  const rows = await db.select().from(settings);
  const merged = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.key in merged) {
      const key = row.key as keyof ShopSettings;
      const defaultValue = DEFAULT_SETTINGS[key];
      (merged as Record<string, unknown>)[row.key] = parseJson(row.value, defaultValue);
    }
  }
  return merged;
}

export async function updateSettings(db: Database, updates: Partial<ShopSettings>) {
  const now = new Date();
  for (const [key, value] of Object.entries(updates)) {
    const existing = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
    if (existing[0]) {
      await db
        .update(settings)
        .set({ value: stringifyJson(value), updatedAt: now })
        .where(eq(settings.key, key));
    } else {
      await db.insert(settings).values({
        id: newId(),
        key,
        value: stringifyJson(value),
        updatedAt: now,
      });
    }
  }
  return getSettings(db);
}

export async function ensureDefaultSettings(db: Database) {
  const rows = await db.select().from(settings).limit(1);
  if (rows.length === 0) {
    await updateSettings(db, DEFAULT_SETTINGS);
  }
}

export async function getSettingNumber(db: Database, key: string, fallback: number): Promise<number> {
  const row = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  if (!row[0]) return fallback;
  const v = parseJson<number | string>(row[0].value, fallback);
  return typeof v === 'number' ? v : fallback;
}
