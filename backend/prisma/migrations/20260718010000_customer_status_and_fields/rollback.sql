-- Rollback B — T011 Customer Domain
-- Luu y: phong lai NOT NULL cho "phone" chi an toan neu chua co du lieu NULL that
-- (kiem tra truoc: SELECT COUNT(*) FROM customers WHERE phone IS NULL).

ALTER TABLE "customers" ALTER COLUMN "phone" SET NOT NULL;
ALTER TABLE "customers" DROP COLUMN "paymentTermDays";
ALTER TABLE "customers" DROP COLUMN "contactName";

ALTER TABLE "customers" ADD COLUMN "status_old" "CommonStatus" NOT NULL DEFAULT 'ACTIVE';
UPDATE "customers" SET "status_old" = 'ACTIVE' WHERE "status" = 'ACTIVE';
UPDATE "customers" SET "status_old" = 'INACTIVE' WHERE "status" IN ('INACTIVE', 'ARCHIVED');
ALTER TABLE "customers" DROP COLUMN "status";
ALTER TABLE "customers" RENAME COLUMN "status_old" TO "status";
DROP TYPE "CustomerStatus";
