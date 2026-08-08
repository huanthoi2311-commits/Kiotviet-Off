-- T043.07 (SPEC-T043.07 §7, RFC-T043.06 Option 2 approved with set-level versioning)
-- Optimistic Lock rieng cho toan bo Product price set, tach khoi Product.version (Product core
-- fields va Product pricing phai co concurrency boundary doc lap - Architect Decision T043.06 §1/§2).

ALTER TABLE "products" ADD COLUMN "priceVersion" INTEGER NOT NULL DEFAULT 1;
