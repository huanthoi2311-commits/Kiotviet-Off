-- T013 Phase 5 (SPEC-T013-SALES-FOUNDATION-001 §3.1, Decision SP07)
-- Snapshot fields tren invoices/invoice_items. Tat ca cot moi deu nullable -
-- khong backfill du lieu cu (du an chua co du lieu production that).

ALTER TABLE "invoices" ADD COLUMN "customerCodeSnapshot" TEXT;
ALTER TABLE "invoices" ADD COLUMN "customerNameSnapshot" TEXT;
ALTER TABLE "invoices" ADD COLUMN "customerPhoneSnapshot" TEXT;

ALTER TABLE "invoice_items" ADD COLUMN "barcodeId" UUID;
ALTER TABLE "invoice_items" ADD COLUMN "productCodeSnapshot" TEXT;
ALTER TABLE "invoice_items" ADD COLUMN "productNameSnapshot" TEXT;
ALTER TABLE "invoice_items" ADD COLUMN "barcodeSnapshot" TEXT;
ALTER TABLE "invoice_items" ADD COLUMN "unitNameSnapshot" TEXT;

ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_barcodeId_fkey"
  FOREIGN KEY ("barcodeId") REFERENCES "barcodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "invoice_items_barcodeId_idx" ON "invoice_items"("barcodeId");
