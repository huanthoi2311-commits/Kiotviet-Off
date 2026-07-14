-- AlterTable: mở rộng Supplier theo field list đầy đủ của Prompt 026.
-- companyName thay thế "name" cũ — backfill dữ liệu trước khi enforce NOT NULL và xóa cột cũ,
-- tránh phá vỡ dữ liệu nếu bảng "suppliers" đã có bản ghi.
ALTER TABLE "suppliers" ADD COLUMN "companyName" TEXT;
UPDATE "suppliers" SET "companyName" = "name" WHERE "companyName" IS NULL;
ALTER TABLE "suppliers" ALTER COLUMN "companyName" SET NOT NULL;
ALTER TABLE "suppliers" DROP COLUMN "name";

-- debtAmount sẽ được thay thế bằng ledger SupplierDebt (Prompt 029) — không còn cột raw balance.
ALTER TABLE "suppliers" DROP COLUMN "debtAmount";

ALTER TABLE "suppliers"
  ADD COLUMN "bankAccount" TEXT,
  ADD COLUMN "bankName" TEXT,
  ADD COLUMN "contactName" TEXT,
  ADD COLUMN "creditLimit" DECIMAL(18,2),
  ADD COLUMN "district" TEXT,
  ADD COLUMN "note" TEXT,
  ADD COLUMN "paymentTerm" INTEGER,
  ADD COLUMN "province" TEXT,
  ADD COLUMN "ward" TEXT,
  ADD COLUMN "website" TEXT;

-- CreateTable
CREATE TABLE "supplier_products" (
    "id" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "supplierSku" TEXT,
    "priority" INTEGER DEFAULT 0,
    "defaultPrice" DECIMAL(18,2),
    "leadTime" INTEGER,
    "minimumOrderQuantity" DECIMAL(18,3),
    "createdBy" UUID,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "supplier_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_products_supplierId_idx" ON "supplier_products"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_products_productId_idx" ON "supplier_products"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_products_supplierId_productId_key" ON "supplier_products"("supplierId", "productId");

-- AddForeignKey
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
