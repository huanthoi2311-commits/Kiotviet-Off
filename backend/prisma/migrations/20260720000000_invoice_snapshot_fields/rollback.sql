-- Rollback A (SPEC-T013-SALES-FOUNDATION-001 §19)

ALTER TABLE "invoice_items" DROP CONSTRAINT "invoice_items_barcodeId_fkey";
DROP INDEX "invoice_items_barcodeId_idx";

ALTER TABLE "invoice_items" DROP COLUMN "barcodeId";
ALTER TABLE "invoice_items" DROP COLUMN "productCodeSnapshot";
ALTER TABLE "invoice_items" DROP COLUMN "productNameSnapshot";
ALTER TABLE "invoice_items" DROP COLUMN "barcodeSnapshot";
ALTER TABLE "invoice_items" DROP COLUMN "unitNameSnapshot";

ALTER TABLE "invoices" DROP COLUMN "customerCodeSnapshot";
ALTER TABLE "invoices" DROP COLUMN "customerNameSnapshot";
ALTER TABLE "invoices" DROP COLUMN "customerPhoneSnapshot";
