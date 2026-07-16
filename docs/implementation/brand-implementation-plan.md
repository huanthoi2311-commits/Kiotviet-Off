# Brand Implementation Plan (T007, dựa trên SPEC-BRAND-001)

**Trạng thái:** Chờ Architecture Review. **Không code, không migration, không commit** ở bước này — chỉ kế hoạch (Decision T007-03).
**Nguồn:** `SPEC-BRAND-001` (APPROVED, `ARCHITECT DECISION — APPROVE SPEC-BRAND-001 & AUTHORIZE T007 IMPLEMENTATION PLAN`, Decision T007-01 SPEC Freeze — không sửa Business Rule/thêm API/thêm Migration/mở rộng phạm vi so với SPEC đã đóng băng).

---

## 1. File Impact

### 1.1 New (3 file)

| File | Nội dung |
|---|---|
| `backend/src/modules/brand/domain/errors/brand.errors.ts` | `BrandConcurrencyConflictError` (đúng mẫu `category.errors.ts`) |
| `backend/prisma/migrations/<timestamp>_brand_version/migration.sql` | `ALTER TABLE brands ADD COLUMN version` (SPEC §3.1). Tên thư mục theo timestamp tại thời điểm code thật, không đặt trước ở bước Plan |
| `backend/prisma/migrations/<timestamp>_brand_version/rollback.sql` | `ALTER TABLE brands DROP COLUMN version` |

### 1.2 Modify (12 file)

| File | Thay đổi |
|---|---|
| `domain/entities/brand.entity.ts` | Thêm `version: number` (SPEC §1.1) |
| `domain/repositories/brand.repository.interface.ts` | `update()` đổi chữ ký nhận `expectedVersion`; thêm `restore()`, `findByIdIncludingDeleted()`; `BrandSearchParams` thêm `isActive?`/`sortBy?`/`sortOrder?`; thêm type `BrandSortField`/`BrandSortOrder` (SPEC §7.1/§7.3) |
| `infrastructure/persistence/prisma-brand.repository.ts` | `update()` dùng `updateMany` compare-and-swap + `findUniqueOrThrow` (đúng mẫu `PrismaCategoryRepository`); `softDelete()` tăng `version`; thêm `restore()` (set `deletedAt=null`, `status='INACTIVE'`, tăng `version`); thêm `findByIdIncludingDeleted()`; `search()` đổi `where` sang `AND` composition cho `status`+`isActive`, `orderBy` đổi từ hardcode sang `{ [sortBy]: sortOrder }` (SPEC §7.2) |
| `infrastructure/persistence/prisma-brand.repository.spec.ts` | Cập nhật mock `updateMany`/`findUniqueOrThrow`, thêm test Optimistic Lock conflict, `restore()`, `findByIdIncludingDeleted()`, `isActive`/`sortBy` |
| `application/brand.service.ts` | `update()` truyền `expectedVersion`, bắt `BrandConcurrencyConflictError` → `ConflictException` (`BRAND_VERSION_CONFLICT`); thêm `restore()` (đúng luồng `CategoryService.restore()`: tìm bằng `findByIdIncludingDeleted`, kiểm tra đang bị xóa mềm, gọi Repository, ghi Audit Log, gọi hook); thêm 4 event hook no-op (`onBrandCreated/Updated/Archived/Restored`); `search()` truyền thêm `isActive`/`sortBy`/`sortOrder` |
| `application/brand.service.spec.ts` | Cập nhật + thêm test case theo §5 Test Strategy dưới đây |
| `application/mappers/brand.mapper.ts` | Map thêm `version` |
| `application/dto/brand-query.dto.ts` | Thêm `isActive?: boolean`, `sortBy?` (`name`/`code`/`createdAt`, default `name`), `sortOrder?` (default `asc`) (SPEC §9) |
| `application/dto/update-brand.dto.ts` | Thêm `version: number` bắt buộc (`@IsInt()`) |
| `application/dto/brand-response.dto.ts` | Thêm `version` |
| `presentation/brand.controller.ts` | Thêm route `POST /brands/:id/restore` (`@RequirePermissions('brand:restore')`), Swagger update cho `GET /brands`/`PATCH /brands/:id` (đúng mẫu Commit 5 T005) |
| `presentation/brand.controller.spec.ts` | Cập nhật cho DTO mới, thêm test route `restore` |

### 1.3 Modify — ngoài module `brand` (2 file)

| File | Thay đổi |
|---|---|
| `common/errors/error-codes.ts` | Thêm `BRAND_VERSION_CONFLICT: 'BRAND_004'` (nối tiếp `BRAND_001`..`003` hiện có — `error-codes.ts:75-77`) |
| `modules/rbac/infrastructure/permission-catalog.ts` | Dòng 62: `...crud('brand', 'thương hiệu')` → `...crud('brand', 'thương hiệu', ['restore'])` (SPEC §6) |

### 1.4 Delete

Không có file nào bị xóa.

### 1.5 Tổng: 3 mới + 12 sửa (brand) + 2 sửa (ngoài brand) = **17 file**

Không chạm module nào khác ngoài `error-codes.ts`/`permission-catalog.ts` (2 file dùng chung toàn dự án, không thuộc riêng module nào) — đúng SPEC §13 ("Không có bước 'module phụ thuộc' như Product").

## 2. Migration Plan

**Đúng 1 migration** (SPEC §3 — Brand chỉ có 1 thay đổi schema, khác Category có 3). Không gộp migration của module khác (Decision T007-01).

### Migration A — `version` (Optimistic Lock)

```sql
ALTER TABLE "brands" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
```

- Thuần `ADD COLUMN` với `DEFAULT`, không đổi kiểu cột nào có sẵn, không tạo/đổi enum (`CommonStatus` không bị chạm — Decision B02.1).
- **Không cần bước duplicate-check** trước migration (khác Category Migration B) — không thêm unique constraint nào.

### Rollback

```sql
ALTER TABLE "brands" DROP COLUMN "version";
```

An toàn tuyệt đối — không có dữ liệu nào bị mất ngoài chính cột `version` vừa thêm (không có FK/index nào phụ thuộc cột này).

### Verify

1. Trước migration: `SELECT COUNT(*) FROM brands;` — ghi lại số dòng.
2. Sau migration: `SELECT COUNT(*) FROM brands WHERE version = 1;` — phải bằng đúng số dòng ở bước 1 (mọi row hiện có nhận `DEFAULT 1`).
3. Chạy lại `up` sau khi rollback lần nữa (idempotent check) — đúng yêu cầu chung dự án (`technical-debt.md` mục #2 Rollback Test).
4. Cả 3 bước trên cần Postgres thật — **PENDING** nếu sandbox không có Docker, ghi vào `technical-debt.md` cùng nhóm Category/Product thay vì tự đánh dấu PASS giả.

## 3. Dependency Impact

| Module | Ảnh hưởng |
|---|---|
| **Product** | Không đổi. `Product.brandId` giữ nguyên optional/`SetNull` (Decision B02.4, SPEC §2). Xác nhận bằng grep: chỉ `ProductDomainService.hasActiveProductsInBrand()` được `BrandService.remove()` gọi — hàm này không đổi chữ ký, không đổi hành vi. |
| **Purchase** | Dự án chưa có module tên `purchase` — tồn tại `purchase-order`, `purchase-return`. Grep xác nhận 0 tham chiếu tới `Brand`/`brandId` trong cả 2 module này — 0 ảnh hưởng. |
| **Inventory** | Tồn tại `inventory` và `inventory-adjustment`. Grep xác nhận 0 tham chiếu tới `Brand`/`brandId` trong cả 2 module — 0 ảnh hưởng. |
| **Supplier** | Grep xác nhận 0 tham chiếu tới `Brand`/`brandId` trong `modules/supplier/` — 0 ảnh hưởng. |
| **Report** | Chưa có module `report` triển khai trong `backend/src/modules/` — không áp dụng, không có gì để đánh giá. |
| **Permission** | Thêm đúng 1 permission `brand:restore` (crud helper, §1.3). Không đổi permission nào khác — 4 permission `brand:view/create/update/delete` giữ nguyên. |
| **Swagger** | Route mới `POST /brands/:id/restore` xuất hiện trong `ApiTags('Brand')`; `GET /brands`/`PATCH /brands/:id` cập nhật mô tả tham số mới (`isActive`/`sortBy`/`sortOrder`/`version`) — không đổi tag, không đổi route path nào khác. |
| **Tests** | 4 test suite hiện có (38 test case, `brand` module) cập nhật; `backend/test/brand.e2e-spec.ts` đã tồn tại (Integration Test, PENDING không Docker — không phải file mới, chỉ cập nhật nếu route/DTO ảnh hưởng assertion hiện có). Regression Baseline (Sprint-00 + T005 + T006) phải tiếp tục PASS (Decision T007-06). |

**Kết luận**: đây là thay đổi cô lập nhất trong 3 domain đã làm (Product/Category/Brand) — không có module phụ thuộc runtime nào cần sửa, đúng xác nhận của Dependency Audit §2 (0 consumer của `BRAND_REPOSITORY`).

## 4. Commit Strategy

Đúng cấu trúc 6 commit theo Decision T007-02, mỗi commit độc lập kiểm tra Build+TypeCheck+Lint PASS trước khi sang commit kế tiếp (đúng Decision T007-05 — không gộp bước):

| # | Commit | Nội dung |
|---|---|---|
| 1 | Migration | `migration.sql` + `rollback.sql` (§2). Không chứa code TypeScript nào. |
| 2 | Repository | `brand.entity.ts`, `brand.repository.interface.ts`, `brand.errors.ts` (mới), `prisma-brand.repository.ts`, `prisma-brand.repository.spec.ts` |
| 3 | Application | `brand.service.ts`, `brand.service.spec.ts`, `brand.mapper.ts`, `update-brand.dto.ts`, `brand-query.dto.ts`, `brand-response.dto.ts` |
| 4 | Controller | `brand.controller.ts`, `brand.controller.spec.ts`, `permission-catalog.ts`, `error-codes.ts` (đặt cùng Controller vì `BRAND_VERSION_CONFLICT` chỉ được ném/dùng từ tầng Application trở lên — nhất quán với thời điểm code chạm tới toàn bộ luồng HTTP) |
| 5 | Tests | Bổ sung test case còn thiếu nếu Commit 2-4 chưa phủ hết Test Strategy (§5) — nếu mỗi commit trước đã tự đủ test đi kèm, Commit 5 có thể rỗng/gộp xác nhận cuối, quyết định lúc code thật dựa trên số lượng case còn lại |
| 6 | Documentation | Release note T007, cập nhật `PROJECT_STATUS.md`, `technical-debt.md` nếu có PENDING mới (đúng mẫu T006 close) |

Không commit lớn (Decision T007-02 — "Không được commit lớn"). Không commit nào được phép chứa quá 1 nhóm logic (đúng `RELEASE_RULES.md` §1).

## 5. Test Strategy

| Nhóm | Nội dung |
|---|---|
| **Unit** | Cập nhật 4 suite hiện có (38 test case) cho `version`/`restore`/`isActive`/`sortBy`/`sortOrder`. Trải rộng theo các nhóm dưới đây. |
| **Integration** | `brand.e2e-spec.ts` (đã tồn tại) — cập nhật nếu route/DTO thay đổi ảnh hưởng assertion. PENDING nếu sandbox không có Docker (đúng `technical-debt.md`). |
| **Regression** | Chạy toàn bộ `npx jest` (không chỉ `src/modules/brand`) — xác nhận Sprint-00 + T005 (Product) + T006 (Category) vẫn PASS (Decision T007-06, `RELEASE_RULES.md` §7). Coverage không được thấp hơn baseline hiện tại (91.41% stmts module `brand` — Dependency Audit §8; toàn backend baseline hiện có tính tới T006). |
| **Permission** | `POST /brands/:id/restore` yêu cầu đúng `brand:restore`, thiếu permission → `403` (đúng mẫu test hiện có cho `create`/`update`/`delete`, `brand.controller.spec.ts:39-43`). |
| **Optimistic Lock** | `PATCH /brands/:id` với `version` khớp → thành công, tăng `version` lên 1. `version` không khớp → `409` (`BrandConcurrencyConflictError` → `BRAND_VERSION_CONFLICT`). |
| **Multi Tenant** | `findByIdIncludingDeleted()`/`restore()` đều lọc theo `organizationId` — request từ Organization khác không thấy/không restore được Brand của Organization A (đúng test pattern `findById` hiện có). |
| **Pagination** | `page`/`limit` giữ nguyên hành vi hiện có, không đổi (không có test mới cần thiết ngoài test hồi quy). |
| **Restore** | Brand đã xóa mềm → restore → `deletedAt=null`, `status='INACTIVE'` (luôn luôn, không phụ thuộc giá trị trước Archive — Decision RQ2). Brand chưa từng bị xóa → restore → lỗi (đúng mẫu `CategoryService.restore()` — not found qua `findByIdIncludingDeleted` nhưng `deletedAt` đang `null`). |
| **Archive** | Còn Product `active` sử dụng Brand → `DELETE` bị chặn (hành vi đã có, không đổi — chỉ xác nhận không vỡ sau khi thêm `version`). |
| **Search** | `search` theo `name`/`code` không đổi (hành vi đã có, xác nhận không vỡ). |
| **Sort** | `sortBy=name` (default)/`code`/`createdAt` × `sortOrder=asc`/`desc` — 6 tổ hợp tối thiểu. |
| **isActive filter** | `isActive=true` → chỉ `status=ACTIVE`; `isActive=false` → chỉ `status=INACTIVE`; `status=ACTIVE&isActive=false` (mâu thuẫn) → tập rỗng, không lỗi (SPEC §4.1). |
| **Architecture** | Không viết mới — không tạo `BrandDomainService` nên không có bất biến kiến trúc mới cần bảo vệ (SPEC §11.3, Decision B02.8). |
| **Security** | Chưa thiết lập, không tạo mới (đúng trạng thái chung dự án). |

**Ước tính**: +14 test case mới (Optimistic Lock ×2, Restore ×2, isActive ×3, Sort ×2, Permission restore ×2, Repository restore/findByIdIncludingDeleted ×3), cộng dồn vào 38 test hiện có → **~52 test case** cho module `brand` sau khi hoàn thành.

## 6. Risk Matrix

| # | Risk | Impact | Mitigation | Verification |
|---|---|---|---|---|
| R1 | `search()` đổi `where` từ object literal đơn giản sang `AND` composition (SPEC §7.2) có thể vô tình đổi hành vi filter `status` đơn lẻ hiện có (không có `isActive`) | Trung bình | Giữ nguyên hành vi khi `isActive` không được gửi — chỉ thêm `AND` khi có ít nhất 1 trong 2 điều kiện; viết test hồi quy riêng cho trường hợp chỉ gửi `status`, không gửi `isActive` | Test case "chỉ `status`, không `isActive`" PASS với kết quả giống hệt hành vi trước khi đổi code |
| R2 | `orderBy` đổi từ hardcode `{ name: 'asc' }` sang động theo `sortBy`/`sortOrder` — sai tên field (vd nếu FE gửi giá trị không nằm trong `BrandSortField`) có thể gây lỗi Prisma runtime thay vì lỗi validate rõ ràng | Thấp | `BrandQueryDto.sortBy` dùng `@IsIn(SORT_FIELDS)` chặn ở tầng Validation Pipe trước khi tới Repository — không có giá trị lạ nào lọt xuống Prisma | Test DTO validate: `sortBy` không hợp lệ → `400`, không tới được Repository |
| R3 | Optimistic Lock (`updateMany` + `findUniqueOrThrow`) là pattern đã áp dụng đúng ở Product/Category — rủi ro thấp nhưng cần xác nhận `findUniqueOrThrow` không ném lỗi sai kiểu nếu Brand bị xóa cứng giữa 2 bước (race condition cực hiếm) | Thấp | Không xử lý riêng — cùng mức rủi ro đã chấp nhận ở Product/Category (không phải rủi ro mới phát sinh riêng cho Brand), không có hành động xóa cứng nào tồn tại trong hệ thống hiện tại (chỉ Soft Delete) | Không cần verification riêng — kế thừa nguyên trạng đã được chấp nhận ở 2 module trước |
| R4 | Thêm `version: number` bắt buộc vào `UpdateBrandDto` là **Breaking Change** cho mọi client hiện tại đang gọi `PATCH /brands/:id` không kèm `version` | Cao | Đây là thay đổi đã được SPEC-BRAND-001 §5 xác nhận tường minh, đúng tiền lệ Product/Category (đều bắt buộc `version` khi thêm Optimistic Lock) — không có client thật nào đang chạy production ở giai đoạn dự án hiện tại (`v0.x`, chưa phát hành), rủi ro chỉ ảnh hưởng nội bộ (Swagger/FE đang phát triển song song) | Cập nhật Swagger, thông báo rõ trong Documentation (Commit 6) — không cần API versioning (dự án chưa có khách hàng thật) |
| R5 | `BRAND_VERSION_CONFLICT` đặt ở Commit 4 (Controller) thay vì Commit 2 (Repository) — nếu Commit 2 build/test riêng lẻ trước khi có error code này, `brand.errors.ts` compile được nhưng chưa có `ErrorCode.BRAND_VERSION_CONFLICT` để Service dùng ở Commit 3 | Thấp | Thứ tự thực tế: `error-codes.ts` cần có mặt **trước** Commit 3 (Application dùng `withCode(ErrorCode.BRAND_VERSION_CONFLICT, ...)`) — điều chỉnh: đưa `error-codes.ts` vào Commit 2 (Repository) thay vì Commit 4, giữ nguyên `permission-catalog.ts` ở Commit 4 (chỉ Controller/route mới cần permission mới) | Xác nhận Build PASS sau mỗi commit theo đúng thứ tự đã điều chỉnh — nếu Commit 3 build lỗi do thiếu `ErrorCode`, phát hiện ngay tại bước Build PASS bắt buộc giữa các commit (Decision T007-05) |

## 7. Rollback Strategy

**Nếu migration lỗi:**
1. Chạy `rollback.sql` (§2) — `ALTER TABLE brands DROP COLUMN version`.
2. Verify: `SELECT COUNT(*) FROM brands;` khớp đúng số dòng trước migration (không có dòng nào bị xóa/thêm — migration chỉ thêm 1 cột).
3. Xác nhận schema Prisma (`npx prisma db pull` hoặc so sánh `schema.prisma` hiện tại) khớp đúng trạng thái trước migration — không còn cột `version` trên bảng `brands`.
4. Không mất dữ liệu ở bất kỳ bước nào — migration/rollback đều thuần cấu trúc (`ADD`/`DROP COLUMN`), không có `UPDATE`/backfill dữ liệu nào (khác Category Migration C có `UPDATE ... SET status = 'ARCHIVED'`).

**Nếu code lỗi (không phải migration):**
- Chưa merge/commit → sửa tại chỗ hoặc bỏ toàn bộ nhánh code chưa từng commit (đúng `RELEASE_RULES.md` §1).
- Đã commit nhưng chưa push → `git reset --soft HEAD~1` (không `--hard`) sau khi xác nhận qua `git log origin/main..HEAD` rằng commit thực sự chưa push (đúng tiền lệ đã dùng ở T006).
- Đã push → không revert tự động, báo cáo Architect và chờ chỉ đạo (ngoài phạm vi tự quyết của Claude Code).

## 8. Acceptance Checklist

Checklist đầy đủ trước khi code — đối chiếu lại ngay trước khi bắt đầu Commit 1:

- [ ] SPEC-BRAND-001 đã APPROVED, không có thay đổi nào chưa qua Architecture Review kể từ đó (SPEC Freeze — Decision T007-01)
- [ ] Migration Plan (§2) đã xác nhận: đúng 1 migration, có `rollback.sql`, có bước Verify
- [ ] File Impact (§1) không sót file nào — đối chiếu lại với `brand-dependency-audit.md` để không bỏ sót consumer nào
- [ ] Dependency Impact (§3) xác nhận 0 module khác cần sửa ngoài `error-codes.ts`/`permission-catalog.ts`
- [ ] Commit Strategy (§4) đã điều chỉnh đúng theo R5 (`error-codes.ts` ở Commit 2, không phải Commit 4)
- [ ] Test Strategy (§5) đủ 12 nhóm: Unit/Integration/Regression/Permission/Optimistic Lock/Multi Tenant/Pagination/Restore/Archive/Search/Sort/isActive
- [ ] Risk Matrix (§6) không còn Risk nào ở mức "Cao" thiếu Mitigation cụ thể (R4 đã có Mitigation)
- [ ] Rollback Strategy (§7) đã xác nhận không có bước nào gây mất dữ liệu
- [ ] `AUTHORIZATION — T007 – Brand Implementation` từ Architect đã có trước khi chạm Commit 1 (Decision T007-04 — bắt buộc)
- [ ] Đúng thứ tự Coding Rules (Decision T007-05): Migration → Build PASS → TypeCheck PASS → Lint PASS → Repository → Build PASS → Application → Build PASS → Controller → Build PASS → Tests → Documentation → Release — không gộp bước nào
- [ ] Regression Baseline (Sprint-00 + T005 + T006) chạy PASS trước khi đóng T007 (Decision T007-06)
- [ ] Coverage module `brand` sau khi hoàn thành không thấp hơn baseline hiện tại (91.41% stmts)

## Lịch sử quyết định

- **SPEC-BRAND-001** — Claude Code viết theo ủy quyền `ARCHITECT RESOLUTION — RFC-0003 Brand Domain` (Decision RQ1-RQ5).
- **`ARCHITECT DECISION — APPROVE SPEC-BRAND-001 & AUTHORIZE T007 IMPLEMENTATION PLAN`** (Decision T007-01 đến T007-06) — APPROVED, không phát hiện xung đột kiến trúc; SPEC Freeze chính thức (T007-01); ủy quyền tạo Implementation Plan này theo cấu trúc 8 mục bắt buộc (T007-02); xác nhận chưa được code (T007-03); Architecture Review bắt buộc trước khi code (T007-04); quy trình coding theo thứ tự cố định, không gộp bước (T007-05); Regression Baseline mở rộng bắt buộc PASS (T007-06).
- Implementation Plan này (tài liệu hiện tại) — chờ Architecture Review, chỉ được phép AUTHORIZATION riêng `T007 – Brand Implementation` mới bắt đầu code (Decision T007-04).
