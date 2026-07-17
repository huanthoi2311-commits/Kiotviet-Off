-- SPEC-BARCODE-001 (Sprint-01, T009 Migration B/2): BarcodeStatus rieng (Decision BQ3) - 3 gia tri
-- hop le, KHONG tuan tu bat buoc. Migration doc lap, khong phu thuoc Migration A.

CREATE TYPE "BarcodeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
ALTER TABLE "barcodes" ADD COLUMN "status" "BarcodeStatus" NOT NULL DEFAULT 'ACTIVE';
-- Backfill don gian (khong backfill phuc tap): Barcode da soft-delete tu truoc -> ARCHIVED.
UPDATE "barcodes" SET "status" = 'ARCHIVED' WHERE "deletedAt" IS NOT NULL;
