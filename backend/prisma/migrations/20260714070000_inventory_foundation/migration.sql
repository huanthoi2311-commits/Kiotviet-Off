-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('PURCHASE', 'SALE', 'RETURN', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT', 'COUNT', 'DAMAGE', 'INITIAL');

-- CreateEnum
CREATE TYPE "InventoryReferenceType" AS ENUM ('PURCHASE', 'POS', 'TRANSFER', 'COUNT', 'RETURN', 'SYSTEM');

-- DropForeignKey
ALTER TABLE "inventory_histories" DROP CONSTRAINT "inventory_histories_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "inventory_histories" DROP CONSTRAINT "inventory_histories_warehouseId_fkey";

-- DropForeignKey
ALTER TABLE "inventory_histories" DROP CONSTRAINT "inventory_histories_productId_fkey";

-- AlterTable
ALTER TABLE "inventories" ADD COLUMN     "lastCost" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "inventory_histories";

-- DropEnum
DROP TYPE "InventoryHistoryType";

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "movementType" "InventoryMovementType" NOT NULL,
    "referenceType" "InventoryReferenceType" NOT NULL,
    "referenceId" UUID,
    "quantity" DECIMAL(18,3) NOT NULL,
    "beforeQuantity" DECIMAL(18,3) NOT NULL,
    "afterQuantity" DECIMAL(18,3) NOT NULL,
    "unitCost" DECIMAL(18,2),
    "remark" TEXT,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_movements_organizationId_idx" ON "inventory_movements"("organizationId");

-- CreateIndex
CREATE INDEX "inventory_movements_warehouseId_idx" ON "inventory_movements"("warehouseId");

-- CreateIndex
CREATE INDEX "inventory_movements_productId_createdAt_idx" ON "inventory_movements"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_movements_referenceType_referenceId_idx" ON "inventory_movements"("referenceType", "referenceId");

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

