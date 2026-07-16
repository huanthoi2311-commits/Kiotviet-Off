-- SPEC-PRODUCT-001 (Sprint-01, T005 Migration 2/3): Barcode.organizationId (denormalize tu
-- Product, khong suy ra gian tiep qua productId) + unique constraint theo tenant thay the unique
-- constraint toan cuc (Decision 7).
--
-- Migration nay CHUA drop unique constraint CU "barcodes_code_key" - giu song song voi constraint
-- MOI de tranh 1 khoang thoi gian khong co unique protection nao (thu tu bat buoc theo Decision
-- A08: tao constraint moi TRUOC, drop constraint cu SAU). Viec drop constraint cu se thuc hien o
-- Migration 3 (Commit 3/Repository). Rollback doc lap: xem rollback.sql cung thu muc.

-- 0) Kiem tra du lieu trung TRUOC khi tao unique constraint moi (Decision 7 - "Neu phat hien
-- trung du lieu trong cung Organization: Migration phai FAIL. Khong tu merge."). Bo sung so voi
-- ban SPEC (o do la 1 query kiem tra thu cong) bang 1 guard TU DONG trong chinh migration - an
-- toan hon vi khong phu thuoc operator nho chay kiem tra truoc, van giu dung tinh than Decision 7
-- ("Migration phai FAIL" khi phat hien trung, khong tu merge).
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count FROM (
    SELECT p."organizationId", b."code"
    FROM "barcodes" b
    JOIN "products" p ON p."id" = b."productId"
    WHERE b."deletedAt" IS NULL
    GROUP BY p."organizationId", b."code"
    HAVING COUNT(*) > 1
  ) dup;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'Migration FAILED: % duplicate (organizationId, code) pair(s) found in barcodes. Xu ly du lieu trung thu cong truoc khi chay lai migration nay (SPEC-PRODUCT-001 Decision 7 - khong tu dong merge).', duplicate_count;
  END IF;
END $$;

-- 1) Them organizationId (nullable truoc -> backfill -> SET NOT NULL, dung mau da dung o
-- Migration Organization T002 cho cot "code").
ALTER TABLE "barcodes" ADD COLUMN "organizationId" UUID;

UPDATE "barcodes" b SET "organizationId" = p."organizationId"
  FROM "products" p WHERE b."productId" = p."id";

ALTER TABLE "barcodes" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "barcodes" ADD CONSTRAINT "barcodes_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "barcodes_organizationId_idx" ON "barcodes"("organizationId");

-- 2) Tao Unique Constraint MOI TRUOC khi drop constraint CU (Decision A08).
CREATE UNIQUE INDEX "barcodes_organizationId_code_key" ON "barcodes"("organizationId", "code");

-- Constraint CU "barcodes_code_key" (@unique toan cuc tren "code") CHUA bi drop o day - se drop
-- o Migration 3, dung luc Repository ngung dua vao unique toan cuc.
