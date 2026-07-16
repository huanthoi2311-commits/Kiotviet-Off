# Release Note — T008: Unit Implementation (Sprint-01)

**Tag:** `v0.5.0-unit-foundation`
**Trạng thái:** Technical Complete = PASS · Operational Complete = PENDING (cùng mẫu T005/T006/T007 — thiếu Docker/Postgres/Redis trong sandbox phát triển).
**SPEC:** `SPEC-UNIT-001` · **Implementation Plan:** `docs/implementation/unit-implementation-plan.md`

---

## Sprint Summary

T008 là task thứ 3 chạy trọn vẹn quy trình chính thức với RFC formal (`RFC-0004`), sau Brand (T007). Khác Brand — được xác nhận là "High Impact Aggregate" (Decision U09): Unit ảnh hưởng **2 model** khi đổi schema (`Product.unitId` bắt buộc/`Restrict`, `Barcode.unitId` optional/`SetNull`), và Implementation thực sự chạm **2 module nghiệp vụ khác** (`product`, `barcode`) — lần đầu tiên trong 3 Sprint Master Data đã hoàn thành.

RFC-0004 được viết theo khuôn trung lập bắt buộc (Decision U10 — "không suy diễn từ Category, không copy Product, không mặc định giống Brand") — mọi trục thiết kế chính (status shape, Optimistic Lock, Restore, Domain Event) được trình bày dưới dạng phương án, không đề xuất trước, để Architecture Review tự quyết định qua Decision RQ1-RQ10.

## Feature Summary

- **`UnitStatus`** (`ACTIVE`/`INACTIVE`/`ARCHIVED`, enum riêng — Decision RQ1) — **không** dùng `CommonStatus` (khác Brand), **không** có `DRAFT` (khác Product/Category).
- **`Unit.version`** (Optimistic Lock, Decision RQ2) — `PATCH /units/:id` bắt buộc gửi đúng version, sai → `409`.
- **`POST /units/:id/restore`** (mới, Decision RQ3) — luôn trả `status` về `INACTIVE`, không bao giờ trực tiếp `ACTIVE`.
- **Delete Guard mở rộng sang Barcode** (Decision RQ5/UP07) — `DELETE /units/:id` nay chặn nếu còn **Product `ACTIVE`** HOẶC **Barcode chưa xóa mềm** tham chiếu Unit — không chỉ Product như trước. Yêu cầu tạo mới `BarcodeDomainService` (đúng 1 method `hasActiveBarcodesInUnit()`, đúng mẫu `ProductDomainService`, ADR-0010).
- **`GET /units`** — thêm `isActive`/`sortBy`/`sortOrder`, đủ 7 tham số Query Convention (Decision RQ7/UP01). `isActive` là **alias** cho `status=ACTIVE`, không phải cột schema mới — xác nhận là chuẩn chung Master Data (Decision SU04).
- **Chuẩn `organizationId` mới cho mọi Repository method ghi** (Decision SU03/UP06) — `update()`/`softDelete()`/`restore()` của Unit đều lọc `organizationId` trong `where`. Đây là module ĐẦU TIÊN áp dụng chuẩn này — Product/Category/Brand chưa đổi, chỉ sửa khi tới đúng Sprint riêng của từng module (không Hotfix riêng).

## Breaking Changes

| Thay đổi | Trước | Sau |
|---|---|---|
| `PATCH /units/:id` | Không cần `version` | **Bắt buộc** gửi `version` (409 nếu sai) |
| `PATCH /units/:id` với `status` | — | Chỉ nhận `ACTIVE`/`INACTIVE` — **không** cho set `ARCHIVED` (phải qua `DELETE`) |
| `DELETE /units/:id` | Chỉ chặn nếu còn Product chưa xóa mềm (bất kể status) | Chặn nếu còn Product **`status=ACTIVE`** HOẶC Barcode chưa xóa mềm |
| `POST /units/:id/restore` | Không tồn tại | Mới, trả `status=INACTIVE` |

**Behavior Change quan trọng nhất (Decision SU01)** — `hasActiveProductsInUnit()` (dùng bởi Delete Guard) nay chỉ tính Product `status=ACTIVE`, không còn tính `INACTIVE`/`ARCHIVED`. Trước đây MỌI Product chưa xóa mềm (bất kể status) đều chặn xóa Unit; sau thay đổi này, 1 Unit chỉ còn Product `INACTIVE`/`ARCHIVED` tham chiếu **sẽ xóa được** (trước đây không xóa được). Đây là thay đổi hành vi có chủ đích, được Architect xác nhận tường minh qua Decision SU01, không phải điều chỉnh âm thầm.

Các thay đổi này đã được duyệt tường minh qua RFC-0004/SPEC-UNIT-001 (breaking change có chủ đích). Dự án hiện ở `v0.x`, chưa phát hành `v1.0.0`, chưa có khách hàng production thật — rủi ro chỉ ảnh hưởng nội bộ.

## Migration Guide

2 migration độc lập, mỗi migration kèm `rollback.sql` riêng, không migration nào `DROP` dữ liệu:

1. `20260716090000_unit_version` — thêm `version INTEGER NOT NULL DEFAULT 1`.
2. `20260716100000_unit_status` — `CREATE TYPE UnitStatus`, `ADD COLUMN status`, backfill: Unit đã soft-delete → `ARCHIVED`, còn lại giữ `DEFAULT 'ACTIVE'`.

**Chưa chạy thật trên môi trường có Postgres.** Khi chạy thật: `npx prisma migrate deploy`, xác nhận qua query đối chiếu số dòng trước/sau.

## Rollback Guide

- Rollback A: `ALTER TABLE units DROP COLUMN version`.
- Rollback B: `ALTER TABLE units DROP COLUMN status`, `DROP TYPE "UnitStatus"`.

An toàn tuyệt đối — không có `DROP VALUE` enum (hoàn toàn mới). **Rollback chưa được chạy thử thật** — cần môi trường Docker.

## Cross-module Changes

Khác Brand (0 module nghiệp vụ khác bị chạm), T008 chạm đúng 2 module theo đúng dự đoán "High Impact Aggregate" (Decision U09):

- **`product`**: sửa `hasActiveProductsInUnit()` (1 method, phạm vi tối thiểu — Decision UP03) — thêm điều kiện `status: 'ACTIVE'`. Không đổi DTO/API/Migration/Permission của `product`.
- **`barcode`**: thêm mới `BarcodeDomainService` (đúng 1 method `hasActiveBarcodesInUnit()`) + method Repository tương ứng. Không đổi DTO/API/Event của `barcode` (Decision UP03).

## Known Limitations

- Integration Test (`test/unit.e2e-spec.ts`, đã cập nhật đủ case Restore/Optimistic Lock/isActive/Delete Guard Barcode) — chưa chạy được thật, cần Docker.
- Rollback Test cho 2 migration — chưa chạy thử thật.
- Manual API Smoke Test — chưa thực hiện.
- Domain Event (`UnitCreated`/`Updated`/`Archived`/`Restored`) — chỉ có hook no-op, chưa publish thật (Decision RQ4).
- **3 điểm Technical Debt được xác nhận giữ nguyên, không sửa ở T008** (Decision SU02/SU03 phạm vi): `existsByCode()` giữ làm Reserved API (không xóa, không refactor); pattern "`organizationId` thiếu ở `where`" của Product/Category/Brand chưa được retro-fit (chỉ Unit áp dụng chuẩn mới).

## Pending Operational Tests

Xem `docs/architecture/technical-debt.md` — Unit đã được gộp vào 3 mục PENDING chung đã có (Integration Test #1, Rollback Test #2, Manual Smoke Test #3), đúng quy ước đã dùng cho T005/T006/T007.

## Test Summary

- Module `unit`: 220/220 test PASS (37 baseline + toàn bộ mới cho Optimistic Lock/Restore/isActive/Delete Guard Barcode/Validation/API Contract, tính chung với `product`/`barcode` bị chạm). Coverage module `unit` 97-100% statements (baseline trước đó ~91%, yêu cầu Decision UP09 ≥ 90%).
- **Regression Baseline** (Decision UP10): toàn bộ `npx jest` — **142/142 test suite PASS, 1352/1352 test PASS** — xác nhận Sprint-00, T005 (Product), T006 (Category), T007 (Brand), Auth, RBAC, Inventory, Organization, Branch đều không bị ảnh hưởng.
- Coverage toàn backend: 87.64% statements (trước T008: 87.47%) — tăng nhẹ, không phải mục tiêu của T008. Decision UP09's "Coverage ≥ 90%" áp dụng theo phạm vi module `unit` (đã đạt, đúng cách diễn giải đã xác nhận ở T007 Decision R01).
- Không phát sinh Repository Boundary violation (Decision UP02/SU06/UP10) — `UnitDomainService` vẫn không tạo, `BarcodeDomainService` mới đúng 1 method, không mở rộng.

## Next Sprint

- **T009 — Barcode Domain**, WAITING `RFC-0005` (Decision RC01/RC04, xác nhận lại qua `ARCHITECT DECISION – Sprint-01 Roadmap Correction`). Roadmap cố định không đổi: Product → Category → Brand → Unit → Barcode → Attribute → Variant → Gate-01. `Customer` không thuộc Sprint-01 — thuộc Sprint CRM sau khi hoàn thành Master Data (Decision RC03). Việc phát hiện và dừng lại trước mâu thuẫn Decision UR08 được xác nhận là đúng quy trình (Decision RC06), không phải lỗi.
- Từ T008 trở đi, Regression Baseline mở rộng thành **T005 + T006 + T007 + T008**.
- Versioning giữ `v0.x.y` cho tới khi hoàn thành toàn bộ Master Data/CRM/Inventory/POS/ERP Core theo roadmap — chưa phát hành `v1.0.0` sớm.

## Release Review

`ARCHITECTURE REVIEW – T008 Unit Implementation` — APPROVED FOR RELEASE (Decision UR01-UR08). Release Gate xác nhận PASS trên toàn bộ tiêu chí (Build/TypeCheck/Lint/Unit Test/Regression/Architecture Test/Coverage/Repository Boundary). Decision UR03 xác nhận việc commit riêng các planning document (Audit/RFC/SPEC/Implementation Plan) là đúng — lịch sử Git phản ánh đầy đủ chuỗi Audit→RFC→Review→SPEC→Plan→Implementation→Release. AUTHORIZATION cuối cùng cho phép tag `v0.5.0-unit-foundation`, push, cập nhật tài liệu — đã thực hiện đầy đủ.
