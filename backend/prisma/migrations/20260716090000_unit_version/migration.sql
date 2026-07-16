-- SPEC-UNIT-001 (Sprint-01, T008 Migration A/2): Optimistic Lock cho Unit (Decision RQ2/UP08).
-- Migration doc lap, khong phu thuoc Migration B.

ALTER TABLE "units" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
