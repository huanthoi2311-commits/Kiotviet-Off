# Implementation Report — Prompt 018: Brand Module

**Ngày:** 2026-07-14
**Phạm vi:** Brand Module (thương hiệu) theo Clean Architecture, tái dùng nguyên vẹn kiến trúc Foundation (Product/Category).

## 1. Chức năng đã hoàn thành

- **CRUD Brand đầy đủ**: `POST/GET/PATCH/DELETE /brands`, `GET /brands/:id`. **Không có `restore`** — đúng theo phạm vi Prompt 018 (chỉ liệt kê `brand:create/view/update/delete`, không có `restore` như Category).
- **Search/Filter/Pagination**: tìm theo `name`/`code` (không phân biệt hoa thường), lọc theo `status` (ACTIVE/INACTIVE), phân trang `page`/`limit`.
- **Chặn xóa khi còn Product**: `BrandService.remove()` gọi `IProductRepository.hasActiveProductsInBrand()` (bổ sung vào `IProductRepository`/`PrismaProductRepository` ở Prompt 018, theo đúng pattern `hasActiveProductsInCategory` đã có từ Prompt 017) → 422 `BRAND_HAS_PRODUCTS` nếu còn sản phẩm.
- **Soft Delete** (không restore): `deletedAt` set khi xóa, loại khỏi mọi truy vấn `findById`/`search`.
- **Permission**: `brand:create/view/update/delete` (đã có sẵn trong catalog từ Prompt 016, không cần thêm mới).
- **Audit Log**: create (newValue)/update (oldValue+newValue)/delete (oldValue) — snapshot `{code, name, status}`.
- **Swagger**: đầy đủ, tái dùng `ApiWriteErrors()`/`ApiCommonErrors()`.
- **Validation**: `website` bắt buộc là URL hợp lệ (`@IsUrl`) nếu có; `code` 1-50 ký tự; `name` 2-255 ký tự; `status` giới hạn enum ACTIVE/INACTIVE.

## 2. Quyết định thiết kế

1. **Không có endpoint `restore`**: Prompt 018 liệt kê permission `brand:create/view/update/delete` — không có `restore` (khác Category ở Prompt 017 có `category:restore`). Repository interface (`IBrandRepository`) vì vậy cũng không có `restore()`/`findByIdIncludingDeleted()`, giữ đúng phạm vi thay vì thêm khả năng chưa được yêu cầu.
2. **`hasActiveProductsInBrand`/`hasActiveProductsInUnit` thêm vào `IProductRepository` ngay trong Prompt 018** (dù `hasActiveProductsInUnit` chỉ thật sự dùng ở Prompt 019): làm cùng lúc vì cùng pattern `findFirst({where:{xId, deletedAt:null}})` với `hasActiveProductsInCategory` đã có, tránh phải sửa lại `IProductRepository`/mock test 2 lần liên tiếp cho hai prompt liền kề. Không phải thêm tính năng mới ngoài phạm vi — cả hai đều là hệ quả trực tiếp của "Brand/Unit module cần chặn xóa khi còn Product" đã nêu trong chính văn bản Prompt 018/019.
3. **`existsByCode` giữ trong interface nhưng chưa được `BrandService` gọi**: dự phòng đúng theo pattern Category (`existsBySlug` cũng tồn tại trong interface phục vụ repository-level duplicate check), validate trùng lặp thực tế được đảm bảo qua unique constraint DB (P2002 → 409) — nhất quán với cách Product/Category đã làm, không thêm round-trip kiểm tra thừa trước khi ghi.

## 3. File đã tạo/sửa

**Tạo mới** — `backend/src/modules/brand/` (đủ 4 lớp, pattern giống hệt Category): domain (entity, repository interface), application (DTO×3 + response DTO, mapper, service + spec + DTO validation spec), infrastructure (Prisma repository + spec), presentation (controller + spec), `brand.module.ts`.
**Tạo mới khác**: `backend/test/brand.e2e-spec.ts`, migration `20260714050000_brand_module`.
**Sửa**: `schema.prisma` (Brand: +description/+website/+country), `app.module.ts` (đăng ký `BrandModule`), `IProductRepository`/`PrismaProductRepository` (+`hasActiveProductsInBrand`, +`hasActiveProductsInUnit` cùng spec), `product.service.spec.ts` (mock bổ sung 2 method mới để khớp `jest.Mocked<IProductRepository>`).

## 4. Migration

`20260714050000_brand_module`: `ALTER TABLE "brands" ADD COLUMN "country" TEXT, ADD COLUMN "description" TEXT, ADD COLUMN "website" TEXT;` — chỉ thêm cột nullable, không phá dữ liệu hiện có.

## 5. API

| Method | Path | Permission |
|---|---|---|
| POST | `/api/v1/brands` | `brand:create` |
| GET | `/api/v1/brands` | `brand:view` |
| GET | `/api/v1/brands/:id` | `brand:view` |
| PATCH | `/api/v1/brands/:id` | `brand:update` |
| DELETE | `/api/v1/brands/:id` | `brand:delete` |

Xác nhận qua Swagger generation offline (`Test.createTestingModule({imports:[AppModule]}).compile()` + `SwaggerModule.createDocument`): **24 route tổng**, đúng 2 path `/brands` (`POST,GET`) và `/brands/{id}` (`GET,PATCH,DELETE`). DI graph resolve thành công, không phát hiện circular dependency.

## 6. Test

- **Unit**: **205/205 PASS** toàn backend (tăng từ 165 sau Prompt 017). Brand-specific (38 test): service (create+audit log, findOne+404, search, update+audit log, remove+chặn khi còn Product+404), Prisma repository (create+P2002→409+lỗi không xác định, findById, update+P2002, softDelete, search+có/không search text, existsByCode+loại trừ excludeId), controller (permission metadata `it.each` cho 5 method, ủy quyền actor context đúng), DTO validation (tối thiểu hợp lệ/name ngắn/code rỗng/website sai định dạng/status sai enum/đầy đủ field tùy chọn).
- **Coverage module `brand/`** (loại trừ `.module.ts` — chỉ DI wiring, không có logic): **91.41% statement, 93.1% function, 93.33% line, 83.72% branch** — vượt mốc 90% ở statement/function/line.
- **Integration**: `test/brand.e2e-spec.ts` — tạo/tìm kiếm/chi tiết qua API thật, từ chối trùng `code` (409), chặn xóa khi còn Product (422), cập nhật + xóa mềm qua HTTP thật (204, sau đó GET trả 404). **Chưa xác nhận PASS** — sandbox này không có Docker/PostgreSQL nên không thể tự chạy `npm run test:e2e`; đây là giới hạn môi trường đã biết từ Prompt 016/017 (xem `docs/release-gates.md`, Gate B), không phải claim đã pass.
- Build/Lint/TypeCheck/Prisma validate: tất cả **PASS** (chạy trên toàn repo, không chỉ module Brand).

## 7. Sự cố kỹ thuật trong quá trình thực hiện (minh bạch)

Script kiểm tra DI graph/Swagger (`di-check.ts`, file tạm, đã xóa sau khi dùng) ban đầu bị treo vô thời hạn khi chạy nền: nguyên nhân là script thiếu `process.exit(0)` ở nhánh thành công, trong khi `RedisModule` tạo `ioredis` client kết nối thật (không có Redis trong sandbox) khiến tiến trình Node không bao giờ tự thoát do retry-timer của `ioredis` giữ event loop sống. Đã sửa bằng cách thêm `process.exit(0)` sau khi log kết quả — không liên quan đến logic nghiệp vụ của Brand module, chỉ là lỗi trong script kiểm tra tạm thời.

## 8. Self-Review

Không còn TODO/FIXME/console.log/`any` thừa trong `src/modules/brand/` (đã `grep` xác nhận rỗng). Clean Architecture giữ nguyên layering (domain không phụ thuộc framework; interface được `import type` riêng theo yêu cầu `isolatedModules`). Không phát sinh circular dependency: `BrandModule → ProductModule, RbacModule` một chiều; `ProductModule` không import ngược `BrandModule`. Multi-tenant isolation giữ nguyên (mọi query lọc `organizationId`, `findById` không cho phép truy cập chéo tổ chức). Rủi ro hiệu năng: không phát sinh mới — `search()` dùng `$transaction([findMany, count])` giống Category, có index tự nhiên qua unique `[organizationId, code]`.

**Definition of Done đạt được** (trừ Integration Test PASS thật — cùng giới hạn Gate B đã biết, đã disclose minh bạch). Tiếp tục Prompt 019.
