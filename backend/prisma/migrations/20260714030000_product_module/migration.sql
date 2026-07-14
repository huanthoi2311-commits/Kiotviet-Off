-- CreateEnum
CREATE TYPE "ProductPriceType" AS ENUM ('RETAIL', 'WHOLESALE', 'VIP', 'DEALER');

-- CreateEnum
CREATE TYPE "BarcodeType" AS ENUM ('EAN13', 'EAN8', 'CODE128', 'QR', 'CUSTOM');

-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_baseUnitId_fkey";

-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_taxId_fkey";

-- AlterTable
ALTER TABLE "products" DROP COLUMN "baseUnitId",
DROP COLUMN "image",
DROP COLUMN "sellingPrice",
DROP COLUMN "taxId",
ADD COLUMN     "height" DECIMAL(18,3),
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "length" DECIMAL(18,3),
ADD COLUMN     "slug" TEXT NOT NULL,
ADD COLUMN     "unitId" UUID NOT NULL,
ADD COLUMN     "vat" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "weight" DECIMAL(18,3),
ADD COLUMN     "width" DECIMAL(18,3);

-- AlterTable
ALTER TABLE "barcodes" ADD COLUMN     "type" "BarcodeType" NOT NULL DEFAULT 'CUSTOM';

-- CreateTable
CREATE TABLE "product_prices" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "type" "ProductPriceType" NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "createdBy" UUID,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "product_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isThumbnail" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" UUID,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequences" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "createdBy" UUID,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_prices_productId_idx" ON "product_prices"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "product_prices_productId_type_key" ON "product_prices"("productId", "type");

-- CreateIndex
CREATE INDEX "product_images_productId_idx" ON "product_images"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "sequences_organizationId_name_key" ON "sequences"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "products_organizationId_slug_key" ON "products"("organizationId", "slug");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

