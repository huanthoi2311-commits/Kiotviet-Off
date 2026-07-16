-- SPEC-BRAND-001 (Sprint-01, T007 Migration A/1): Optimistic Lock cho Brand (Decision B02.7/RQ).
-- Migration doc lap duy nhat cua T007 - khong co migration nao khac di kem.

ALTER TABLE "brands" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
