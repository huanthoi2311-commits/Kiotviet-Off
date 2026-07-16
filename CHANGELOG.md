# Changelog

Toàn bộ thay đổi đáng chú ý của dự án được ghi lại ở đây.

Định dạng theo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
dự án tuân thủ [Semantic Versioning](https://semver.org/lang/vi/) (`MAJOR.MINOR.PATCH`).

## [Unreleased]

### Changed
- **Sprint-00 T004 — Inventory Refactor** (`SPEC-INV-001`, commit `fb8628d`): tập trung hóa toàn bộ đường ghi tồn kho qua `InventoryDomainService` — cửa ngõ ghi duy nhất (Single Writer), public API `increase()`/`decrease()`/`adjust()`/`transfer()`/`recordMovement()`. `IInventoryRepository`/`INVENTORY_REPOSITORY` không còn export ra ngoài `InventoryModule`. Migrate 5 module (`purchase-order`, `purchase-return`, `transfer`, `inventory-adjustment`, `stock-count`) từ ghi trực tiếp `tx.inventory.*` sang gọi qua `InventoryDomainService`; refactor tối thiểu tầng DI của `checkout` (không đổi business logic/transaction).
- Optimistic Lock (compare-and-swap) áp dụng cho toàn bộ 6 đường ghi tồn kho, không chỉ riêng Checkout như trước.
- Transfer OUT (trừ kho nguồn) nay kiểm tra âm kho — hành vi mới, trước đây không có.

### Added
- `docs/architecture/inventory/*.md` (7 tài liệu, T003.5): Domain Model, Write Path, Event Flow, Transaction Boundary, Locking Strategy, Concurrency Test Cases, Migration Plan cho kiến trúc Inventory.
- `backend/src/modules/inventory/single-writer.architecture.spec.ts` (T004.5): bộ test kiến trúc tự động xác minh bất biến "Single Writer" — không module nào ngoài `inventory` được inject `InventoryRepository` hay ghi trực tiếp bảng `Inventory`/`InventoryMovement`.
- `docs/release/gate-status.md`: theo dõi trạng thái PASS/FAIL/PENDING cho từng hạng mục Sprint-00 (T001-T006).

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

[Unreleased]: https://github.com/huanthoi2311-commits/Kiotviet-Off/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/huanthoi2311-commits/Kiotviet-Off/releases/tag/v0.1.0
