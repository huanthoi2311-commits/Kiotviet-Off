-- PurchaseOrderStatus: DRAFT, ORDERED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED
--                    → DRAFT, PENDING, APPROVED, RECEIVED, COMPLETED, CANCELLED (Prompt 027)
-- Postgres không cho xóa giá trị enum trực tiếp — tạo type mới, remap dữ liệu cũ
-- (ORDERED -> PENDING, PARTIALLY_RECEIVED -> RECEIVED) trước khi thay type, để không
-- mất/kẹt bản ghi hiện có.
CREATE TYPE "PurchaseOrderStatus_new" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'RECEIVED', 'COMPLETED', 'CANCELLED');

ALTER TABLE "purchase_orders" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "purchase_orders"
  ALTER COLUMN "status" TYPE "PurchaseOrderStatus_new"
  USING (
    CASE "status"::text
      WHEN 'ORDERED' THEN 'PENDING'
      WHEN 'PARTIALLY_RECEIVED' THEN 'RECEIVED'
      ELSE "status"::text
    END
  )::"PurchaseOrderStatus_new";

ALTER TABLE "purchase_orders" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

DROP TYPE "PurchaseOrderStatus";
ALTER TYPE "PurchaseOrderStatus_new" RENAME TO "PurchaseOrderStatus";

-- PurchaseItem: thêm warehouseId (mỗi dòng hàng có thể nhập vào 1 kho khác nhau —
-- field list PurchaseItem của Prompt 027 liệt kê "Warehouse" ở cấp dòng hàng, không
-- phải cấp đơn nhập). Thêm nullable trước, backfill từ warehouseId cũ của PurchaseOrder
-- cha, rồi mới bắt buộc NOT NULL — không có dòng nào bị mất giá trị.
ALTER TABLE "purchase_items" ADD COLUMN "warehouseId" UUID;

UPDATE "purchase_items" pi
SET "warehouseId" = po."warehouseId"
FROM "purchase_orders" po
WHERE pi."purchaseOrderId" = po.id AND pi."warehouseId" IS NULL;

ALTER TABLE "purchase_items" ALTER COLUMN "warehouseId" SET NOT NULL;

ALTER TABLE "purchase_items"
  ADD CONSTRAINT "purchase_items_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "purchase_items_warehouseId_idx" ON "purchase_items"("warehouseId");

-- Bỏ warehouseId ở cấp PurchaseOrder (đã chuyển xuống PurchaseItem ở trên).
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_warehouseId_fkey";
DROP INDEX IF EXISTS "purchase_orders_warehouseId_idx";
ALTER TABLE "purchase_orders" DROP COLUMN "warehouseId";

-- PurchaseItem.taxAmount — field list Prompt 027: Product, Warehouse, Qty, Price,
-- Discount, Tax, Total. Có DEFAULT 0 nên an toàn cho dữ liệu hiện có.
ALTER TABLE "purchase_items" ADD COLUMN "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;
