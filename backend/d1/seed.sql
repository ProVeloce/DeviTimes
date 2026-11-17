-- Historical D1 seed data; not used by the Supabase-backed API.
-- Default login: username admin / password admin123

INSERT OR IGNORE INTO users (id, email, password, name, role, is_active, created_at, updated_at)
VALUES (
  'a1000001-0001-4001-8001-000000000001',
  'admin',
  'pbkdf2:100000:MctXMrX0XuEp0DlUtqbhqg==:hSzCbkbAELU11NSpjOzcslw1NavUID95j6YMNij8d2k=',
  'Store Admin',
  'ADMIN',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO settings (id, key, value, updated_at) VALUES
  ('b1000001-0001-4001-8001-000000000001', 'shopName', '"Devi Times"', CURRENT_TIMESTAMP),
  ('b1000001-0001-4001-8001-000000000002', 'shopTagline', '""', CURRENT_TIMESTAMP),
  ('b1000001-0001-4001-8001-000000000003', 'address', '""', CURRENT_TIMESTAMP),
  ('b1000001-0001-4001-8001-000000000004', 'phone', '""', CURRENT_TIMESTAMP),
  ('b1000001-0001-4001-8001-000000000005', 'email', '""', CURRENT_TIMESTAMP),
  ('b1000001-0001-4001-8001-000000000006', 'gstin', '""', CURRENT_TIMESTAMP),
  ('b1000001-0001-4001-8001-000000000007', 'logoUrl', '""', CURRENT_TIMESTAMP),
  ('b1000001-0001-4001-8001-000000000008', 'currency', '"INR"', CURRENT_TIMESTAMP),
  ('b1000001-0001-4001-8001-000000000009', 'currencySymbol', '"₹"', CURRENT_TIMESTAMP),
  ('b1000001-0001-4001-8001-000000000010', 'defaultGstPercent', '5', CURRENT_TIMESTAMP),
  ('b1000001-0001-4001-8001-000000000011', 'invoicePrefix', '"DEVI"', CURRENT_TIMESTAMP),
  ('b1000001-0001-4001-8001-000000000012', 'thermalPrinterName', '""', CURRENT_TIMESTAMP),
  ('b1000001-0001-4001-8001-000000000013', 'a4PrinterName', '""', CURRENT_TIMESTAMP),
  ('b1000001-0001-4001-8001-000000000014', 'lowStockThreshold', '10', CURRENT_TIMESTAMP),
  ('b1000001-0001-4001-8001-000000000015', 'theme', '"light"', CURRENT_TIMESTAMP),
  ('b1000001-0001-4001-8001-000000000016', 'invoiceFooter', '"Thank you for shopping with us!"', CURRENT_TIMESTAMP),
  ('b1000001-0001-4001-8001-000000000017', 'showLogoOnInvoice', 'true', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO categories (id, name, description, created_at, updated_at) VALUES
  ('c1000001-0001-4001-8001-000000000001', 'Smart Watches', 'Smartwatches and fitness bands', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c1000001-0001-4001-8001-000000000002', 'Analog Watches', 'Classic analog wrist watches', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c1000001-0001-4001-8001-000000000003', 'Wall Clocks', 'Decorative and standard wall clocks', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c1000001-0001-4001-8001-000000000004', 'Digital Clocks', 'Digital and LED table/wall clocks', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c1000001-0001-4001-8001-000000000005', 'Gifts & Novelties', 'Gift items, toys and novelties', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c1000001-0001-4001-8001-000000000006', 'Straps & Accessories', 'Watch straps, cells and accessories', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c1000001-0001-4001-8001-000000000007', 'Service & Repairs', 'Watch repair services and spares', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c1000001-0001-4001-8001-000000000008', 'General', 'Miscellaneous items', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
