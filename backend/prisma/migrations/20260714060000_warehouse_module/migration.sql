-- CreateEnum
CREATE TYPE "WarehouseType" AS ENUM ('MAIN', 'RETAIL', 'ONLINE', 'RETURN', 'DAMAGED', 'TRANSIT', 'CUSTOM');

-- AlterTable
ALTER TABLE "warehouses" DROP COLUMN "isDefault",
ADD COLUMN     "description" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "managerId" UUID,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "type" "WarehouseType" NOT NULL DEFAULT 'MAIN';

-- CreateIndex
CREATE INDEX "warehouses_managerId_idx" ON "warehouses"("managerId");

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
