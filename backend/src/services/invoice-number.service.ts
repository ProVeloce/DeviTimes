import { desc, like } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { invoices } from '../db/schema/index.js';

export async function generateInvoiceNumber(db: Database): Promise<string> {
  const today = new Date();
  const prefix = `DEVI${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

  const last = await db
    .select({ invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(like(invoices.invoiceNumber, `${prefix}%`))
    .orderBy(desc(invoices.invoiceNumber))
    .limit(1);

  let seq = 1;
  if (last[0]?.invoiceNumber) {
    const tail = parseInt(last[0].invoiceNumber.slice(prefix.length), 10);
    if (!Number.isNaN(tail)) seq = tail + 1;
  }

  return `${prefix}${String(seq).padStart(4, '0')}`;
}
