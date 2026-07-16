# SPEC-CATEGORY-001 — Category Domain

**Status:** APPROVED WITH MINOR ADJUSTMENTS (`ARCHITECTURE REVIEW – SPEC-CATEGORY-001`, Decision S01-S08) — chuyển sang Implementation Plan. SPEC này vẫn không code/không migration/không commit — chỉ Implementation Plan và code thật (sau Architecture Review lần cuối) mới được phép động vào code thật.
**Nguồn:** `RFC-0002 — Category Domain (Version 1.0)` + `ARCHITECTURE REVIEW – RFC-0002` (9 câu hỏi) + `ARCHITECT DECISION – RFC-0002 Architecture Review Resolution` (Decision Q1-Q12) + `ARCHITECTURE REVIEW – SPEC-CATEGORY-001` (Decision S01-S08) — ràng buộc bắt buộc của SPEC này.
**Bản chất:** Refactor/mở rộng module `category` **đang chạy thật** (không phải module mới) — thêm `status`/`version`, ràng buộc DB cho `slug`, guard Archive/Restore theo cây, và 1 validate tối thiểu bổ sung vào `product` module (Decision Q8).
**Tác giả SPEC:** Claude Code, theo ủy quyền tường minh trong `AUTHORIZATION` của `ARCHITECT DECISION – RFC-0002 Architecture Review Resolution` (đúng carve-out ở Decision G02: "SPEC chỉ được viết khi có chỉ định rõ ràng theo từng trường hợp").

## 1. Entity

### 1.1 `CategoryEntity` — thay đổi so với hiện tại (`category.entity.ts`)

```ts
// THÊM
status: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';  // Decision Q1 — vòng đời, tách biệt isActive
version: number;                                          // Decision Q9 — Optimistic Lock

// GIỮ NGUYÊN, không đổi ý nghĩa (Decision Q1 — không loại bỏ isActive)
isActive: boolean;   // chỉ là cờ bật/tắt nhanh, KHÔNG đồng bộ với status
sortOrder: number;   // Decision Q2 — không đổi tên thành displayOrder
```

Toàn bộ field còn lại (`id`, `organizationId`, `parentId`, `code`, `name`, `slug`, `description`, `imageUrl`, `createdAt`, `updatedAt`, `deletedAt`) **giữ nguyên**.

**`status` mặc định khi tạo mới**: `ACTIVE` (không phải `DRAFT`) — đúng tiền lệ `ProductStatus @default(ACTIVE)` (SPEC-PRODUCT-001 §1.1). RFC-0002 không nói rõ default cho create; DRAFT là trạng thái nghiệp vụ tùy chọn (danh mục đang soạn, chưa công bố), không phải default ngầm định — người tạo phải chủ động chọn DRAFT nếu muốn.

### 1.2 `CategoryTreeNode` — không đổi shape ngoài field kế thừa từ `CategoryEntity`

## 2. Aggregate

```
Category (Aggregate Root, version — Decision Q9)
├── Category[] (children)     — self-reference qua parentId, Unlimited Level (RFC §5)
└── Product[]                  — tham chiếu qua FK, KHÔNG nằm trong Aggregate (RFC §1: Category không quản lý Product)
```

`Organization` — tham chiếu qua `organizationId`, không nằm trong Aggregate.

## 3. Migration

**Không migration nào được tạo ở bước SPEC này** — chỉ mô tả kế hoạch cho khi được duyệt code. Chia 3 migration độc lập theo thứ tự A→B→C (Decision S04 — điều chỉnh so với bản trước, vốn đề xuất gộp 1 migration; Architect giữ chuẩn "mỗi thay đổi schema độc lập nên có migration độc lập" xuyên suốt dự án, kể cả khi từng thay đổi riêng lẻ đơn giản, để nhất quán rollback/CI/truy vết lỗi khi dự án có hàng trăm migration).

### 3.1 Migration A — `version` (Optimistic Lock, Decision Q9)

```sql
ALTER TABLE "categories" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
```

### 3.2 Migration B — `slug` unique constraint (Decision Q3)

**Bước bắt buộc trước khi đổi constraint** (đúng mẫu Barcode, SPEC-PRODUCT-001 §3.4/Decision 7 — kiểm tra dữ liệu trùng, FAIL nếu có, không tự merge):

```sql
-- Chạy TRƯỚC khi tạo unique constraint. Nếu trả về > 0 dòng -> DỪNG migration, xử lý thủ công.
SELECT "organizationId", "slug", COUNT(*)
FROM "categories"
WHERE "deletedAt" IS NULL
GROUP BY "organizationId", "slug"
HAVING COUNT(*) > 1;
```

```sql
CREATE UNIQUE INDEX "categories_organizationId_slug_key" ON "categories"("organizationId", "slug");
```

Rủi ro trùng dữ liệu thấp trong thực tế (vì `CategorySlugifySlugGenerator` đã kiểm tra trước khi ghi từ trước tới nay — chỉ có khoảng hở race condition dưới ghi đồng thời), nhưng vẫn phải chạy bước kiểm tra này trước khi migrate thật, không giả định.

### 3.3 Migration C — `CategoryStatus` (Decision Q1)

```sql
CREATE TYPE "CategoryStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');
ALTER TABLE "categories" ADD COLUMN "status" "CategoryStatus" NOT NULL DEFAULT 'ACTIVE';
-- Backfill: danh mục đã soft-delete từ trước -> ARCHIVED (nhất quán với "Archive = Soft Delete", RFC §6).
-- Còn lại giữ DEFAULT 'ACTIVE' (không có danh mục nào tự động thành DRAFT - DRAFT là lựa chọn chủ
-- động, không suy ra được từ dữ liệu cũ).
UPDATE "categories" SET "status" = 'ARCHIVED' WHERE "deletedAt" IS NOT NULL;
```

`isActive` **không đổi, không migrate** (Decision Q1 — 2 field độc lập, không có ánh xạ giữa chúng).

### 3.4 Thứ tự & tính độc lập

A/B/C không có phụ thuộc kỹ thuật lẫn nhau (không migration nào cần migration khác chạy trước mới hợp lệ) — chạy đúng thứ tự A→B→C như liệt kê (Decision S04), mỗi migration có `rollback.sql` riêng (mô tả ở §14), có thể rollback từng migration độc lập mà không ảnh hưởng 2 migration còn lại.

## 4. API

**Không thêm route mới cho Archive/Restore** (đúng nguyên tắc đã áp dụng ở Product — tái sử dụng route hiện có):

| Route hiện có | Thay đổi |
|---|---|
| `POST /categories` | Thêm field `status` (optional, default `ACTIVE` — §1.1). |
| `GET /categories` | **Thêm filter/phân trang** (RFC §2: "Category Search" nằm trong phạm vi, hiện tại route này KHÔNG có gì — xem §4.1 dưới). Response thêm `status`, `version`. |
| `GET /categories/tree` | Không đổi tham số (tree cần load toàn bộ để dựng cây, không phân trang được). Response thêm `status`, `version`. |
| `GET /categories/:id` | Response thêm `status`, `version`. |
| `PATCH /categories/:id` | Thêm `status` (optional, **CHỈ nhận `DRAFT`/`ACTIVE`/`INACTIVE`, KHÔNG nhận `ARCHIVED`** — xem §5). Optimistic Lock: bắt buộc gửi `version` hiện tại, sai → `409`. |
| `DELETE /categories/:id` | Set cả `status=ARCHIVED` lẫn `deletedAt` (đúng mẫu Product Decision 4). Guard: từ chối nếu còn Product `active` (đã có) **HOẶC còn Category con nào ở trạng thái ACTIVE, kiểm tra TOÀN BỘ cây con đệ quy** (Decision Q6 — không chỉ con trực tiếp). |
| `POST /categories/:id/restore` | Trả `status` về `INACTIVE` (RFC §6, đúng mẫu Product Decision A05). Guard MỚI (Decision Q7): từ chối nếu **bất kỳ tổ tiên nào** (đi ngược `parentId` tới gốc) đang có `status=ARCHIVED` — lỗi nghiệp vụ, không tự động Restore tổ tiên, người dùng phải tự Restore từ trên xuống. |

### 4.1 Filter cho `GET /categories` (RFC §2 "Category Search", Decision S02)

```
search, status, parentId, isActive, page, limit, sortBy, sortOrder
```

**Đối chiếu tên tham số với Decision S02**: S02 liệt kê `page`/`pageSize`/`sort` — SPEC này dùng `page`/`limit`/`sortBy`+`sortOrder` (tên tham số đã dùng thống nhất ở `ProductQueryDto`/`BrandQueryDto`/`UnitQueryDto`). Cách hiểu: S02 dùng thuật ngữ REST chung (giống cách Decision Q2 dùng "Display Order" mang nghĩa nghiệp vụ, không phải tên field DB literal), không phải chỉ định đổi tên tham số riêng cho Category — đặc biệt vì chính Decision S04 nhấn mạnh "giữ một tiêu chuẩn thống nhất cho toàn bộ dự án". Nếu cách hiểu này sai, cần Architect xác nhận lại tên tham số chính xác trước khi viết Controller/DTO thật.

`search` tìm theo `name`/`code` (không phân biệt hoa thường, đúng mẫu `Product.search`). `sortBy` nhận `name`/`sortOrder`/`createdAt`, **mặc định `sortOrder`** (RFC §10: "Không dùng `createdAt`" áp dụng cho **default ordering**, không cấm chọn `createdAt` làm tùy chọn sort tường minh — đúng mẫu `ProductSortField` cho phép nhiều lựa chọn nhưng có default cụ thể). Không bổ sung filter nào khác ngoài danh sách trên (Decision S02 — "Không over-engineering"). `GET /categories/tree` không nhận các filter này (giữ nguyên, luôn trả toàn bộ cây theo `organizationId`).

## 5. Validation

Thêm vào `CreateCategoryDto`/`UpdateCategoryDto`:

```ts
// CreateCategoryDto
@IsOptional()
@IsIn(['DRAFT', 'ACTIVE', 'INACTIVE'])  // KHÔNG cho tạo trực tiếp ở ARCHIVED
status?: CategoryStatus;

// UpdateCategoryDto
@IsInt()
version: number;  // bắt buộc — Optimistic Lock

@IsOptional()
@IsIn(['DRAFT', 'ACTIVE', 'INACTIVE'])  // KHÔNG cho set ARCHIVED qua PATCH — chỉ qua DELETE (có guard)
status?: CategoryStatus;
```

**Xác nhận qua Decision S01**: `status=ARCHIVED` chỉ đạt được qua `DELETE` (có đủ 2 guard: Product active + descendant active — Decision Q6), **không** cho phép set trực tiếp qua `PATCH .../status=ARCHIVED`. Tương tự, không cho `PATCH .../status=ACTIVE` để "un-archive" — phải qua `POST /:id/restore` (có guard Decision Q7). Lý do (Decision S01): toàn bộ business rule (recursive descendant check, parent chain validation, audit, event reserve, optimistic lock) tập trung tại đúng 1 đường duy nhất — không tồn tại shortcut.

**Business Rule (RFC §7, Decision Q8) — thực thi ở tầng `product`, KHÔNG phải `category`:**
- `ProductService.assertValidVariantRelationship()` (đã tồn tại từ T005) bổ sung thêm 1 điều kiện: nếu `type=VARIANT_CHILD`, `categoryId` của Product đang tạo/sửa **phải bằng đúng** `categoryId` của Product tại `parentProductId`. Vi phạm → lỗi nghiệp vụ mới (`PRODUCT_014` — xem §7.1).
- Đây là thay đổi DUY NHẤT chạm tới code `product` (đã đóng ở tag `v0.2.0-product-foundation`) — được Decision Q8 xác nhận tường minh là hợp lệ, không phải mở rộng phạm vi Sprint.

**Archive Rule (Decision Q6) — kiểm tra đệ quy toàn bộ cây con:**
- Thuật toán: tải toàn bộ `Category` của `organizationId` (đúng cách `listAll()` hiện có đang làm cho `assertNoCircularReference`), dựng map `parentId → children[]`, duyệt đệ quy (BFS/DFS) từ node đang Archive xuống toàn bộ hậu duệ — nếu gặp bất kỳ node nào `status=ACTIVE`, từ chối. Không cần method Repository mới — tái sử dụng `listAll()` đã có, xử lý ở tầng Service (đúng cách `assertNoCircularReference` đang làm, chỉ thêm 1 hàm duyệt cây tương tự).

**Restore Rule (Decision Q7) — kiểm tra đệ quy toàn bộ tổ tiên:**
- Thuật toán: từ Category đang restore, đi ngược theo `parentId` tới gốc (đúng cách `assertNoCircularReference` đang duyệt ngược `parentId`, chỉ đổi điều kiện dừng) — nếu gặp bất kỳ tổ tiên nào `status=ARCHIVED`, từ chối, không tự động restore tổ tiên đó.

## 6. Permission

**Không cần permission code mới, không đổi code cũ** (Decision Q4 — dứt khoát). Giữ nguyên `category:view`/`create`/`update`/`delete`/`restore` (`permission-catalog.ts:61`). "Archive" chỉ là tên nghiệp vụ hiển thị ở tầng UI/docs cho hành động `DELETE /categories/:id` — permission thực thi vẫn là `category:delete`.

## 7. Repository

### 7.1 `ICategoryRepository` — thay đổi interface

Thêm vào `UpdateCategoryInput`: `status?: CategoryStatus`.

`update()` đổi chữ ký hỗ trợ Optimistic Lock (đúng mẫu `IProductRepository.update()`, SPEC-PRODUCT-001 §7.1):

```ts
update(id: string, expectedVersion: number, input: UpdateCategoryInput): Promise<CategoryEntity>;
// ném CategoryConcurrencyConflictError nếu version không khớp (đúng mẫu ProductConcurrencyConflictError)
```

**Quy tắc versioning (đúng Decision A09 của SPEC-PRODUCT-001, áp dụng lại cho Category)**: mọi `UPDATE` (qua `update()`, `softDelete()`, `restore()`) đều tăng `version`, cập nhật `updatedAt`/`updatedBy`. `softDelete()`/`restore()` không nhận `expectedVersion` (không có route nào yêu cầu client gửi version cho 2 thao tác này — chỉ `PATCH` theo §4, đúng tiền lệ Product).

**Không thêm method Repository mới cho Archive/Restore tree-check** (§5) — tái sử dụng `listAll()` đã có, xử lý ở tầng Service.

**Lỗi domain mới**: `CategoryConcurrencyConflictError` (file mới `domain/errors/category.errors.ts`, đúng mẫu `product.errors.ts`).

### 7.2 `CATEGORY_REPOSITORY`/`ICategoryRepository` — export (Decision Q5/Q10/S07)

**KHÔNG thay đổi.** `category.module.ts` giữ nguyên `exports: [CATEGORY_REPOSITORY]`. Không tạo `CategoryDomainService`. Lý do (Decision Q5/Q10, YAGNI): hiện tại 0 module bên ngoài tiêu thụ `CATEGORY_REPOSITORY` — tạo lớp trung gian trước khi có nhu cầu thật là thiết kế thừa. Khi có module thứ 2 cần đọc Category, giới thiệu `CategoryDomainService` lúc đó.

## 8. Domain Service

**Không tạo.** Xem §7.2 (Decision Q5/Q10).

## 9. DTO

- `CreateCategoryDto`: thêm `status?` (§5).
- `UpdateCategoryDto`: thêm `status?` (§5), thêm `version` (bắt buộc — Optimistic Lock).
- `CategoryResponseDto`/`CategoryTreeResponseDto`: thêm `status`, `version`.
- **`CategoryQueryDto` (file mới)**: `search`, `status`, `parentId`, `isActive`, `page`, `limit`, `sortBy` (`name`/`sortOrder`/`createdAt`, default `sortOrder`), `sortOrder` (`asc`/`desc`, default `asc`) — đúng mẫu `ProductQueryDto`/`BrandQueryDto`. Áp dụng cho `GET /categories`, KHÔNG áp dụng cho `GET /categories/tree`.

## 10. Event (RFC §14 — CHỈ định nghĩa, KHÔNG publish)

| Event | Publisher | Khi nào |
|---|---|---|
| `CategoryCreated` | `category` module | Sau `POST /categories` thành công |
| `CategoryUpdated` | `category` module | Sau `PATCH /categories/:id` thành công |
| `CategoryArchived` | `category` module | Sau `DELETE /categories/:id` thành công |
| `CategoryRestored` | `category` module | Sau `POST /categories/:id/restore` thành công |

Đúng ADR-0009 (publish sau commit) + ADR-0011 (Outbox Pattern) nhưng **không implement Sprint này** (Decision Q11 — "Không Outbox. Không Event. Không Publisher."). Chỉ chừa hook no-op trong `CategoryService` (đúng mẫu `ProductService.onProductCreated()` v.v., SPEC-PRODUCT-001 §10), không TODO/FIXME.

## 11. Test

Theo `TEST_RULES.md` (5 lớp):

1. **Unit**: cập nhật toàn bộ test hiện có (`category.service.spec.ts`, `prisma-category.repository.spec.ts`, `category.controller.spec.ts`, `create-category.dto.spec.ts`) cho field mới. Thêm test case: Archive khi còn Product active → lỗi (đã có, không đổi); Archive khi còn Category con ACTIVE ở **bất kỳ cấp nào** (không chỉ con trực tiếp — Decision Q6) → lỗi; Restore khi tổ tiên đang ARCHIVED → lỗi (Decision Q7); Optimistic Lock conflict (`version` không khớp) → `CategoryConcurrencyConflictError` → `409`; tạo/sửa `slug` trùng trong cùng Organization → `409` (nay có DB constraint thật, không chỉ dựa vào slug generator); Variant Child có `categoryId` khác Variant Parent → lỗi (test này nằm ở `product` module, không phải `category` — Decision Q8); **vòng lặp 3 cấp `A→B→C→A` bị chặn** (Decision S05 — mở rộng test `assertNoCircularReference` hiện có, vốn đã có case root/child/grandchild, thành đúng kịch bản A gán cha là chính hậu duệ cấp 3 của nó).
2. **Integration**: cập nhật `category.e2e-spec.ts` (nếu có — chưa xác nhận có tồn tại, cần kiểm tra khi code thật). PENDING nếu sandbox không có Docker.
3. **Architecture**: **không viết mới** — Decision Q5/Q10 xác nhận không tạo DomainService nên không có bất biến kiến trúc mới cần bảo vệ bằng test tự động ở Sprint này.
4. **Performance (Decision S06)**: benchmark thủ công/script riêng (không phải Jest unit test) cho `getTree()` và thuật toán duyệt cây Archive/Restore (§5) trên tập dữ liệu **>1000 category** trong 1 Organization — xác nhận `search` (GET /categories) và dựng cây (GET /categories/tree) vẫn đủ nhanh. Không bắt buộc Closure Table/Nested Set — Adjacency List (`parentId` self-reference) hiện tại được xác nhận là đủ (Decision S06), chỉ cần đo để có số liệu thật thay vì giả định. Benchmark này cần môi trường có Postgres thật — **PENDING** cùng nhóm Integration Test nếu sandbox không có Docker.
5. **Security**: chưa thiết lập, không tạo mới (đúng trạng thái chung dự án).

## 12. Acceptance Criteria

| # | Tiêu chí | Cách xác minh |
|---|---|---|
| 1 | Build/Lint/TypeCheck PASS | Chuẩn `REVIEW_RULES.md` §1 |
| 2 | Unit Test PASS, Coverage không thấp hơn baseline (91.11% stmts hiện tại — xem Dependency Audit §8) | So sánh trước/sau |
| 3 | Multi Tenant | Mọi query/constraint mới đều scope theo `organizationId` (Decision Q12) |
| 4 | Repository Boundary | Xác nhận KHÔNG có module mới nào bắt đầu inject `CATEGORY_REPOSITORY` trực tiếp trong lúc code SPEC này (không phải tạo DomainService — Decision Q5/Q10) |
| 5 | Soft Delete | `DELETE` set cả `status=ARCHIVED` lẫn `deletedAt` |
| 6 | Audit | Mọi thao tác ghi mới (Archive/Restore/Update) tiếp tục ghi qua `AuditLogService` hiện có, không tạo bảng Audit mới (RFC §13) |
| 7 | Permission | Không đổi permission catalog (Decision Q4), 5 route vẫn đúng 5 permission cũ |
| 8 | Version (Optimistic Lock) | `PATCH` sai `version` → `409`, mọi UPDATE đều tăng `version` |
| 9 | Parent Tree | `GET /categories/tree` vẫn dựng đúng cây Unlimited Level sau khi thêm field mới |
| 10 | Circular Detection | `assertNoCircularReference` hiện có tiếp tục hoạt động đúng, không bị phá vỡ bởi thay đổi `update()` signature |
| 11 | Archive đệ quy | Archive bị chặn nếu có ACTIVE ở BẤT KỲ cấp con nào, không chỉ con trực tiếp (Decision Q6) |
| 12 | Restore chain | Restore bị chặn nếu BẤT KỲ tổ tiên nào đang ARCHIVED (Decision Q7) |
| 13 | Slug unique DB-level | `@@unique([organizationId, slug])` tồn tại và được test xác nhận (không chỉ dựa vào slug generator) |
| 14 | Variant-Category consistency | `product` module từ chối tạo/sửa Variant Child có `categoryId` khác Variant Parent (Decision Q8) |
| 15 | Integration Test PASS | PENDING nếu không có Docker — không đánh dấu PASS giả (đúng kỷ luật T005) |
| 16 | Không TODO/FIXME/`any` không cần thiết | grep trong phạm vi code đã sửa |
| 17 | Circular 3 cấp (Decision S05) | Test case cụ thể `A→B→C→A` (gán `parentId` của A thành chính hậu duệ cấp 3 của A) bị chặn bởi `assertNoCircularReference` |
| 18 | Query Performance (Decision S06) | Benchmark `search`/`getTree()` trên >1000 category vẫn đủ nhanh (không có ngưỡng số cụ thể trong Decision S06 — ghi nhận số đo thật, so sánh trước/sau, không cần đạt target tuyệt đối vì SPEC không đặt SLA) — PENDING nếu không có Docker |

## 13. Implementation Order

```
Migration A (version) → Migration B (slug unique) → Migration C (status) — 3 migration độc lập, Decision S04
  ↓
Repository (CategoryEntity, ICategoryRepository, PrismaCategoryRepository, category.errors.ts)
  ↓
Application (CategoryService: Archive đệ quy, Restore chain, Optimistic Lock, Event hook no-op)
  ↓
Controller + DTO (bao gồm CategoryQueryDto mới)
  ↓
product module (bổ sung validate Variant-Category consistency — Decision Q8, phạm vi tối thiểu)
  ↓
Test
  ↓
Architecture Review
```

Không có bước "5 module phụ thuộc" như Product (T005) — hiện 0 module nào phụ thuộc runtime vào Category (Dependency Audit §1).

## 14. Rollback Plan

- **Schema**: mỗi migration (A/B/C — §3.4, Decision S04) có `rollback.sql` riêng, rollback độc lập không ảnh hưởng 2 migration còn lại:
  - Rollback A: `ALTER TABLE categories DROP COLUMN version`.
  - Rollback B: `DROP INDEX categories_organizationId_slug_key`.
  - Rollback C: `ALTER TABLE categories DROP COLUMN status`, `DROP TYPE "CategoryStatus"`.
  An toàn tuyệt đối (không có `DROP VALUE` enum như trường hợp `ProductStatus` — `CategoryStatus` là enum hoàn toàn mới, không rename từ enum cũ nào).
- **Code**: nếu Acceptance Criteria không đạt, không merge/commit — sửa tại chỗ hoặc bỏ toàn bộ nhánh code (chưa từng commit).
- **Dữ liệu**: nếu bước duplicate-check slug (§3.2) phát hiện trùng — Migration B chưa từng chạy (fail trước khi đổi constraint), xử lý dữ liệu trùng thủ công (không tự động merge, đúng Decision Q3 tinh thần) rồi chạy lại — không ảnh hưởng Migration A/C.

## Lịch sử quyết định

- **RFC-0002 — Category Domain (Version 1.0)** — ban hành bởi Architect.
- **ARCHITECTURE REVIEW – RFC-0002** (Claude Code) — 4 nhóm kiểm tra (schema/ADR/PROJECT_RULES/module hiện có), 9 câu hỏi mở (Q1-Q9).
- **ARCHITECT DECISION – RFC-0002 Architecture Review Resolution** (Decision Q1-Q12) — giải quyết toàn bộ 9 câu hỏi + bổ sung Q10-Q12, ủy quyền Claude Code viết SPEC-CATEGORY-001.
- **ARCHITECTURE REVIEW – SPEC-CATEGORY-001** (Decision S01-S08) — APPROVED WITH MINOR ADJUSTMENTS: xác nhận thiết kế chặn `PATCH status=ARCHIVED/ACTIVE` (S01), xác nhận filter `GET /categories` (S02, có 1 điểm cần xác nhận thêm về tên tham số — §4.1), xác nhận phạm vi validate Variant-Category ở `product` (S03), **đổi chiến lược Migration từ 1 gộp sang 3 độc lập A/B/C** (S04), bổ sung Acceptance Criteria Circular 3 cấp (S05) và Query Performance benchmark (S06), xác nhận không tạo DomainService (S07), xác nhận Implementation Plan là bước tiếp theo (S08).
- Còn 1 điểm cần xác nhận khi Review Implementation Plan: tên tham số `GET /categories` (`limit`/`sortBy`/`sortOrder` theo cách hiểu của SPEC vs. `pageSize`/`sort` theo văn bản Decision S02 — xem §4.1).
