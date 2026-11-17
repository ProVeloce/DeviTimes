import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
};

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    password: text('password'),
    name: text('name').notNull(),
    role: text('role').$type<'ADMIN' | 'CASHIER'>().notNull().default('CASHIER'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [index('users_email_idx').on(t.email)]
);

export const categories = pgTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  ...timestamps,
});

export const suppliers = pgTable(
  'suppliers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    address: text('address'),
    gstin: text('gstin'),
    ...timestamps,
  },
  (t) => [index('suppliers_name_idx').on(t.name)]
);

export const products = pgTable(
  'products',
  {
    id: text('id').primaryKey(),
    serialNo: text('serial_no'),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    categoryId: text('category_id').references(() => categories.id, { onDelete: 'set null' }),
    brand: text('brand'),
    purchasePrice: doublePrecision('purchase_price').notNull(),
    sellingPrice: doublePrecision('selling_price').notNull(),
    stockQuantity: integer('stock_quantity').notNull().default(0),
    barcode: text('barcode').unique(),
    gstPercent: doublePrecision('gst_percent').notNull().default(5),
    supplierId: text('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    hasVariants: boolean('has_variants').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index('products_name_idx').on(t.name),
    index('products_serial_no_idx').on(t.serialNo),
    index('products_code_idx').on(t.code),
    index('products_category_id_idx').on(t.categoryId),
    index('products_barcode_idx').on(t.barcode),
  ]
);

export const productVariants = pgTable(
  'product_variants',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    size: text('size'),
    color: text('color'),
    sku: text('sku').notNull().unique(),
    barcode: text('barcode').unique(),
    purchasePrice: doublePrecision('purchase_price'),
    sellingPrice: doublePrecision('selling_price').notNull(),
    stockQuantity: integer('stock_quantity').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index('product_variants_product_id_idx').on(t.productId),
    index('product_variants_barcode_idx').on(t.barcode),
    index('product_variants_sku_idx').on(t.sku),
  ]
);

export const customers = pgTable(
  'customers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    address: text('address'),
    gstin: text('gstin'),
    ...timestamps,
  },
  (t) => [index('customers_phone_idx').on(t.phone), index('customers_name_idx').on(t.name)]
);

export const invoices = pgTable(
  'invoices',
  {
    id: text('id').primaryKey(),
    invoiceNumber: text('invoice_number').notNull().unique(),
    customerId: text('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    subtotal: doublePrecision('subtotal').notNull(),
    discount: doublePrecision('discount').notNull().default(0),
    gstAmount: doublePrecision('gst_amount').notNull().default(0),
    grandTotal: doublePrecision('grand_total').notNull(),
    status: text('status').$type<'DRAFT' | 'COMPLETED' | 'CANCELLED'>().notNull().default('COMPLETED'),
    clientRequestId: text('client_request_id').unique(),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    index('invoices_invoice_number_idx').on(t.invoiceNumber),
    index('invoices_created_at_idx').on(t.createdAt),
    index('invoices_user_id_idx').on(t.userId),
    index('invoices_customer_id_idx').on(t.customerId),
  ]
);

export const invoiceItems = pgTable(
  'invoice_items',
  {
    id: text('id').primaryKey(),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    productId: text('product_id'),
    variantId: text('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
    itemCode: text('item_code').notNull(),
    itemName: text('item_name').notNull(),
    description: text('description'),
    quantity: integer('quantity').notNull(),
    unitPrice: doublePrecision('unit_price').notNull(),
    discount: doublePrecision('discount').notNull().default(0),
    gstPercent: doublePrecision('gst_percent').notNull(),
    gstAmount: doublePrecision('gst_amount').notNull(),
    lineTotal: doublePrecision('line_total').notNull(),
  },
  (t) => [index('invoice_items_invoice_id_idx').on(t.invoiceId)]
);

export const payments = pgTable(
  'payments',
  {
    id: text('id').primaryKey(),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    mode: text('mode').$type<'CASH' | 'UPI' | 'CARD' | 'MIXED'>().notNull(),
    amount: doublePrecision('amount').notNull(),
    reference: text('reference'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('payments_invoice_id_idx').on(t.invoiceId)]
);

export const stockHistory = pgTable(
  'stock_history',
  {
    id: text('id').primaryKey(),
    productId: text('product_id').references(() => products.id, { onDelete: 'set null' }),
    variantId: text('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
    type: text('type').$type<'SALE' | 'PURCHASE' | 'ADJUSTMENT' | 'RETURN' | 'INITIAL'>().notNull(),
    quantity: integer('quantity').notNull(),
    previousQty: integer('previous_qty').notNull(),
    newQty: integer('new_qty').notNull(),
    reference: text('reference'),
    clientRequestId: text('client_request_id').unique(),
    notes: text('notes'),
    userId: text('user_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('stock_history_product_id_idx').on(t.productId),
    index('stock_history_variant_id_idx').on(t.variantId),
    index('stock_history_created_at_idx').on(t.createdAt),
  ]
);

export const settings = pgTable('settings', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

export const backups = pgTable(
  'backups',
  {
    id: text('id').primaryKey(),
    filename: text('filename').notNull(),
    filepath: text('filepath').notNull(),
    size: bigint('size', { mode: 'number' }).notNull().default(0),
    type: text('type').notNull().default('manual'),
    status: text('status').notNull().default('completed'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('backups_created_at_idx').on(t.createdAt)]
);

export const schema = {
  users,
  categories,
  suppliers,
  products,
  productVariants,
  customers,
  invoices,
  invoiceItems,
  payments,
  stockHistory,
  settings,
  backups,
};
