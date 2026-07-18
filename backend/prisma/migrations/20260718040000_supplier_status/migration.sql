-- T012 Supplier Domain — Migration B
-- SupplierStatus rieng (3 gia tri, thay CommonStatus 2 gia tri)

CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
ALTER TABLE "suppliers" ADD COLUMN "status_new" "SupplierStatus" NOT NULL DEFAULT 'ACTIVE';
UPDATE "suppliers" SET "status_new" = 'ARCHIVED' WHERE "deletedAt" IS NOT NULL;
UPDATE "suppliers" SET "status_new" = "status"::text::"SupplierStatus" WHERE "deletedAt" IS NULL;
ALTER TABLE "suppliers" DROP COLUMN "status";
ALTER TABLE "suppliers" RENAME COLUMN "status_new" TO "status";
