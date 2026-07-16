-- ROLLBACK cho migration 20260716050000_category_version.
-- Chay THU CONG (Prisma khong ho tro down-migration tu dong). Doc lap voi Migration B/C.
-- An toan tuyet doi - chi xoa 1 cot moi them, khong anh huong du lieu khac.

ALTER TABLE "categories" DROP COLUMN "version";
