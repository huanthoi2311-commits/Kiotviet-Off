# Changelog

Toàn bộ thay đổi đáng chú ý của dự án được ghi lại ở đây.

Định dạng theo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
dự án tuân thủ [Semantic Versioning](https://semver.org/lang/vi/) (`MAJOR.MINOR.PATCH`).

## [Unreleased]

**Sprint-01 — T011: Customer Domain** (`SPEC-T011-CUSTOMER-001`), brownfield refactor đầu tiên của
dự án (Decision CR01) — theo `RFC-T011` v1 (Architect) → Architecture Review → `ARCHITECT
RESOLUTION` lần 1 (AR-T011-01~08, RFC REVISION REQUIRED) → `RFC-T011` v2 (Claude Code cập nhật
theo CR01-CR13, ủy quyền tường minh) → `ARCHITECTURE REVIEW – SPEC-T011-CUSTOMER-001` (SR01-SR15,
APPROVED, Fast Track Workflow). Chi tiết đầy đủ: `docs/release/t011-release-note.md`. **Chưa tag**
— chờ Final Release Review riêng.

### Added
- `CustomerStatus` (`ACTIVE`/`INACTIVE`/`ARCHIVED`, enum riêng) — thay `CommonStatus` 2 giá trị,
  thống nhất trạng thái + soft-delete.
- `Customer.version` (Optimistic Lock, mới hoàn toàn) — áp dụng Update/Activate/Deactivate/
  Archive/Restore (5 route ghi).
- `POST /customers/:id/activate`, `POST /customers/:id/deactivate` — tách lifecycle transition
  khỏi `PATCH` chung, đúng transition table RFC §8.
- `contactName`, `paymentTermDays` — field mới (RFC §6.9/§6.12).
- `CustomerDomainService` (module `customer`, mới) — 6 method, sửa Repository Boundary violation
  tồn tại từ trước T011 (`checkout`/`customer-point` từng inject thẳng `CUSTOMER_REPOSITORY`).

### Changed
- **Customer code** — chuyển từ luôn tự sinh sang **optional input, mandatory stored value**
  (Decision CR05/SR08): client có thể tự cung cấp (validate + unique) hoặc để hệ thống tự sinh
  (giữ nguyên generator hiện có).
- **`phone`** — không còn unique trong Organization (Decision CR06/SR09), chuyển sang nullable.
  Gỡ `CUSTOMER_PHONE_DUPLICATE` khỏi luồng Create/Update.
- **`PATCH /customers/:id`** nay bắt buộc `version`, không còn nhận `status` trực tiếp.
- **`DELETE /customers/:id`**, **`POST /customers/:id/restore`** nay bắt buộc body `{ version }`.
- **`checkout.service.ts`** dùng `CustomerDomainService.findActiveById()` — Customer đã `ARCHIVED`
  không còn chọn được cho giao dịch mới (đúng BR04, thay đổi hành vi có chủ đích).

### Deprecated
- `currentDebt`, `totalRevenue`, `totalOrder` (Decision CR02/CR03) — không xóa cột, vẫn trả về
  trong response (Backward Compatibility — Decision CR12), nhưng không nhận input từ Create/Update
  DTO nào. `totalPoint` giữ nguyên làm system-maintained projection (Decision CR04).

### Known Limitations
- Integration Test (`test/customer.e2e-spec.ts` — chưa tồn tại), Rollback Test (3 migration),
  Manual API Smoke Test, End-to-End Migration Scenario (Decision SR14) — 🟡 PENDING: không có
  Docker/Postgres trong môi trường phát triển hiện tại. Xem `docs/architecture/technical-debt.md`.

## [0.6.0-barcode-foundation] - 2026-07-17

**Sprint-01 — T009: Barcode Domain** (`SPEC-BARCODE-001`), theo đúng `RFC-0005` (Architect-authored)
→ `ARCHITECT RESOLUTION – RFC-0005 Barcode Domain` (BQ1-BQ11) → `SPEC-BARCODE-001` →
`ARCHITECTURE REVIEW – SPEC-BARCODE-001` (SB01-SB10) → `Barcode Implementation Plan` →
`ARCHITECTURE REVIEW – Implementation Plan – Barcode Domain` (IP01-IP10). Chi tiết đầy đủ:
`docs/release/t009-release-note.md`.

### Added
- `BarcodeStatus` (`ACTIVE`/`INACTIVE`/`ARCHIVED`, enum riêng — Decision BQ3).
- `Barcode.version` (Optimistic Lock, `DEFAULT 1`) — mở rộng sang **cả 4** thao tác ghi
  (`PATCH`/Archive (`DELETE`)/Restore/SetDefault), không chỉ `PATCH` như chuẩn chung dự án
  (Decision BQ10/SB02).
- `GET /barcodes` — tra cứu org-wide mới (search/status/isActive/page/limit/sortBy/sortOrder),
  cộng thêm vào route lồng sẵn có `GET /products/:productId/barcodes` (Decision BQ1/SB01, Hybrid
  Route — Exception có chủ đích với `MASTER_DATA_TEMPLATE.md`). Default sort `createdAt desc`
  (Decision SB08 — Barcode không có field `name`).
- `POST /barcodes/:id/restore` — khôi phục Barcode đã xóa mềm, luôn trả `status` về `INACTIVE`
  (Decision BQ3), bắt buộc `version` trong body.
- `UnitDomainService` (module `unit`, mới) — đúng 1 method `findByIdForReference()`, phục vụ xác
  nhận `unitId` của Barcode cùng tổ chức và chưa `ARCHIVED` (Decision BQ11).
- `BarcodePersistenceModule`/`BarcodeReferenceModule` (module `barcode`, mới) — tách từ 1 module
  thành 3 để xử lý circular dependency thật giữa `UnitModule` (T008) và `BarcodeModule` — xem
  "Lịch sử quyết định" trong `SPEC-BARCODE-001` §9.5 (Decision CD01-CD12 rồi RPC01-RPC12).

### Changed
- **`DELETE /barcodes/:id`** nay bắt buộc body `{ version }` (trước không cần body) và chỉ chặn
  Archive khi `isDefault=true` **VÀ** Product `status=ACTIVE` (Decision BQ2 — hẹp hơn Delete Guard
  của Unit).
- **`POST /barcodes/:id/default`** nay bắt buộc body `{ version }` (trước không cần body).
- **`existsByCode()`** đổi chữ ký thêm `organizationId` — unique theo tổ chức (Decision BQ8,
  `@@unique([organizationId, code])`), không phải toàn cục; gọi thật từ `BarcodeService` trước khi
  ghi (Decision BQ6), giữ nguyên bắt `P2002` làm lớp bảo vệ cuối.
- **`UnitModule.imports`** đổi từ `[RbacModule, ProductModule, BarcodeModule]` sang
  `[RbacModule, ProductModule, BarcodeReferenceModule]` — không dùng `forwardRef()`.

### Known Limitations
- Integration Test (`test/barcode.e2e-spec.ts`), Rollback Test (2 migration), Manual API Smoke Test
  — 🟡 PENDING: không có Docker/Postgres/Redis trong môi trường phát triển hiện tại. Xem
  `docs/architecture/technical-debt.md`.

## [0.5.0-unit-foundation] - 2026-07-16

**Sprint-01 — T008: Unit Domain** (`SPEC-UNIT-001`), theo đúng `RFC-0004` →
`docs/architecture/unit-dependency-audit.md` → `ARCHITECTURE REVIEW – RFC-0004 Unit Domain`
(RQ1-RQ10) → `SPEC-UNIT-001` → `ARCHITECTURE REVIEW – SPEC-UNIT-001` (SU01-SU10) →
`Unit Implementation Plan` → `ARCHITECTURE REVIEW – Unit Implementation Plan` (UP01-UP10). Chi
tiết đầy đủ: `docs/release/t008-release-note.md`.

### Added
- `UnitStatus` (`ACTIVE`/`INACTIVE`/`ARCHIVED`, enum riêng — Decision RQ1) — **không** dùng
  `CommonStatus` (khác Brand), **không** có `DRAFT` (khác Product/Category).
- `Unit.version` (Optimistic Lock, `DEFAULT 1`) — `PATCH /units/:id` bắt buộc gửi đúng version,
  sai → `409`.
- `POST /units/:id/restore` — khôi phục Unit đã xóa mềm, luôn trả `status` về `INACTIVE` (Decision
  RQ3), permission mới `unit:restore`.
- `GET /units` — thêm `isActive`/`sortBy`/`sortOrder`, đủ 7 tham số Query Convention (Decision
  RQ7). `isActive` là alias cho `status=ACTIVE`, không phải cột schema mới (Decision SU04).
- `BarcodeDomainService` (module `barcode`, mới) — đúng 1 method `hasActiveBarcodesInUnit()`,
  đúng mẫu `ProductDomainService`, phục vụ Delete Guard mở rộng của Unit (Decision RQ5).

### Changed
- **`DELETE /units/:id`** nay chặn nếu còn Product `status=ACTIVE` HOẶC Barcode chưa xóa mềm tham
  chiếu — mở rộng từ chỉ-Product trước đây (Decision RQ5/UP07, "không để dữ liệu mồ côi").
- **`hasActiveProductsInUnit()`** (module `product`) nay chỉ tính Product `status=ACTIVE` — Product
  `INACTIVE`/`ARCHIVED` không còn chặn xóa Unit như trước (Decision SU01, Behavior Change có chủ
  đích).
- **`update()`/`softDelete()`/`restore()`** của `unit` nay bắt buộc lọc `organizationId` trong
  `where` (Decision SU03/UP06) — chuẩn mới, áp dụng lần đầu ở Unit, chưa retro-fit
  Product/Category/Brand.

### Known Limitations
- Integration Test (`test/unit.e2e-spec.ts`), Rollback Test (2 migration), Manual API Smoke Test —
  🟡 PENDING: không có Docker/Postgres/Redis trong môi trường phát triển hiện tại. Xem
  `docs/architecture/technical-debt.md`.

## [0.4.0-brand-foundation] - 2026-07-16

**Sprint-01 — T007: Brand Domain** (`SPEC-BRAND-001`), theo đúng `RFC-0003` →
`docs/architecture/brand-dependency-audit.md` → `ARCHITECT RESOLUTION – RFC-0003 Brand Domain`
(RQ1-RQ5) → `SPEC-BRAND-001` → `ARCHITECT DECISION – APPROVE SPEC-BRAND-001 & AUTHORIZE T007
IMPLEMENTATION PLAN` → `Brand Implementation Plan` → `ARCHITECTURE REVIEW – Brand Implementation
Plan` (T007-04.1-10). Chi tiết đầy đủ: `docs/release/t007-release-note.md`.

### Added
- `Brand.version` (Optimistic Lock, `DEFAULT 1`) — `PATCH /brands/:id` bắt buộc gửi đúng version,
  sai → `409`.
- `POST /brands/:id/restore` — khôi phục Brand đã xóa mềm, luôn trả `status` về `INACTIVE` (không
  bao giờ trực tiếp `ACTIVE` — Decision RQ2), permission mới `brand:restore`.
- `GET /brands` — thêm `isActive`/`sortBy`/`sortOrder` vào bộ filter/phân trang hiện có
  (`search`/`status`/`page`/`limit`), đúng chuẩn tham số thống nhất Master Data (Decision B02.5).
  `isActive` là **filter alias tầng business cho `status`, không phải cột schema mới** (Decision
  RQ1) — ngoại lệ có chủ đích so với Product/Category, theo nguyên tắc mới **"Business First,
  Consistency Second"** (Decision RQ5).

### Changed
- `PATCH /brands/:id` nay bắt buộc gửi `version` (Optimistic Lock) — sai version trả `409`.
- `GET /brands` mặc định sắp xếp theo `name` (trước đây hardcode, nay tường minh và có thể đổi
  qua `sortBy`/`sortOrder`).

### Known Limitations
- Integration Test (`test/brand.e2e-spec.ts`), Rollback Test (migration `version`), Manual API
  Smoke Test — 🟡 PENDING: không có Docker/Postgres/Redis trong môi trường phát triển hiện tại.
  Xem `docs/architecture/technical-debt.md`.

## [0.3.0-category-foundation] - 2026-07-16

**Sprint-01 — T006: Category Implementation** (`SPEC-CATEGORY-001`), theo đúng `RFC-0002` →
`docs/architecture/category-dependency-audit.md` → `ARCHITECTURE REVIEW – RFC-0002` (Q1-Q12) →
`SPEC-CATEGORY-001` → `ARCHITECTURE REVIEW – SPEC-CATEGORY-001` (S01-S08) →
`Category Implementation Plan` → `ARCHITECTURE REVIEW – Category Implementation Plan` (IP01-IP07).
Chi tiết đầy đủ: `docs/implementation/t006-category-implementation-report.md`.

### Added
- `Category.status` (`CategoryStatus`: `DRAFT`/`ACTIVE`/`INACTIVE`/`ARCHIVED`) — độc lập với
  `isActive` (cờ bật/tắt nhanh, không đổi ý nghĩa), cùng mẫu `Product` (T005).
- `Category.version` (Optimistic Lock, `DEFAULT 1`).
- **`@@unique([organizationId, slug])`** cho `Category` — đóng lỗ hổng race condition trước đây
  chỉ dựa vào `CategorySlugifySlugGenerator` (app-level, không có ràng buộc DB).
- `GET /categories` — filter/phân trang mới: `search`/`status`/`parentId`/`isActive`/`page`/
  `limit`/`sortBy`/`sortOrder` (tên tham số thống nhất toàn dự án Master Data — Decision IP01).
- `findAncestorChainIncludingArchived()` (Repository, nội bộ, không expose API) — phục vụ guard
  Restore theo chuỗi tổ tiên.
- Bộ test mới cho Circular Detection nhiều cấp, Archive/Restore đệ quy, Optimistic Lock,
  Pagination/Search, Multi Tenant Isolation (`category`) và Variant-Category consistency
  (`product`) — chi tiết ở báo cáo implementation.

### Changed
- **`DELETE /categories/:id`** nay chặn Archive nếu còn danh mục con **ở bất kỳ cấp nào** đang
  `ACTIVE` (đệ quy toàn bộ cây con, không chỉ con trực tiếp — Decision Q6/S05), ngoài điều kiện
  "còn Product active" đã có từ trước. Set cả `status=ARCHIVED` lẫn `deletedAt`.
- **`POST /categories/:id/restore`** nay chặn nếu **bất kỳ tổ tiên nào** (không chỉ cha trực
  tiếp) đang `ARCHIVED` (Decision Q7) — không tự động Restore tổ tiên, phải Restore từ trên
  xuống. Luôn trả `status` về `INACTIVE`.
- **`PATCH /categories/:id`** nay bắt buộc gửi `version` (Optimistic Lock) — sai version trả
  `409`. Không cho set `status=ARCHIVED`/`ACTIVE` trực tiếp qua route này (phải qua
  `DELETE`/`restore`, có guard đệ quy — Decision S01).
- **Variant Child (Product) bắt buộc cùng `categoryId` với Variant Parent** (RFC-0002 §7, Decision
  Q8/S03) — validate bổ sung ở `product.service.ts` (`assertValidVariantRelationship()`), lỗi mới
  `PRODUCT_014`. Đây là thay đổi duy nhất chạm module `product` (đã đóng ở T005).

### Known Limitations
- Integration Test, Rollback Test (3 migration mới), Manual API Smoke Test, Query Performance
  benchmark (>1000 category, Decision S06) — 🟡 PENDING: không có Docker/Postgres/Redis trong môi
  trường phát triển hiện tại. Xem `docs/implementation/t006-category-implementation-report.md`.

## [0.2.0-product-foundation] - 2026-07-16

**Sprint-01 — T005: Product Refactor** (`SPEC-PRODUCT-001`), theo đúng
`RFC-0001 Revision 1` + `ARCHITECTURE REVIEW – SPEC-PRODUCT-001` (A01-A10) +
`ARCHITECTURE REVIEW – T005.1` (A11-A18) + `ARCHITECT DECISION – T005 Implementation
Clarification` (C01-C08) + `ARCHITECTURE REVIEW – T005 Product Refactor` (APPROVED,
Decision T005-R01..R05). **Technical Complete = PASS, Operational Complete = PENDING**
(cần môi trường Docker/Postgres/Redis thật — xem Known Limitations). Release note đầy đủ:
`docs/release/t005-release-note.md`.

### Added
- `ProductType` enum (`STANDARD`/`SERVICE`/`VARIANT_PARENT`/`VARIANT_CHILD`) thay thế
  `Product.isService`. `Product.parentProductId` (self-reference) cho Variant Child — Variant
  Child là 1 Product bình thường, không có model `Variant` riêng.
- `Product.version` (Optimistic Lock, `DEFAULT 1`) — chuẩn mới bắt buộc cho mọi Aggregate Root
  từ Sprint-01.
- `Barcode.organizationId` (denormalize từ `Product`) + unique constraint theo tenant
  `(organizationId, code)` thay thế unique toàn cục.
- `ProductDomainService` (`backend/src/modules/product/application/product-domain.service.ts`)
  — cửa ngõ đọc duy nhất của `Product` cho module khác (4 method: `findById`,
  `hasActiveProductsInCategory/Brand/Unit`), theo mẫu `InventoryDomainService` (T004) nhưng giải
  quyết vấn đề khác (Repository Boundary/export hygiene — ADR-0010, không phải Single Writer).
- `product-repository-boundary.architecture.spec.ts` — bộ test kiến trúc tự động xác minh
  `PRODUCT_REPOSITORY` không còn export ngoài `product` module.
- `PRODUCT_REFACTOR_ENABLED` — feature flag nội bộ (dev-only, đọc từ env, mặc định `false`), gate
  3 business rule mới: Optimistic Lock enforcement, Product Type change guard, Archive-blocks-
  active-variant guard. Có thể xóa ở cuối Sprint-01.

### Changed
- **`PATCH /products/:id`** nay bắt buộc gửi `version` (Optimistic Lock) — sai version trả `409`.
- **`DELETE /products/:id`** nay set cả `status=ARCHIVED` lẫn `deletedAt` (trước chỉ `deletedAt`);
  từ chối nếu còn Variant Child `status=ACTIVE`.
- **`POST /products/:id/restore`** luôn trả `status` về `INACTIVE` (không tự động `ACTIVE`).
- `ProductStatus`: thêm `DRAFT`, đổi tên `DISCONTINUED` → `ARCHIVED` (rename value, giữ dữ liệu
  cũ, cùng mẫu `OrganizationStatus` ở T002).
- 5 module (`category`, `brand`, `unit`, `barcode`, `cart`) đổi từ inject
  `PRODUCT_REPOSITORY`/`IProductRepository` trực tiếp sang inject `ProductDomainService`.

### Migration
- 3 migration độc lập (`20260716020000`/`20260716030000`/`20260716040000`), mỗi migration kèm
  `rollback.sql` riêng — rollback đã viết, **chưa chạy thử thật** (không có Postgres trong môi
  trường phát triển hiện tại, xem Known Limitations).

### Known Limitations
- Integration Test, Rollback Test, Manual API Smoke Test — 🟡 PENDING: không có Docker/Postgres/
  Redis trong môi trường phát triển hiện tại. Xem `docs/implementation/t005-product-refactor-report.md`.

## [0.1.0-foundation] - 2026-07-16

**Sprint-00: Architecture Stabilization** — đóng Sprint sau T001-T004.95. Toàn bộ tính năng POS/Order/Payment/Voucher/Promotion mới bị tạm dừng trong Sprint này để ổn định kiến trúc nền tảng trước khi mở rộng (Sprint-01 trở đi).

### Added
- **T001 — Architecture Audit**: `docs/architecture/dependency-graph.md` — kiểm kê 25 module, 0 circular dependency, phát hiện 5 module ghi trực tiếp Inventory (khắc phục ở T004).
- **T002/T003 — Organization & Branch Module** (`SPEC-ORG-001`, `SPEC-BRANCH-001`): tenant root aggregate, bootstrap Organization+Owner atomic, Platform Admin (`isPlatformAdmin` boolean), Branch với `BranchStatus` riêng.
- **T003.5 — Inventory Architecture Specification & Review**: `docs/architecture/inventory/*.md` (7 tài liệu) — Domain Model, Write Path, Event Flow, Transaction Boundary, Locking Strategy, Concurrency Test Cases, Migration Plan.
- **T004.9 — Event Architecture Review**: `docs/architecture/event-architecture-review.md` — chốt dùng nhiều Domain Event cụ thể (không dùng 1 event tổng quát) và bắt buộc Outbox Pattern cho Sprint-01.
- **T004.95 — Architecture Decision Records** (`SPEC-T004.95`): `docs/architecture/adr/` — 12 ADR chuẩn Status/Context/Decision/Consequences/Alternatives/Rejected/References, ghi lại mọi quyết định kiến trúc lớn của dự án tới thời điểm này.
- `backend/src/modules/inventory/single-writer.architecture.spec.ts` (T004.5): bộ test kiến trúc tự động xác minh bất biến "Single Writer" — không module nào ngoài `inventory` được inject `InventoryRepository` hay ghi trực tiếp bảng `Inventory`/`InventoryMovement`.
- `docs/release/gate-status.md`: theo dõi trạng thái PASS/FAIL/PENDING cho từng hạng mục Sprint-00.
- `docs/implementation/sprint-00-summary.md`, `docs/implementation/sprint-00-t004-report.md`, `docs/implementation/t00495-report.md`.

### Changed
- **T004 — Inventory Refactor** (`SPEC-INV-001`): tập trung hóa toàn bộ đường ghi tồn kho qua `InventoryDomainService` — cửa ngõ ghi duy nhất (Single Writer), public API `increase()`/`decrease()`/`adjust()`/`transfer()`/`recordMovement()`. `IInventoryRepository`/`INVENTORY_REPOSITORY` không còn export ra ngoài `InventoryModule`. Migrate 5 module (`purchase-order`, `purchase-return`, `transfer`, `inventory-adjustment`, `stock-count`) từ ghi trực tiếp `tx.inventory.*` sang gọi qua `InventoryDomainService`; refactor tối thiểu tầng DI của `checkout` (không đổi business logic/transaction).
- Optimistic Lock (compare-and-swap) áp dụng cho toàn bộ 6 đường ghi tồn kho, không chỉ riêng Checkout như trước.
- Transfer OUT (trừ kho nguồn) nay kiểm tra âm kho — hành vi mới, trước đây không có.

### Known Limitations
- Integration Test (e2e) — 🟡 PENDING toàn bộ Sprint-00: không có Docker/Postgres/Redis trong môi trường phát triển hiện tại. Xem `docs/release/gate-status.md`.

## [0.1.0] - 2026-07-14

### Added
- Tài liệu kiến trúc nền tảng: kiến trúc tổng thể, ERD, Prisma schema, routing/sitemap, design system, wireframe dashboard (`docs/architecture/`).
- Backend (NestJS 11): cấu hình nền tảng (Prisma, Redis, JWT, Swagger, BullMQ, Socket.IO, Winston, response envelope chuẩn hóa, Request ID/Correlation ID).
- Module Auth: đăng nhập đa tenant (`organizationSlug` + email), JWT access/refresh token, refresh token rotation kèm phát hiện tái sử dụng, Session theo thiết bị (browser/OS/geo), Refresh Token qua HttpOnly Cookie (Web) hoặc JSON (Mobile), quên mật khẩu qua OTP (cooldown 60s, giới hạn 5 lần/giờ).
- Module RBAC: Role/Permission/RolePermission/UserRole, danh mục ~140 permission theo `resource:action`, `permissionVersion` để vô hiệu JWT cũ khi quyền thay đổi.
- Audit Log dùng chung toàn hệ thống.
- Frontend (Next.js 15): Tailwind v4, shadcn/ui, TanStack Query, Zustand, React Hook Form + Zod, Dark Mode.
- `docs/release-gates.md` và `docs/integration-test-checklist.md`: quy trình Gate A (offline, đã PASS) / Gate B (Docker, PENDING) / Gate C / Gate D.

### Security
- Mật khẩu băm bằng Argon2id.
- Refresh token lưu dưới dạng HMAC-SHA256 hash trong DB, không lưu plaintext.
- Refresh token reuse detection: phát hiện token đã bị thu hồi nhưng vẫn được dùng lại → thu hồi toàn bộ session của user.

[Unreleased]: https://github.com/huanthoi2311-commits/Kiotviet-Off/compare/v0.5.0-unit-foundation...HEAD
[0.5.0-unit-foundation]: https://github.com/huanthoi2311-commits/Kiotviet-Off/compare/v0.4.0-brand-foundation...v0.5.0-unit-foundation
[0.4.0-brand-foundation]: https://github.com/huanthoi2311-commits/Kiotviet-Off/compare/v0.3.0-category-foundation...v0.4.0-brand-foundation
[0.3.0-category-foundation]: https://github.com/huanthoi2311-commits/Kiotviet-Off/compare/v0.2.0-product-foundation...v0.3.0-category-foundation
[0.2.0-product-foundation]: https://github.com/huanthoi2311-commits/Kiotviet-Off/compare/v0.1.0-foundation...v0.2.0-product-foundation
[0.1.0-foundation]: https://github.com/huanthoi2311-commits/Kiotviet-Off/compare/v0.1.0...v0.1.0-foundation
[0.1.0]: https://github.com/huanthoi2311-commits/Kiotviet-Off/releases/tag/v0.1.0
