-- ROLLBACK cho migration 20260716060000_category_slug_unique.
-- Chay THU CONG. Doc lap voi Migration A/C. An toan tuyet doi - chi xoa 1 index,
-- khong mat du lieu (slug van con nguyen tren tung dong).

DROP INDEX "categories_organizationId_slug_key";
