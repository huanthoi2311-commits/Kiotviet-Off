# Sprint-00 — Architecture Stabilization: Summary

**Trạng thái: ĐÃ ĐÓNG (2026-07-16).** T001-T004.95 hoàn thành, gắn tag `v0.1.0-foundation`. Sprint-01 (Product Domain) bắt đầu bằng `RFC-0001` (user soạn) → `SPEC-PRODUCT-001` → Implementation → Review → Release, theo quy trình mới trong `docs/project-governance/`.

## 1. Mục tiêu Sprint-00

Sau Prompt 035 (Checkout Engine), user dừng toàn bộ phát triển tính năng POS/Order/Payment/Voucher/Promotion mới, chuyển sang ổn định kiến trúc trước khi mở rộng thêm. Phương pháp làm việc: **Specification First** — với mọi domain nền tảng/mơ hồ, user tự soạn SPEC (Entity/Business Rules/API/Permission/Migration/Event/Performance/Security/Acceptance), Claude Code không viết code — kể cả bản nháp SPEC — cho tới khi nhận văn bản đánh dấu "APPROVED FOR DEVELOPMENT"/"APPROVED FOR IMPLEMENTATION". Khi phát hiện xung đột giữa SPEC và code/schema thực tế, dừng lại và hỏi bằng bằng chứng cụ thể (file:line), không tự thiết kế giải pháp.

## 2. Tiến độ theo hạng mục

| # | Hạng mục | SPEC | Trạng thái | Commit |
|---|---|---|---|---|
| T001 | Architecture Audit (Prompt A01) | — (chỉ phân tích) | ✅ | `fb4c21f` |
| T002 | Organization Module | `SPEC-ORG-001` | ✅ | `d69b82a` |
| T003 | Branch Module | `SPEC-BRANCH-001` | ✅ | `d69b82a` |
| T003.5 | Inventory Architecture Specification & Review | — (chỉ phân tích, 7 tài liệu) | ✅ | `fb8628d` |
| T004 | Inventory Refactor | `SPEC-INV-001` + Revision 1 | ✅ | `fb8628d` |
| T004.9 | Event Architecture Review | — (chuẩn bị, chưa phải SPEC) | ✅ | `d424c75`* |
| T004.95 | Architecture Decision Records | `SPEC-T004.95` | ✅ | `c001f31` |

*`d424c75` bị soft-reset và thay bằng nội dung cuối cùng nằm trong `c001f31` — xem `docs/release/gate-status.md` để biết chi tiết lịch sử.

**Sprint-00 ĐÓNG tại đây — tag `v0.1.0-foundation`.** T005 (Domain Events) và các T00x tiếp theo chuyển sang đánh số Sprint-01 (xem §7), không còn thuộc Sprint-00.

Chi tiết Gate từng hạng mục: `docs/release/gate-status.md`.

## 3. Kết quả kỹ thuật chính

### 3.1 Organization & Branch (T002/T003)
- `Organization` trở thành root aggregate thật: `code`/`displayName`/`slug` (bất biến sau tạo)/`legalName`/`taxCode`, `ownerUserId` (nullable ở schema, luôn set khi transaction tạo hoàn tất), `plan` deprecated — SSOT chuyển sang `OrganizationSubscription` mới.
- Bootstrap Organization+Owner là 1 transaction nguyên tử (Organization → User → Role → RolePermission → UserRole → Settings → Subscription → AuditLog).
- "Platform Admin" là `User.isPlatformAdmin` boolean thuần túy (không phải Role/Permission) — do `Role.organizationId` bắt buộc, không có cơ chế Role liên-tenant.
- `Branch` có `BranchStatus` enum riêng, tách khỏi `CommonStatus` dùng chung.

### 3.2 Inventory Refactor (T003.5 + T004)
- **Trước T004**: 5 module (`purchase-order`, `purchase-return`, `transfer`, `stock-count`, `inventory-adjustment`) ghi trực tiếp `Inventory`/`InventoryMovement`, bỏ qua `IInventoryRepository` — chỉ `checkout` (module mới nhất trước đó) đi đúng cửa. Chỉ Checkout có Optimistic Lock.
- **Sau T004**: `InventoryDomainService` là cửa ngõ ghi DUY NHẤT (Single Writer, không ngoại lệ — kể cả Checkout đã refactor tầng DI). `IInventoryRepository`/`INVENTORY_REPOSITORY` không còn export ra ngoài `InventoryModule`. Optimistic Lock áp dụng cho toàn bộ 6 đường ghi. Transfer OUT có thêm kiểm tra âm kho (hành vi mới, được SPEC ủy quyền tường minh).
- **Xác minh không chỉ bằng grep một lần** — `single-writer.architecture.spec.ts` là test tự động, chạy mỗi lần `npm test`, đọc trực tiếp metadata `@Module()` qua `Reflect.getMetadata` để xác nhận cả bất biến "không ai được ghi trực tiếp" lẫn "6 module nghiệp vụ thực sự import đúng InventoryModule".

### 3.3 Kỷ luật "dừng lại và hỏi" — xác nhận qua nhiều instance
Xuyên suốt Sprint-00, mọi lần phát hiện xung đột giữa SPEC/ARCHITECT DECISION và code thực tế đều dừng lại hỏi bằng bằng chứng cụ thể thay vì tự thiết kế:
- SPEC-ORG-001 vs schema: 6 điểm xung đột (Plan/Subscription trùng lặp, enum status, bootstrap ordering, Platform Admin, Audit table, Setting split).
- SPEC-INV-001 (bản đầu) vs code: Decision 8 ("không sửa Checkout") mâu thuẫn trực tiếp với Decision 11/12 ("Single Writer, không ngoại lệ") — user trả lời bằng Revision 1.
- Sau khi báo cáo T004 lần đầu (coverage giảm nhẹ, Integration Test ghi mập mờ), user từ chối cho commit, yêu cầu T004.1/T004.5 sửa thật thay vì chỉ diễn giải lại — đã khắc phục, coverage vượt baseline cả 4 chỉ số.

## 4. Trạng thái kiểm thử hiện tại (toàn backend, sau T004)

| Chỉ số | Giá trị |
|---|---|
| Test Suites | 135/135 PASS |
| Unit Test | 1223/1223 PASS |
| Coverage (Statements / Branch / Functions / Lines) | 86.44% / 74.81% / 84.71% / 87.66% |
| Circular Dependency | 0 |
| Integration Test (e2e) | 🟡 PENDING (No Docker Environment trong sandbox này) |

## 5. Việc CHƯA làm / còn mở (mang sang Sprint-01, không còn là "nợ" của Sprint-00)

- **Các open question chưa quyết định** (nêu lại để không bị quên): `InventoryReservation`/`Lot`/`Serial`/`Batch` chưa thiết kế (domain-model.md §4); nguồn Setting cho negative-stock check vẫn giữ bảng `Setting` cũ, chưa cắt sang `OrganizationSettings.allowNegativeInventory`; Stock Count chưa quyết định có cần Pessimistic Lock khi đang đếm hay không (concurrency.md Case 5).
- **Integration Test thật** — cần môi trường có Docker/Postgres/Redis để chạy `npm run test:e2e`, xác nhận Gate B (`docs/release-gates.md`) và mọi Gate Integration Test còn PENDING trong `docs/release/gate-status.md`.

## 6. Tài liệu tham chiếu

- Audit gốc: `docs/architecture/dependency-graph.md`
- 7 tài liệu thiết kế Inventory (T003.5): `docs/architecture/inventory/*.md`
- Event Architecture Review (T004.9): `docs/architecture/event-architecture-review.md`
- 12 ADR (T004.95): `docs/architecture/adr/`
- Báo cáo T004 đầy đủ (Implementation/Refactor/Migration/Test/Architecture Verification): `docs/implementation/sprint-00-t004-report.md`
- Báo cáo T004.95: `docs/implementation/t00495-report.md`
- Gate Status theo dõi liên tục: `docs/release/gate-status.md`
- Gate A-D toàn sản phẩm (khác phạm vi, xem ghi chú trong chính file): `docs/release-gates.md`

## 7. Sprint-01 — bắt đầu

**Quy trình mới, áp dụng từ Sprint-01**: RFC → SPEC → Implementation → Review → Release, hỗ trợ bởi `docs/project-governance/` (PROJECT_RULES/ARCHITECTURE_RULES/CODING_RULES/TEST_RULES/REVIEW_RULES/RELEASE_RULES/AI_WORKFLOW).

Sprint-01 bắt đầu bằng **`RFC-0001` (Product Domain)** — user soạn, Claude Code KHÔNG tự viết RFC/SPEC (đúng nguyên tắc Specification First xuyên suốt dự án). Sau `RFC-0001` mới tới `SPEC-PRODUCT-001` rồi triển khai Product Module. Roadmap đầy đủ (T005-T014 + Gate-01) do user cung cấp, chưa có tài liệu chi tiết hóa — chỉ tạo khi có RFC/SPEC tương ứng.
