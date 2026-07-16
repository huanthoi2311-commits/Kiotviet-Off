-- SPEC-PRODUCT-001 (Sprint-01, T005 Migration 1/3): ProductStatus (them DRAFT, doi ten
-- DISCONTINUED -> ARCHIVED), ProductType (thay the isService), parentProductId (Variant
-- self-reference), version (Optimistic Lock).
--
-- Migration nay CHUA drop cot "isService", CHUA drop DEFAULT tren "type" (giu ca 2 song song)
-- de code hien tai (Repository chua refactor) van build/insert duoc binh thuong. Viec don dep
-- se thuc hien o Migration 3 (Commit 3/Repository), dung luc code ngung tham chieu "isService"
-- (Decision C02, ARCHITECTURE REVIEW - T005.1). Rollback doc lap: xem rollback.sql cung thu muc.

-- 1) ProductStatus: DISCONTINUED -> ARCHIVED (rename value tai cho, giu nguyen du lieu cu,
-- dung tien le da ap dung o OrganizationStatus T002), them DRAFT.
ALTER TYPE "ProductStatus" RENAME VALUE 'DISCONTINUED' TO 'ARCHIVED';
ALTER TYPE "ProductStatus" ADD VALUE 'DRAFT';

-- 2) ProductType - thay the isService (SPEC-PRODUCT-001 §3.2, Decision 5). Backfill tu
-- isService=true -> SERVICE. DEFAULT 'STANDARD' duoc GIU LAI (khong DROP DEFAULT o day).
CREATE TYPE "ProductType" AS ENUM ('STANDARD', 'SERVICE', 'VARIANT_PARENT', 'VARIANT_CHILD');
ALTER TABLE "products" ADD COLUMN "type" "ProductType" NOT NULL DEFAULT 'STANDARD';
UPDATE "products" SET "type" = 'SERVICE' WHERE "isService" = true;

-- 3) parentProductId - Variant Child tu tham chieu Variant Parent (SPEC §3.3, Decision 9).
-- Chua co Variant nao ton tai truoc migration nay nen khong can buoc backfill du lieu.
ALTER TABLE "products" ADD COLUMN "parentProductId" UUID;
ALTER TABLE "products" ADD CONSTRAINT "products_parentProductId_fkey"
  FOREIGN KEY ("parentProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "products_parentProductId_idx" ON "products"("parentProductId");

-- 4) version - Optimistic Lock (SPEC §3.5, Decision A02). DEFAULT 1 (khong phai 0).
ALTER TABLE "products" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
