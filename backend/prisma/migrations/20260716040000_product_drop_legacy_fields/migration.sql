-- SPEC-PRODUCT-001 (Sprint-01, T005 Migration 3/3): don dep cot/constraint cu, chi chay SAU khi
-- Repository (Commit 3) da hoan toan ngung tham chieu "isService" va khong con dua vao unique
-- constraint toan cuc cua Barcode.code (Decision C02, ARCHITECTURE REVIEW - T005.1).

-- 1) ProductType: drop DEFAULT - tu gio code luon phai truyen "type" tuong minh (SPEC SS3.2).
ALTER TABLE "products" ALTER COLUMN "type" DROP DEFAULT;

-- 2) Drop isService - da duoc thay the hoan toan boi "type" tu Migration 1.
ALTER TABLE "products" DROP COLUMN "isService";

-- 3) Drop unique constraint CU cua Barcode (toan cuc tren "code"). Constraint MOI
-- (organizationId, code) da ton tai tu Migration 2 - dung thu tu tao-truoc-drop-sau theo
-- Decision A08 (tranh 1 khoang thoi gian khong co unique protection nao).
DROP INDEX "barcodes_code_key";
