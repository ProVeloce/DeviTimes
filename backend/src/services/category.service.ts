import { asc, sql } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { categories } from '../db/schema/index.js';
import { newId } from '../utils/id.js';

export const DEFAULT_CATEGORIES = [
  { name: 'Smart Watches', description: 'Smartwatches and fitness bands' },
  { name: 'Analog Watches', description: 'Classic analog wrist watches' },
  { name: 'Wall Clocks', description: 'Decorative and standard wall clocks' },
  { name: 'Digital Clocks', description: 'Digital and LED table/wall clocks' },
  { name: 'Gifts & Novelties', description: 'Gift items, toys and novelties' },
  { name: 'Straps & Accessories', description: 'Watch straps, cells and accessories' },
  { name: 'Service & Repairs', description: 'Watch repair services and spares' },
  { name: 'General', description: 'Miscellaneous items' },
] as const;

/** Insert default textile categories when table is empty (production-safe). */
export async function ensureDefaultCategories(db: Database) {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(categories);
  if (count > 0) return;

  const now = new Date();
  for (const cat of DEFAULT_CATEGORIES) {
    await db.insert(categories).values({
      id: newId(),
      name: cat.name,
      description: cat.description,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function listCategories(db: Database) {
  await ensureDefaultCategories(db);
  return db.select().from(categories).orderBy(asc(categories.name));
}
