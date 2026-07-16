# Implementation Report — Sprint-00 / T002 + T003: Organization & Branch Modules

**SPEC:** SPEC-ORG-001 v1.0.0 (APPROVED FOR DEVELOPMENT), SPEC-BRANCH-001 v1.0.0 (APPROVED FOR DEVELOPMENT)
**Ngày:** 2026-07-16
**Quy trình:** Specification First — code chỉ bắt đầu sau khi cả 6 "ARCHITECT DECISION" (trả lời 6 điểm xung đột/chưa rõ đã nêu trước khi triển khai) được chốt.

## 0. Bối cảnh

Sau Prompt A01 (Architecture Audit), user chuyển sang quy trình "Architecture Freeze + Sprint Development": Sprint-00 = ổn định kiến trúc nền, không thêm tính năng bán hàng. T002 (Organization) và T003 (Branch) là 2 task đầu tiên của Sprint-00, đi kèm 2 SPEC chi tiết. Trước khi code, đối chiếu SPEC với schema hiện có phát hiện 6 điểm xung đột/chưa rõ (Plan trùng Subscription, enum Status khác, bài toán con-gà-quả-trứng Organization↔User, "System Admin" chưa tồn tại trong RBAC, `OrganizationAudit` không rõ có phải bảng mới, `Setting` chồng chéo `OrganizationSettings`) — đã hỏi và nhận đủ 6 "ARCHITECT DECISION" trước khi viết bất kỳ dòng code nào.

## 1. Tóm tắt 6 Decision đã áp dụng

| # | Quyết định | Áp dụng |
|---|---|---|
| 1 | `OrganizationSubscription` là Single Source of Truth cho `plan`. `Organization.plan` giữ lại, đánh dấu deprecated (comment + `COMMENT ON COLUMN`), chưa xóa. | Schema + code mới không đọc/ghi `Organization.plan` |
| 2 | Đổi `CANCELLED` → `ARCHIVED` trong `OrganizationStatus`. Giữ `deletedAt` (soft-delete kỹ thuật) song song `status` (trạng thái nghiệp vụ). | `ALTER TYPE ... RENAME VALUE` |
| 3 | `POST /organizations` tạo đồng thời Organization + Owner User + Owner Role + UserRole + OrganizationSettings + OrganizationSubscription + Audit Log trong 1 transaction. Không `ownerUserId = null`, không tạo Organization rồi Owner sau. | `IOrganizationRepository.createWithOwner()` |
| 4 | Không thêm Global Role, không sửa RBAC. Thêm `User.isPlatformAdmin: Boolean`. Chỉ user này gọi được `POST /organizations`. | `PlatformAdminGuard` + `isPlatformAdmin` trong JWT |
| 5 | Không tạo bảng `OrganizationAudit` mới — dùng `AuditLog` có sẵn (`entityType='Organization'`). | `tx.auditLog.create()` trong transaction tạo Organization |
| 6 | Giữ cả 2 hệ thống Setting: `Setting` (Platform Setting, dùng cho SMTP/Redis/Storage...) và `OrganizationSettings` (Business Setting, `allowNegativeInventory`...). Không migrate module Inventory ở Sprint-00 — để dành Sprint-05. | `OrganizationSettings` bảng mới riêng, `Setting` giữ nguyên |

## 2. Schema reconciliation

### 2.1 Organization

`name`→`displayName` (đổi tên, SPEC dùng literal `displayName`), `currency`→`currencyCode`. Thêm `code` (unique, sinh tự động, backfill cho dữ liệu cũ qua chính `organization_code_seq`), `legalName`, `taxCode` (unique), `email` (unique), `phone`, `website`, `logoUrl`, `address/province/district/ward`, `countryCode` (default `VN`), `languageCode` (default `vi`), `ownerUserId` (**nullable ở schema** — xem mục 3.1). `plan` giữ nguyên, đánh dấu deprecated theo Decision 1.

**Mã Organization dùng Postgres `SEQUENCE` nguyên sinh (`organization_code_seq`), không dùng bảng `sequences` (Prisma model `Sequence`) đã có** — bảng đó gắn `organizationId` bắt buộc cho từng tổ chức (mã nội bộ CỦA tổ chức đó, vd `CUS000001`), nhưng Organization là gốc, chưa có `organizationId` nào để scope lúc sinh mã chính nó. Đây là ngoại lệ duy nhất, đã disclose rõ trong code.

### 2.2 OrganizationSettings, OrganizationSubscription (bảng mới)

Đúng theo SPEC §8/§9 — `OrganizationSubscription` chỉ tạo cấu trúc (không logic billing/quota enforcement, đúng "Chưa triển khai logic thanh toán ở Sprint-00. Chỉ tạo cấu trúc"), `max*`/`storageLimitGB` để `null` (không tự bịa số quota theo plan — SPEC không cho số cụ thể).

### 2.3 Branch

Thêm `email`, `province/district/ward`, `managerUserId` (FK User), `defaultWarehouseId` (FK Warehouse), `invoicePrefix`/`receiptPrefix`, `timezone`/`currencyCode` (default theo Organization). Đổi `status` từ `CommonStatus` (dùng chung nhiều model khác) sang enum riêng `BranchStatus` (`ACTIVE/INACTIVE/ARCHIVED`) vì `CommonStatus` không có `ARCHIVED` và không nên thêm vào enum dùng chung (ảnh hưởng các model khác đang dùng `CommonStatus` như `Warehouse`/`User`). Giữ nguyên field `isMain` có sẵn — khớp đúng nghĩa "Branch mặc định" mà SPEC mô tả qua Business Rule + endpoint `set-default`, không cần đổi tên thành `isDefault`.

### 2.4 User (thay đổi tối thiểu, ngoài phạm vi 2 SPEC nhưng bắt buộc để không chặn luồng)

- `isPlatformAdmin: Boolean` (Decision 4).
- `fullName: String?` — SPEC-ORG-001 yêu cầu payload `owner.fullName` nhưng `User` trước đây chỉ có `username`. Thêm tối thiểu, disclose rõ — không phải quyết định kiến trúc, chỉ là field còn thiếu để hiện thực Decision 3.

## 3. Thiết kế trọng tâm

### 3.1 Bootstrap Organization↔User (Decision 3)

`User.organizationId` bắt buộc NOT NULL — không thể tạo User trước khi có Organization. `Organization.ownerUserId` vì vậy **nullable ở schema** (dù luôn được set ngay trong CÙNG transaction, không bao giờ null sau khi transaction hoàn tất): tạo Organization (ownerUserId tạm null) → tạo Owner User (organizationId = Organization vừa tạo) → `UPDATE organizations SET ownerUserId = ...`. Toàn bộ 7 bước (Organization, Owner User, Owner Role, RolePermission, UserRole, OrganizationSettings, OrganizationSubscription, Audit Log) nằm trong 1 `prisma.$transaction()` — rollback toàn bộ nếu bất kỳ bước nào lỗi, đúng SPEC §17.

**Owner Role** được cấp *toàn bộ* permission hiện có trong `PERMISSION_CATALOG` (không phải Global Role — Role vẫn scope theo `organizationId` như RBAC hiện tại, chỉ là Role ĐẦU TIÊN của tổ chức mới nên hợp lý được cấp full quyền, tổ chức chưa có User nào khác).

**Username của Owner** tự suy ra từ phần trước `@` của email (SPEC không có field `username` riêng trong payload `owner`) — vd `owner@acme.com` → `owner`.

### 3.2 Platform Admin & Organization Context (Decision 4 + SPEC-ORG-001 §15)

`isPlatformAdmin` được nhúng vào JWT lúc đăng nhập (`AuthService.issueSession()` → `JwtAccessPayload.isPlatformAdmin`) — đòi hỏi mở rộng `AuthUserEntity`/`PrismaAuthUserRepository` (additive, không đổi hành vi cũ). `PlatformAdminGuard` (mới, chỉ dùng ở `organization` module) chặn `POST /organizations` và `GET /organizations` (danh sách toàn bộ tổ chức) — theo đúng "Chỉ System Admin mới được tạo Organization", và để tránh rò rỉ dữ liệu cross-tenant qua danh sách không giới hạn.

**"Mọi API đều kiểm tra Organization Context từ JWT" (SPEC §15)** hiện thực qua `assertOrganizationContext()`: mọi endpoint theo `:id` (`GET/PATCH/:id/archive/:id/transfer-owner`) yêu cầu `actor.isPlatformAdmin === true` HOẶC `actor.organizationId === id` — user thường không xem/sửa được tổ chức khác.

### 3.3 Archive 2 bước (SPEC §15 "Archive phải xác nhận hai bước")

`POST /organizations/:id/archive` yêu cầu body `{ confirmSlug }` khớp đúng slug hiện tại của tổ chức (tương tự cơ chế "gõ lại tên để xác nhận xóa" phổ biến) — không khớp thì từ chối trước khi chạm tới bước archive thật. Archive cũng tự động `status = INACTIVE` toàn bộ User của tổ chức (SPEC Rule 5 "Archive → Tự động Disable Login").

### 3.4 Branch Archive — 3 điều kiện chặn

Theo đúng SPEC-BRANCH-001 §6: (1) không còn Warehouse ACTIVE, (2) không phải Branch ACTIVE cuối cùng của Organization, (3) không còn Shift đang mở. **Điều kiện (3) hiện là no-op** — `Shift` chưa tồn tại dưới bất kỳ hình thức nào trong toàn bộ codebase (đã xác nhận qua Prompt A01), không có gì để kiểm tra. Đây là gap đã biết, disclose rõ — sẽ tự động có hiệu lực khi Shift Module được xây (Volume POS sau này), không cần sửa lại Branch module lúc đó nhờ interface `archive()` đã có sẵn.

### 3.5 Validation Timezone/Currency — phát hiện + sửa 1 bug trong lúc viết test

Viết `IsIanaTimezone`/`IsIso4217Currency` (custom class-validator, dùng `Intl` có sẵn của Node, không thêm thư viện). **Lần thử đầu tiên dùng `Intl.supportedValuesOf('timeZone')` để so khớp trực tiếp — sai**: hàm này chỉ trả về tên CANONICAL theo IANA tzdata (`Asia/Saigon`), không gồm alias hợp lệ như `Asia/Ho_Chi_Minh` — chính là default trong schema của cả `Organization` và `Branch`! Test tự viết đã bắt được lỗi này ngay lập tức (4 test fail khi validate chính giá trị default). Sửa bằng cách thử `new Intl.DateTimeFormat(..., { timeZone: value })` — không throw nghĩa là hợp lệ, chấp nhận cả canonical lẫn alias, đã verify lại bằng node trực tiếp trước khi chốt.

## 4. File đã tạo/sửa

**Tạo mới**: `backend/src/modules/organization/` (đầy đủ layer + `PlatformAdminGuard` + test), `backend/src/modules/branch/` (đầy đủ layer + test), `backend/src/common/validators/` (2 validator + test), `backend/prisma/migrations/20260716000000_organization_module/`, `backend/prisma/migrations/20260716010000_branch_module/`, `backend/test/organization.e2e-spec.ts`, `backend/test/branch.e2e-spec.ts`.
**Sửa**: `schema.prisma`, `app.module.ts`, `error-codes.ts` (+`ORGANIZATION_001..008`, `BRANCH_001..005`), `permission-catalog.ts` (+`organization:*` × 5, `branch:archive`/`branch:set-default`), `auth.module.ts` (export thêm `PASSWORD_HASHER` để `organization` module tái dùng), `auth-user.entity.ts`/`prisma-auth-user.repository.ts`/`auth.service.ts`/`jwt-payload.type.ts` (+`isPlatformAdmin`, additive), ~20 file `*.e2e-spec.ts` + `prisma/seed.ts` (đổi `organization.upsert({create: {name...}})` → `displayName` + thêm `code`, do đổi field bắt buộc — cơ học, không đổi logic test).

## 5. API

| Method | Path | Permission |
|---|---|---|
| POST | `/api/v1/organizations` | Platform Admin only |
| GET | `/api/v1/organizations` | Platform Admin only |
| GET | `/api/v1/organizations/current` | `organization:view` |
| GET | `/api/v1/organizations/:id` | `organization:view` + Organization Context |
| PATCH | `/api/v1/organizations/:id` | `organization:update` + Organization Context |
| POST | `/api/v1/organizations/:id/archive` | `organization:archive` + Organization Context + confirmSlug |
| POST | `/api/v1/organizations/:id/transfer-owner` | `organization:transfer-owner` + Organization Context |
| POST | `/api/v1/branches` | `branch:create` |
| GET | `/api/v1/branches` | `branch:view` |
| GET | `/api/v1/branches/:id` | `branch:view` |
| PATCH | `/api/v1/branches/:id` | `branch:update` |
| POST | `/api/v1/branches/:id/archive` | `branch:archive` |
| POST | `/api/v1/branches/:id/set-default` | `branch:set-default` |

## 6. Test

- **Unit**: 134 test mới (Organization: repository/service/controller/guard/DTO/code-generator; Branch: cùng cấu trúc; 2 custom validator). Coverage tổng hợp: **97.75% statement / 83.49% branch / 96.19% function / 97.64% line** — vượt mốc 90% ở 3/4 chỉ số, branch thấp hơn do các nhánh phòng thủ (đã chấp nhận cùng mức ở mọi Prompt trước).
- **Full backend suite**: **133 suite / 1195 test — 1195 PASS**, 0 fail (kể cả `argon2-password-hasher.spec.ts` — không bị flaky lần chạy này, máy rảnh).
- **Integration**: `test/organization.e2e-spec.ts` (tạo Organization+Owner atomically, Slug conflict, chặn user thường tạo Organization, Organization Context 403/200, Archive 2 bước sai/đúng confirmSlug, `GET /organizations/current`), `test/branch.e2e-spec.ts` (CRUD, set-default tự bỏ isMain của Branch khác, chặn Archive Branch ACTIVE cuối cùng, invoicePrefix conflict, chặn Archive khi còn Warehouse ACTIVE). **Chưa xác nhận PASS thật** — sandbox không có Docker/Postgres, cùng giới hạn Gate B đã biết từ đầu dự án.
- Build/Lint/TypeCheck: **PASS** trên toàn repo. `prisma validate`: **PASS**.

## 7. Self-Review

- **Không TODO/FIXME/console.log/`any`** trong `organization/`, `branch/`, `common/validators/` — grep xác nhận rỗng.
- **Không mở rộng phạm vi ngoài 6 Decision đã chốt** — mọi field/logic đều truy được về 1 mục cụ thể trong SPEC hoặc 1 Decision; các điểm buộc phải tự quyết định nhỏ (username suy từ email, Owner Role full quyền, quota để null, Shift no-op) đều thuộc loại "chi tiết kỹ thuật hiển nhiên" chứ không phải "quyết định kiến trúc mới", và đều đã disclose rõ trong báo cáo này, không giấu.
- **Architecture Review**: `organization`/`branch` module tuân thủ đúng layering Clean Architecture đã dùng xuyên suốt dự án; `OrganizationModule` import `AuthModule` chỉ để tái dùng `PASSWORD_HASHER` (không có Service-to-Service chain nào bị vi phạm).
- **Security**: `PlatformAdminGuard` + `assertOrganizationContext()` đảm bảo không user thường nào truy cập được dữ liệu tổ chức khác; Archive 2 bước chặn thao tác nhầm.
