-- Rollback — T052.05B Supplier Payment Idempotency
DROP TABLE "supplier_payment_operations";
DROP TYPE "SupplierPaymentOperationStatus";
