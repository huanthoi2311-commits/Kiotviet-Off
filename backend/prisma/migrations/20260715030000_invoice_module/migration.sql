-- Prompt 035 (POS Checkout Engine): Invoice được tạo trực tiếp từ Checkout, không qua Order
-- (Order Module chưa xây, quy hoạch Volume 036-040) -> orderId chuyển NOT NULL -> nullable,
-- FK Restrict -> SetNull. Thêm customerId (Cart Engine không bắt buộc khách hàng). Hóa đơn là
-- chứng từ bất biến sau khi tạo (chỉ đổi status/paidAmount/dueAmount qua Payment), không soft
-- delete -> bỏ updatedBy/deletedAt. Thêm InvoiceItem lưu chi tiết dòng hàng của hóa đơn.

-- 1) orderId: NOT NULL -> nullable, đổi FK Restrict -> SetNull
ALTER TABLE "invoices" ALTER COLUMN "orderId" DROP NOT NULL;
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_orderId_fkey";
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2) customerId mới (optional)
ALTER TABLE "invoices" ADD COLUMN "customerId" UUID;
CREATE INDEX "invoices_customerId_idx" ON "invoices"("customerId");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3) Bỏ updatedBy/deletedAt
ALTER TABLE "invoices" DROP COLUMN "updatedBy";
ALTER TABLE "invoices" DROP COLUMN "deletedAt";

-- 4) InvoiceItem
CREATE TABLE "invoice_items" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "invoice_items_invoiceId_idx" ON "invoice_items"("invoiceId");
CREATE INDEX "invoice_items_productId_idx" ON "invoice_items"("productId");

ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
