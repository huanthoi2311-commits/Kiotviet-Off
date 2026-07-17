-- SPEC-BARCODE-001 (Sprint-01, T009 Migration A/2): Optimistic Lock cho Barcode (Decision BQ10/SB02).
-- Migration doc lap, khong phu thuoc Migration B.

ALTER TABLE "barcodes" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
