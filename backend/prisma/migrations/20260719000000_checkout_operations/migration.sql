-- T013 Sales Foundation — Migration 1 (Idempotency, SPEC §3.2/§9.5)
-- Bang ho tro ky thuat, tach biet khoi Invoice/Payment de "reserve" mot Idempotency-Key
-- co the durable/quan sat duoc TRUOC khi Business Transaction chinh tao Invoice.

CREATE TYPE "CheckoutOperationStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "checkout_operations" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "branchId"       UUID NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash"    TEXT NOT NULL,
  "status"         "CheckoutOperationStatus" NOT NULL DEFAULT 'PROCESSING',
  "invoiceId"      UUID,
  "paymentId"      UUID,
  "createdBy"      UUID,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"    TIMESTAMP(3),
  "expiresAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "checkout_operations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "checkout_operations"
  ADD CONSTRAINT "checkout_operations_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "checkout_operations"
  ADD CONSTRAINT "checkout_operations_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "checkout_operations_organizationId_idempotencyKey_key"
  ON "checkout_operations"("organizationId", "idempotencyKey");
CREATE INDEX "checkout_operations_status_createdAt_idx"
  ON "checkout_operations"("status", "createdAt");
CREATE INDEX "checkout_operations_expiresAt_idx"
  ON "checkout_operations"("expiresAt");
