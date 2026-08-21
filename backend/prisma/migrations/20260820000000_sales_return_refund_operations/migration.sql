-- T053.06E Sales Return Refund Idempotency — Migration
-- Bang ho tro ky thuat, tach biet khoi SalesReturnRefund de "reserve" mot Idempotency-Key co the
-- durable/quan sat duoc TRUOC khi Business Transaction chinh tao SalesReturnRefund. Cung kien
-- truc nen voi checkout_operations (20260719000000) va supplier_payment_operations
-- (20260815000000) — requestFingerprint BAT BIEN sau khi tao (mirror supplier_payment_operations,
-- KHONG mirror checkout_operations, vi day cung la du lieu tai chinh can kha nang doi soat on
-- dinh). refundId co FK that su toi sales_return_refunds (cung ly do rieng cua T052.05B —
-- checkout_operations.paymentId KHONG co FK).
--
-- Chi them bang moi — KHONG sua doi sales_returns/sales_return_refunds hien co, KHONG anh huong
-- du lieu san co.

CREATE TYPE "SalesReturnRefundOperationStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "sales_return_refund_operations" (
  "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId"     UUID NOT NULL,
  "idempotencyKey"     TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "status"             "SalesReturnRefundOperationStatus" NOT NULL DEFAULT 'PROCESSING',
  "refundId"           UUID,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  "completedAt"        TIMESTAMP(3),

  CONSTRAINT "sales_return_refund_operations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "sales_return_refund_operations"
  ADD CONSTRAINT "sales_return_refund_operations_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_return_refund_operations"
  ADD CONSTRAINT "sales_return_refund_operations_refundId_fkey"
  FOREIGN KEY ("refundId") REFERENCES "sales_return_refunds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tên constraint mặc định (`<table>_organizationId_idempotencyKey_key`) dài 64 ký tự, VƯỢT giới
-- hạn identifier 63 byte của Postgres (NAMEDATALEN) — dùng tên ngắn tường minh (mirror `map:` ở
-- schema.prisma), tránh phụ thuộc vào truncation ngầm.
CREATE UNIQUE INDEX "sales_return_refund_ops_org_idem_key"
  ON "sales_return_refund_operations"("organizationId", "idempotencyKey");
CREATE INDEX "sales_return_refund_operations_status_createdAt_idx"
  ON "sales_return_refund_operations"("status", "createdAt");
