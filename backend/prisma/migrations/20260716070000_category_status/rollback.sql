-- ROLLBACK cho migration 20260716070000_category_status.
-- Chay THU CONG. Doc lap voi Migration A/B.
--
-- An toan tuyet doi ve mat enum: "CategoryStatus" la enum hoan toan MOI (khong RENAME VALUE tu
-- enum cu nao, khac voi ProductStatus/DISCONTINUED->ARCHIVED o T005) - khong co gioi han
-- "khong the DROP VALUE" nao can luu y, vi ta drop CA enum, khong drop 1 gia tri le trong enum
-- con duoc dung.
--
-- LUU Y: neu da co danh muc duoc dat status='DRAFT' SAU migration nay (nghiep vu DRAFT that su
-- duoc dung), rollback se MAT thong tin do khi xoa cot - chi an toan neu rollback TRUOC khi
-- nghiep vu DRAFT di vao su dung that.

ALTER TABLE "categories" DROP COLUMN "status";
DROP TYPE "CategoryStatus";
