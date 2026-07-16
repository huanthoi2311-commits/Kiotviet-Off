# Status

Accepted

---

# Context

T001 (Prompt A01) phát hiện 5 module (`purchase-order`, `purchase-return`, `transfer`, `stock-count`, `inventory-adjustment`) ghi trực tiếp vào bảng `Inventory`/`InventoryMovement` qua Prisma Client riêng, bỏ qua `IInventoryRepository` dù interface đó tự nhận là "sole write path". Chỉ `checkout` (module mới nhất tại thời điểm đó) đi đúng cửa và chỉ đường ghi của nó có Optimistic Lock (xem ADR-0007) — 5 module còn lại không có khóa nào, có thể mất-cập-nhật (lost update) khi 2 giao dịch chạm cùng `(warehouse, product)` đồng thời.

---

# Decision

`Inventory` chỉ ghi qua **`InventoryDomainService`** — điểm ghi DUY NHẤT toàn hệ thống. Không module nào ngoài `inventory` module được `INSERT`/`UPDATE`/`UPSERT` trực tiếp vào `Inventory`/`InventoryMovement`.

---

# Consequences

**Ưu điểm**
- Loại bỏ hoàn toàn nguy cơ ghi trực tiếp không kiểm soát — mọi thay đổi tồn kho đi qua đúng 1 điểm có Optimistic Lock (ADR-0007) và policy kiểm tra âm kho nhất quán.
- Bất biến được thực thi bởi test tự động (`single-writer.architecture.spec.ts`), không chỉ dựa vào code review thủ công.

**Nhược điểm**
- Thêm 1 lớp gián tiếp (indirection) cho mọi caller cần thay đổi tồn kho — 5 module + Checkout đều phải gọi qua `InventoryDomainService` thay vì viết trực tiếp.

**Ảnh hưởng**
- 5 module (`purchase-order`, `purchase-return`, `transfer`, `inventory-adjustment`, `stock-count`) refactor lại (T004) để gọi `InventoryDomainService`, truyền `tx` của transaction đang mở của chính mình (xem ADR-0008).
- `checkout` refactor tối thiểu tầng Dependency Injection (đổi inject/lời gọi, không đổi business logic).

---

# Alternatives

- **Giữ ghi trực tiếp, thêm Optimistic Lock riêng cho từng module.**
- **Ràng buộc ở tầng database** (trigger/constraint chặn UPDATE ngoài 1 role/hàm cụ thể).

---

# Rejected

- **Optimistic Lock riêng lẻ từng module** — bị loại vì lặp lại logic 6 lần, dễ lệch nhau theo thời gian (đúng những gì đã xảy ra trước T004 — chỉ Checkout có lock).
- **Ràng buộc tầng database** — bị loại vì khó test/reason trong tầng ứng dụng, không khớp cách kiểm chứng kiến trúc bằng test tự động (NestJS DI metadata) mà dự án đã chọn (xem ADR-0012).

---

# References

- SPEC: `SPEC-INV-001` (Decision 3/11/12).
- Sprint: T003.5 (Inventory Architecture Specification & Review), T004 (Inventory Refactor).
- Report: `docs/implementation/sprint-00-t004-report.md`.
- Module: `backend/src/modules/inventory/application/inventory-domain.service.ts`, `backend/src/modules/inventory/single-writer.architecture.spec.ts`.
