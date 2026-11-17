-- Add S.No (serial number) for product catalog
ALTER TABLE "products" ADD COLUMN "serial_no" TEXT;
CREATE INDEX "products_serial_no_idx" ON "products"("serial_no");
