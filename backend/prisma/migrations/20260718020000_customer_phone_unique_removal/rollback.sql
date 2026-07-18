-- Rollback C — T011 Customer Domain
-- Luu y: chi an toan neu chua phat sinh du lieu trung phone that sau khi go constraint.
-- Kiem tra truoc: SELECT "organizationId", phone, COUNT(*) FROM customers
--   WHERE phone IS NOT NULL GROUP BY "organizationId", phone HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX "customers_organizationId_phone_key" ON "customers"("organizationId", "phone");
