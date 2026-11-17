export type Role = 'ADMIN' | 'CASHIER';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  hasPassword?: boolean;
  mfaEnabled?: boolean;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  syncStatus?: 'pending';
}

export interface ProductVariant {
  id: string;
  productId: string;
  size?: string;
  color?: string;
  sku: string;
  barcode?: string;
  purchasePrice?: number;
  sellingPrice: number;
  stockQuantity: number;
}

export interface Product {
  id: string;
  serialNo?: string | null;
  code: string;
  name: string;
  description?: string;
  categoryId?: string;
  brand?: string;
  purchasePrice: number;
  sellingPrice: number;
  stockQuantity: number;
  barcode?: string;
  gstPercent: number;
  hasVariants: boolean;
  category?: Category;
  variants?: ProductVariant[];
  syncStatus?: 'pending';
}

export interface CartLine {
  id: string;
  productId?: string;
  variantId?: string;
  itemCode: string;
  itemName: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  gstPercent: number;
  gstAmount: number;
  lineTotal: number;
}

export interface ShopSettings {
  shopName: string;
  shopTagline: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  logoUrl: string;
  currencySymbol: string;
  defaultGstPercent: number;
  lowStockThreshold: number;
  invoiceFooter: string;
  showLogoOnInvoice: boolean;
  theme: string;
}

export interface Invoice {
  id: string;
  clientRequestId?: string | null;
  invoiceNumber: string;
  subtotal: number;
  discount: number;
  gstAmount: number;
  grandTotal: number;
  status: string;
  createdAt: string;
  notes?: string | null;
  customer?: {
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    gstin?: string | null;
  } | null;
  user?: { id?: string; name: string } | null;
  payments?: { mode: string; amount: number }[];
  items?: Array<{
    id?: string;
    productId?: string | null;
    variantId?: string | null;
    itemCode: string;
    itemName: string;
    description?: string | null;
    quantity: number;
    unitPrice: number;
    discount?: number;
    gstPercent?: number;
    gstAmount: number;
    lineTotal: number;
  }>;
}

export interface DashboardStats {
  todaySales: number;
  monthlySales: number;
  totalOrders: number;
  profit: number;
  topProducts: { code: string; name: string; quantitySold: number }[];
  lowStockAlerts: { id: string; name: string; code: string; stock: number; variant?: string }[];
  recentTransactions: Invoice[];
  salesChart: { date: string; sales: number }[];
  inventorySummary: { totalProducts: number; totalVariants: number; totalUnits: number };
}
