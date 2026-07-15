-- points (chưa từng có module nào ghi dữ liệu) → customer_point_ledgers (Prompt 032):
-- đổi tên bảng + cột (metadata-only, giữ nguyên dữ liệu nếu có), bỏ type/updatedBy/updatedAt/
-- deletedAt (sổ cái bất biến, không có khái niệm sửa/xóa), thêm balance (số dư tích lũy).
ALTER TABLE "points" RENAME TO "customer_point_ledgers";
ALTER TABLE "customer_point_ledgers" RENAME COLUMN "points" TO "point";
ALTER TABLE "customer_point_ledgers" RENAME COLUMN "refType" TO "referenceType";
ALTER TABLE "customer_point_ledgers" RENAME COLUMN "refId" TO "referenceId";
ALTER TABLE "customer_point_ledgers" RENAME COLUMN "expiresAt" TO "expiredAt";
ALTER TABLE "customer_point_ledgers" RENAME CONSTRAINT "points_pkey" TO "customer_point_ledgers_pkey";

ALTER TABLE "customer_point_ledgers" DROP CONSTRAINT "points_organizationId_fkey";
ALTER TABLE "customer_point_ledgers" DROP CONSTRAINT "points_customerId_fkey";
ALTER TABLE "customer_point_ledgers"
  ADD CONSTRAINT "customer_point_ledgers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_point_ledgers_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_point_ledgers" ADD COLUMN "balance" INTEGER;
UPDATE "customer_point_ledgers" SET "balance" = 0 WHERE "balance" IS NULL;
ALTER TABLE "customer_point_ledgers" ALTER COLUMN "balance" SET NOT NULL;

ALTER TABLE "customer_point_ledgers" DROP COLUMN "type";
ALTER TABLE "customer_point_ledgers" DROP COLUMN "updatedBy";
ALTER TABLE "customer_point_ledgers" DROP COLUMN "updatedAt";
ALTER TABLE "customer_point_ledgers" DROP COLUMN "deletedAt";

DROP TYPE "PointType";

DROP INDEX "points_organizationId_idx";
DROP INDEX "points_customerId_idx";
CREATE INDEX "customer_point_ledgers_organizationId_idx" ON "customer_point_ledgers"("organizationId");
CREATE INDEX "customer_point_ledgers_customerId_createdAt_idx" ON "customer_point_ledgers"("customerId", "createdAt");
