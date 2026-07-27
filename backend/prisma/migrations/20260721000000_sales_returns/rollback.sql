-- Rollback (SPEC-T014-SALES-RETURN-EXCHANGE-001 §20)

DROP TABLE "sales_return_refunds";
DROP TABLE "sales_return_items";
DROP TABLE "sales_returns";

DROP TYPE "SalesReturnRefundStatus";
DROP TYPE "SalesReturnReason";
DROP TYPE "SalesReturnStatus";
