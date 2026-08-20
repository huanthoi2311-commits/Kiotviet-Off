-- Rollback — T053.06E Sales Return Refund Idempotency
-- An toan de chay BAT KY LUC NAO TRUOC KHI ung dung doc/ghi bang nay (thuan tuy them moi, khong
-- co du lieu san co nao phu thuoc). KHONG an toan neu chay SAU KHI ma ung dung da trien khai va
-- da ghi cac hang operation that — rollback schema phai di kem rollback ma ung dung truoc, dung
-- thu tu (cung ky luat da ap dung cho checkout_operations/supplier_payment_operations).
DROP TABLE "sales_return_refund_operations";
DROP TYPE "SalesReturnRefundOperationStatus";
