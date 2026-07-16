# Status

Accepted

---

# Context

Trước T004, `InventoryModule` export `INVENTORY_REPOSITORY` — cho phép `checkout` (và về lý thuyết, bất kỳ module tương lai nào) inject `IInventoryRepository` trực tiếp thay vì qua cổng vào có kiểm soát (`InventoryDomainService`, ADR-0006). Đây chính là lỗ hổng khiến Single Writer (ADR-0005) không thể thực thi tuyệt đối chỉ bằng quy ước — về mặt DI, Checkout hoàn toàn hợp lệ khi ghi trực tiếp qua Repository vì module cho phép điều đó.

---

# Decision

**Không module nào inject Repository của module khác.** Repository (interface + implementation + DI token) là chi tiết triển khai NỘI BỘ của module sở hữu nó. Chỉ Application/Domain Service (bề mặt public có kiểm soát business rule) mới được `exports` ra ngoài module. Áp dụng cho `inventory` (T004) và là quy tắc CHUNG cho toàn dự án từ nay về sau, không giới hạn riêng Inventory.

---

# Consequences

**Ưu điểm**
- Loại bỏ khả năng bypass bất kỳ Domain Service gate-kept nào ở tầng DI — nếu Repository không được export, không có cách nào hợp lệ để inject trực tiếp.
- Áp dụng được cho MỌI module tương lai có nhu cầu gate-kept tương tự Inventory, không cần phát minh lại quy tắc riêng.

**Nhược điểm**
- Module cần cân nhắc kỹ trước khi thiết kế: bề mặt public (Service) phải đủ đầy đủ cho MỌI nhu cầu hợp lệ của module khác — nếu thiếu 1 use case, phải mở rộng Service thay vì "tạm mở" Repository.

**Ảnh hưởng**
- `InventoryModule.exports` chỉ còn `[InventoryDomainService]`, không còn `INVENTORY_REPOSITORY`.
- Xác nhận bằng test tự động: `single-writer.architecture.spec.ts` đọc trực tiếp metadata `@Module({exports: [...]})` để kiểm tra bất biến này không bị vi phạm trong tương lai (xem ADR-0012).
- Quy tắc này áp dụng khi thiết kế module MỚI (Product/Category/Brand... Sprint-01): mặc định KHÔNG export Repository trừ khi có lý do rõ ràng module đó không cần gate-kept nghiệp vụ nào.

---

# Alternatives

- **Export cả Repository lẫn Service**, dựa vào code review để ngăn lạm dụng.
- **Runtime guard** (decorator/interceptor chặn gọi Repository từ module khác).

---

# Rejected

- **Export cả 2, dựa vào review** — đây chính là hiện trạng trước T004, đã chứng minh không hiệu quả trong thực tế dự án này (Checkout đã inject trực tiếp mà không ai chặn được ở tầng review).
- **Runtime guard riêng** — phức tạp hơn nhiều so với giải pháp đơn giản "không export"; NestJS DI đã tự nhiên hỗ trợ ràng buộc này qua `exports`, không cần cơ chế bổ sung.

---

# References

- SPEC: `SPEC-INV-001` Decision 8, Revision 2 (xác nhận là quy tắc toàn dự án).
- Sprint: T004.
- Module: `backend/src/modules/inventory/inventory.module.ts`, `backend/src/modules/inventory/single-writer.architecture.spec.ts`.
