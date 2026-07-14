# Changelog

Toàn bộ thay đổi đáng chú ý của dự án được ghi lại ở đây.

Định dạng theo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
dự án tuân thủ [Semantic Versioning](https://semver.org/lang/vi/) (`MAJOR.MINOR.PATCH`).

## [Unreleased]

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
