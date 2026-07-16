-- SPEC-ORG-001 (Sprint-00, T002): Organization trở thành Root Aggregate đầy đủ.
-- Đổi "name" -> "displayName" (Prompt spec authoritative), thêm các field mô tả pháp lý/liên
-- hệ/địa chỉ/locale, thêm ownerUserId (nullable ở schema — xem comment trong schema.prisma
-- lý do bootstrap User<->Organization), đánh dấu "plan" deprecated (Decision 1, chưa xóa),
-- đổi tên enum value CANCELLED -> ARCHIVED (Decision 2), thêm OrganizationSettings/
-- OrganizationSubscription (cấu trúc, không logic billing — Decision 1/§9), thêm
-- users.isPlatformAdmin (Decision 4).

-- 1) organizations: rename "name" -> "displayName"
ALTER TABLE "organizations" RENAME COLUMN "name" TO "displayName";

-- 1b) Sequence NGUYÊN SINH của Postgres cho mã Organization — KHÔNG dùng bảng `sequences`
-- (Prisma model `Sequence`) hiện có vì bảng đó gắn với 1 organizationId cụ thể (mỗi tổ chức
-- có sequence riêng cho mã nội bộ của NÓ — vd CUS000001 trong 1 tổ chức); Organization là
-- gốc, chưa có organizationId nào để gắn vào lúc sinh mã. Postgres SEQUENCE (không phải bảng)
-- vốn atomic/an toàn concurrent, phù hợp hơn cho đúng 1 trường hợp gốc này.
CREATE SEQUENCE IF NOT EXISTS "organization_code_seq" START 1;

-- 2) organizations: thêm code (backfill rồi mới NOT NULL + UNIQUE)
ALTER TABLE "organizations" ADD COLUMN "code" TEXT;
-- Backfill bằng chính organization_code_seq (không phải ROW_NUMBER rời rạc) để sequence tiếp
-- tục đúng mạch cho những Organization tạo mới sau này, tránh trùng mã.
UPDATE "organizations"
SET "code" = 'ORG' || LPAD(nextval('organization_code_seq')::text, 6, '0');
ALTER TABLE "organizations" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "organizations_code_key" ON "organizations"("code");

-- 3) organizations: các field mới (đều nullable, không cần backfill)
ALTER TABLE "organizations"
  ADD COLUMN "legalName" TEXT,
  ADD COLUMN "taxCode" TEXT,
  ADD COLUMN "email" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "website" TEXT,
  ADD COLUMN "logoUrl" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "province" TEXT,
  ADD COLUMN "district" TEXT,
  ADD COLUMN "ward" TEXT,
  ADD COLUMN "countryCode" TEXT NOT NULL DEFAULT 'VN',
  ADD COLUMN "languageCode" TEXT NOT NULL DEFAULT 'vi',
  ADD COLUMN "ownerUserId" UUID;

ALTER TABLE "organizations" RENAME COLUMN "currency" TO "currencyCode";

CREATE UNIQUE INDEX "organizations_taxCode_key" ON "organizations"("taxCode");
CREATE UNIQUE INDEX "organizations_email_key" ON "organizations"("email");
CREATE UNIQUE INDEX "organizations_ownerUserId_key" ON "organizations"("ownerUserId");

-- 4) plan: đánh dấu deprecated (Decision 1) — KHÔNG xóa, chỉ comment. Nguồn sự thật mới là
-- organization_subscriptions.plan.
COMMENT ON COLUMN "organizations"."plan" IS 'DEPRECATED (SPEC-ORG-001 Decision 1) — dùng organization_subscriptions.plan. Sẽ gỡ ở migration sau.';

-- 5) OrganizationStatus: CANCELLED -> ARCHIVED (Decision 2)
ALTER TYPE "OrganizationStatus" RENAME VALUE 'CANCELLED' TO 'ARCHIVED';

-- 6) organizations.ownerUserId FK (users đã tồn tại từ trước, an toàn thêm FK ngay)
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7) users.isPlatformAdmin (Decision 4 — không thêm Global Role, chỉ 1 cờ boolean)
ALTER TABLE "users" ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- 7b) users.fullName — SPEC-ORG-001 Decision 3 yêu cầu payload "owner" có fullName, nhưng User
-- hiện chưa có field này (chỉ có username). Thêm tối thiểu để không chặn luồng tạo Owner.
ALTER TABLE "users" ADD COLUMN "fullName" TEXT;

-- 8) OrganizationSubscriptionStatus enum + organization_subscriptions (chỉ cấu trúc, §9)
CREATE TYPE "OrganizationSubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

CREATE TABLE "organization_subscriptions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "plan" "OrganizationPlan" NOT NULL DEFAULT 'FREE',
    "status" "OrganizationSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiredAt" TIMESTAMP(3),
    "maxBranch" INTEGER,
    "maxUser" INTEGER,
    "maxWarehouse" INTEGER,
    "maxProduct" INTEGER,
    "maxCustomer" INTEGER,
    "storageLimitGB" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organization_subscriptions_organizationId_key" ON "organization_subscriptions"("organizationId");
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 9) organization_settings (Business Setting — khác "settings"/Platform Setting, §8/Decision 6)
CREATE TABLE "organization_settings" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "allowNegativeInventory" BOOLEAN NOT NULL DEFAULT false,
    "allowBackDate" BOOLEAN NOT NULL DEFAULT false,
    "decimalQuantity" INTEGER NOT NULL DEFAULT 0,
    "decimalPrice" INTEGER NOT NULL DEFAULT 0,
    "defaultWarehouseId" UUID,
    "defaultBranchId" UUID,
    "defaultLanguage" TEXT NOT NULL DEFAULT 'vi',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'VND',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organization_settings_organizationId_key" ON "organization_settings"("organizationId");
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_defaultWarehouseId_fkey" FOREIGN KEY ("defaultWarehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_defaultBranchId_fkey" FOREIGN KEY ("defaultBranchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
