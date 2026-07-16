# Category — Dependency Audit (T006 kickoff, trước RFC-0002)

**Yêu cầu:** `ARCHITECT DECISION – Governance Clarification` (Decision G04) — khảo sát hệ thống hiện có, không đề xuất RFC/SPEC, không thiết kế.
**Phạm vi:** Dependency Graph, Repository Boundary, Multi Tenant Review, Technical Debt, Existing API, Existing Database, Existing Permission, Existing Tests, Impact Analysis.
**Phương pháp:** đọc trực tiếp code/schema hiện tại — `backend/src/modules/category/`, `backend/prisma/schema.prisma`, `backend/src/modules/rbac/infrastructure/permission-catalog.ts`, grep word-boundary-safe toàn `backend/src`, chạy test suite thật.
**Không thay đổi code. Không commit. Không đề xuất giải pháp/thiết kế — chỉ khảo sát và báo cáo phát hiện.**

---

## 1. Dependency Graph

### 1.1 Phụ thuộc qua DI (NestJS Module import + Repository/Service injection)

Grep `\bCategoryModule\b` toàn `backend/src`: chỉ xuất hiện ở `app.module.ts` (đăng ký gốc) và `category.module.ts` (tự thân). Không có module nghiệp vụ nào khác import `CategoryModule`.

Grep `\bCATEGORY_REPOSITORY\b|\bICategoryRepository\b` toàn `backend/src`: chỉ xuất hiện trong 5 file, tất cả nằm trong chính `category` module (`category.module.ts`, `category.service.ts`+`.spec.ts`, `category.repository.interface.ts`, `prisma-category.repository.ts`). Không có module nào bên ngoài inject trực tiếp.

### 1.2 Phụ thuộc qua Schema (Prisma FK)

Chỉ 1 model tham chiếu `Category`: `Product.categoryId` (`onDelete: Restrict`, `schema.prisma:791-792`). Đối chiếu toàn bộ `schema.prisma`, không model nào khác có FK tới `Category`. (`ExpenseCategory.categoryId` là self-reference của chính `ExpenseCategory` — domain Expense khác, trùng tên field ngẫu nhiên.)

### 1.3 Chiều phụ thuộc ngược — Category → Product

`category.module.ts` import `ProductModule`; `CategoryService.remove()` gọi `ProductDomainService.hasActiveProductsInCategory(id)`. Chiều Category → Product, dùng `ProductDomainService` (không phải `PRODUCT_REPOSITORY` trực tiếp) — khớp trạng thái sau T005 Commit 6.

### 1.4 Bảng tổng hợp

| Module | Chiều | Cơ chế | Trạng thái quan sát được |
|---|---|---|---|
| `product` (schema FK) | Product → Category | `Product.categoryId`, `Restrict` | Không đổi qua T005 |
| `product` (DI, chiều ngược) | Category → Product | `ProductDomainService.hasActiveProductsInCategory()` | Dùng DomainService, không dùng Repository trực tiếp |
| (không module nào khác) | — | — | Không module nào khác phụ thuộc runtime vào Category |

### 1.5 Circular Dependency

`category` → `product` (1 chiều). `product` → `rbac` (không có `category`). Không phát hiện vòng lặp.

## 2. Repository Boundary

- `CategoryModule.exports` hiện có `CATEGORY_REPOSITORY` (`category.module.ts:22`).
- Số lượng consumer bên ngoài module inject `CATEGORY_REPOSITORY`/`ICategoryRepository` trực tiếp: **0** (xác nhận §1.1).
- Không phát hiện vi phạm ADR-0010 đang hoạt động đối với Category.
- Không có Architecture Test tự động nào hiện kiểm tra ranh giới này cho Category (khác với `inventory`/`product` đã có `*.architecture.spec.ts` từ T004/T005).

## 3. Multi Tenant Review

- Schema `Category`: `organizationId String @db.Uuid`, `@@unique([organizationId, code])`, `@@index([organizationId])`.
- Method đọc công khai (`findById`, `findByIdIncludingDeleted`, `listAll`, `existsByCode`, `existsBySlug`) đều nhận `organizationId` làm tham số và lọc ở tầng Repository (`prisma-category.repository.ts:42-139`).
- Method ghi (`update`, `softDelete`, `restore`) — `prisma-category.repository.ts:62-99` — chỉ lọc theo `id` ở câu lệnh Prisma, không kèm `organizationId` trong `where`. Việc xác nhận quyền sở hữu tenant diễn ra ở tầng `CategoryService` (gọi `findById(id, organizationId)` trước khi gọi các method ghi này), không phải constraint ở tầng DB/Repository.
- `getTree()`/`listAll()` load toàn bộ category theo `organizationId` trước khi dựng cây/validate vòng lặp cha-con ở bộ nhớ (`assertNoCircularReference`) — không có bước nào đọc dữ liệu ngoài phạm vi `organizationId` đã lọc.
- Toàn bộ route trong `category.controller.ts` truyền `user.organizationId` (từ JWT) vào Service — không có route nào nhận `organizationId` từ input người dùng.

## 4. Technical Debt

1. `CategoryModule` export `CATEGORY_REPOSITORY` dù hiện tại 0 consumer bên ngoài (§1.1, §2).
2. `docs/architecture/dependency-graph.md:105` — dòng "5 module này chỉ import để lấy `PRODUCT_REPOSITORY` (đọc)" chưa được cập nhật kể từ T005 (lần sửa cuối là T004, commit `fb8628d`) — không khớp trạng thái thực tế hiện tại (`ProductDomainService`).
3. `PrismaCategoryRepository.update()`/`softDelete()`/`restore()` không lọc `organizationId` ở tầng DB (§3) — an toàn hiện tại phụ thuộc hoàn toàn vào tầng Service gọi đúng thứ tự.
4. `Category` không có cột `version` (Optimistic Lock) — không có cơ chế compare-and-swap khi 2 request cùng sửa 1 Category đồng thời.
5. `GET /categories` và `GET /categories/tree` không có tham số phân trang/filter/search — trả toàn bộ danh sách theo `organizationId` trong 1 lần gọi.
6. `update-category.dto.ts` không có file `.spec.ts` riêng (có `create-category.dto.spec.ts`, không có bản tương ứng cho update).
7. `category.module.ts` không có `.spec.ts`/Architecture Test — coverage đo được 0% cho riêng file này (§7).
8. Không tìm thấy `TODO`/`FIXME` trong toàn bộ `category` module.

## 5. Existing API

`category.controller.ts` — prefix `/categories`, guard `JwtAuthGuard`+`PermissionsGuard`, mọi route yêu cầu `Bearer` token:

| Method | Route | Permission | Request | Response |
|---|---|---|---|---|
| `POST` | `/categories` | `category:create` | `CreateCategoryDto` | `201`, `CategoryResponseDto` |
| `GET` | `/categories` | `category:view` | — | `200`, `CategoryResponseDto[]` (phẳng) |
| `GET` | `/categories/tree` | `category:view` | — | `200`, `CategoryTreeResponseDto[]` (cây) |
| `GET` | `/categories/:id` | `category:view` | — | `200`, `CategoryResponseDto` |
| `PATCH` | `/categories/:id` | `category:update` | `UpdateCategoryDto` | `200`, `CategoryResponseDto` |
| `DELETE` | `/categories/:id` | `category:delete` | — | `204` (xóa mềm, chặn nếu còn Product active) |
| `POST` | `/categories/:id/restore` | `category:restore` | — | `201`, `CategoryResponseDto` |

Không có route filter/search/pagination (§4.5). Không có route nào thao tác trực tiếp lên `Product` từ phía Category (chỉ đọc qua `ProductDomainService` nội bộ, không lộ ra API).

## 6. Existing Database

`model Category` (`schema.prisma:686-714`):

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id` | `String @id @default(uuid())` | |
| `organizationId` | `String` | FK → `Organization`, `onDelete: Restrict` |
| `parentId` | `String?` | Self-reference `Category?` (`onDelete: SetNull`) — cây không giới hạn cấp |
| `code`, `name`, `slug` | `String` | `code` unique theo `(organizationId, code)` |
| `description`, `imageUrl` | `String?` | |
| `sortOrder` | `Int @default(0)` | |
| `isActive` | `Boolean @default(true)` | |
| `createdBy`/`updatedBy` | `String?` | |
| `createdAt`/`updatedAt`/`deletedAt` | | Soft-delete qua `deletedAt` |

Constraint: `@@unique([organizationId, code])`, `@@index([organizationId])`, `@@index([parentId])`. Không có `@@unique([organizationId, slug])` (khác với `Product` — `Product` có unique cả `sku` lẫn `slug` theo tenant, `Category` chỉ unique `code`). Quan hệ: `children Category[]` (self), `products Product[]` (1-n, phía Product giữ FK).

Không có cột `version`. Không có migration nào riêng cho `Category` gần đây (không nằm trong 3 migration T005).

## 7. Existing Permission

`permission-catalog.ts:61` — `crud('category', 'danh mục ngành hàng', ['restore'])` sinh ra 5 permission cố định (bảng `permissions` là global, không theo tenant):

| Code | Mô tả |
|---|---|
| `category:view` | Xem danh mục ngành hàng |
| `category:create` | Tạo danh mục ngành hàng |
| `category:update` | Sửa danh mục ngành hàng |
| `category:delete` | Xóa danh mục ngành hàng |
| `category:restore` | restore danh mục ngành hàng |

Khớp 1-1 với 5 `@RequirePermissions(...)` dùng trong `category.controller.ts` (§5) — không có permission nào khai báo nhưng không dùng, hoặc dùng nhưng không khai báo.

## 8. Existing Tests

Chạy `jest src/modules/category` thật:

- **5 test suite / 50 test case, 100% PASS.**
- File có test: `category.service.spec.ts`, `create-category.dto.spec.ts`, `category-slugify-slug.generator.spec.ts`, `prisma-category.repository.spec.ts`, `category.controller.spec.ts`.
- File không có test riêng: `category.module.ts` (không bất thường — cùng tình trạng với mọi `*.module.ts` khác trong dự án trước khi có Architecture Test tương ứng, xem T004.5/T005 §7 báo cáo trước), `update-category.dto.ts` (§4.6).
- Coverage đo bằng `jest --coverage --collectCoverageFrom="modules/category/**/*.ts"`: **91.11% statements / 81.42% branch / 97.77% funcs / 93.1% lines** (aggregate). Thấp nhất: `category.module.ts` (0%, do không ai `import` tĩnh để đọc metadata — cùng nguyên nhân đã ghi nhận ở `single-writer.architecture.spec.ts`/`product-repository-boundary.architecture.spec.ts`), `category-response.dto.ts` dòng 19 và `category.service.ts` dòng 91 chưa cover (nhánh cụ thể, chưa xác định nội dung nhánh — không mở rộng phân tích vì ngoài phạm vi khảo sát được giao).

## 9. Impact Analysis

- **Nếu thay đổi schema `Category`** (thêm cột, đổi kiểu, đổi constraint): ảnh hưởng trực tiếp đúng 1 model khác — `Product` (qua FK `categoryId`). Không có model thứ 3 nào bị ảnh hưởng gián tiếp qua Category.
- **Nếu thay đổi `ICategoryRepository`/`CategoryEntity`**: ảnh hưởng nằm gọn trong `category` module (0 consumer ngoài, §1.1/§2) — không cần cập nhật code ở module khác, khác hẳn tình huống `IProductRepository` trước T005 (phải sửa 5 module phụ thuộc).
- **Nếu thêm module mới cần đọc dữ liệu Category** (ví dụ Promotion/Report theo ngành hàng): sẽ là module ĐẦU TIÊN phụ thuộc Category qua DI — hiện `CategoryModule` đã có sẵn `CATEGORY_REPOSITORY` ở `exports` (§2), nghĩa là về mặt kỹ thuật module mới CÓ THỂ inject trực tiếp `CATEGORY_REPOSITORY` ngay hôm nay mà không bị chặn bởi bất kỳ Architecture Test nào (khác với `product`/`inventory`, nơi việc này đã bị chặn từ T004/T005).
- **Nếu thay đổi hành vi "Không cho xóa Category còn Product active"**: điểm chạm duy nhất là `CategoryService.remove()` gọi `ProductDomainService.hasActiveProductsInCategory()` — thay đổi ở phía Product (vd đổi định nghĩa "active") sẽ tự động ảnh hưởng hành vi này mà không cần sửa code Category.
- **Nếu cần đồng bộ `categoryId` giữa Variant Parent và Variant Child** (câu hỏi mở từ T005, chưa có ràng buộc nào ở hiện tại — xem §1.3): thay đổi này sẽ chạm cả `product` (nơi định nghĩa Variant) lẫn `category` (nơi định nghĩa "còn Product active") — phạm vi ảnh hưởng nằm ở tầng validate của `product`, không cần đổi schema/API của `category`.
