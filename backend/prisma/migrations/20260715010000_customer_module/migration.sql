-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('RETAIL', 'WHOLESALE', 'VIP', 'DEALER', 'COMPANY');

-- Customer.groupId (→ CustomerGroup) không có trong field list của Prompt 031 — CustomerGroup
-- được dời sang một Prompt riêng trong tương lai (Customer Sprint). Bỏ FK/cột trước, CustomerGroup
-- vẫn tồn tại độc lập (dormant, không có quan hệ nào trỏ tới), không mất bảng.
ALTER TABLE "customers" DROP CONSTRAINT "customers_groupId_fkey";
ALTER TABLE "customers" DROP COLUMN "groupId";

-- Đổi tên cột giữ nguyên dữ liệu (metadata-only, không mất dữ liệu, không cần backfill):
-- name → fullName, debtAmount → currentDebt (do hệ thống duy trì qua Customer Debt sau này),
-- pointBalance → totalPoint (do hệ thống duy trì qua Customer Point Ledger — Prompt 032).
ALTER TABLE "customers" RENAME COLUMN "name" TO "fullName";
ALTER TABLE "customers" RENAME COLUMN "debtAmount" TO "currentDebt";
ALTER TABLE "customers" RENAME COLUMN "pointBalance" TO "totalPoint";

DROP INDEX "customers_name_idx";
CREATE INDEX "customers_fullName_idx" ON "customers"("fullName");

-- Field list mới của Prompt 031 — mọi cột đều nullable hoặc có DEFAULT nên an toàn với dữ liệu hiện có.
ALTER TABLE "customers"
  ADD COLUMN "customerType" "CustomerType" NOT NULL DEFAULT 'RETAIL',
  ADD COLUMN "taxCode" TEXT,
  ADD COLUMN "companyName" TEXT,
  ADD COLUMN "province" TEXT,
  ADD COLUMN "district" TEXT,
  ADD COLUMN "ward" TEXT,
  ADD COLUMN "avatar" TEXT,
  ADD COLUMN "note" TEXT,
  ADD COLUMN "creditLimit" DECIMAL(18,2),
  ADD COLUMN "totalRevenue" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "totalOrder" INTEGER NOT NULL DEFAULT 0;
