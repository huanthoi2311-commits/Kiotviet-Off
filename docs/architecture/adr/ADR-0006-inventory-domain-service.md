# Status

Accepted

---

# Context

`SPEC-INV-001` dùng thuật ngữ "InventoryDomainService", gợi ý 1 tầng kiến trúc "Domain Service" tách biệt. Khảo sát 25 module hiện có (T001/T003.5) cho thấy dự án chưa từng có tầng "Domain Service" riêng ở bất kỳ module nào — mẫu hình nhất quán là "Application Service → Repository" (ADR-0002). Đồng thời (ADR-0005), Repository của `inventory` module cần trở thành chi tiết nội bộ, không còn export.

---

# Decision

**Repository không export. Chỉ export Service.** `InventoryDomainService` là 1 class duy nhất, nội bộ vẫn theo đúng mẫu "Application Service → Repository" đã có (gọi `IInventoryRepository`) — không thêm tầng kiến trúc mới cho toàn dự án. Điểm khác biệt duy nhất so với Application Service khác: nó là bề mặt public DUY NHẤT module khác được phép inject từ `inventory` module.

Bề mặt public giới hạn ở 5 phương thức: `increase()`, `decrease()`, `adjust()`, `transfer()`, `recordMovement()` — mỗi phương thức ứng với 1 nhóm nghiệp vụ cụ thể (nhập kho, xuất kho, điều chỉnh, điều chuyển, và cửa ngõ tổng quát cho module tương lai).

---

# Consequences

**Ưu điểm**
- Không có thay đổi cấu trúc thư mục/layering ở 24 module còn lại.
- `InventoryDomainService` nằm đúng vị trí `application/` theo layering hiện có (ADR-0002), không tạo `domain/services/` mới riêng.
- Mẫu này tái sử dụng được cho domain khác nếu có cùng nhu cầu "gate-kept single writer" trong tương lai (vd Customer Point đã có nhu cầu tương tự — `usePoint()` với optimistic lock).

**Nhược điểm**
- 5 phương thức public là 1 quyết định thiết kế cụ thể (không phải generic CRUD) — module tương lai cần hiểu đúng NÊN dùng phương thức nào (`increase` vs `adjust`) thay vì tự do gọi 1 hàm ghi chung chung.

**Ảnh hưởng**
- `InventoryModule.exports` chỉ còn `[InventoryDomainService]`.
- `IInventoryRepository`/`INVENTORY_REPOSITORY` trở thành provider nội bộ, chỉ `InventoryDomainService` (cùng module) được inject.

---

# Alternatives

- **Tạo 1 tầng Domain Service chính thức trong Clean Architecture** (`domain/services/`, tách biệt Application Service) áp dụng cho toàn dự án.

---

# Rejected

**Tầng Domain Service chính thức toàn dự án** — bị hoãn (không phải bác bỏ vĩnh viễn). Chưa có đủ bằng chứng (≥2 module cần cùng nhu cầu) để chứng minh giá trị của việc thêm độ phức tạp kiến trúc mới; `inventory` một mình chưa đủ lý do để thay đổi layering chung.

---

# References

- SPEC: `SPEC-INV-001` Decision 3/10.
- Sprint: T004.
- Report: `docs/implementation/sprint-00-t004-report.md`.
- Module: `backend/src/modules/inventory/application/inventory-domain.service.ts`, `backend/src/modules/inventory/inventory.module.ts`.
