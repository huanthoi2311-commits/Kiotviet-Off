# Implementation Report — Prompt 019: Unit Module

**Ngày:** 2026-07-14
**Phạm vi:** Unit Module (đơn vị tính) theo Clean Architecture, tái dùng nguyên vẹn kiến trúc Foundation (Product/Category/Brand).

## 1. Chức năng đã hoàn thành

- **CRUD Unit đầy đủ**: `POST/GET/PATCH/DELETE /units`, `GET /units/:id`. **Không có `restore`** — đúng theo phạm vi Prompt 019 (permission catalog chỉ có `unit:create/view/update/delete`, đã có sẵn từ trước, không cần sửa).
- **Search/Filter/Pagination**: tìm theo `name`/`code` (không phân biệt hoa thường), phân trang `page`/`limit`. Không có filter `status` vì model `Unit` không có field trạng thái (khác Brand).
- **Chặn xóa khi còn Product**: `UnitService.remove()` gọi `IProductRepository.hasActiveProductsInUnit()` (đã bổ sung vào `IProductRepository`/`PrismaProductRepository` từ Prompt 018, cùng lúc với `hasActiveProductsInBrand`) → 422 `UNIT_IN_USE` nếu còn sản phẩm.
- **Soft Delete** (không restore): `deletedAt` set khi xóa, loại khỏi mọi truy vấn `findById`/`search`.
- **Permission**: `unit:create/view/update/delete` (đã có sẵn trong catalog, không cần thêm).
- **Audit Log**: create (newValue)/update (oldValue+newValue)/delete (oldValue) — snapshot `{code, name, symbol}`.
- **Swagger**: đầy đủ, tái dùng `ApiWriteErrors()`/`ApiCommonErrors()`.
- **Validation**: `code` 1-50 ký tự, `name` 1-255 ký tự, `symbol` 1-20 ký tự (tất cả bắt buộc khi tạo).

## 2. Quyết định thiết kế

1. **Không cần sửa schema/migration**: model `Unit` trong `schema.prisma` đã có sẵn đầy đủ `code`, `name`, `symbol`, các cột audit (`createdBy`/`updatedBy`/`createdAt`/`updatedAt`), `deletedAt` và unique constraint `[organizationId, code]` từ trước (Prompt 002/003 — Foundation schema). Prompt 019 không yêu cầu field mới nên không tạo migration nào — khác Brand (Prompt 018) phải thêm 3 cột mới.
2. **`UnitEntity` không có `status`**: model `Unit` không có field trạng thái (khác `Brand` có `status: BrandStatus`), nên `UnitEntity`/DTO/mapper cũng không có — giữ đúng những gì schema thực sự có, không tự thêm field ngoài phạm vi.
3. **`hasActiveProductsInUnit` đã có sẵn từ Prompt 018** (thêm cùng lúc với `hasActiveProductsInBrand` khi làm Brand module, đã disclose trong report Prompt 018) — Prompt 019 chỉ cần gọi lại, không cần sửa `IProductRepository` lần nữa.

## 3. File đã tạo/sửa

**Tạo mới** — `backend/src/modules/unit/` (đủ 4 lớp, pattern giống hệt Brand nhưng bỏ `status`/restore): domain (entity, repository interface), application (DTO×4 gồm response, mapper, service + spec + DTO validation spec), infrastructure (Prisma repository + spec), presentation (controller + spec), `unit.module.ts`.
**Tạo mới khác**: `backend/test/unit.e2e-spec.ts`.
**Sửa**: `app.module.ts` (đăng ký `UnitModule`).
**Không sửa**: `schema.prisma` (không cần thay đổi), `error-codes.ts`/`permission-catalog.ts` (đã có sẵn `UNIT_001..003` và `unit:*` từ Prompt 016/018).

## 4. Migration

Không có — schema `Unit` đã đầy đủ từ trước, không phát sinh migration nào cho Prompt 019.

## 5. API

| Method | Path | Permission |
|---|---|---|
| POST | `/api/v1/units` | `unit:create` |
| GET | `/api/v1/units` | `unit:view` |
| GET | `/api/v1/units/:id` | `unit:view` |
| PATCH | `/api/v1/units/:id` | `unit:update` |
| DELETE | `/api/v1/units/:id` | `unit:delete` |

Xác nhận qua Swagger generation offline (`Test.createTestingModule({imports:[AppModule]}).compile()` + `SwaggerModule.createDocument`): **26 route tổng**, đúng 2 path `/units` (`POST,GET`) và `/units/{id}` (`GET,PATCH,DELETE`). DI graph resolve thành công, không phát hiện circular dependency.

## 6. Test

- **Unit**: **242/242 PASS** toàn backend (tăng từ 205 sau Prompt 018). Unit-specific (37 test): service (create+audit log, findOne+404, search, update+audit log, remove+chặn khi còn Product+404), Prisma repository (create+P2002→409+lỗi không xác định, findById, update+P2002, softDelete, search+có/không search text, existsByCode+loại trừ excludeId), controller (permission metadata `it.each` cho 5 method, ủy quyền actor context đúng), DTO validation (đầy đủ hợp lệ/code rỗng/name rỗng/symbol rỗng/symbol quá dài).
- **Coverage module `unit/`** (loại trừ `.module.ts` — chỉ DI wiring): **90.47% statement, 93.1% function, 92.53% line, 81.57% branch** — đạt mốc 90% ở statement/function/line.
- **Integration**: `test/unit.e2e-spec.ts` — tạo/tìm kiếm/chi tiết qua API thật, từ chối trùng `code` (409), chặn xóa khi còn Product (422), cập nhật + xóa mềm qua HTTP thật (204, sau đó GET trả 404). **Chưa xác nhận PASS** — sandbox này không có Docker/PostgreSQL, cùng giới hạn môi trường đã biết và disclose từ Prompt 016 (xem `docs/release-gates.md`, Gate B).
- Build/Lint/TypeCheck/Prisma validate: tất cả **PASS** trên toàn repo.

## 7. Self-Review

Không còn TODO/FIXME/console.log/`any` thừa trong `src/modules/unit/` (đã `grep` xác nhận rỗng). Clean Architecture giữ nguyên layering; interface dùng `import type` riêng theo yêu cầu `isolatedModules`. Không phát sinh circular dependency: `UnitModule → ProductModule, RbacModule` một chiều; `ProductModule` không import ngược `UnitModule`. Multi-tenant isolation giữ nguyên (mọi query lọc `organizationId`). Không có rủi ro hiệu năng mới — cùng pattern `$transaction([findMany, count])` đã dùng ở Brand/Category, có index tự nhiên qua unique `[organizationId, code]`.

**Definition of Done đạt được** (trừ Integration Test PASS thật — cùng giới hạn Gate B đã biết, đã disclose minh bạch). Tiếp tục Prompt 020.
