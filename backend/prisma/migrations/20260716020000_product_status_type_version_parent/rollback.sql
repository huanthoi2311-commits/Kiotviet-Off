-- ROLLBACK cho migration 20260716020000_product_status_type_version_parent.
-- Prisma khong ho tro down-migration tu dong - script nay chay THU CONG khi can rollback.
-- Theo Decision A15: rollback phai duoc kiem thu doc lap (khong chi viet), trang thai kiem thu
-- thuc te (PASS/PENDING) duoc ghi lai trong docs/implementation/t005-product-refactor-report.md
-- (sandbox phat trien hien tai khong co Docker/Postgres de chay that - xem Decision C05).
--
-- Thu tu: NGUOC lai voi migration.sql (version -> parentProductId -> type -> status).

-- 4) version
ALTER TABLE "products" DROP COLUMN "version";

-- 3) parentProductId
DROP INDEX "products_parentProductId_idx";
ALTER TABLE "products" DROP CONSTRAINT "products_parentProductId_fkey";
ALTER TABLE "products" DROP COLUMN "parentProductId";

-- 2) ProductType - LUU Y: neu da co du lieu type = 'VARIANT_PARENT'/'VARIANT_CHILD' duoc tao
-- SAU migration nay (nghiep vu Variant that su duoc dung), rollback nay se MAT thong tin do khi
-- xoa cot. Chi an toan chay rollback nay TRUOC khi nghiep vu Variant di vao su dung that (dung
-- gia dinh cua SPEC-PRODUCT-001 Decision 9: "chua co Variant nao ton tai truoc SPEC nay").
ALTER TABLE "products" DROP COLUMN "type";
DROP TYPE "ProductType";

-- 1) ProductStatus - doi ARCHIVED tro lai DISCONTINUED (doi xung voi RENAME VALUE xuoi, an toan
-- vi khong mat du lieu). GIOI HAN QUAN TRONG: KHONG THE rollback "ADD VALUE 'DRAFT'" - Postgres
-- khong co lenh DROP VALUE cho enum. Neu da co dong Product voi status='DRAFT' duoc tao SAU
-- migration nay, phai chuyen thu cong ve status khac (vd ACTIVE/INACTIVE) TRUOC khi chay dong
-- lenh nay, neu khong RENAME VALUE ben duoi van chay duoc nhung enum "ProductStatus" se vinh
-- vien con lai gia tri "DRAFT" khong dung toi (khong gay loi, chi la du thua) - dung theo
-- SPEC-PRODUCT-001 §14 ("neu can rollback that, phai tao lai toan bo enum type - chi phi cao").
ALTER TYPE "ProductStatus" RENAME VALUE 'ARCHIVED' TO 'DISCONTINUED';
