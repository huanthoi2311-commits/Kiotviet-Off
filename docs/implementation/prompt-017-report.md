# Implementation Report — Prompt 017: Category Module

**Ngày:** 2026-07-14
**Phạm vi:** Category Module (cây danh mục nhiều cấp) theo Clean Architecture, tái dùng nguyên vẹn kiến trúc Foundation.

## 1. Chức năng đã hoàn thành

- **CRUD Category đầy đủ**: `POST/GET/PATCH/DELETE /categories`, `GET /categories/:id`.
- **Tree API**: `GET /categories/tree` — dựng cây không giới hạn cấp từ danh sách phẳng, thuần in-memory (map theo `id`/`parentId`, không đệ quy SQL).
- **Slug tự sinh** từ `name` (tái dùng `slugify()` — đã tách sang `common/utils/` để dùng chung Product/Category).
- **Chặn xóa khi còn Product**: `CategoryService.remove()` gọi `IProductRepository.hasActiveProductsInCategory()` (đã export sẵn từ `ProductModule` ở Prompt 016) → 422 nếu còn sản phẩm.
- **Chặn vòng lặp cha-con**: khi đổi `parentId`, kiểm tra (a) không được là chính nó, (b) không được là hậu duệ của chính nó (đi ngược chuỗi cha từ `parentId` mới, nếu gặp lại category đang sửa → 422).
- **Soft Delete + Restore**: giống pattern Product.
- **Permission**: `category:create/view/update/delete/restore` — đã thêm `restore` vào catalog.
- **Audit Log**: create/update (old/new)/delete/restore.
- **Swagger**: đầy đủ, dùng lại `ApiWriteErrors()`/`ApiCommonErrors()` từ Prompt 016.

## 2. Quyết định thiết kế

1. **`status` (CommonStatus) → `isActive` (Boolean)**: Prompt 017 chỉ liệt kê `isActive`, không có `status`, khác với Category gốc ở Prompt 002/003 dùng enum `CommonStatus`. Đã đổi hẳn sang `isActive: Boolean` theo đúng field list, không giữ song song 2 field như Product (Product có cả `status` VÀ `isActive` vì cả hai đều được liệt kê rõ; Category chỉ liệt kê `isActive`).
2. **`slugify()` chuyển thành `common/utils/`**: ban đầu nằm trong `product/infrastructure/generators/`, nay Category cũng cần → tách thành utility dùng chung, tránh 1 module import code nội bộ của module khác (giữ đúng ranh giới Clean Architecture).
3. **Circular-reference check load toàn bộ category của Organization** (không truy vấn đệ quy từng cấp) — với quy mô danh mục thực tế (vài trăm đến vài nghìn dòng/tổ chức) đây là cách đơn giản, đúng, hiệu năng chấp nhận được; tránh CTE đệ quy (sẽ là SQL raw).

## 3. File đã tạo/sửa

**Tạo mới** — `backend/src/modules/category/` (đủ 4 lớp, pattern giống hệt Product): domain (entity, repository interface, slug-generator interface), application (DTO×3, mapper, service + spec), infrastructure (generator + spec, Prisma repository + spec), presentation (controller + spec), `category.module.ts`.
**Tạo mới khác**: `backend/src/common/utils/slugify.util.ts` (+ spec — chuyển từ Product), `backend/test/category.e2e-spec.ts`, migration `20260714040000_category_module`.
**Sửa**: `schema.prisma` (Category: +description/+imageUrl, status→isActive), `app.module.ts` (đăng ký `CategoryModule`), `error-codes.ts` (+CATEGORY_xxx, +BRAND_xxx/UNIT_xxx/BARCODE_xxx chuẩn bị sẵn cho 018-020), `permission-catalog.ts` (+category:restore), Product module's `slugify-slug.generator.ts` (đổi import sang `common/utils/`).

## 4. Migration

`20260714040000_category_module`: cột `categories` đổi `status`→bỏ, thêm `description`, `imageUrl`, `isActive`.

## 5. API

| Method | Path | Permission |
|---|---|---|
| POST | `/api/v1/categories` | `category:create` |
| GET | `/api/v1/categories` | `category:view` |
| GET | `/api/v1/categories/tree` | `category:view` |
| GET | `/api/v1/categories/:id` | `category:view` |
| PATCH | `/api/v1/categories/:id` | `category:update` |
| DELETE | `/api/v1/categories/:id` | `category:delete` |
| POST | `/api/v1/categories/:id/restore` | `category:restore` |

Xác nhận qua Swagger generation offline: 22 route tổng, đúng 4 path Category (route `tree` đặt trước `:id` trong controller — xác nhận Nest match đúng, không bị `:id` "nuốt" `tree`).

## 6. Test

- **Unit**: 165/165 PASS toàn backend (tăng từ 115). Category-specific: create (+ chặn parentId không tồn tại), list, findOne, getTree (3 cấp + node mồ côi), update (+ sinh lại slug, + chặn tự làm cha chính mình, + chặn vòng lặp cháu làm cha, + cho phép đổi nhánh hợp lệ), remove (+ chặn khi còn Product), restore (+ chặn khi chưa xóa). Controller: permission metadata `it.each` cho 7 method. DTO validation.
- **Coverage module `category/`** (loại trừ DTO/entity/interface/module wiring): **95.97% statement, 100% function, 98.05% line, 82.03% branch** — vượt 90%.
- **Integration**: `test/category.e2e-spec.ts` — dựng cây qua API thật, từ chối circular reference (422), chặn xóa khi còn Product (422), vòng đời xóa mềm/khôi phục qua HTTP thật. **Chưa xác nhận PASS** (thiếu Docker, cùng lý do Prompt 016).
- Build/Lint/TypeCheck/Prisma validate: tất cả PASS.

## 7. Self-Review

Không còn TODO/FIXME/console.log/any thừa (đã `grep` xác nhận). Clean Architecture giữ nguyên layering. Không phát sinh circular dependency (`CategoryModule → ProductModule, RbacModule` một chiều; `ProductModule`/`RbacModule` không import ngược). Multi-tenant isolation giữ nguyên (mọi query lọc `organizationId`). Rủi ro hiệu năng: `getTree`/circular-check tải toàn bộ category flat list mỗi lần gọi — chấp nhận được ở quy mô danh mục hiện tại, cần cache nếu tổ chức có hàng chục nghìn category.

**Definition of Done đạt được** (trừ Integration Test PASS thật — cùng giới hạn Gate B đã biết). Tiếp tục Prompt 018.
