-- T014 Phase 1 (SPEC-T014-SALES-RETURN-EXCHANGE-001 §3, Decision AD27/AD35)
-- sales_returns / sales_return_items / sales_return_refunds - Aggregate MOI, tham chieu truc
-- tiep Invoice/InvoiceItem. KHONG dung Order/OrderItem/Return/ReturnItem (scaffold cu, giu
-- nguyen khong dung toi - Decision AD27, RFC-T014 SS35).

CREATE TYPE "SalesReturnStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'RECEIVED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "SalesReturnReason" AS ENUM ('DAMAGED', 'DEFECTIVE', 'WRONG_PRODUCT', 'CUSTOMER_CHANGED_MIND', 'EXPIRED', 'TRANSPORT_DAMAGE', 'OTHER');
CREATE TYPE "SalesReturnRefundStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE "sales_returns" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "branchId"       UUID NOT NULL,
  "invoiceId"      UUID NOT NULL,
  "customerId"     UUID,
  "code"           TEXT NOT NULL,
  "status"         "SalesReturnStatus" NOT NULL DEFAULT 'DRAFT',
  "totalAmount"    DECIMAL(18,2) NOT NULL DEFAULT 0,
  "note"           TEXT,
  "createdBy"      UUID,
  "updatedBy"      UUID,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "deletedAt"      TIMESTAMP(3),
  "version"        INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "sales_returns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_returns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_returns_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_returns_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_returns_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "sales_returns_organizationId_code_key" ON "sales_returns"("organizationId", "code");
CREATE INDEX "sales_returns_organizationId_idx" ON "sales_returns"("organizationId");
CREATE INDEX "sales_returns_invoiceId_idx" ON "sales_returns"("invoiceId");
CREATE INDEX "sales_returns_status_idx" ON "sales_returns"("status");

CREATE TABLE "sales_return_items" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "salesReturnId"       UUID NOT NULL,
  "invoiceItemId"       UUID NOT NULL,
  "productId"           UUID NOT NULL,
  "warehouseId"         UUID,
  "quantity"            DECIMAL(18,3) NOT NULL,
  "unitPrice"           DECIMAL(18,2) NOT NULL,
  "discount"            DECIMAL(18,2) NOT NULL DEFAULT 0,
  "taxAmount"           DECIMAL(18,2) NOT NULL DEFAULT 0,
  "totalAmount"         DECIMAL(18,2) NOT NULL,
  "productCodeSnapshot" TEXT NOT NULL,
  "productNameSnapshot" TEXT NOT NULL,
  "unitNameSnapshot"    TEXT NOT NULL,
  "reason"              "SalesReturnReason" NOT NULL,
  "reasonNote"          TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,

  CONSTRAINT "sales_return_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_return_items_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "sales_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sales_return_items_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "invoice_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_return_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_return_items_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "sales_return_items_salesReturnId_idx" ON "sales_return_items"("salesReturnId");
CREATE INDEX "sales_return_items_invoiceItemId_idx" ON "sales_return_items"("invoiceItemId");

CREATE TABLE "sales_return_refunds" (
  "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
  "salesReturnId"      UUID NOT NULL,
  "amount"             DECIMAL(18,2) NOT NULL,
  "method"             "PaymentMethod" NOT NULL,
  "status"             "SalesReturnRefundStatus" NOT NULL DEFAULT 'PENDING',
  "externalReference"  TEXT,
  "failureReason"      TEXT,
  "createdBy"          UUID,
  "updatedBy"          UUID,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  "version"            INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT "sales_return_refunds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_return_refunds_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "sales_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "sales_return_refunds_salesReturnId_idx" ON "sales_return_refunds"("salesReturnId");
