-- SPEC-CATEGORY-001 (Sprint-01, T006 Migration C/3): CategoryStatus (Decision Q1).
-- Migration doc lap, khong phu thuoc Migration A/B (Decision S04/IP05).

CREATE TYPE "CategoryStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');
ALTER TABLE "categories" ADD COLUMN "status" "CategoryStatus" NOT NULL DEFAULT 'ACTIVE';

-- Backfill: danh muc da soft-delete tu truoc -> ARCHIVED (nhat quan voi "Archive = Soft Delete",
-- RFC-0002 SS6). Con lai giu DEFAULT 'ACTIVE' - khong co danh muc nao tu dong thanh DRAFT (DRAFT
-- la lua chon chu dong, khong suy ra duoc tu du lieu cu).
UPDATE "categories" SET "status" = 'ARCHIVED' WHERE "deletedAt" IS NOT NULL;

-- "isActive" khong doi, khong migrate (Decision Q1 - 2 field doc lap, khong co anh xa giua chung).
