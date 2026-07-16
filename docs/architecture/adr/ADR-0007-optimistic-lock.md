# Status

Accepted

---

# Context

Trước T004, chỉ `recordSaleMovement()` (Checkout, Prompt 035) có Optimistic Lock — compare-and-swap `updateMany WHERE quantity = beforeQuantity`. 5 module còn lại dùng `findUnique` rồi `upsert()` mù (read-modify-write cổ điển), có thể mất-cập-nhật nếu 2 transaction chạm cùng `(warehouse, product)` đồng thời. Rủi ro MỘT CHIỀU: nếu bên có lock (Checkout) commit trước, bên không lock commit sau sẽ ghi đè mù lên kết quả đúng mà không phát hiện.

---

# Decision

**Toàn bộ Inventory** — cả 6 đường ghi (Purchase Receive, Purchase Return, Transfer OUT/IN, Inventory Adjustment, Stock Count, Checkout) dùng chung 1 hàm ghi vật lý (`IInventoryRepository.recordMovement()`) LUÔN áp dụng Optimistic Lock, không có ngoại lệ theo `movementType`.

Cơ chế: `UPDATE ... WHERE quantity = <giá trị vừa đọc trong cùng transaction>` — 0 dòng bị ảnh hưởng nghĩa là giá trị đã đổi do giao dịch khác chen giữa → ném `InventoryConcurrencyConflictError` thay vì ghi đè.

---

# Consequences

**Ưu điểm**
- An toàn dưới mức cô lập READ COMMITTED (mặc định của dự án) mà không cần nâng lên SERIALIZABLE — `UPDATE` luôn tái kiểm tra `WHERE` với dữ liệu mới nhất đã commit tại thời điểm thực thi.
- Hiệu quả hơn Pessimistic Lock trong hồ sơ tải thấp-tranh-chấp/cao-thông-lượng điển hình của POS/ERP.
- Nhất quán 6/6 đường ghi — không còn bất đối xứng như trước T004.

**Nhược điểm**
- 5 module trước đây không có lock nay CÓ THỂ ném `InventoryConcurrencyConflictError` trong tình huống tranh chấp hiếm — hành vi mới cần xử lý ở tầng gọi.
- Không tự động retry — caller/người dùng phải tự thử lại.

**Ảnh hưởng**
- Mỗi Service module map `InventoryConcurrencyConflictError` sang HTTP 409 riêng, dùng ErrorCode riêng từng module.
- Chưa có Idempotency key cho `InventoryMovement` — nếu tầng gọi tự retry, cần đảm bảo retry từ đầu transaction nghiệp vụ, không chỉ retry bước ghi Inventory.

---

# Alternatives

- **Pessimistic Lock (`SELECT ... FOR UPDATE`)** làm mặc định cho mọi đường ghi.
- **Nâng mức cô lập lên SERIALIZABLE** toàn dự án.

---

# Rejected

- **Pessimistic Lock làm mặc định** — không chọn cho mặc định (hồ sơ tải POS/ERP là tranh chấp thấp/thông lượng cao; không có tiền lệ dùng row-level lock nào khác trong dự án). Giữ làm lựa chọn dự phòng phạm vi hẹp nếu 1 hot path cụ thể (vd Stock Count khóa sản phẩm trong lúc đếm) chứng minh cần thiết.
- **SERIALIZABLE toàn dự án** — không cần thiết, compare-and-swap đã đủ an toàn dưới READ COMMITTED, tốn chi phí hiệu năng không tương xứng.

---

# References

- SPEC: `SPEC-INV-001` Decision 6.
- Sprint: T004.
- Report: `docs/architecture/inventory/inventory-locking-strategy.md`, `docs/architecture/inventory/inventory-concurrency.md`.
- Module: `backend/src/modules/inventory/infrastructure/persistence/prisma-inventory.repository.ts`.
