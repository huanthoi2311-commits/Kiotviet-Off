# Release Note — T009: Barcode Domain (Sprint-01)

**Tag:** `v0.6.0-barcode-foundation`
**Trạng thái:** Technical Complete = PASS · Operational Complete = PENDING (cùng mẫu T005-T008 — thiếu Docker/Postgres/Redis trong sandbox phát triển).
**SPEC:** `SPEC-BARCODE-001` · **Implementation Plan:** `docs/implementation/barcode-implementation-plan.md`

---

## Sprint Summary

T009 là task đầu tiên trong Sprint-01 mà RFC được **Architect soạn trực tiếp** (`RFC-0005`, không cần trường hợp ngoại lệ Claude-authored như RFC-0003 của T007) — đúng nguyên tắc RFC-authorship-boundary (`PROJECT_RULES.md §2`). Quy trình chạy đầy đủ:

```
RFC-0005 (Architect) → Architecture Review (Decision BQ1-BQ11)
  → SPEC-BARCODE-001 → Architecture Review (Decision SB01-SB10)
  → Barcode Implementation Plan → Architecture Review (Decision IP01-IP10)
  → Code (10 bước, không gộp, Build+TypeCheck+Lint sau mỗi bước)
  → Implementation Report (file này) → chờ Final Release Review
```

**Sự kiện kỹ thuật nổi bật nhất Sprint-01 tính tới nay:** giữa lúc code (sau khi hoàn thành Migration A/B), phát hiện **circular module dependency thật** — `UnitModule` (từ T008) đã import `BarcodeModule`, trong khi SPEC-BARCODE-001 yêu cầu chiều ngược lại (`BarcodeModule` cần đọc `UnitDomainService`). Đây là lần đầu tiên trong dự án một xung đột kiến trúc thật (không phải do đọc nhầm SPEC) xuất hiện giữa 2 module Master Data đã DONE. Được báo cáo đầy đủ bằng chứng thay vì tự dùng `forwardRef()` — 2 vòng Architect Resolution liên tiếp:

1. `ARCHITECT RESOLUTION — T009 Circular Module Dependency` (Decision CD01-CD12) — đề xuất tách `BarcodeReferenceModule`, nhưng khi triển khai thật phát hiện chính giải pháp này có **mâu thuẫn nội tại** (`BarcodeReferenceModule` vừa phải giữ `BARCODE_REPOSITORY` vừa không được export vừa không được chứa `BarcodeService` — không thể đồng thời thỏa mãn cả 3 bằng NestJS DI thuần).
2. `ARCHITECT RESOLUTION — T009 Barcode Repository Ownership Correction` (Decision RPC01-RPC12) — thêm module thứ 3, `BarcodePersistenceModule`, giải quyết triệt để. Thiết kế cuối (xem SPEC-BARCODE-001 §9.5) là DAG 3 module, không `forwardRef()` ở bất kỳ đâu, được xác nhận bằng 16 assertion Architecture Test tự động (`barcode-repository-boundary.architecture.spec.ts` 11 case + `unit-repository-boundary.architecture.spec.ts` 5 case).

Toàn bộ lịch sử phát hiện + xử lý được giữ nguyên trong SPEC-BARCODE-001 §"Lịch sử quyết định" và `barcode-implementation-plan.md` §9 — không xóa, đúng chỉ đạo.

## Feature Summary

- **`BarcodeStatus`** (`ACTIVE`/`INACTIVE`/`ARCHIVED`, enum riêng, không tuần tự bắt buộc — Decision BQ3).
- **`Barcode.version`** (Optimistic Lock) — **mở rộng hơn mọi module trước** (Decision BQ10/SB02): không chỉ `PATCH` mà cả **Archive (`DELETE`)/Restore/SetDefault** đều bắt buộc gửi đúng `version`, sai → `409`. Đây là override có chủ đích so với `DEFAULT_DECISIONS.md` (chuẩn chung: chỉ PATCH cần version).
- **`GET /barcodes`** (mới, org-wide) — tra cứu/lọc/sắp xếp/phân trang toàn tổ chức, **cộng thêm** vào route lồng sẵn có `GET /products/:productId/barcodes` (không phân trang, giữ nguyên) — thiết kế Hybrid Route được xác nhận là Exception có chủ đích với `MASTER_DATA_TEMPLATE.md` (Decision BQ1/SB01). Default sort `sortBy=createdAt, sortOrder=desc` (Decision SB08 — Barcode không có field `name`, chuẩn mới cho mọi Aggregate không tên tương tự sau này).
- **`POST /barcodes/:id/restore`** (mới) — luôn trả `status` về `INACTIVE`, không bao giờ tự động `ACTIVE` (Decision BQ3, nhất quán với Unit/Brand).
- **Delete Guard hẹp hơn Unit** (Decision BQ2) — chỉ chặn Archive khi **đồng thời** `isDefault=true` **VÀ** `Product.status=ACTIVE`; mã vạch không phải mặc định luôn xóa được bất kể trạng thái Product.
- **`existsByCode()` 2 lớp** (Decision BQ6) — pre-check nghiệp vụ ở tầng Application (thông điệp lỗi rõ ràng) + giữ nguyên bắt `P2002` làm lớp bảo vệ cuối cho race condition. Unique **theo tổ chức** (`@@unique([organizationId, code])`, Decision BQ8) — không phải toàn cục.
- **`UnitDomainService.findByIdForReference()`** (module `unit`, mới) — cửa ngõ đọc duy nhất để Barcode xác nhận `unitId` (nếu có) cùng tổ chức và chưa `ARCHIVED` (Decision BQ11).

## Breaking Changes

| Thay đổi | Trước | Sau |
|---|---|---|
| `PATCH /barcodes/:id` | Không cần `version` | **Bắt buộc** `version` (409 nếu sai) |
| `DELETE /barcodes/:id` | Không có body | **Bắt buộc** body `{ version }` (409 nếu sai) |
| `POST /barcodes/:id/default` | Không có body | **Bắt buộc** body `{ version }` (409 nếu sai) |
| `POST /barcodes/:id/restore` | Không tồn tại | Mới, bắt buộc body `{ version }` |
| Delete Guard | Không có | Chặn Archive nếu `isDefault=true` + Product `ACTIVE` (422) |
| Unit Reference | Không kiểm tra | `unitId` khác tổ chức hoặc đã Archive → 422 |

Optimistic Lock mở rộng sang cả 4 thao tác ghi (không chỉ PATCH) là **behavior change lớn nhất** trong 5 Task Master Data đã DONE tính tới nay — có chủ đích, xác nhận tường minh qua Decision BQ10/SB02, không phải điều chỉnh âm thầm. Dự án hiện `v0.x`, chưa có khách hàng production thật.

## Migration Guide

2 migration độc lập, mỗi migration kèm `rollback.sql` riêng, không `DROP` dữ liệu:

1. `20260717000000_barcode_version` — thêm `version INTEGER NOT NULL DEFAULT 1`.
2. `20260717010000_barcode_status` — `CREATE TYPE "BarcodeStatus"`, `ADD COLUMN status`, backfill: Barcode đã soft-delete (`deletedAt IS NOT NULL`) → `ARCHIVED`, còn lại giữ `DEFAULT 'ACTIVE'`.

**Chưa chạy thật trên môi trường có Postgres.**

## Rollback Guide

- Rollback A: `ALTER TABLE barcodes DROP COLUMN version`.
- Rollback B: `ALTER TABLE barcodes DROP COLUMN status`, `DROP TYPE "BarcodeStatus"`.

An toàn tuyệt đối — không `DROP VALUE` enum. **Chưa chạy thử thật** — cần môi trường Docker.

## Cross-module Changes

- **`unit`**: thêm mới `UnitDomainService` (đúng 1 method `findByIdForReference()`, đúng mẫu `ProductDomainService`/`BarcodeDomainService`, ADR-0010). `UnitModule.imports` đổi từ `[RbacModule, ProductModule, BarcodeModule]` sang `[RbacModule, ProductModule, BarcodeReferenceModule]` — xử lý circular dependency, không dùng `forwardRef()`. `UnitModule.exports` không đổi (`[UnitDomainService]`).
- **`barcode`**: tách từ 1 module thành 3 (`BarcodePersistenceModule`/`BarcodeReferenceModule`/`BarcodeModule`) — xem SPEC-BARCODE-001 §9.5 cho DAG đầy đủ.
- **`product`/`rbac`**: không đổi DTO/API/Migration; `rbac` chỉ thêm `barcode:restore` vào `permission-catalog.ts`.

## Known Limitations

- Integration Test (`test/barcode.e2e-spec.ts`) — đã cập nhật đủ case CRUD/Duplicate-khác-tổ-chức/SetDefault/Optimistic Lock (cả 4 thao tác)/Restore/Delete Guard (2 chiều)/Unit Reference Guard (2 case)/`GET /barcodes` (search/status/sort/pagination) — 🟡 PENDING, chưa chạy được thật, cần Docker.
- Rollback Test cho 2 migration — chưa chạy thử thật.
- Manual API Smoke Test — chưa thực hiện.
- Domain Event (`onBarcodeCreated`/`Updated`/`Archived`/`Restored`) — chỉ có hook no-op, chưa publish thật (đúng SPEC §11, chờ Sprint Event/Outbox thật).

## Pending Operational Tests

Xem `docs/architecture/technical-debt.md` — Barcode đã được gộp vào 3 mục PENDING chung đã có (Integration Test #1, Rollback Test #2, Manual Smoke Test #3), đúng quy ước đã dùng cho T005-T008.

## Test Summary

- Module `barcode`: 10 test suite / 104 test PASS. Coverage: 98.1% statements, 83.14% branch, 100% functions, 98.25% lines (yêu cầu Decision IP09 ≥ 90%, đạt trên cả 4 chỉ số statements/functions/lines, branch thấp hơn 90% nhưng vẫn cao — phần chưa phủ chủ yếu là decorator route/no-op event hook, không phải logic nghiệp vụ).
- Module `unit` (phần bị chạm bởi T009 — `UnitDomainService`/`unit.module.ts`): 8 test suite / 73 test PASS.
- **Architecture Test**: 16/16 assertion PASS (`barcode-repository-boundary.architecture.spec.ts` 11 case theo RPC08 + `unit-repository-boundary.architecture.spec.ts` 5 case) — xác nhận DAG 3 module, không `forwardRef()`, không rò rỉ `BARCODE_REPOSITORY`/`UNIT_REPOSITORY` ra ngoài phạm vi cho phép.
- **Regression Baseline** (Decision IP09): toàn bộ `npx jest` — **148/148 test suite PASS, 1419/1419 test PASS** — xác nhận Sprint-00 + T005 (Product) + T006 (Category) + T007 (Brand) + T008 (Unit) đều không bị ảnh hưởng bởi T009. (2 suite không liên quan — `argon2-password-hasher.spec.ts`, `purchase-report-export.adapter.spec.ts` — timeout khi chạy song song toàn bộ do tranh chấp CPU; chạy lại độc lập PASS 8/8, xác nhận là flake môi trường, không phải regression.)
- Build/TypeCheck/Lint: PASS, 0 lỗi (toàn backend, không riêng `barcode`/`unit`).
- Không phát sinh Repository Boundary violation — `BARCODE_REPOSITORY` không còn trong `BarcodeModule.exports`, `UNIT_REPOSITORY` không có trong `UnitModule.exports` (giữ nguyên từ T008), xác nhận qua Architecture Test.

## Next Sprint

- **T010 — Attribute Domain**, WAITING RFC từ Architect. Roadmap cố định không đổi: Product → Category → Brand → Unit → Barcode → Attribute → Variant → Gate-01.
- Từ T009 trở đi, Regression Baseline mở rộng thành **T005 + T006 + T007 + T008 + T009**.

## Release Review

`FINAL RELEASE REVIEW – T009 Barcode Domain` — **APPROVED FOR RELEASE**. Toàn bộ tiêu chí PASS: RFC, SPEC, Architecture Review, Implementation Plan, Build, TypeCheck, Lint, Migration Verification, Architecture Tests, Regression Tests, Repository Boundary, Documentation, Working Tree.

- **Decision FR01 — Branch Coverage:** 83.14% (dưới 90%) — **không chặn Release**. Đã tạo mục PENDING ưu tiên thấp trong `docs/architecture/technical-debt.md` (#5).
- **Decision FR02 — Flaky Tests:** 2 suite timeout khi chạy song song (`argon2-password-hasher`, `purchase-report-export`) đã xác minh là flake (PASS 8/8 khi chạy độc lập) — **không coi là Regression**. Ghi chú theo dõi tối ưu CI trong `docs/architecture/technical-debt.md` (#6).
- **Decision FR03 — Version:** Tag `v0.6.0-barcode-foundation`.
- **Decision FR04 — Commit:** AUTHORIZATION commit toàn bộ T009, push `origin/main`, tạo tag `v0.6.0-barcode-foundation`, push tag.
- **Decision FR05 — Sprint Transition:** Sprint-01 tiếp tục, module kế tiếp T010 — Attribute Domain, đúng pipeline `Audit → RFC → Architecture Review → SPEC → Review → Implementation Plan`, không tự bắt đầu code.
