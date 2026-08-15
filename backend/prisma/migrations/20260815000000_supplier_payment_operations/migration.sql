-- T052.05B Supplier Payment Idempotency — Migration
-- Bang ho tro ky thuat, tach biet khoi Payment de "reserve" mot Idempotency-Key co the
-- durable/quan sat duoc TRUOC khi Business Transaction chinh tao Payment. Cung kien truc nen
-- voi checkout_operations (20260719000000) nhung paymentId co FK that su toi payments (yeu
-- cau rieng cua T052.05B — checkout_operations.paymentId KHONG co FK).

CREATE TYPE "SupplierPaymentOperationStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "supplier_payment_operations" (
  "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId"     UUID NOT NULL,
  "idempotencyKey"     TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "status"             "SupplierPaymentOperationStatus" NOT NULL DEFAULT 'PROCESSING',
  "paymentId"          UUID,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  "completedAt"        TIMESTAMP(3),

  CONSTRAINT "supplier_payment_operations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "supplier_payment_operations"
  ADD CONSTRAINT "supplier_payment_operations_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_payment_operations"
  ADD CONSTRAINT "supplier_payment_operations_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "supplier_payment_operations_organizationId_idempotencyKey_key"
  ON "supplier_payment_operations"("organizationId", "idempotencyKey");
CREATE INDEX "supplier_payment_operations_status_createdAt_idx"
  ON "supplier_payment_operations"("status", "createdAt");
