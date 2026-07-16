# Master Decision Log — Tổng hợp Decision đã ổn định (T005–T008)

**Mục đích:** Tổng hợp — **không phát minh mới** — toàn bộ Architect Decision đã APPROVED và áp dụng nhất quán qua 4 module Master Data (Product/T005, Category/T006, Brand/T007, Unit/T008). Mỗi mục dưới đây trích dẫn Decision gốc để truy vết lại. Dùng làm tài liệu tham chiếu khi RFC/SPEC module mới (Barcode/Attribute/Variant) cần biết "trước đây đã quyết định gì" — **không thay thế** việc RFC module mới vẫn phải tự xác nhận áp dụng lại hay không.

---

## 1. Repository Boundary (ADR-0010)

- **Chỉ tạo `XxxDomainService` khi có module khác THẬT SỰ đọc** — không tạo trước "phòng khi cần sau". Xác nhận qua Dependency Audit của từng module (đếm consumer thật).
- Nguồn: Decision Q5/Q10/S07 (Category), B02.8 (Brand), U08/RQ6/SU06/UP02 (Unit) — tái xác nhận 3 lần liên tiếp, không đổi.
- `ProductDomainService` là mẫu tham chiếu: 4 method pass-through đúng nhu cầu thật của 5 module phụ thuộc (`findById`, `hasActiveProductsInCategory/Brand/Unit`) — không có method ghi.
- `BarcodeDomainService` (T008) là ví dụ tạo mới đúng lúc: chỉ 1 method (`hasActiveBarcodesInUnit`) khi Unit thật sự cần đọc Barcode cho Delete Guard — không mở rộng thêm (Decision RQ5/SU05/UP03).
- Module KHÔNG được inject `XXX_REPOSITORY` của module khác trực tiếp qua DI — luôn qua DomainService.

## 2. Multi Tenant

- `organizationId` luôn lấy từ JWT (`@CurrentUser()`) ở Controller — không nhận từ body/param/query của bất kỳ DTO nào.
- Đường đọc (`findById`/`search`/`existsByCode`) luôn lọc `organizationId` — đúng từ T005.
- Đường ghi (`update`/`softDelete`/`restore`): **thay đổi theo thời gian** —
  - T005–T007 (Product/Category/Brand): chỉ lọc theo `id`, dựa vào Service pre-check (`findById(id, organizationId)` trước khi gọi write) — chưa lọc `organizationId` trực tiếp ở `where`.
  - **Từ T008 (Unit) trở đi**: `organizationId` bắt buộc có trong `where` của MỌI method ghi (Decision SU03/UP06) — chuẩn mới, áp dụng cho module MỚI từ đây. Product/Category/Brand **chưa** được retro-fit — chỉ sửa khi tới đúng Sprint riêng của từng module, không mở Hotfix riêng (Decision SU03).

## 3. Query Convention

- 7 tham số cố định: `page`, `limit`, `search`, `sortBy`, `sortOrder`, `status`, `isActive`. Không đổi tên (không `pageSize`/`sort`).
- Nguồn: Decision IP01/S02 (Category), B02.5/RQ3 (Brand), RQ7/UP01 (Unit) — 3 lần xác nhận liên tiếp không đổi.
- `parentId` CHỈ thêm cho module có cấu trúc cây (hiện chỉ Category) — không mặc định cho module khác.
- `isActive`: **filter alias cho `status`, KHÔNG phải cột schema mới** — trừ khi RFC chứng minh nhu cầu nghiệp vụ thật riêng biệt (nguyên tắc "Business First, Consistency Second" — Decision RQ5/Brand, tái xác nhận SU04/Unit). Có thể dùng đồng thời `status`+`isActive` (AND, không Breaking Change — Decision RQ4/Brand).

## 4. Optimistic Lock (ADR-0007)

- Mọi Aggregate Root Master Data có `version: Int @default(1)`.
- `PATCH` bắt buộc gửi đúng `version`; sai → `409` qua `XxxConcurrencyConflictError` → `ConflictException`.
- Compare-and-swap qua `updateMany({ where: { id, [organizationId,] version }, data: { ..., version: { increment: 1 } } })` — không dùng `update()` thuần.
- **Không áp dụng** cho `GET`/`LIST`/`RESTORE`/`ARCHIVE` — chỉ `PATCH` (Decision UP08, Unit).
- Nguồn: gốc từ Product (T005), tái áp dụng nguyên trạng cho Category/Brand/Unit không đổi.

## 5. Archive (Soft Delete)

- `DELETE` set `deletedAt` + `status = ARCHIVED` NẾU status enum của module có giá trị này (Product/Category/Unit). Brand (`CommonStatus`, không có `ARCHIVED`) chỉ set `deletedAt`.
- Guard nghiệp vụ: kiểm tra TẤT CẢ model khác tham chiếu qua FK còn "đang dùng thật" — không chỉ 1 model nếu Aggregate ảnh hưởng nhiều hơn 1 (Unit: cả Product VÀ Barcode, Decision RQ5/UP07 — "không để dữ liệu mồ côi").
- Category có thêm: kiểm tra đệ quy TOÀN BỘ cây con, không chỉ con trực tiếp (Decision Q6/S05).

## 6. Restore

- Luôn set `status = INACTIVE` — **không bao giờ trực tiếp `ACTIVE`**. Người dùng phải chủ động `PATCH status=ACTIVE` sau đó.
- Nguồn: gốc Product (Decision A05), tái áp dụng nguyên trạng Category (Q7), Brand (RQ2), Unit (RQ3) — 4 lần xác nhận, không đổi.
- Guard tối thiểu: `XXX_NOT_DELETED` nếu chưa từng xóa mềm. Category có thêm guard chuỗi tổ tiên (không Archived) — chỉ áp dụng cho module có cấu trúc cây.
- Cần `findByIdIncludingDeleted()` ở Repository để Service xác nhận tồn tại trước khi restore.

## 7. Permission Convention

- `resource:action` — `crud(group, label, extra)` helper trong `permission-catalog.ts`.
- Extra `'restore'` chỉ thêm khi module có Restore thật — Brand/Unit đều thêm, module không có Restore (barcode hiện tại) thì không.
- Không tạo permission code nào ngoài `view`/`create`/`update`/`delete`/`restore` cho Master Data (không cần permission riêng cho Archive — dùng chung `delete`).

## 8. Domain Event

- Chỉ reserve tên + thời điểm gọi (4 hook no-op: `onXxxCreated/Updated/Archived/Restored`) — **không** publish thật.
- Chờ Outbox Pattern (ADR-0011) + publish-after-commit (ADR-0009) — chưa triển khai Sprint nào tính đến T008.
- `AuditLogService.log()` (best-effort, nuốt lỗi) KHÔNG phải cơ chế Domain Event — chỉ là audit trail.

## 9. Release Gate

- Mỗi bước code (Migration/Repository/Application/Controller/Adjustment) phải Build+TypeCheck+Lint PASS trước khi sang bước tiếp theo — không gộp bước.
- Trước khi đóng Sprint task: Regression Baseline (toàn bộ `npx jest`, không chỉ module mới) PASS.
- Coverage ≥ 90% — áp dụng theo **phạm vi module đang triển khai**, không phải toàn backend (xác nhận qua Decision R01/T007, tái xác nhận UP09/T008 — cùng cách hiểu, đã ổn định).
- Technical Complete / Operational Complete tách biệt — Operational (Integration/Rollback/Smoke Test/Benchmark thật) PENDING do thiếu Docker không chặn Release, chỉ cần ghi rõ (Decision T005-R01 gốc, tái xác nhận mọi Sprint sau).

## 10. Versioning Policy

- `v0.x.y` xuyên suốt Foundation + Master Data + CRM + Inventory + POS + ERP Core.
- Chỉ chuyển `v1.0.0` khi hoàn thành ĐẦY ĐỦ các domain trên — không phát hành sớm.
- Tag format `v<major>.<minor>.<patch>-<milestone>`, annotated tag bắt buộc.
- Nguồn: Decision T006-R07, không đổi qua T007/T008.

## 11. Testing

- 5 lớp theo `TEST_RULES.md`: Unit / Integration / Architecture / Performance / Security.
- Nhóm bắt buộc cho Master Data (đúc kết dần qua Brand→Unit, chốt tại Decision UP09): CRUD, Restore, Optimistic Lock, Pagination, Search, Sort, Permission, Multi Tenant, Repository, Validation, API Contract, Regression.
- Integration Test (e2e thật với Postgres) luôn PENDING trong sandbox hiện tại — không đánh dấu PASS giả.
- Performance Benchmark chỉ bắt buộc khi có rủi ro N+1/quy mô dữ liệu lớn thật (Category có cấu trúc cây → có benchmark; Brand/Unit không cần).

## 12. Documentation

- Mỗi Sprint task đóng cần: Release Note (`docs/release/t0xx-release-note.md`), CHANGELOG.md (`[Unreleased]` → `[version] - date` đúng lúc tag, không tag trước), PROJECT_STATUS.md cập nhật.
- Planning document (Dependency Audit, RFC, SPEC, Implementation Plan) commit riêng thành 1 logical unit, tách khỏi các commit code (Decision UR03, xác nhận đúng tại T008).
- `technical-debt.md`: PENDING do hạ tầng gộp vào mục chung đã có theo domain (Integration Test/Rollback Test/Smoke Test), không mở mục riêng mỗi Task — trừ Performance Benchmark (đặc thù theo module, tách riêng).

---

**Ghi chú:** Bảng này chỉ tổng hợp — nếu Barcode/Attribute/Variant có lý do kỹ thuật để lệch khỏi 1 mục nào ở trên, RFC tương ứng vẫn phải nêu rõ lý do và chờ Architecture Review xác nhận, đúng nguyên tắc Specification First. Xem `DEFAULT_DECISIONS.md` để biết mục nào được PHÉP tự áp dụng không cần hỏi lại.
