-- ROLLBACK cho migration 20260717010000_barcode_status.
-- Chay THU CONG (Prisma khong ho tro down-migration tu dong).
-- An toan tuyet doi - enum hoan toan moi, khong co DROP VALUE nao.

ALTER TABLE "barcodes" DROP COLUMN "status";
DROP TYPE "BarcodeStatus";
