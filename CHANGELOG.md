# Changelog

Toàn bộ thay đổi đáng chú ý của dự án được ghi lại ở đây.

Định dạng theo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
dự án tuân thủ [Semantic Versioning](https://semver.org/lang/vi/) (`MAJOR.MINOR.PATCH`).

## [Unreleased]

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

[Unreleased]: https://github.com/huanthoi2311-commits/Kiotviet-Off/compare/v0.2.0-product-foundation...HEAD
[0.2.0-product-foundation]: https://github.com/huanthoi2311-commits/Kiotviet-Off/compare/v0.1.0-foundation...v0.2.0-product-foundation
[0.1.0-foundation]: https://github.com/huanthoi2311-commits/Kiotviet-Off/compare/v0.1.0...v0.1.0-foundation
[0.1.0]: https://github.com/huanthoi2311-commits/Kiotviet-Off/releases/tag/v0.1.0
