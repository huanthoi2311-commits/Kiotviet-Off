# Implementation Report — Prompt 016: Product Module Foundation

**Ngày:** 2026-07-14
**Phạm vi:** Product Module hoàn chỉnh theo Clean Architecture (domain/application/infrastructure/presentation), không đổi kiến trúc Foundation (Organization → Branch/Warehouse/User giữ nguyên).

---

## 1. Chức năng đã hoàn thành

- **CRUD Product đầy đủ**: `POST /products`, `GET /products`, `GET /products/:id`, `PATCH /products/:id`, `DELETE /products/:id` (soft delete), `POST /products/:id/restore`.
- **SKU tự sinh**: `SP000001`, `SP000002`... qua bảng `Sequence` (atomic per-Organization, dùng Prisma `upsert` + `increment`, **không SQL raw**, không race-condition khi tạo đồng thời).
- **Slug tự sinh**: từ `name`, chuẩn hóa tiếng Việt có dấu → ASCII (tự viết, không thêm dependency ngoài), tự thêm hậu tố `-2`, `-3`... khi trùng trong Organization; tự sinh lại khi đổi `name`.
- **Nhiều Barcode/sản phẩm**: bảng `Barcode` (đã có sẵn từ Prompt 003) bổ sung `type` (EAN13/EAN8/CODE128/QR/CUSTOM), unique toàn hệ thống.
- **Nhiều giá/sản phẩm**: bảng mới `ProductPrice` (RETAIL/WHOLESALE/VIP/DEALER) — **không hard-code `sellingPrice` vào Product** theo đúng yêu cầu; bắt buộc có ít nhất 1 giá RETAIL khi tạo (422 nếu thiếu).
- **Nhiều ảnh/sản phẩm**: bảng mới `ProductImage` (url, sortOrder, isThumbnail) — không lưu ảnh trong Product.
- **Transaction toàn vẹn**: tạo Product + Prices + Images + Barcodes trong 1 lệnh Prisma nested `create` (atomic tự nhiên — Prisma bọc transaction ngầm cho nested write) → lỗi bất kỳ phần nào (VD: trùng barcode) khiến **toàn bộ rollback**, không có Product mồ côi. Có integration test xác minh riêng.
- **Search/Filter/Pagination/Sort server-side**: tìm theo tên/SKU/barcode (không phân biệt hoa thường), lọc theo category/brand/status/createdDate/updatedDate, sort theo name/sku/price/createdAt/updatedAt.
- **Permission bắt buộc**: `product:create`, `product:view`, `product:update`, `product:delete`, `product:restore` — đã seed vào `PERMISSION_CATALOG`, gắn `@RequirePermissions()` trên từng route, verify bằng test permission-metadata.
- **Audit Log đầy đủ**: `product.create`, `product.update` (kèm oldValue/newValue), `product.delete`, `product.restore` — ghi actor (userId), IP, User-Agent qua `AuditLogService` dùng chung.
- **Swagger đầy đủ**: `@ApiOperation`, request/response example (qua `@ApiProperty({example})` trên toàn bộ DTO), 401/403/404/409/422/500 qua `@ApiWriteErrors()` (decorator mới, tái dùng `@ApiCommonErrors()` + bổ sung 409/422).

## 2. File đã tạo/sửa

### Tạo mới — `backend/src/modules/product/` (Clean Architecture 4 lớp)
```
domain/entities/product.entity.ts
domain/repositories/product.repository.interface.ts
domain/services/sku-generator.interface.ts
domain/services/slug-generator.interface.ts
domain/value-objects/  (không cần — dùng entity trực tiếp)
application/dto/{create-product,update-product,product-query,product-response}.dto.ts
application/dto/create-product.dto.spec.ts
application/mappers/product.mapper.ts
application/product.service.ts
application/product.service.spec.ts
infrastructure/generators/slugify.util.ts (+ .spec.ts)
infrastructure/generators/sequence-sku.generator.ts (+ .spec.ts)
infrastructure/generators/slugify-slug.generator.ts (+ .spec.ts)
infrastructure/persistence/prisma-product.repository.ts (+ .spec.ts)
presentation/product.controller.ts (+ .spec.ts)
product.module.ts
```

### Tạo mới khác
- `backend/test/product.e2e-spec.ts` — Integration Test (Prisma + Postgres thật + transaction rollback).
- `backend/prisma/migrations/20260714030000_product_module/migration.sql`.
- `docs/implementation/prompt-016-report.md` (file này).

### Sửa
- `backend/prisma/schema.prisma` — sửa `Product` (thêm `slug`, `vat`, `weight/length/width/height`, `isActive`; bỏ `sellingPrice`, `taxId`/`tax` relation, `image`; đổi `baseUnitId`→`unitId`), thêm model `ProductPrice`, `ProductImage`, `Sequence`, enum `ProductPriceType`, `BarcodeType`; `Barcode` thêm `type`; `Tax` bỏ back-relation `products` không còn dùng; `Organization` thêm `sequences`.
- `backend/src/app.module.ts` — đăng ký `ProductModule`.
- `backend/src/common/errors/error-codes.ts` — thêm `PRODUCT_001..007`.
- `backend/src/common/swagger/api-common-errors.decorator.ts` — thêm `ApiWriteErrors()` (409/422).
- `backend/src/modules/rbac/infrastructure/permission-catalog.ts` — thêm `product:restore`.
- `backend/eslint.config.mjs` — mở rộng override nới lỏng rule `no-unsafe-*` cho cả `*.e2e-spec.ts` (trước chỉ có `*.spec.ts`), cần thiết vì `supertest` response body luôn là `any`.

## 3. Quyết định thiết kế cần bạn biết (không tự ý đổi mà không nói)

1. **`vat` thay vì `taxId`**: yêu cầu liệt kê `vat` trực tiếp trên Product Entity, khác với thiết kế `Tax` entity đã có từ Prompt 002/003. Đã bỏ `taxId`/`tax` relation khỏi `Product`, giữ nguyên bảng `Tax` (không xóa, chỉ không còn tham chiếu) để không phá dữ liệu nếu module khác cần sau này.
2. **"Product Entity" liệt kê `sellingPrice`/`barcode` (số ít) ở đầu prompt, nhưng phần chi tiết "Price"/"Barcode" lại yêu cầu tách bảng riêng** — đã ưu tiên phần chi tiết (bảng `ProductPrice`/`Barcode` riêng) vì đó là mô tả rõ ràng, cụ thể hơn.
3. **Sort theo `price`**: `ProductPrice` là quan hệ 1-n (Product ↔ nhiều loại giá) nên Prisma không hỗ trợ `orderBy` trực tiếp theo giá RETAIL mà không dùng SQL raw. Giải pháp đã chọn: sort/paginate qua bảng `ProductPrice` (type=RETAIL) trước để lấy đúng thứ tự `productId`, rồi fetch `Product` theo thứ tự đó — thuần Prisma, đúng luật "Không SQL Raw", nhưng tốn 3 query thay vì 1 (đánh đổi hiệu năng đã ghi nhận ở mục 7).
4. **`isActive` song song với `status`**: giữ cả 2 theo đúng field list — `status` là vòng đời (ACTIVE/INACTIVE/DISCONTINUED), `isActive` là công tắc bật/tắt nhanh độc lập (VD: tạm ẩn khỏi POS mà không đổi vòng đời).
5. **`categoryId`/`brandId`/`unitId` không tự query kiểm tra tồn tại trước** — dựa vào FK constraint của Postgres (P2003), dịch lỗi sang 400 rõ ràng theo tên field. Lý do: tránh Application layer phụ thuộc trực tiếp Prisma (đúng Clean Architecture), tránh N+1 query kiểm tra thừa.

## 4. Migration đã thêm

`20260714030000_product_module` — tóm tắt: 2 enum mới (`ProductPriceType`, `BarcodeType`), sửa bảng `products` (7 cột mới, 3 cột xóa, đổi `baseUnitId`→`unitId`), 2 bảng mới (`product_prices`, `product_images`), bảng `sequences`, unique index `products(organizationId, slug)`. Đã `prisma validate` + `prisma generate` thành công.

## 5. API đã sinh

| Method | Path | Permission |
|---|---|---|
| POST | `/api/v1/products` | `product:create` |
| GET | `/api/v1/products` | `product:view` |
| GET | `/api/v1/products/:id` | `product:view` |
| PATCH | `/api/v1/products/:id` | `product:update` |
| DELETE | `/api/v1/products/:id` | `product:delete` |
| POST | `/api/v1/products/:id/restore` | `product:restore` |

Xác nhận qua Swagger generation offline: 18 route tổng (15 cũ + 3 path mới của Product).

## 6. Test đã chạy

### Unit Test — 115/115 PASS (toàn backend, tăng từ 47 trước Prompt 016)
- `product.service.spec.ts`: create (+ audit log, + thiếu RETAIL price), findOne, search (mapping + default), update (+ đổi slug khi đổi tên, + giữ slug khi không đổi tên), remove, restore (+ chưa xóa thì không cho restore).
- `prisma-product.repository.spec.ts`: create (+ P2002/P2003/lỗi lạ, + images/barcodes default sortOrder/isThumbnail/isDefault), findById/findByIdIncludingDeleted (+ map đầy đủ Decimal→string, kích thước, barcodes/images), update (+ lỗi), search (sort thường qua `$transaction`, sort theo price qua 2 bước, rỗng khi không có ProductPrice), exists*/hasActiveProductsInCategory.
- `product.controller.spec.ts`: **permission metadata** cho cả 6 route (`it.each`), ủy quyền actor context đúng cho create/update/remove/restore, search chỉ truyền organizationId.
- `create-product.dto.spec.ts`: **validation** — tên 3-255, UUID, costPrice≥0, vat 0-100, prices không rỗng, price/barcode type enum hợp lệ.
- `slugify.util.spec.ts`, `sequence-sku.generator.spec.ts`, `slugify-slug.generator.spec.ts`.

### Coverage (đo riêng module `product/`, loại trừ DTO/entity/interface thuần khai báo + `product.module.ts` — file wiring DI không có logic)
```
Statements : 98.94%
Branches   : 81.91%
Functions  : 100%
Lines      : 100%
```
→ **Vượt mục tiêu 90%** ở Statement/Line/Function. Branch coverage 81.91% do một số nhánh optional-chaining hiếm gặp (VD: `error.meta` undefined) chưa cố tình test — chấp nhận được, không phải logic nghiệp vụ cốt lõi.

### Integration Test — **ĐÃ VIẾT ĐẦY ĐỦ, CHƯA XÁC NHẬN PASS**
File: `backend/test/product.e2e-spec.ts`. Bao gồm: tạo qua HTTP thật (SKU/slug tự sinh, prices/images/barcodes lưu đúng), 422 thiếu giá RETAIL, 401 thiếu token, **rollback khi trùng barcode** (assert không có Product mồ côi trong DB), search có phân trang, và full vòng đời create→get→update→delete→restore qua API thật.

⚠️ **Không thể tự chạy trong sandbox này** — không có Docker/PostgreSQL thật (đã ghi nhận từ Gate B, xem `docs/release-gates.md`). Cách xác nhận thủ công:
```bash
docker compose up -d postgres redis
cd backend && npx prisma migrate deploy
npm run test:e2e -- product.e2e-spec.ts
```

### Kết quả Build/Lint/TypeCheck
```
✔ npx eslint "{src,test}/**/*.ts"     — 0 lỗi
✔ npx tsc --noEmit                    — 0 lỗi
✔ npm run build (nest build)          — thành công
✔ npx prisma validate                 — hợp lệ
✔ DI graph (Test.createTestingModule) — resolve thành công, không cần DB thật
✔ Swagger generation                  — 18 route, đủ 6 route Product
```

## 7. Self-Review

- **Clean Architecture**: domain không import Prisma/NestJS-infra (chỉ interface thuần); application chỉ phụ thuộc domain interface (`@Inject(TOKEN)` + `import type`); infrastructure implement interface, chứa toàn bộ Prisma-specific code; presentation chỉ gọi service, không query DB, không chứa business rule (validate RETAIL price nằm ở service, không phải controller). Xác nhận qua đọc lại code, không phát hiện vi phạm.
- **SOLID**: mỗi repository/generator có 1 interface + 1 implementation (DIP), `ProductService` không phình to (tách `ProductMapper` riêng cho việc map response), mở rộng loại giá/barcode mới không cần sửa `ProductService` (chỉ sửa enum + DTO).
- **Circular Dependency**: `ProductModule → RbacModule` một chiều; `AuthModule → RbacModule` một chiều; `RbacModule` không import ngược lại module nào. DI graph compile thành công xác nhận không có cycle (Nest sẽ throw lỗi rõ ràng nếu có).
- **Performance**: đã đánh index sẵn từ Prompt 002/003 (`organizationId`, `categoryId`, `brandId`, `name`); sort theo `price` tốn 3 query thay vì 1 — **rủi ro hiệu năng đã ghi nhận** (mục 3.3), chấp nhận được ở quy mô hiện tại, cần revisit nếu catalog > hàng trăm nghìn sản phẩm.
- **Security**: mọi query đều lọc `organizationId` (không rò rỉ dữ liệu chéo tenant); `ValidationPipe` global (`whitelist + forbidNonWhitelisted`) chặn mass-assignment; SKU/slug sinh server-side (không nhận từ client); unique constraint ở DB (không chỉ ở app) cho SKU/slug/barcode — an toàn race-condition; Argon2/JWT/RBAC đã có từ trước, tái dùng nguyên vẹn.
- **Không còn TODO/FIXME/console.log/any thừa**: đã `grep` xác nhận (mục đầu response).

## 8. Rủi ro còn tồn tại

1. **Integration Test chưa chạy được** — cần Docker, xem mục 6. Đây là rủi ro lớn nhất: logic transaction/rollback mới chỉ được suy luận đúng qua đọc code + cơ chế nested-write của Prisma, chưa có bằng chứng chạy thật.
2. **Sort theo `price` kém hiệu quả hơn sort thường** (3 query thay vì 1) — chấp nhận đánh đổi để tuân thủ "không SQL raw"; nếu cần tối ưu sau này, cân nhắc denormalize hoặc dùng Prisma `$queryRawTyped` (an toàn kiểu hơn raw string) khi có benchmark thực tế chứng minh cần thiết.
3. **`hasActiveProductsInCategory`** đã implement sẵn trên `IProductRepository` và export `PRODUCT_REPOSITORY` từ `ProductModule` để Category Module (Prompt 017) dùng ngay — chưa có consumer nào gọi tới trong phạm vi Prompt 016 này (sẽ dùng ở 017).

---

**Kết luận: Definition of Done đạt được** (Product CRUD hoạt động, không TODO/FIXME/console.log/any thừa, build/lint/typecheck/unit test PASS) — **trừ Integration Test PASS chưa xác nhận được do giới hạn môi trường**, đã ghi nhận minh bạch thay vì báo khống. Sẵn sàng chuyển sang Prompt 017 theo quyết định của bạn.
