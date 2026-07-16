# Status

Accepted

---

# Context

`InventoryDomainService` (ADR-0005/0006) cần ghép vào các transaction lớn hơn do module gọi sở hữu — vd `PurchaseOrder.receive()` cần Inventory write + Debt write + PurchaseItem update cùng atomic trong 1 transaction. Trước T004, `IInventoryRepository.recordMovement()` tự mở transaction riêng, khiến 5 module không thể dùng nó mà vẫn giữ tính atomic — đây là lý do kỹ thuật gốc khiến các module đó phải tự viết code ghi trực tiếp (xem ADR-0005).

---

# Decision

**Caller quản lý transaction. DomainService không commit.** Mọi phương thức public của `InventoryDomainService` (`increase`, `decrease`, `adjust`, `transfer`, `recordMovement`) nhận `tx: Prisma.TransactionClient` làm tham số BẮT BUỘC, đứng đầu — tuyệt đối không tự mở, không `commit()`, không `rollback()` transaction riêng.

---

# Consequences

**Ưu điểm**
- Cho phép composability thật — nhiều lời gọi `InventoryDomainService` ghép được vào 1 transaction lớn hơn của Caller mà vẫn giữ tính atomic.
- Ranh giới transaction của từng luồng nghiệp vụ (Purchase Receive, Transfer OUT/IN 2 pha, Checkout...) giữ nguyên như thiết kế hiện có — T004 không cần đổi ranh giới transaction nào, chỉ đổi ai thực hiện thao tác ghi bên trong ranh giới đó.

**Nhược điểm**
- Mọi Domain Service theo mẫu này phải nhất quán ký hiệu `tx` ở đầu tham số — caller phải luôn nhớ truyền `tx`, không có "chế độ mặc định tự mở transaction" để dùng nhanh cho việc lặt vặt.

**Ảnh hưởng**
- Không thể gọi `InventoryDomainService.increase()` (hay bất kỳ phương thức nào khác) mà không có sẵn 1 transaction đang mở — ép buộc kỷ luật atomic tốt, nhưng cũng là rào cản nếu ai đó muốn gọi "nhanh" ngoài ngữ cảnh transaction.
- Transfer giữ nguyên thiết kế 2 transaction TÁCH BIỆT theo thời gian (Approve trừ kho nguồn, Receive cộng kho đích — 2 sự kiện đời thực tách biệt, không gộp lại) — bất biến "caller quản lý transaction" áp dụng ĐỘC LẬP cho mỗi trong 2 transaction đó.

---

# Alternatives

- **Domain Service tự mở transaction riêng cho mỗi lời gọi** (mẫu `recordMovement()` cũ trước T004).

---

# Rejected

**Domain Service tự quản lý transaction** — bị loại. Đây chính xác là nguyên nhân kỹ thuật khiến 5 module (trước T004) không thể dùng `IInventoryRepository.recordMovement()` cũ mà vẫn giữ atomic, buộc phải tự viết code ghi trực tiếp — vi phạm Single Writer (ADR-0005). Fix đúng gốc rễ là đổi chữ ký nhận `tx`, không phải thêm ngoại lệ/workaround khác.

---

# References

- SPEC: `SPEC-INV-001` Decision 5.
- Sprint: T004.
- Report: `docs/architecture/inventory/inventory-transaction-boundary.md`.
- Module: `backend/src/modules/inventory/application/inventory-domain.service.ts`, `backend/src/modules/inventory/domain/repositories/inventory.repository.interface.ts`.
