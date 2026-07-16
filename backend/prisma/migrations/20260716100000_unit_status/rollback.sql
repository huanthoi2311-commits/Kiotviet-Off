-- ROLLBACK cho migration 20260716100000_unit_status.
-- Chay THU CONG (Prisma khong ho tro down-migration tu dong).
-- An toan tuyet doi - enum hoan toan moi, khong co DROP VALUE nao.

ALTER TABLE "units" DROP COLUMN "status";
DROP TYPE "UnitStatus";
