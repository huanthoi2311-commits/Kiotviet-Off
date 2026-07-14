-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('DRAFT', 'COUNTING', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "stock_counts" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "createdBy" UUID,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_items" (
    "id" UUID NOT NULL,
    "stockCountId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "systemQty" DECIMAL(18,3) NOT NULL,
    "actualQty" DECIMAL(18,3),
    "difference" DECIMAL(18,3),
    "remark" TEXT,
    "createdBy" UUID,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "stock_count_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_counts_organizationId_idx" ON "stock_counts"("organizationId");

-- CreateIndex
CREATE INDEX "stock_counts_warehouseId_idx" ON "stock_counts"("warehouseId");

-- CreateIndex
CREATE INDEX "stock_counts_status_idx" ON "stock_counts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "stock_counts_organizationId_code_key" ON "stock_counts"("organizationId", "code");

-- CreateIndex
CREATE INDEX "stock_count_items_stockCountId_idx" ON "stock_count_items"("stockCountId");

-- CreateIndex
CREATE INDEX "stock_count_items_productId_idx" ON "stock_count_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_items_stockCountId_productId_key" ON "stock_count_items"("stockCountId", "productId");

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "stock_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

