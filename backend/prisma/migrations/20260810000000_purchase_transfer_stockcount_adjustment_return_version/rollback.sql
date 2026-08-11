-- ROLLBACK cho migration 20260810000000_purchase_transfer_stockcount_adjustment_return_version.
-- Chay THU CONG (Prisma khong ho tro down-migration tu dong).
-- An toan tuyet doi - chi xoa 5 cot moi them, khong anh huong du lieu khac.

ALTER TABLE "purchase_orders" DROP COLUMN "version";
ALTER TABLE "purchase_returns" DROP COLUMN "version";
ALTER TABLE "transfers" DROP COLUMN "version";
ALTER TABLE "stock_counts" DROP COLUMN "version";
ALTER TABLE "inventory_adjustments" DROP COLUMN "version";
