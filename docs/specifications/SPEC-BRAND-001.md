# SPEC-BRAND-001 — Brand Domain

**Status:** DRAFT — chờ Architecture Review. SPEC này không migration/không code/không commit code — chỉ Implementation Plan và code thật (sau Architecture Review lần cuối) mới được phép động vào code thật.
**Nguồn:** `RFC-0003 — Brand Domain (Version 1.0)` (APPROVED) + `ARCHITECT DECISION – START RFC-0003` (Decision B01-B04) + `ARCHITECT RESOLUTION — RFC-0003 Brand Domain` (Decision RQ1-RQ5) — ràng buộc bắt buộc của SPEC này.
**Bản chất:** Refactor/mở rộng module `brand` **đang chạy thật** (không phải module mới) — thêm `version` (Optimistic Lock), Restore đầy đủ, chuẩn hóa Query API (`sortBy`/`sortOrder`/`isActive`), **không** đổi `CommonStatus`, **không** tạo cột `isActive` mới.
**Tác giả SPEC:** Claude Code, theo ủy quyền tường minh trong `AUTHORIZATION` của `ARCHITECT RESOLUTION — RFC-0003 Brand Domain` (carve-out Decision G02: "SPEC chỉ được viết khi có chỉ định rõ ràng theo từng trường hợp").

## 1. Entity

### 1.1 `BrandEntity` — thay đổi so với hiện tại (`brand.entity.ts`)

```ts
// THÊM
version: number;   // Decision B02.7 / RFC-0003 §3.6 — Optimistic Lock, đúng mẫu Product/Category

// KHÔNG ĐỔI
status: BrandStatus;  // vẫn 'ACTIVE' | 'INACTIVE' (CommonStatus) — Decision B02.1/RQ1, không tạo BrandStatus riêng
```

Toàn bộ field còn lại (`id`, `organizationId`, `code`, `name`, `logo`, `description`, `website`, `country`, `createdAt`, `updatedAt`, `deletedAt`) **giữ nguyên**. **Không thêm cột `isActive`** (Decision RQ1 — dứt khoát, `isActive` chỉ tồn tại ở tầng Query/DTO, không phải Entity/Schema).

## 2. Aggregate

```
Brand (Aggregate Root, version — Decision B02.7)
```

Không có entity con (RFC §4). Quan hệ duy nhất ra ngoài Aggregate: `Product.brandId` (FK, optional, `onDelete: SetNull`, **không đổi** — Decision B02.4).

## 3. Migration

**Không migration nào được tạo ở bước SPEC này** — chỉ mô tả kế hoạch cho khi được duyệt Implementation Plan/Code. Đúng nguyên tắc dự án (Decision S04 tiền lệ Category — mỗi thay đổi schema độc lập có migration độc lập), Brand chỉ cần **1 migration duy nhất** vì chỉ có đúng 1 thay đổi schema (khác Category — 3 thay đổi độc lập nên 3 migration).

### 3.1 Migration — `version` (Optimistic Lock, Decision B02.7/B02.10)

```sql
ALTER TABLE "brands" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
```

Có `rollback.sql` riêng (§14): `ALTER TABLE brands DROP COLUMN version`. An toàn tuyệt đối — không đổi kiểu dữ liệu cột nào, không tạo enum mới, không ảnh hưởng `CommonStatus` (đang dùng chung với `Warehouse`/`Tax`/`Supplier`/`Customer` — Decision B02.1 xác nhận không đụng tới).

**Không có migration nào cho `isActive`** — không tồn tại cột `isActive` trong schema Brand (Decision RQ1).

## 4. API

**Không thêm route path mới ngoài `restore`** (đúng nguyên tắc RFC §5, tái sử dụng route hiện có):

| Route hiện có | Thay đổi |
|---|---|
| `POST /brands` | Không đổi cấu trúc, vẫn nhận `status` (đã có). |
| `GET /brands` | Chuẩn hóa Query params đầy đủ (RFC §5.1/Decision B02.5/RQ3) — xem §4.1. |
| `GET /brands/:id` | Response thêm `version`. |
| `PATCH /brands/:id` | Thêm `version` **bắt buộc** (Optimistic Lock — Decision B02.7). Sai → `409`. |
| `DELETE /brands/:id` | Giữ nguyên hành vi (chặn nếu còn Product active — `hasActiveProductsInBrand`, không đổi). Chỉ set `deletedAt` (không đổi `status` — `CommonStatus` không có giá trị `ARCHIVED` tương đương, khác Category). |
| `POST /brands/:id/restore` | **MỚI** (Decision B02.3/RFC §8). Set `deletedAt = null`, `status = INACTIVE` (luôn luôn — Decision RQ2). |

### 4.1 Filter cho `GET /brands` (Decision B02.5/RQ3/RQ4)

```
search, status, isActive, page, limit, sortBy, sortOrder
```

**Không có `parentId`** (Brand không phân cấp — RFC §2/§3.2, khác Category). `search` tìm theo `name`/`code` (không phân biệt hoa thường, đúng mẫu hiện có, không đổi). `sortBy` nhận `name`/`code`/`createdAt`, **mặc định `name`** (đúng hành vi hardcode hiện tại `orderBy: { name: 'asc' }` — Dependency Audit §5 xác nhận đây là default cứng duy nhất trước SPEC này, nay trở thành default tường minh có thể override).

**`isActive` (Decision RQ1/RQ3) — filter alias, KHÔNG phải cột DB:**
- `isActive=true` ⇔ Repository thêm điều kiện `status = 'ACTIVE'`.
- `isActive=false` ⇔ Repository thêm điều kiện `status != 'ACTIVE'` (tức `status = 'INACTIVE'`, vì `CommonStatus` chỉ có 2 giá trị).
- Có thể dùng **đồng thời** với `status` trong cùng 1 query (Decision RQ4 — không phải Breaking Change). Nếu cả 2 cùng gửi và mâu thuẫn (vd `status=INACTIVE&isActive=true`) — áp dụng **AND** cả 2 điều kiện (không có business rule nào yêu cầu 1 trong 2 phải thắng; kết quả tự nhiên là tập rỗng nếu mâu thuẫn logic — không cần validate chặn ở DTO, đúng tinh thần "không over-engineering" đã áp dụng cho Category Decision S02).

## 5. Validation

Thêm vào `UpdateBrandDto`:

```ts
// UpdateBrandDto
@IsInt()
version: number;  // bắt buộc — Optimistic Lock (Decision B02.7)
```

`CreateBrandDto` **không đổi** (không có `version` khi tạo — mặc định `1` ở Repository, đúng mẫu Product/Category). Không thêm validate nghiệp vụ nào khác — Brand không có quan hệ cha-con, không có business rule liên module mới nào được yêu cầu trong RFC-0003.

## 6. Permission

Thêm **1 permission mới**: `brand:restore` (Decision B02.3, RFC §6). Cập nhật `permission-catalog.ts:62`:

```ts
// TRƯỚC
...crud('brand', 'thương hiệu'),
// SAU
...crud('brand', 'thương hiệu', ['restore']),
```

Đúng mẫu `crud('category', 'danh mục ngành hàng', ['restore'])` (`permission-catalog.ts:61`). Giữ nguyên 4 permission hiện có (`brand:view`/`create`/`update`/`delete`). Không đổi permission catalog nào khác.

## 7. Repository

### 7.1 `IBrandRepository` — thay đổi interface

`update()` đổi chữ ký hỗ trợ Optimistic Lock (đúng mẫu `ICategoryRepository.update()`, SPEC-CATEGORY-001 §7.1):

```ts
update(id: string, expectedVersion: number, input: UpdateBrandInput): Promise<BrandEntity>;
// ném BrandConcurrencyConflictError nếu version không khớp (đúng mẫu CategoryConcurrencyConflictError)
```

Thêm 2 method mới (Decision B02.3 — Restore):

```ts
restore(id: string, restoredBy: string): Promise<void>;
findByIdIncludingDeleted(id: string, organizationId: string): Promise<BrandEntity | null>;
```

`findByIdIncludingDeleted()` cần cho `BrandService.restore()` xác nhận Brand tồn tại (kể cả đã `deletedAt`) trước khi restore — đúng mẫu `ICategoryRepository.findByIdIncludingDeleted()`.

Thêm vào `BrandSearchParams`: `isActive?: boolean`, `sortBy?: BrandSortField`, `sortOrder?: BrandSortOrder` (kiểu mới, xem §7.3).

**Quy tắc versioning (đúng Decision A09 gốc Product, tái áp dụng)**: mọi `UPDATE` (qua `update()`, `softDelete()`, `restore()`) đều tăng `version`, cập nhật `updatedAt`/`updatedBy`. `softDelete()`/`restore()` không nhận `expectedVersion` — không route nào yêu cầu client gửi `version` cho 2 thao tác này (chỉ `PATCH` theo §4, đúng tiền lệ Product/Category).

**Lỗi domain mới**: `BrandConcurrencyConflictError` (file mới `domain/errors/brand.errors.ts`, đúng mẫu `category.errors.ts`).

### 7.2 `search()` — implementation `isActive` (Decision RQ1)

```ts
// PrismaBrandRepository.search()
const where: Prisma.BrandWhereInput = {
  organizationId: params.organizationId,
  deletedAt: null,
  status: params.status,
  ...(params.isActive !== undefined
    ? { status: params.isActive ? 'ACTIVE' : { not: 'ACTIVE' } }
    : {}),
  // ...search OR như hiện tại
};
```

Nếu cả `status` và `isActive` cùng gửi, `params.isActive` override key `status` trong object literal ở trên — **cần sửa lại thành `AND` thay vì override ngầm** (đúng quyết định §4.1 — cả 2 điều kiện cùng áp dụng, không cái nào thắng cái nào):

```ts
const statusConditions: Prisma.BrandWhereInput[] = [];
if (params.status) statusConditions.push({ status: params.status });
if (params.isActive !== undefined) {
  statusConditions.push({ status: params.isActive ? 'ACTIVE' : { not: 'ACTIVE' } });
}
const where: Prisma.BrandWhereInput = {
  organizationId: params.organizationId,
  deletedAt: null,
  ...(statusConditions.length > 0 ? { AND: statusConditions } : {}),
  ...(params.search ? { OR: [...] } : {}),
};
```

`orderBy` đổi từ hardcode `{ name: 'asc' }` sang `{ [params.sortBy ?? 'name']: params.sortOrder ?? 'asc' }` (§4.1).

### 7.3 `BRAND_REPOSITORY`/`IBrandRepository` — export (Decision B02.8/RQ — YAGNI)

**KHÔNG thay đổi.** `brand.module.ts` giữ nguyên `exports: [BRAND_REPOSITORY]`. Không tạo `BrandDomainService`. Lý do (Decision B02.8, YAGNI — đúng tiền lệ Decision Q5/Q10/S07 của Category): Dependency Audit §2 xác nhận 0 module bên ngoài tiêu thụ `BRAND_REPOSITORY` trực tiếp (chỉ `ProductDomainService` được `BrandService` gọi theo chiều ngược lại, không phải Brand cung cấp Repository cho module khác).

Thêm 2 type mới (file `brand.repository.interface.ts`, đúng mẫu `CategorySortField`/`CategorySortOrder`):

```ts
export type BrandSortField = 'name' | 'code' | 'createdAt';
export type BrandSortOrder = 'asc' | 'desc';
```

## 8. Domain Service

**Không tạo.** Xem §7.3 (Decision B02.8).

## 9. DTO

- `CreateBrandDto`: **không đổi**.
- `UpdateBrandDto`: thêm `version` (bắt buộc — §5).
- `BrandResponseDto`: thêm `version`.
- `BrandQueryDto`: thêm `isActive` (`boolean`, optional), `sortBy` (`BrandSortField`, default `name`), `sortOrder` (`BrandSortOrder`, default `asc`) — đúng mẫu `CategoryQueryDto`. `status`/`search`/`page`/`limit` giữ nguyên.

**Nguồn `BRAND_STATUSES`**: Dependency Audit §7 ghi nhận mảng này bị lặp độc lập ở 3 file DTO (`create-brand.dto.ts`, `update-brand.dto.ts`, `brand-query.dto.ts`). SPEC này **không gộp thành 1 nguồn chung** — hợp nhất hằng số trùng lặp không tạo giá trị nghiệp vụ mới, chỉ là dọn dẹp hình thức, vi phạm nguyên tắc "Business First, Consistency Second" (Decision RQ5) nếu đưa vào phạm vi SPEC-BRAND-001. Nằm ngoài phạm vi RFC-0003 (không có trong Decision B02) — nếu cần dọn dẹp, phải qua đề xuất riêng.

## 10. Event (RFC §Out of Scope — CHỈ định nghĩa, KHÔNG publish)

| Event | Publisher | Khi nào |
|---|---|---|
| `BrandCreated` | `brand` module | Sau `POST /brands` thành công |
| `BrandUpdated` | `brand` module | Sau `PATCH /brands/:id` thành công |
| `BrandArchived` | `brand` module | Sau `DELETE /brands/:id` thành công |
| `BrandRestored` | `brand` module | Sau `POST /brands/:id/restore` thành công |

Đúng ADR-0009/ADR-0011 nhưng **không implement Sprint này** (Decision B02.9 — "chỉ reserve tên + thời điểm gọi, không publish thật"). Chỉ thêm hook no-op trong `BrandService` (đúng mẫu `CategoryService.onCategoryCreated()` v.v.), không TODO/FIXME.

## 11. Test

Theo `TEST_RULES.md` (5 lớp):

1. **Unit**: cập nhật toàn bộ 4 test suite hiện có (38 test case — `brand.service.spec.ts`, `prisma-brand.repository.spec.ts`, `brand.controller.spec.ts`, DTO spec nếu có) cho `version`/`restore`/`isActive`/`sortBy`/`sortOrder`. Thêm test case mới: Optimistic Lock conflict (`version` không khớp) → `BrandConcurrencyConflictError` → `409`; Restore Brand đã xóa mềm → `status` luôn về `INACTIVE` (không phụ thuộc giá trị trước khi Archive — Decision RQ2); Restore Brand chưa từng bị xóa → lỗi (đúng mẫu Category); `GET /brands?isActive=true` chỉ trả `status=ACTIVE`; `GET /brands?isActive=false` chỉ trả `status=INACTIVE`; `GET /brands?status=ACTIVE&isActive=false` trả tập rỗng (2 điều kiện AND mâu thuẫn — §4.1); `sortBy=code`/`sortBy=createdAt` hoạt động đúng; Archive khi còn Product active → lỗi (đã có, không đổi).
2. **Integration**: cập nhật `brand.e2e-spec.ts` (nếu tồn tại — cần kiểm tra khi code thật, Dependency Audit chưa xác nhận có file này). PENDING nếu sandbox không có Docker (đúng `technical-debt.md`).
3. **Architecture**: **không viết mới** — Decision B02.8 xác nhận không tạo DomainService nên không có bất biến kiến trúc mới cần bảo vệ bằng test tự động ở Sprint này.
4. **Performance**: không yêu cầu benchmark riêng (khác Category — Brand không có cấu trúc cây, quy mô dữ liệu Brand trong thực tế nhỏ hơn nhiều so với Category/Product, RFC-0003 không đặt yêu cầu benchmark).
5. **Security**: chưa thiết lập, không tạo mới (đúng trạng thái chung dự án).

## 12. Acceptance Criteria

| # | Tiêu chí | Cách xác minh |
|---|---|---|
| 1 | Build/Lint/TypeCheck PASS | Chuẩn `REVIEW_RULES.md` §1 |
| 2 | Unit Test PASS, Coverage không thấp hơn baseline (91.41% stmts hiện tại — Dependency Audit §8) | So sánh trước/sau |
| 3 | Multi Tenant | Mọi query/constraint mới đều scope theo `organizationId` (không đổi hành vi hiện có, đã đúng chuẩn theo Dependency Audit §3) |
| 4 | Repository Boundary | Xác nhận KHÔNG có module mới nào bắt đầu inject `BRAND_REPOSITORY` trực tiếp trong lúc code SPEC này (không tạo DomainService — Decision B02.8) |
| 5 | Restore | `POST /brands/:id/restore` hoạt động đúng, permission `brand:restore` riêng, luôn set `status=INACTIVE` (Decision RQ2) |
| 6 | Optimistic Lock | `PATCH` sai `version` → `409`, mọi UPDATE đều tăng `version` |
| 7 | isActive alias | `GET /brands?isActive=true/false` lọc đúng theo `status`, **không có cột `isActive` mới trong schema** (Decision RQ1) |
| 8 | Backward Compatible | `status` và `isActive` dùng đồng thời không phải Breaking Change, không cần API version mới (Decision RQ4) |
| 9 | Sort | `GET /brands` hỗ trợ `sortBy`(`name`/`code`/`createdAt`)/`sortOrder`, default `name` (đúng hành vi cũ) |
| 10 | Không tạo `BrandStatus`/`BrandDomainService` mới | Decision B02.1/B02.8 |
| 11 | `Product.brandId` không đổi hành vi | Vẫn optional/`SetNull` (Decision B02.4) |
| 12 | Migration | 1 migration độc lập, có rollback, không `DROP` dữ liệu hiện có |
| 13 | Existing Tests (38 test hiện có) không vỡ | |
| 14 | Regression Baseline (T005+T006) vẫn PASS (`RELEASE_RULES.md` §7) | `npx jest` toàn bộ suite |
| 15 | Integration Test PASS | PENDING nếu không có Docker — không đánh dấu PASS giả (đúng kỷ luật T005/T006) |
| 16 | Không TODO/FIXME/`any` không cần thiết | grep trong phạm vi code đã sửa |
| 17 | `BRAND_STATUSES` trùng lặp 3 file | **Không sửa** — ngoài phạm vi RFC-0003, không vi phạm Decision RQ5 (§9 giải thích) |

## 13. Implementation Order

```
Migration (version) — 1 migration độc lập
  ↓
Repository (BrandEntity, IBrandRepository, PrismaBrandRepository, brand.errors.ts)
  ↓
Application (BrandService: Restore, Optimistic Lock, isActive filter, Event hook no-op)
  ↓
Controller + DTO (UpdateBrandDto.version, BrandQueryDto.isActive/sortBy/sortOrder, route restore mới)
  ↓
permission-catalog.ts (brand:restore)
  ↓
Test
  ↓
Architecture Review
```

Không có bước "module phụ thuộc" như Product (T005) — Dependency Audit §2 xác nhận 0 module nào phụ thuộc runtime vào `BRAND_REPOSITORY`.

## 14. Rollback Plan

- **Schema**: migration duy nhất (§3.1) có `rollback.sql` riêng: `ALTER TABLE brands DROP COLUMN version`. An toàn tuyệt đối — không có `DROP TYPE`/đổi enum nào (Brand tiếp tục dùng `CommonStatus` không đổi).
- **Code**: nếu Acceptance Criteria không đạt, không merge/commit — sửa tại chỗ hoặc bỏ toàn bộ nhánh code (chưa từng commit).
- **Dữ liệu**: không có bước duplicate-check nào cần thiết (không thêm unique constraint mới, khác Category Migration B) — migration chỉ thêm 1 cột `version DEFAULT 1`, không rủi ro dữ liệu hiện có.

## Lịch sử quyết định

- **RFC-0003 — Brand Domain (Version 1.0)** — Claude Code viết theo ủy quyền 1 lần (`ARCHITECT DECISION – START RFC-0003`, Decision B01-B04).
- **Self-Architecture-Review RFC-0003** (Claude Code, theo Decision B04) — đối chiếu 12 ADR/`PROJECT_RULES.md`/`AI_WORKFLOW.md`/schema/Product/Category — không phát hiện xung đột, 2 câu hỏi mở tự nêu (RQ1 `isActive` cột mới hay alias?, RQ2 giá trị `status` chính xác sau Restore?).
- **`ARCHITECT RESOLUTION — RFC-0003 Brand Domain`** (Decision RQ1-RQ5) — APPROVED: RQ1 (alias, không cột mới), RQ2 (`INACTIVE` luôn luôn), RQ3 (giữ nguyên Query Convention), RQ4 (không phải Breaking Change), RQ5 (nguyên tắc mới "Business First, Consistency Second"). Ủy quyền Claude Code viết SPEC-BRAND-001, **không** Implementation Plan, **không** code.
- SPEC-BRAND-001 (tài liệu này) — chờ Architecture Review.
