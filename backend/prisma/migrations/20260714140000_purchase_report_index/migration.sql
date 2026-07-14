-- Purchase Report (Prompt 030) — acceptance criterion: 100.000 Purchase Order phải xử lý
-- <3s. Mọi truy vấn báo cáo lọc theo organizationId + status (chỉ tính RECEIVED/COMPLETED)
-- rồi group theo tháng (createdAt) — index tổng hợp giúp Postgres lọc trước khi group
-- thay vì quét toàn bảng. Chỉ thêm CREATE INDEX, không đổi dữ liệu/cột nào — an toàn tuyệt
-- đối với dữ liệu hiện có.
CREATE INDEX "purchase_orders_organizationId_status_createdAt_idx" ON "purchase_orders"("organizationId", "status", "createdAt");
