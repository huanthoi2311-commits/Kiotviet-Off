# Release Note — T006: Category Implementation (Sprint-01)

**Tag:** `v0.3.0-category-foundation`
**Trạng thái:** Technical Complete = PASS · Operational Complete = PENDING (Decision T006-R01)
**SPEC:** `SPEC-CATEGORY-001` · **Báo cáo kỹ thuật đầy đủ:** `docs/implementation/t006-category-implementation-report.md`

---

## Sprint Summary

T006 là task đầu tiên chạy **trọn vẹn** quy trình chính thức của dự án: `Dependency Audit → RFC → Architecture Review → SPEC → Implementation Plan → Architecture Review → Code (12 bước, không gộp) → Architecture Review → Release`. RFC-0002 (Category Domain) do Architect ban hành, mọi quyết định kỹ thuật (Q1-Q12, S01-S08, IP01-IP07) đều qua Architecture Review trước khi hiện thực.

## Feature Summary

- **`Category.status`** (`DRAFT`/`ACTIVE`/`INACTIVE`/`ARCHIVED`) — độc lập với `isActive` (cờ bật/tắt nhanh), đúng mẫu `Product` (T005).
- **`Category.version`** (Optimistic Lock) — `PATCH /categories/:id` bắt buộc gửi đúng version, sai → `409`.
- **`Category.slug` unique thật ở tầng DB** (`@@unique([organizationId, slug])`) — đóng lỗ hổng race condition trước đây chỉ dựa vào slug generator ở tầng ứng dụng.
- **`GET /categories`** — filter/phân trang mới: `search`/`status`/`parentId`/`isActive`/`page`/`limit`/`sortBy`/`sortOrder` (tên tham số thống nhất toàn dự án Master Data, sẽ áp dụng lại cho Brand/Unit/Customer/Supplier ở các Sprint sau).
- **Archive đệ quy toàn bộ cây con** — `DELETE /categories/:id` từ chối nếu còn danh mục con ACTIVE ở bất kỳ cấp nào (không chỉ con trực tiếp), ngoài điều kiện "còn Product active" đã có từ trước.
- **Restore theo chuỗi tổ tiên** — `POST /categories/:id/restore` từ chối nếu bất kỳ tổ tiên nào đang bị lưu trữ; không tự động Restore tổ tiên, phải Restore từ trên xuống.
- **Variant-Category consistency** — Variant Child (Product) bắt buộc cùng `categoryId` với Variant Parent.
- **Không tạo `CategoryDomainService`** — quyết định YAGNI có chủ đích (Decision Q5/S07/IP07): hiện chưa có module nào khác cần đọc `Category`.

## Breaking Changes

| Thay đổi | Trước | Sau |
|---|---|---|
| `PATCH /categories/:id` | Không cần `version` | **Bắt buộc** gửi `version` (409 nếu sai) |
| `PATCH /categories/:id` với `status` | — | Chỉ nhận `DRAFT`/`ACTIVE`/`INACTIVE` — **không** cho set `ARCHIVED` (phải qua `DELETE`) |
| `DELETE /categories/:id` | Chỉ chặn nếu còn Product active | Chặn thêm nếu còn danh mục con active ở **bất kỳ cấp nào** |
| `POST /categories/:id/restore` | Không có ràng buộc | Chặn nếu tổ tiên đang bị lưu trữ |
| `Category.slug` unique | Chỉ app-level (có race condition) | DB-level thật |

Các thay đổi này đã được duyệt tường minh qua RFC-0002/SPEC-CATEGORY-001 (breaking change có chủ đích, không áp dụng nguyên tắc Backward Compatibility cho phạm vi đã duyệt — đúng tinh thần Decision C01/A13 của T005).

## Migration Guide

3 migration độc lập, mỗi migration kèm `rollback.sql` riêng, **không migration nào `DROP` dữ liệu** (an toàn hơn T005):

1. `20260716050000_category_version` — thêm `version INTEGER NOT NULL DEFAULT 1`.
2. `20260716060000_category_slug_unique` — duplicate-check tự động (FAIL nếu trùng, không tự merge), rồi `CREATE UNIQUE INDEX`.
3. `20260716070000_category_status` — `CREATE TYPE CategoryStatus`, `ADD COLUMN status`, backfill: category đã soft-delete → `ARCHIVED`, còn lại → `ACTIVE` (mặc định).

**Chưa chạy thật trên môi trường có Postgres.** Khi chạy thật: `npx prisma migrate deploy`, xác nhận qua query đối chiếu số dòng trước/sau (đặc biệt bước duplicate-check của Migration B).

## Rollback Guide

Mỗi migration rollback độc lập, không ảnh hưởng 2 migration còn lại:

- Rollback A: `ALTER TABLE categories DROP COLUMN version`.
- Rollback B: `DROP INDEX categories_organizationId_slug_key`.
- Rollback C: `ALTER TABLE categories DROP COLUMN status`, `DROP TYPE "CategoryStatus"`.

An toàn tuyệt đối — không có giới hạn kiểu "không thể `DROP VALUE` enum" như `ProductStatus` ở T005, vì `CategoryStatus` là enum hoàn toàn mới (không rename từ enum cũ). **Rollback chưa được chạy thử thật** — cần môi trường Docker.

## Known Limitations

- Integration Test (`test/category.e2e-spec.ts`) chưa tồn tại — cần tạo khi có Docker.
- Domain Event (`CategoryCreated`/`Updated`/`Archived`/`Restored`) — chỉ có hook no-op, chưa publish thật (chờ Sprint Event + Outbox Pattern, ADR-0011).
- Query Performance trên tập dữ liệu lớn (>1000 category) chưa có số đo thật — thiết kế set-based (1 query + in-memory traversal, không N+1) nhưng chưa benchmark.

## Pending Operational Tests

Xem `docs/architecture/technical-debt.md` — 4 mục PENDING (Integration Test, Rollback Test, Manual Smoke Test, Query Performance Benchmark), mỗi mục có nguyên nhân/điều kiện hoàn thành/mức ưu tiên/Sprint dự kiến.

## Next Sprint

- **T007 — Brand Domain**, chờ Architect ban hành `RFC-0003`. Dự kiến áp dụng lại đúng chuẩn Query Parameter (Decision IP01) và mẫu Optimistic Lock/Archive-Restore đã thiết lập ở Category.
- Từ T006 trở đi, mọi Sprint mới phải xác nhận **T005 và T006 vẫn PASS** trước khi được đóng (Regression Baseline — Decision T006-R06).
- Versioning giữ `v0.x.y` cho tới khi hoàn thành toàn bộ Master Data/CRM/Inventory/POS/ERP Core theo roadmap (Decision T006-R07) — chưa phát hành `v1.0.0` sớm.
