-- ROLLBACK cho migration 20260716080000_brand_version.
-- Chay THU CONG (Prisma khong ho tro down-migration tu dong).
-- An toan tuyet doi - chi xoa 1 cot moi them, khong anh huong du lieu khac.

ALTER TABLE "brands" DROP COLUMN "version";
