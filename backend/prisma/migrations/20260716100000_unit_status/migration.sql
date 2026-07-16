-- SPEC-UNIT-001 (Sprint-01, T008 Migration B/2): UnitStatus rieng (Decision RQ1) - KHONG dung
-- CommonStatus, KHONG co DRAFT. Migration doc lap, khong phu thuoc Migration A.

CREATE TYPE "UnitStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
ALTER TABLE "units" ADD COLUMN "status" "UnitStatus" NOT NULL DEFAULT 'ACTIVE';
-- Backfill don gian (Decision RQ9 - khong backfill phuc tap): Unit da soft-delete tu truoc ->
-- ARCHIVED (nhat quan "Archive = Soft Delete"). Con lai giu DEFAULT 'ACTIVE'.
UPDATE "units" SET "status" = 'ARCHIVED' WHERE "deletedAt" IS NOT NULL;
