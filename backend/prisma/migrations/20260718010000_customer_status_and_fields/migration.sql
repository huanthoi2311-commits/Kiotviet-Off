-- T011 Customer Domain — Migration B
-- CustomerStatus rieng (3 gia tri, thay CommonStatus 2 gia tri) + field moi + phone nullable

-- Status model rieng
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
ALTER TABLE "customers" ADD COLUMN "status_new" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE';
UPDATE "customers" SET "status_new" = 'ARCHIVED' WHERE "deletedAt" IS NOT NULL;
UPDATE "customers" SET "status_new" = "status"::text::"CustomerStatus" WHERE "deletedAt" IS NULL;
ALTER TABLE "customers" DROP COLUMN "status";
ALTER TABLE "customers" RENAME COLUMN "status_new" TO "status";

-- Field moi (RFC-T011 SS6.9/SS6.12)
ALTER TABLE "customers" ADD COLUMN "contactName" TEXT;
ALTER TABLE "customers" ADD COLUMN "paymentTermDays" INTEGER;

-- phone nullable (RFC-T011 SS6.5 - tuy chon)
ALTER TABLE "customers" ALTER COLUMN "phone" DROP NOT NULL;
