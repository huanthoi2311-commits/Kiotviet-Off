-- T051.02 (Release Hardening — Transaction Concurrency Hardening, Architect Decision AD-1 Option A).
-- Optimistic Lock rieng cho tung aggregate, thay the bao ve tinh co (accidental cross-aggregate
-- concurrency protection qua Inventory's own optimistic lock) bang bao ve tuong minh, do chinh
-- aggregate so huu. Chi ap dung cho hanh dong co anh huong Inventory/tien (receive/complete/
-- transitionStatus) — approve/cancel/submit/start khong doi Inventory van dung status-predicate
-- updateMany hien co (transitionSimple), khong can version.

ALTER TABLE "purchase_orders" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "purchase_returns" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "transfers" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "stock_counts" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "inventory_adjustments" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
