-- SPEC-CATEGORY-001 (Sprint-01, T006 Migration A/3): Optimistic Lock cho Category (Decision Q9).
-- Migration doc lap, khong phu thuoc Migration B/C (Decision S04/IP05).

ALTER TABLE "categories" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
