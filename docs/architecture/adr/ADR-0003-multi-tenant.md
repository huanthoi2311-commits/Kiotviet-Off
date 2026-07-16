# Status

Accepted

---

# Context

Hệ thống bán cho nhiều khách hàng (tenant) độc lập, mỗi tenant có cấu trúc tổ chức thật (nhiều chi nhánh, nhiều kho mỗi chi nhánh). Trước T002, không có API nào để tạo Organization mới — chỉ tạo được bằng thao tác tay trong test/seed. Cần đảm bảo dữ liệu giữa các tenant không bao giờ lẫn nhau.

---

# Decision

Phân cấp tenant: **Organization → Branch → Warehouse**. Một User chỉ thuộc đúng 1 Organization (không đa-tenant cho 1 User). **Platform Admin đứng NGOÀI khái niệm tenant** — không thuộc về RBAC per-tenant (xem ADR-0004), mô hình hóa bằng `User.isPlatformAdmin` boolean thuần túy.

---

# Consequences

**Ưu điểm**
- Mọi bảng nghiệp vụ scope theo `organizationId` rõ ràng, dễ audit và đảm bảo cô lập dữ liệu giữa các tenant.
- Cấu trúc Organization → Branch → Warehouse khớp đúng mô hình POS/ERP thật (nhiều cửa hàng, nhiều kho mỗi cửa hàng).
- Organization+Owner+Role+Settings+Subscription được tạo atomic trong 1 transaction (T002) — không có trạng thái nửa vời (tenant tồn tại nhưng chưa có chủ sở hữu).

**Nhược điểm**
- Một User không thể thao tác cho 2 Organization khác nhau trong mô hình hiện tại (vd 1 kế toán thuê ngoài quản lý độc lập nhiều cửa hàng của các chủ khác nhau) — cần tạo User riêng cho mỗi Organization nếu có nhu cầu này.

**Ảnh hưởng**
- Mọi Repository/Query PHẢI filter theo `organizationId` — thiếu sót dù chỉ 1 chỗ là rò rỉ dữ liệu xuyên tenant.
- Platform Admin cần 1 guard riêng biệt (`PlatformAdminGuard`), tách khỏi `PermissionsGuard` thông thường — không lẫn vào hệ thống RBAC per-tenant.
- Organization tự sinh mã bằng 1 `SEQUENCE` Postgres riêng (`organization_code_seq`), không dùng bảng `Sequence` dùng chung của module khác (`Sequence` cần `organizationId` để scope theo, nhưng Organization chưa tồn tại tại thời điểm sinh mã của chính nó).

---

# Alternatives

- **Many-to-many User↔Organization** (1 User thuộc nhiều Organization) — cân nhắc nhưng không chọn cho phiên bản hiện tại.

---

# Rejected

**Many-to-many User↔Organization** — bị loại. Phức tạp hóa toàn bộ mô hình JWT/session (JWT hiện mã hóa đúng 1 `organizationId` cố định cho cả phiên đăng nhập); chưa có nhu cầu nghiệp vụ cụ thể nào đòi hỏi ngay; có thể bổ sung sau bằng 1 bảng liên kết nếu cần, không phá vỡ mô hình hiện tại.

---

# References

- SPEC: `SPEC-ORG-001`, `SPEC-BRANCH-001` (chưa có file riêng trong repo — nội dung nằm trong lịch sử quyết định kiến trúc của dự án).
- Sprint: T002 (Organization), T003 (Branch).
- Report: `docs/implementation/sprint-00-t002-t003-report.md`.
- Module: `backend/src/modules/organization/`, `backend/src/modules/branch/`, `backend/src/modules/warehouse/`.
