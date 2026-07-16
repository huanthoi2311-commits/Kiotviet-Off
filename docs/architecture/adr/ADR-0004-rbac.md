# Status

Accepted

---

# Context

Cần kiểm soát quyền truy cập chi tiết theo `resource:action` (~140 permission code đã seed từ Foundation) mà không làm chậm mỗi request bằng truy vấn DB liên tục để lấy danh sách quyền hiện tại của user.

---

# Decision

**Role → Permission → JWT.** Quyền của user (permission codes) được nạp vào JWT tại thời điểm đăng nhập. `PermissionsGuard` kiểm tra quyền dựa vào claims trong JWT — **không query DB mỗi request** để lấy lại danh sách quyền.

---

# Consequences

**Ưu điểm**
- Hiệu năng cao — không round-trip DB cho mỗi request cần kiểm tra quyền, phù hợp tần suất request cao ở các điểm bán POS.
- `PermissionsGuard` đơn giản, chỉ đọc claims có sẵn trong JWT đã verify.

**Nhược điểm**
- Đổi quyền của 1 Role không có hiệu lực NGAY cho user đang đăng nhập với JWT cũ (JWT là snapshot tại thời điểm phát hành).

**Ảnh hưởng**
- Cần cơ chế vô hiệu hóa JWT cũ khi quyền đổi: `permissionVersion` (đã có từ Foundation) — đổi quyền của Role → tăng `permissionVersion` → JWT cũ mang version thấp hơn bị từ chối, buộc đăng nhập lại để nhận JWT mới với quyền cập nhật.
- JWT payload lớn hơn 1 chút so với JWT tối giản chỉ chứa `userId` (mang thêm danh sách permission hoặc `permissionVersion` để so sánh).

---

# Alternatives

- **Query DB mỗi request** để luôn lấy quyền mới nhất, chính xác tuyệt đối theo thời gian thực.

---

# Rejected

**Query DB mỗi request** — bị loại. Tốn hiệu năng không cần thiết ở quy mô nhiều điểm bán POS hoạt động đồng thời; `permissionVersion` invalidation đã giải quyết vấn đề "quyền đổi nhưng JWT cũ vẫn dùng được" ở mức chấp nhận được (độ trễ tối đa = thời gian JWT còn hạn trước khi hết hạn/bị buộc đăng nhập lại).

---

# References

- Module: `backend/src/modules/rbac/`, `backend/src/modules/rbac/infrastructure/permission-catalog.ts`.
- Module: `backend/src/common/types/jwt-payload.type.ts` (JWT payload shape, gồm `permissionVersion`).
- Sprint: Foundation.
