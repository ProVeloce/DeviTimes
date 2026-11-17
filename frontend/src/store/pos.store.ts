import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartLine } from '@/types';

function calcLine(line: Omit<CartLine, 'gstAmount' | 'lineTotal'>): Pick<CartLine, 'gstAmount' | 'lineTotal'> {
  const gross = line.quantity * line.unitPrice;
  const afterDiscount = Math.max(0, gross - line.discount);
  const gstAmount = Math.round(((afterDiscount * line.gstPercent) / 100) * 100) / 100;
  const lineTotal = Math.round((afterDiscount + gstAmount) * 100) / 100;
  return { gstAmount, lineTotal };
}

interface PosState {
  lines: CartLine[];
  billDiscount: number;
  customerName: string;
  customerPhone: string;
  addLine: (line: Omit<CartLine, 'id' | 'gstAmount' | 'lineTotal'>) => void;
  updateLine: (id: string, updates: Partial<CartLine>) => void;
  removeLine: (id: string) => void;
  clearBill: () => void;
  setBillDiscount: (n: number) => void;
  setCustomer: (name: string, phone: string) => void;
  getTotals: () => { subtotal: number; gst: number; discount: number; grandTotal: number };
}

export const usePosStore = create<PosState>()(persist((set, get) => ({
  lines: [],
  billDiscount: 0,
  customerName: '',
  customerPhone: '',

  addLine: (line) => {
    const existing = get().lines.find(
      (l) =>
        l.variantId === line.variantId &&
        l.productId === line.productId &&
        l.itemCode === line.itemCode
    );
    if (existing) {
      get().updateLine(existing.id, { quantity: existing.quantity + line.quantity });
      return;
    }
    const calc = calcLine({ ...line, id: '' });
    set((s) => ({
      lines: [
        ...s.lines,
        { ...line, id: crypto.randomUUID(), ...calc },
      ],
    }));
  },

  updateLine: (id, updates) => {
    set((s) => ({
      lines: s.lines.map((l) => {
        if (l.id !== id) return l;
        const merged = { ...l, ...updates };
        return { ...merged, ...calcLine(merged) };
      }),
    }));
  },

  removeLine: (id) => set((s) => ({ lines: s.lines.filter((l) => l.id !== id) })),

  clearBill: () =>
    set({ lines: [], billDiscount: 0, customerName: '', customerPhone: '' }),

  setBillDiscount: (n) => set({ billDiscount: n }),

  setCustomer: (customerName, customerPhone) => set({ customerName, customerPhone }),

  getTotals: () => {
    const { lines, billDiscount } = get();
    const subtotal = lines.reduce((s, l) => s + l.lineTotal - l.gstAmount, 0);
    const gst = lines.reduce((s, l) => s + l.gstAmount, 0);
    const lineDiscount = lines.reduce((s, l) => s + l.discount, 0);
    const grandTotal = Math.round((subtotal + gst - billDiscount) * 100) / 100;
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      gst: Math.round(gst * 100) / 100,
      discount: lineDiscount + billDiscount,
      grandTotal,
    };
  },
}), {
  name: 'devi-pos-cart',
  partialize: (state) => ({
    lines: state.lines,
    billDiscount: state.billDiscount,
    customerName: state.customerName,
    customerPhone: state.customerPhone,
  }),
}));
