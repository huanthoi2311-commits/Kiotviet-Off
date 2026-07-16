-- ROLLBACK cho migration 20260716030000_barcode_organization_scope.
-- Chay THU CONG. Theo Decision A15: rollback phai duoc kiem thu doc lap (khong chi viet), trang
-- thai kiem thu thuc te ghi trong docs/implementation/t005-product-refactor-report.md.
--
-- An toan tuyet doi: organizationId chi la denormalize tu Product.organizationId (qua
-- productId), khong co du lieu nao bi mat khi xoa cot nay - co the tinh lai bat cu luc nao.

DROP INDEX "barcodes_organizationId_code_key";
ALTER TABLE "barcodes" DROP CONSTRAINT "barcodes_organizationId_fkey";
DROP INDEX "barcodes_organizationId_idx";
ALTER TABLE "barcodes" DROP COLUMN "organizationId";
