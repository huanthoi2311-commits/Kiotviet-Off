-- SPEC-CATEGORY-001 (Sprint-01, T006 Migration B/3): slug unique theo tenant (Decision Q3).
-- Migration doc lap, khong phu thuoc Migration A/C (Decision S04/IP05).

-- Kiem tra du lieu trung TRUOC khi tao unique constraint (dung mau Barcode, SPEC-PRODUCT-001
-- SS3.4/Decision 7 - Migration phai FAIL neu phat hien trung, khong tu merge).
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count FROM (
    SELECT "organizationId", "slug"
    FROM "categories"
    WHERE "deletedAt" IS NULL
    GROUP BY "organizationId", "slug"
    HAVING COUNT(*) > 1
  ) dup;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'Migration FAILED: % duplicate (organizationId, slug) pair(s) found in categories. Xu ly du lieu trung thu cong truoc khi chay lai migration nay (SPEC-CATEGORY-001 Decision Q3 - khong tu dong merge).', duplicate_count;
  END IF;
END $$;

CREATE UNIQUE INDEX "categories_organizationId_slug_key" ON "categories"("organizationId", "slug");
