# Brand — Dependency Audit (T007 kickoff, trước RFC-0003)

**Yêu cầu:** `ARCHITECT DECISION – CLOSE T006 & START SPRINT T007` (Decision T007-04) — khảo sát hệ thống hiện có, không đề xuất giải pháp, không thiết kế.
**Phạm vi:** Dependency Graph, Repository Boundary, Multi Tenant Review, Existing API, Existing Database, Existing Permission, Existing Tests, Existing DTO, Existing Validation, Existing Business Rules, Existing Swagger, Existing Technical Debt, Impact Analysis, Open Questions.
**Phương pháp:** đọc trực tiếp code/schema hiện tại — `backend/src/modules/brand/`, `backend/prisma/schema.prisma`, `backend/src/modules/rbac/infrastructure/permission-catalog.ts`, grep word-boundary-safe toàn `backend/src`, chạy test suite thật.
**Không thay đổi code. Không commit. Không đề xuất giải pháp/thiết kế — chỉ khảo sát và báo cáo phát hiện.**

---

## 1. Dependency Graph

### 1.1 Phụ thuộc qua DI

Grep `\bBrandModule\b` toàn `backend/src`: chỉ xuất hiện ở `app.module.ts` (đăng ký gốc) và `product-repository-boundary.architecture.spec.ts` (T005, xác nhận `BrandModule` import `ProductModule` — chiều Brand→Product, không phải module khác phụ thuộc Brand).

Grep `\bBRAND_REPOSITORY\b|\bIBrandRepository\b` toàn `backend/src`: **0 kết quả** bên ngoài chính `brand` module. Không có module nào bên ngoài inject trực tiếp.

### 1.2 Phụ thuộc qua Schema (Prisma FK)

Chỉ 1 model tham chiếu `Brand`: **`Product.brandId`** (`schema.prisma:807-808`). Khác `Category`: `brandId` là **`String?` (optional)** với **`onDelete: SetNull`** (không phải `Restrict` như `categoryId`) — 1 Product có thể tồn tại KHÔNG có Brand, và về mặt DB, xóa cứng 1 Brand sẽ tự động set `brandId = NULL` trên Product liên quan (không bị chặn ở tầng DB như Category).

### 1.3 Chiều phụ thuộc ngược — Brand → Product

`brand.module.ts` import `ProductModule`; `BrandService.remove()` gọi `ProductDomainService.hasActiveProductsInBrand(id)` — đúng chuẩn `ProductDomainService` (không dùng `PRODUCT_REPOSITORY` trực tiếp), khớp trạng thái sau T005.

### 1.4 Bảng tổng hợp

| Module | Chiều | Cơ chế | Ghi chú |
|---|---|---|---|
| `product` (schema FK) | Product → Brand | `Product.brandId`, **optional**, `SetNull` | Khác Category (bắt buộc, `Restrict`) |
| `product` (DI, chiều ngược) | Brand → Product | `ProductDomainService.hasActiveProductsInBrand()` | Đúng chuẩn T005 |
| (không module nào khác) | — | — | Brand hiện là "lá" trong dependency graph, giống Category trước T006 |

### 1.5 Circular Dependency

`brand` → `product` (1 chiều), `product` → `rbac` (không có `brand`). Không phát hiện vòng lặp.

## 2. Repository Boundary

- `BrandModule.exports` hiện có `BRAND_REPOSITORY` (`brand.module.ts:16`).
- Consumer bên ngoài: **0** (§1.1).
- Không phát hiện vi phạm ADR-0010 đang hoạt động — cùng trạng thái "sạch vì chưa ai phụ thuộc" như Category trước T006.
- Không có Architecture Test riêng cho ranh giới này (Brand chỉ xuất hiện trong `product-repository-boundary.architecture.spec.ts` của T005 ở chiều xác nhận `BrandModule` import `ProductModule`, không phải bảo vệ export của chính `brand`).

## 3. Multi Tenant Review

- Schema `Brand`: `organizationId String @db.Uuid`, `@@unique([organizationId, code])`, `@@index([organizationId])`.
- Method đọc công khai (`findById`, `search`, `existsByCode`) nhận `organizationId` và lọc đúng ở tầng Repository (`prisma-brand.repository.ts`).
- Method ghi (`update`, `softDelete`) — `prisma-brand.repository.ts:53-79` — chỉ lọc theo `id`, không kèm `organizationId` ở `where`. An toàn tenant phụ thuộc tầng `BrandService` gọi `findById(id, organizationId)` trước — **cùng pattern hệ thống đã ghi nhận ở Category trước T006**, không phải rủi ro riêng của Brand.
- Toàn bộ route trong `brand.controller.ts` truyền `user.organizationId` từ JWT, không nhận từ input.

## 4. Existing API

`brand.controller.ts` — prefix `/brands`, guard `JwtAuthGuard`+`PermissionsGuard`:

| Method | Route | Permission | Ghi chú |
|---|---|---|---|
| `POST` | `/brands` | `brand:create` | |
| `GET` | `/brands` | `brand:view` | search/status/page/limit — **không có sortBy/sortOrder** |
| `GET` | `/brands/:id` | `brand:view` | |
| `PATCH` | `/brands/:id` | `brand:update` | Không có Optimistic Lock (`version`) |
| `DELETE` | `/brands/:id` | `brand:delete` | Xóa mềm, chặn nếu còn Product active |

**Không có `POST /brands/:id/restore`** — khác Category/Product, Brand hiện **không có cơ chế khôi phục sau khi xóa mềm** (xác nhận bằng grep `restore`/`findByIdIncludingDeleted` trong toàn bộ `brand` module: 0 kết quả).

## 5. Existing Database

`model Brand` (`schema.prisma:730-754`):

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id` | `String @id @default(uuid())` | |
| `organizationId` | `String` | FK → `Organization`, `onDelete: Restrict` |
| `code`, `name` | `String` | `code` unique theo `(organizationId, code)` |
| `logo`, `description`, `website`, `country` | `String?` | |
| `status` | **`CommonStatus`** | `@default(ACTIVE)` — enum DÙNG CHUNG (xem dưới) |
| `createdBy`/`updatedBy`/`createdAt`/`updatedAt`/`deletedAt` | | Soft-delete qua `deletedAt` |

Constraint: `@@unique([organizationId, code])`, `@@index([organizationId])`. Quan hệ: `products Product[]` (1-n, phía Product giữ FK).

**`status: CommonStatus` (`ACTIVE`/`INACTIVE`, 2 giá trị) — enum này KHÔNG dành riêng cho Brand.** Grep toàn `schema.prisma`: `CommonStatus` được dùng bởi **5 model**: `Warehouse` (dòng 452), `Tax` (788), `Brand` (741), `Supplier` (1109), `Customer` (1717). Không có cột `version`. Không có `isActive` boolean riêng (khác Category/Product — Brand chỉ có 1 field `status` duy nhất, không có cờ bật/tắt nhanh tách biệt). Không có `parentId`/cấu trúc cây (Brand phẳng, không phân cấp).

## 6. Existing Permission

`permission-catalog.ts:62` — `crud('brand', 'thương hiệu')` (KHÔNG có tham số `extra` thứ 3, khác `category`/`product` vốn có `['restore']`) — sinh ra đúng 4 permission:

| Code | Mô tả |
|---|---|
| `brand:view` | Xem thương hiệu |
| `brand:create` | Tạo thương hiệu |
| `brand:update` | Sửa thương hiệu |
| `brand:delete` | Xóa thương hiệu |

**Không có `brand:restore`** — khớp đúng với việc không có route/method restore nào tồn tại (§4).

## 7. Existing Tests

Chạy `jest src/modules/brand --coverage` thật:

- **4 test suite / 38 test case, 100% PASS.**
- File có test: `brand.service.spec.ts`, `create-brand.dto.spec.ts`, `prisma-brand.repository.spec.ts`, `brand.controller.spec.ts`.
- File không có test riêng: `brand.module.ts` (cùng lý do đã ghi nhận ở Product/Category — không ai `import` tĩnh để đọc metadata), `update-brand.dto.ts`, `brand-query.dto.ts` (không có `.spec.ts` riêng — cùng dạng khoảng trống nhỏ đã ghi nhận ở Category).
- Coverage: **91.41% statements / 83.33% branch / 93.1% funcs / 93.33% lines**. Thấp nhất: `brand.module.ts` (0%), `brand-query.dto.ts` (69.23% stmts — 2 dòng chưa cover).

## 8. Existing DTO

- `CreateBrandDto`/`UpdateBrandDto`: `code`, `name`, `logo`, `description`, `website`, `country`, `status` (`'ACTIVE'|'INACTIVE'` literal union, không import từ `BrandStatus` type — khai báo lặp lại `const BRAND_STATUSES = ['ACTIVE', 'INACTIVE'] as const` ở CẢ 3 file DTO thay vì dùng chung 1 nguồn).
- `BrandQueryDto`: `search`, `status`, `page`, `limit` — **không có `sortBy`/`sortOrder`, không có `parentId`/`isActive`** (Brand không có 2 khái niệm này).
- `BrandResponseDto`: không có `deletedAt`, không có `version` (khác `CategoryResponseDto` có cả 2).

## 9. Existing Validation

- `code`: `@Length(1, 50)`. `name`: `@Length(2, 255)`. `website`: `@IsUrl()` (validate format URL — không có ở Category/Product). `status`: `@IsEnum(BRAND_STATUSES)`.
- Không có validate nào cho quan hệ cha-con (Brand không có `parentId`).
- Không có validate Optimistic Lock (`version` không tồn tại).
- Không có ràng buộc DB-level nào khác ngoài `@@unique([organizationId, code])` (không có tương đương "slug unique" như Category).

## 10. Existing Business Rules

- **`remove()` chặn nếu còn Product active** (`hasActiveProductsInBrand`) — đúng mẫu Category, dùng `ProductDomainService`.
- Không có rule nào khác (không circular reference check — không có cấu trúc cây; không có rule liên quan Variant/Product Type).
- Không có logic nào tương đương "Archive đệ quy"/"Restore theo chuỗi tổ tiên" của Category — vì Brand không phân cấp và không có restore.

## 11. Existing Swagger

- Đầy đủ `@ApiOperation`/`@ApiResponse`/`@ApiWriteErrors`/`@ApiCommonErrors` cho 5 route hiện có — mô tả ngắn gọn, không có ghi chú chi tiết về guard/behavior đặc biệt (vì hiện tại không có guard phức tạp nào để mô tả, khác Category sau T006).
- `@ApiProperty` trên DTO đầy đủ, có `example` cho hầu hết field.

## 12. Existing Technical Debt

1. **Không có cơ chế Restore** — xóa mềm là một chiều, không thể khôi phục qua API (khác biệt lớn nhất so với Category/Product).
2. **`status: CommonStatus` dùng chung với 4 model khác** (`Warehouse`, `Tax`, `Supplier`, `Customer`) — bất kỳ thay đổi nào vào enum này (vd mở rộng thêm giá trị) sẽ ảnh hưởng cả 5 model, không chỉ Brand.
3. **Không có `version`** (Optimistic Lock) — không có bảo vệ compare-and-swap khi 2 request cùng sửa 1 Brand đồng thời.
4. **`BrandQueryDto` không có `sortBy`/`sortOrder`** — `search()` hard-code `orderBy: { name: 'asc' }` (`prisma-brand.repository.ts:100`), không thể đổi.
5. **`BRAND_STATUSES` khai báo lặp lại độc lập ở 3 file DTO** (`create-brand.dto.ts`, `update-brand.dto.ts`, `brand-query.dto.ts`) thay vì dùng chung 1 nguồn — rủi ro lệch danh sách nếu sửa 1 nơi quên nơi khác.
6. **`docs/architecture/dependency-graph.md:105`** vẫn ghi "5 module này chỉ import để lấy `PRODUCT_REPOSITORY` (đọc)" — đã lỗi thời từ T005 (đã ghi nhận ở Category audit trước, vẫn chưa được cập nhật).
7. Không có `update-brand.dto.spec.ts`/`brand-query.dto.spec.ts` riêng.
8. Không tìm thấy `TODO`/`FIXME` trong toàn bộ `brand` module.

## 13. Impact Analysis

- **Nếu thay đổi schema `Brand`**: ảnh hưởng trực tiếp đúng 1 model khác — `Product` (qua FK `brandId`, optional/`SetNull` — phạm vi ảnh hưởng NHỎ HƠN Category vì quan hệ không bắt buộc).
- **Nếu đổi kiểu `status` của Brand** (vd sang enum riêng 4 giá trị như `ProductStatus`/`CategoryStatus`): **không thể sửa trực tiếp `CommonStatus`** mà không ảnh hưởng `Warehouse`/`Tax`/`Supplier`/`Customer` — đây là điểm khác biệt cấu trúc quan trọng nhất so với Category (vốn đã có `CategoryStatus` enum RIÊNG ngay từ đầu, không dùng chung).
- **Nếu thêm Restore cho Brand**: cần đồng thời — method Repository mới (`restore`, `findByIdIncludingDeleted`), method Service mới, route Controller mới, permission `brand:restore` mới trong catalog — đúng bộ 4 thay đổi đã làm cho Category ở T006.
- **Nếu thêm `version` (Optimistic Lock)**: cần migration thêm cột, đổi chữ ký `update()` — đúng mẫu đã áp dụng 2 lần (Product T005, Category T006).
- **Nếu thêm `sortBy`/`sortOrder` vào `BrandQueryDto`**: chỉ cần sửa trong phạm vi `brand` module (DTO + Repository `search()`), không ảnh hưởng module khác.
- **Không có tác động tới cấu trúc cây/Variant** — Brand không phân cấp, không có khái niệm tương đương "Variant Parent/Child" của Product cần đồng bộ chéo module.

## 14. Open Questions (không tự trả lời, để RFC-0003 quyết định)

1. Brand có cần `status` 4 giá trị (`DRAFT`/`ACTIVE`/`INACTIVE`/`ARCHIVED`, đúng mẫu Product/Category) hay giữ nguyên 2 giá trị (`ACTIVE`/`INACTIVE`) và chỉ thêm khái niệm Archive qua `deletedAt`+Restore (không cần thêm giá trị status mới)?
2. Nếu Brand cần enum status riêng — có tách khỏi `CommonStatus` (tạo `BrandStatus` enum mới, không đụng tới 4 model khác đang dùng chung) hay có ý định đồng bộ hóa `CommonStatus` cho cả 5 model cùng lúc (phạm vi lớn hơn nhiều, vượt ngoài Brand)?
3. Brand có cần `version` (Optimistic Lock) đúng chuẩn đã thiết lập ở Product/Category không, hay đây là chuẩn CHỈ áp dụng cho model có cấu trúc phức tạp hơn (có cây/guard nghiệp vụ nhiều bước)?
4. Brand có cần cơ chế Restore đầy đủ (route + permission + guard tương tự Category) không — và nếu có, Restore có cần guard nghiệp vụ nào tương tự "Archive Rule"/"Restore Rule" của Category, hay đơn giản chỉ là đảo ngược `deletedAt`?
5. `Product.brandId` hiện là `optional`/`SetNull` (khác `categoryId` bắt buộc/`Restrict`) — đây có phải thiết kế cố ý cần giữ nguyên (1 Product có thể không có Brand) hay là điểm cần xem lại?
6. `BrandQueryDto` có cần bổ sung `sortBy`/`sortOrder` để khớp đúng chuẩn Query Parameter thống nhất đã chốt ở Decision IP01 (Category) không — vì Decision T007-06 yêu cầu Brand kế thừa "API Query Convention" từ Product/Category?

## 15. Kết luận

Brand hiện là module "sạch" về Repository Boundary (chưa ai phụ thuộc runtime), Multi-tenant đúng chuẩn, không TODO/FIXME. Khác biệt cấu trúc rõ rệt nhất so với Category: (a) không phân cấp (không `parentId`), (b) không có Restore, (c) `status` dùng enum CHUNG với 4 model khác thay vì enum riêng, (d) `brandId` trên Product là quan hệ optional/`SetNull` thay vì bắt buộc/`Restrict`. Các khác biệt này không phải lỗi — có thể là thiết kế cố ý cho 1 domain đơn giản hơn Category — nhưng là điểm RFC-0003 cần quyết định rõ trước khi chuẩn hóa theo Decision T007-06 ("Brand phải kế thừa toàn bộ tiêu chuẩn đã chuẩn hóa từ Product và Category").

Không có phát hiện nào đủ nghiêm trọng để chặn việc chờ RFC-0003.
