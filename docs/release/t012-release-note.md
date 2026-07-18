# Release Note — T012: Supplier Domain

**Tag:** `v0.8.0-supplier-domain` (commit `9419ca9`)
**Trạng thái:** Technical Complete = PASS · Operational Complete = PENDING (Integration Test + End-to-End Acceptance Scenario §13.1 — thiếu Docker/Postgres trong sandbox phát triển) · **Release = APPROVED, đã commit/push/tag** (`FINAL RELEASE REVIEW — T012 SUPPLIER DOMAIN`).
**RFC:** `RFC-T012` v2 (`docs/rfc/RFC-T012-supplier-domain.md`) · **SPEC:** `SPEC-T012-SUPPLIER-001` (`docs/specifications/SPEC-T012-SUPPLIER-001.md`, đã qua Architecture Review SP01-SP13) · **Quy trình:** Fast Track Workflow (không Implementation Plan riêng — `SPEC Review → Implementation → Implementation Report → Release Review → Commit → Tag`).

---

## Sprint Summary

T012 là module **Type B / Fast Track thứ hai** sau T011 Customer, và là brownfield trưởng thành hơn Customer lúc bắt đầu — RFC tự nhận diện là brownfield ngay từ §0 (rút kinh nghiệm từ T011). Architecture Review của RFC phát hiện Supplier đã có sẵn **Archive Guard thật đang hoạt động** (`hasPurchaseOrders()`) và **Excel Import/Export thật** (RFC liệt kê nhầm là Out of Scope) — khác Customer, RFC-T012 chỉ cần **một vòng Resolution** (không cần vòng 2 như Customer):

```
RFC-T012 v1 (Architect) → Architecture Review (Claude Code)
  → ARCHITECT RESOLUTION (SR01-SR14) — APPROVED WITH DECISIONS
  → RFC-T012 v2 (Claude Code cập nhật theo SR01-SR14, ủy quyền tường minh)
  → ARCHITECTURE REVIEW SPEC-T012-SUPPLIER-001 (SP01-SP13) — APPROVED WITH DECISIONS
  → SPEC cập nhật theo SP05/SP10/SP11/SP12
  → Implementation (7 commit logic, chưa commit thật)
```

## Feature Summary

- **`SupplierStatus`** (`ACTIVE`/`INACTIVE`/`ARCHIVED`, enum riêng — thay `CommonStatus` 2 giá trị) — thống nhất trạng thái + soft-delete, đúng mẫu Customer/Barcode.
- **`Supplier.version`** (Optimistic Lock, mới hoàn toàn) — áp dụng Update/Activate/Deactivate/Archive/Restore (5 route ghi).
- **`POST /suppliers/:id/activate`**, **`POST /suppliers/:id/deactivate`** (mới) — transition table giống Customer (`INACTIVE→ACTIVE`, `ACTIVE→INACTIVE`, sai transition → `422 SUPPLIER_INVALID_TRANSITION`).
- **Supplier code — optional input, mandatory stored value** (Decision SR07) — khác Customer (vốn đã có generator sẵn), Supplier **chưa từng có generator** — xây mới `SequenceSupplierCodeGenerator` (`NCC000001`).
- **`SequenceCodeGeneratorService` dùng chung (MỚI — Decision SP05)** — thay vì Supplier tự sao chép logic `SequenceCustomerCodeGenerator`, một abstraction dùng chung (`backend/src/prisma/sequence-code-generator.service.ts`, đăng ký trong `PrismaModule @Global()`) được tạo; `SequenceCustomerCodeGenerator` (T011) refactor thành adapter mỏng gọi service này, không đổi giá trị sinh ra (regression-tested). Xem mục "Technical Debt Disclosure" bên dưới.
- **`SupplierDomainService`** (mới) — 6 method (`findById`/`findActiveById`/`findUsableForPurchase`/`existsByCode`/`assertBelongsToOrganization`/`assertNotArchived`), sửa **Repository Boundary violation tồn tại từ trước T012**: `supplier-debt.service.ts` từng inject thẳng `SUPPLIER_REPOSITORY` — nay dùng `SupplierDomainService`.
- **Archive Guard (BR08) — chuẩn hóa, KHÔNG viết lại** (Decision SR02/SR03) — `hasPurchaseOrders()` giữ nguyên 100% logic nghiệp vụ đã có từ Sprint-00, chỉ bọc thêm version check. T015 (Purchase Foundation) bị cấm viết Archive Guard mới cho Supplier, chỉ được mở rộng guard này.
- **`existsByCode()` wiring thật** (Decision SR08/§9.2) — method đã tồn tại nhưng chưa từng được gọi trước khi ghi; nay `SupplierService.create()` pre-check trước khi insert (2 lớp bảo vệ: pre-check + `P2002`).
- **Excel Import/Export — giữ nguyên 100%** (Decision SR04) — không đổi API/DTO/behavior; `code` vẫn bắt buộc trong Import dù `CreateSupplierDto.code` đã đổi optional cho API tạo thường (xem "Implementation Note" bên dưới).

## Breaking Changes

| Thay đổi | Trước | Sau |
|---|---|---|
| `POST /suppliers` | `code` bắt buộc | `code` optional — client có thể tự cung cấp, không gửi thì tự sinh |
| `POST /suppliers` | Nhận `status` | Không nhận `status` — luôn `ACTIVE` khi tạo |
| `PATCH /suppliers/:id` | Không cần `version`, có thể set `status` | Bắt buộc `version` (409 nếu sai); **không** nhận `status` (chuyển sang route riêng) |
| `DELETE /suppliers/:id` | Không cần body | Bắt buộc body `{ version }` |
| `POST /suppliers/:id/restore` | Không cần body | Bắt buộc body `{ version }` |
| `POST /suppliers/:id/activate`, `.../deactivate` | Không tồn tại | Mới |
| `supplier-debt` tra cứu Supplier | Inject thẳng `SUPPLIER_REPOSITORY` | Qua `SupplierDomainService` (hành vi không đổi, chỉ đổi nguồn) |
| `POST /suppliers/import`, `GET /suppliers/export` | — | **Không đổi** (Decision SR04) |

Dự án hiện `v0.x`, chưa có khách hàng production thật — rủi ro chỉ ảnh hưởng nội bộ. Toàn bộ thay đổi đã qua RFC v2 + SPEC + Architecture Review (SR01-SR14, SP01-SP13) — breaking change có chủ đích.

## Implementation Note — Import/Create code coupling (phát hiện khi code, không có trong SPEC gốc)

`SupplierExcelService` tái sử dụng chính `CreateSupplierDto` để validate từng dòng Import (`plainToInstance(CreateSupplierDto, raw)`) — một coupling mà Customer không có (Customer không có Excel Import). Khi `CreateSupplierDto.code` đổi thành optional (Decision SR07) để phục vụ API tạo thường, coupling này sẽ vô tình khiến Import chấp nhận dòng thiếu `code` — vi phạm Decision SR04/§0.8 ("Import tiếp tục yêu cầu code bắt buộc"). Xử lý: thêm một check tường minh trong `SupplierExcelService.importFromExcel()` — nếu `dto.code` rỗng, đẩy lỗi dòng `"code là bắt buộc khi nhập từ Excel"` trước khi ghi, giữ đúng hành vi Import hiện tại mà không phải tách riêng một DTO mới. Có test riêng xác nhận (`supplier-excel.service.spec.ts`).

Tương tự, cột "Trạng thái" (status) trong file Excel Import/Export vẫn hoạt động — `CreateSupplierDto.status` được giữ lại (dù API tạo thường bỏ qua field này, `PrismaSupplierRepository.create()` hard-code `ACTIVE` bất kể `input.status`), chỉ dùng bởi `importBatch()` (vốn không đi qua `create()`, tự xây `data` object độc lập).

## Migration Guide

2 migration độc lập (ít hơn Customer's 3 — Supplier đã có sẵn toàn bộ field "tối thiểu" của RFC, chỉ thiếu `version`/status model), mỗi migration kèm `rollback.sql` riêng, không `DROP` dữ liệu nghiệp vụ:

1. `20260718030000_supplier_version` — thêm `version INTEGER NOT NULL DEFAULT 1`.
2. `20260718040000_supplier_status` — `CREATE TYPE "SupplierStatus"`, đổi cột `status` sang enum mới (backfill `ARCHIVED` từ `deletedAt IS NOT NULL`, còn lại giữ nguyên `ACTIVE`/`INACTIVE`).

**Chưa chạy thật trên môi trường có Postgres.**

## Rollback Guide

- Rollback A: `ALTER TABLE suppliers DROP COLUMN version`.
- Rollback B: khôi phục `status` về `CommonStatus` 2 giá trị (ARCHIVED gộp về INACTIVE), đúng mẫu Customer Rollback B.
- `supplier-debt`: nếu cần rollback code, revert về inject `SUPPLIER_REPOSITORY` trực tiếp (tạm thời, không khuyến nghị).

Chi tiết đầy đủ + câu lệnh kiểm tra trước khi rollback: `SPEC-T012-SUPPLIER-001.md` §15.

## Cross-module Changes

- **`supplier-debt`**: `supplier-debt.service.ts` đổi từ inject `SUPPLIER_REPOSITORY` sang `SupplierDomainService`, giữ nguyên `findById()` (không áp dụng logic `findActiveById` — đồng bộ công nợ không phải giao dịch mua hàng mới).
- **`customer`** (T011, chạm lại): `SequenceCustomerCodeGenerator` refactor thành adapter mỏng trên `SequenceCodeGeneratorService` dùng chung (Decision SP05) — KHÔNG đổi giá trị sinh ra, có Regression Test riêng xác nhận.
- **`prisma`**: `PrismaModule` (`@Global()`) thêm provider/export mới `SequenceCodeGeneratorService`.
- **`rbac`**: `permission-catalog.ts` thêm `supplier:activate`/`supplier:deactivate`.
- Không module nào khác bị chạm — `purchase-order`/`purchase-return`/`purchase-report` chỉ có quan hệ FK schema-level, không import Supplier repository/service (đã xác nhận qua grep khi Architecture Review).

## Known Limitations

- Integration Test (`test/supplier.e2e-spec.ts`) — 🟡 chưa tồn tại, cần tạo mới + chạy trên Docker/Postgres thật (PENDING, nhóm chung với các module khác trong `technical-debt.md`).
- **End-to-End Acceptance Scenario** (Decision SP12, SPEC §13.1) — 🟡 PENDING, cần Docker để chạy migration thật trên dữ liệu Supplier cũ và xác nhận toàn bộ chuỗi 10 bước (migration → build → regression → tạo Supplier mới → generator đúng → Archive Guard đúng → Import đúng → Export đúng → SupplierDebt hoạt động).
- Rollback Test cho 2 migration — chưa chạy thử thật.
- Manual API Smoke Test — chưa thực hiện.
- Branch Coverage tổng hợp module `supplier`+`supplier-debt`: 80.6% (dưới 90%, cùng tình huống Customer/Barcode — không chặn release theo tiền lệ Decision FR01/FR06, ghi nhận Technical Debt).
- **8 generator `Sequence*Generator` khác trong dự án chưa được hợp nhất vào `SequenceCodeGeneratorService`** (branch, inventory-adjustment, invoice, organization, product/sku, purchase-order, purchase-return, stock-count, transfer) — Decision SP05 chỉ nêu tên Customer+Supplier, T012 không tự mở rộng phạm vi. Xem "Technical Debt Disclosure" bên dưới và `docs/architecture/technical-debt.md`.

## Technical Debt Disclosure (SP05 — công khai tường minh)

Khi triển khai `SequenceCodeGeneratorService` dùng chung theo yêu cầu SP05 ("generator Supplier không được sao chép logic Customer"), khảo sát phát hiện đây là một **pattern trùng lặp có hệ thống trên toàn dự án**: 10 class `Sequence*Generator` độc lập tồn tại từ trước (branch, customer, inventory-adjustment, invoice, organization, product/sku, purchase-order, purchase-return, stock-count, transfer), mỗi class tự lặp lại đúng logic `prisma.sequence.upsert()`. T012 chỉ hợp nhất **2 module SP05 nêu tên đích danh — Customer và Supplier** — 8 generator còn lại giữ nguyên, không đụng tới (ngoài phạm vi RFC-T012). Đây là candidate cho một task hạ tầng dọn dẹp riêng nếu Architect muốn hợp nhất toàn bộ — đã ghi vào `docs/architecture/technical-debt.md`.

## Test Summary

- Module `supplier` + `supplier-debt`: 17 test suite / 149 test PASS. Coverage tổng hợp: 94.7% statements, 80.6% branch, 96.03% functions, 96.44% lines.
- **Architecture Test**: `supplier-repository-boundary.architecture.spec.ts` — xác nhận `SupplierModule` chỉ export `SupplierDomainService`, `supplier-debt` không còn import `SUPPLIER_REPOSITORY`/`ISupplierRepository`, không `forwardRef()`.
- **Generator Test** (Decision SP11): `sequence-code-generator.service.spec.ts` (cách ly sequence dùng chung giữa `customer_code`/`supplier_code`), `sequence-supplier-code.generator.spec.ts` (adapter mỏng mới), `sequence-customer-code.generator.spec.ts` (Regression Test — refactor không đổi giá trị sinh ra).
- **Regression Baseline**: toàn bộ `npx jest` — **156/157 test suite PASS, 1523/1525 test PASS** (1 suite không liên quan — `argon2-password-hasher` — timeout khi chạy song song do tranh chấp CPU; xác nhận flake bằng cách chạy lại độc lập với `--runInBand` PASS 3/3, không phải regression — cùng hiện tượng đã ghi nhận ở T009/T011).
- Build/TypeCheck/Lint: PASS, 0 lỗi (toàn backend).

## Next Sprint

- **T013 — Sales Foundation** (Type A, Business-Critical, full quy trình kể cả Implementation Plan — Decision AD06), WAITING RFC từ Architect.

## Release Review

`FINAL RELEASE REVIEW — T012 Supplier Domain` — **APPROVED FOR RELEASE**. Toàn bộ tiêu chí PASS:

| # | Tiêu chí | Kết quả |
|---|---|---|
| 1 | RFC/SPEC Compliance | PASS — khớp RFC-T012 v2, SPEC-T012-SUPPLIER-001, SR01-SR14, SP01-SP13, không tự mở rộng phạm vi |
| 2 | Archive Guard | PASS — bảo toàn đúng hiện trạng (`hasPurchaseOrders()`), chỉ bọc thêm version check |
| 3 | Repository Boundary | PASS — sửa đúng ADR-0010, `supplier-debt` chuyển sang `SupplierDomainService`, Architecture Test xác nhận |
| 4 | SequenceCodeGeneratorService | PASS — thiết kế theo hướng tái sử dụng (Decision SP05), phạm vi giới hạn Customer+Supplier, công khai minh bạch phần chưa hợp nhất |
| 5 | Circular Dependency | PASS — không phát sinh |
| 6 | Migration | PASS — 2 migration độc lập, có rollback, chưa chạy do thiếu Docker (đúng quy trình) |
| 7 | Build/TypeCheck/Lint | PASS — 0 lỗi |
| 8 | Regression | PASS — 156/157 suite, 1523/1525 test; flake Argon2 xác nhận không phải regression |
| 9 | Documentation | PASS — đầy đủ |
| 10 | Working Tree | PASS — đúng quy trình, chưa commit trước khi có Final Release Review |

**Branch coverage vẫn dưới mục tiêu** nhưng đã ghi vào Technical Debt (#10), không chặn Release — nhất quán với T009 và T011.

**FINAL RELEASE DECISION:** APPROVED. Commit/Push/Tag đều AUTHORIZED. Commit: `feat(supplier): complete supplier domain refactor` (`9419ca9`). Tag: `v0.8.0-supplier-domain`.

**Quyết định mới sau T012 (Decision AD06):** Type A (Business-Critical: Sales/Purchase/Inventory/Debt Ledger/Cashbook/Reports) nay có quy trình chi tiết đầy đủ 13 bước (RFC → Architecture Review → Architect Resolution → RFC Revision → SPEC → SPEC Review → Implementation Plan → Plan Review → Implementation → Implementation Report → Final Release Review → Commit → Tag), **không áp dụng Fast Track**. Chi tiết: `docs/project-governance/AI_WORKFLOW.md`.

**Module kế tiếp:** T013 — Sales Foundation (Type A, đầy đủ quy trình), WAITING RFC từ Architect.
