-- SPEC-BRANCH-001 (Sprint-00, T003): thêm field liên hệ/địa chỉ/locale/chứng từ, đổi status
-- sang enum riêng BranchStatus (thêm ARCHIVED, CommonStatus dùng chung cho nhiều model khác
-- không có giá trị này), thêm managerUserId + defaultWarehouseId.

-- 1) BranchStatus enum + đổi kiểu cột status (ACTIVE/INACTIVE giữ nguyên giá trị hiện có)
CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

ALTER TABLE "branches" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "branches" ALTER COLUMN "status" TYPE "BranchStatus" USING ("status"::text::"BranchStatus");
ALTER TABLE "branches" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- 2) Field mới (đều nullable, có default riêng cho timezone/currencyCode)
ALTER TABLE "branches"
  ADD COLUMN "managerUserId" UUID,
  ADD COLUMN "defaultWarehouseId" UUID,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "province" TEXT,
  ADD COLUMN "district" TEXT,
  ADD COLUMN "ward" TEXT,
  ADD COLUMN "invoicePrefix" TEXT,
  ADD COLUMN "receiptPrefix" TEXT,
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  ADD COLUMN "currencyCode" TEXT NOT NULL DEFAULT 'VND';

CREATE UNIQUE INDEX "branches_organizationId_invoicePrefix_key" ON "branches"("organizationId", "invoicePrefix");

ALTER TABLE "branches" ADD CONSTRAINT "branches_managerUserId_fkey" FOREIGN KEY ("managerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branches" ADD CONSTRAINT "branches_defaultWarehouseId_fkey" FOREIGN KEY ("defaultWarehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
