-- ROLLBACK cho migration 20260716040000_product_drop_legacy_fields.
-- Chay THU CONG. Theo Decision A15: rollback phai duoc kiem thu doc lap (khong chi viet).
--
-- LUU Y QUAN TRONG: rollback nay KHONG THE khoi phuc nguyen ven du lieu "isService" da mat (cot
-- bi DROP o migration xuoi, khong co ban sao) - chi co the TAI TAO cot voi gia tri SUY NGUOC tu
-- "type" hien tai (type='SERVICE' -> isService=true, con lai -> false). Neu da co Product duoc
-- tao/sua VOI type khac SERVICE/STANDARD (vd VARIANT_PARENT/VARIANT_CHILD) SAU migration xuoi,
-- gia tri isService suy nguoc se KHONG con chinh xac nhu du lieu goc - chi an toan chay rollback
-- nay TRUOC khi nghiep vu Variant di vao su dung that (dung gia dinh SPEC-PRODUCT-001 Decision 9).

-- 3) Tao lai unique constraint CU cua Barcode (toan cuc tren "code"). LUU Y: neu da co du lieu
-- trung (organizationId, code) khac nhau nhung code giong nhau duoc tao SAU khi constraint cu
-- bi drop, buoc nay se FAIL - phai xu ly du lieu trung thu cong truoc.
CREATE UNIQUE INDEX "barcodes_code_key" ON "barcodes"("code");

-- 2) Tai tao isService, suy nguoc tu type
ALTER TABLE "products" ADD COLUMN "isService" BOOLEAN NOT NULL DEFAULT false;
UPDATE "products" SET "isService" = true WHERE "type" = 'SERVICE';

-- 1) Khoi phuc DEFAULT tren type
ALTER TABLE "products" ALTER COLUMN "type" SET DEFAULT 'STANDARD';
