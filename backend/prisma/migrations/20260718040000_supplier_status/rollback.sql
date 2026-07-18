-- Rollback B — T012 Supplier Domain
ALTER TABLE "suppliers" ADD COLUMN "status_old" "CommonStatus" NOT NULL DEFAULT 'ACTIVE';
UPDATE "suppliers" SET "status_old" = 'ACTIVE' WHERE "status" = 'ACTIVE';
UPDATE "suppliers" SET "status_old" = 'INACTIVE' WHERE "status" IN ('INACTIVE', 'ARCHIVED');
ALTER TABLE "suppliers" DROP COLUMN "status";
ALTER TABLE "suppliers" RENAME COLUMN "status_old" TO "status";
DROP TYPE "SupplierStatus";
