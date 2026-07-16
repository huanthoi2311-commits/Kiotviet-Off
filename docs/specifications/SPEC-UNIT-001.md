# SPEC-UNIT-001 — Unit Domain

**Status:** APPROVED WITH FINAL DECISIONS (`ARCHITECTURE REVIEW – SPEC-UNIT-001`, Decision SU01-SU10) — **LOCKED** (Decision SU10). Mọi thay đổi sau đây phản ánh SU01-SU10; thay đổi phát sinh mới phải qua Architect Decision riêng, không sửa âm thầm.
**Nguồn:** `RFC-0004 — Unit Domain (Version 1.0)` + `ARCHITECTURE REVIEW – RFC-0004 Unit Domain` (Decision RQ1-RQ10) + `ARCHITECTURE REVIEW – SPEC-UNIT-001` (Decision SU01-SU10) — ràng buộc bắt buộc của SPEC này.
**Bản chất:** Refactor/mở rộng module `unit` **đang chạy thật** (không phải module mới) — thêm `status` (enum riêng `UnitStatus`), `version` (Optimistic Lock), Restore đầy đủ, mở rộng Delete Guard sang cả `Barcode` (không chỉ `Product`), chuẩn hóa Query API.
**Tác giả SPEC:** Claude Code, theo ủy quyền tường minh trong `AUTHORIZATION` của `ARCHITECTURE REVIEW – RFC-0004 Unit Domain` (carve-out Decision G02: "SPEC chỉ được viết khi có chỉ định rõ ràng theo từng trường hợp").

## 0. Giải quyết 3 điểm còn mở (Decision SU01-SU04, đã chốt — không còn mở)

Bản nháp SPEC ban đầu có 3/9 câu hỏi RFC-0004 §14 chưa được RQ1-RQ10 giải quyết, cộng 1 điểm tự quyết định cần xác nhận lại (`isActive`). Toàn bộ đã được `ARCHITECTURE REVIEW – SPEC-UNIT-001` chốt:

| # | Câu hỏi | Quyết định |
|---|---|---|
| 5 | `hasActiveProductsInUnit()` không lọc `Product.status` | **Decision SU01**: sửa lại — chỉ tính Product thỏa ĐỒNG THỜI `deletedAt IS NULL` VÀ `status = ACTIVE`. Không tính `INACTIVE`/`ARCHIVED`. Lý do: Delete Guard chỉ cần chặn khi Unit còn được dùng **thực tế**. |
| 6 | `existsByCode()` không được gọi — giữ hay xóa | **Decision SU02**: giữ nguyên, không xóa, không refactor. Đánh dấu **Reserved API** — phục vụ Import Excel/Bulk Import/API Validation/ERP Integration sau này. Không tối ưu hóa sớm. |
| 8 | `update()`/`softDelete()` không lọc `organizationId` ở `where` | **Decision SU03**: từ Sprint này trở đi, mọi Repository Update/Delete phải dùng `WHERE id AND organizationId`, không ngoại lệ. Riêng Product/Category/Brand/Unit — module nào còn Repository method cũ được sửa **trong đúng Sprint tương ứng của module đó** (không Hotfix riêng). **Unit đang ở đúng Sprint của mình (T008)** → SPEC này áp dụng SU03 ngay cho `unit.update()`/`softDelete()`/`restore()` mới. **Không** áp dụng ngược cho Product/Category/Brand (chưa tới Sprint của các module đó). |
| — | `isActive` — alias hay cột schema mới? | **Decision SU04**: xác nhận Alias đúng — không tạo cột. `isActive=true` → `status=ACTIVE`. Trở thành **chuẩn cho toàn bộ Master Data** (không chỉ Unit/Brand). |

Không còn điểm nào bỏ ngỏ trong SPEC này.

## 1. Entity

### 1.1 `UnitEntity` — thay đổi so với hiện tại

```ts
// THÊM
status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';  // Decision RQ1 — UnitStatus riêng, KHÔNG dùng CommonStatus, KHÔNG có DRAFT
version: number;                              // Decision RQ2 — Optimistic Lock
```

Toàn bộ field còn lại (`id`, `organizationId`, `code`, `name`, `symbol`, `createdAt`, `updatedAt`, `deletedAt`) **giữ nguyên**. **Không thêm cột `isActive`** (xem §0 — alias, không phải schema).

**`status` mặc định khi tạo mới**: `ACTIVE` — đúng tiền lệ `ProductStatus`/`CategoryStatus @default(ACTIVE)`. `UnitStatus` không có `DRAFT` (Decision RQ1 chỉ liệt kê đúng 3 giá trị `ACTIVE`/`INACTIVE`/`ARCHIVED`) nên không có khái niệm "trạng thái soạn thảo" cho Unit.

## 2. Aggregate

```
Unit (Aggregate Root, version — Decision RQ2)
```

Không có entity con. Quan hệ ra ngoài Aggregate: `Product.unitId` (bắt buộc, `Restrict`) và `Barcode.unitId` (optional, `SetNull`) — **2 quan hệ**, khác Brand (1 quan hệ) — đúng Decision U09 "High Impact Aggregate".

## 3. Migration

**Không migration nào được tạo ở bước SPEC này.** 2 migration độc lập (Decision RQ9 — "Migration độc lập... Không Backfill phức tạp"), đúng nguyên tắc dự án (mỗi thay đổi schema độc lập có migration độc lập):

### 3.1 Migration A — `version` (Optimistic Lock)

```sql
ALTER TABLE "units" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
```

### 3.2 Migration B — `UnitStatus` (Decision RQ1)

```sql
CREATE TYPE "UnitStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
ALTER TABLE "units" ADD COLUMN "status" "UnitStatus" NOT NULL DEFAULT 'ACTIVE';
-- Backfill (đơn giản, đúng Decision RQ9 "không backfill phức tạp" — 1 UPDATE, đúng mẫu Migration C
-- của Category): Unit đã soft-delete từ trước -> ARCHIVED (nhất quán "Archive = Soft Delete").
UPDATE "units" SET "status" = 'ARCHIVED' WHERE "deletedAt" IS NOT NULL;
```

Không có migration nào `DROP` dữ liệu hiện có (Decision RQ9). A/B độc lập, không phụ thuộc lẫn nhau, mỗi migration có `rollback.sql` riêng (§14).

## 4. API

**Không thêm route path mới ngoài `restore`:**

| Route | Thay đổi |
|---|---|
| `POST /units` | Thêm `status?` (optional, default `ACTIVE`, **chỉ nhận `ACTIVE`/`INACTIVE`** — không tạo trực tiếp ở `ARCHIVED`). |
| `GET /units` | Chuẩn hóa đủ 7 tham số (Decision RQ7) — xem §4.1. |
| `GET /units/:id` | Response thêm `status`, `version`. |
| `PATCH /units/:id` | Thêm `version` bắt buộc (409 nếu sai). Thêm `status?` (**chỉ nhận `ACTIVE`/`INACTIVE`** — không set `ARCHIVED` qua route này, đúng mẫu Category Decision S01, áp dụng lại vì cùng hình dạng status 3 giá trị có `ARCHIVED`). |
| `DELETE /units/:id` | Set cả `status=ARCHIVED` lẫn `deletedAt`. Guard **mở rộng theo Decision RQ5**: chặn nếu còn `Product` HOẶC `Barcode` chưa xóa mềm đang tham chiếu Unit (§8, §10). |
| `POST /units/:id/restore` | **MỚI** (Decision RQ3). Trả `status` về `INACTIVE` — không bao giờ trực tiếp `ACTIVE`. |

### 4.1 Query Parameter cho `GET /units` (Decision RQ7)

```
page, limit, search, sortBy, sortOrder, status, isActive
```

`search` theo `name`/`code` (đúng mẫu hiện có, không đổi). `sortBy` nhận `name`/`code`/`createdAt`, mặc định `name` (đúng hành vi hardcode hiện tại, nay tường minh). `isActive` là **alias** cho `status=ACTIVE`/`status != ACTIVE` (§0), có thể dùng đồng thời với `status` (đúng mẫu Brand Decision RQ4 — AND cả 2 điều kiện, không cái nào thắng cái nào).

## 5. Validation

Thêm vào `CreateUnitDto`:

```ts
@IsOptional()
@IsIn(['ACTIVE', 'INACTIVE'])  // KHÔNG cho tạo trực tiếp ở ARCHIVED
status?: UnitStatus;
```

Thêm vào `UpdateUnitDto`:

```ts
@IsInt()
version: number;  // bắt buộc — Optimistic Lock

@IsOptional()
@IsIn(['ACTIVE', 'INACTIVE'])  // KHÔNG cho set ARCHIVED qua PATCH — chỉ qua DELETE
status?: UnitStatus;
```

**Áp dụng lại nguyên tắc Category Decision S01** (toàn bộ business rule Archive/Restore tập trung đúng 1 đường, không có shortcut) — hợp lý vì `UnitStatus` có hình dạng giống `CategoryStatus` (có `ARCHIVED` là 1 giá trị thật, khác `CommonStatus` của Brand). Đây là suy luận từ việc chọn hình dạng status ở Decision RQ1, không phải quyết định độc lập cần hỏi lại.

## 6. Permission

Thêm **1 permission mới**: `unit:restore` (Decision RQ8 — `crud('unit', 'đơn vị tính', ['restore'])`). Giữ nguyên 4 permission hiện có.

## 7. Multi-tenant

Không đổi hành vi đường đọc (đã đúng chuẩn — Audit §4). Đường ghi (`update`/`softDelete`/`restore` mới) **nay bắt buộc lọc `organizationId` ở `where`** (Decision SU03, áp dụng ngay trong Sprint T008 — xem §0 và §10.1 cho chữ ký method cụ thể). Đây là module ĐẦU TIÊN áp dụng chuẩn này — Product/Category/Brand giữ nguyên hành vi cũ, chỉ sửa khi tới đúng Sprint của từng module (Decision SU03, không Hotfix riêng).

## 8. Delete Guard — mở rộng sang Barcode (Decision RQ5)

**Hiện tại**: `UnitService.remove()` chỉ gọi `ProductDomainService.hasActiveProductsInUnit(id)`.

**Yêu cầu mới (Decision RQ5)**: kiểm tra CẢ `Product` LẪN `Barcode` — nếu 1 trong 2 còn tham chiếu (chưa xóa mềm), chặn Archive, không để dữ liệu "mồ côi" (Barcode còn `unitId` trỏ tới Unit đã Archive).

**Thiết kế (hệ quả kỹ thuật của Decision RQ5, cần 1 điểm chạm mới ngoài `unit` module):**

- `Barcode` hiện **không có** cơ chế tương đương `ProductDomainService` cho module khác đọc — `BarcodeModule` chỉ export `BARCODE_REPOSITORY` thô (0 consumer hiện tại, xác nhận qua grep).
- Đúng ADR-0010 (Repository Boundary — cross-module đọc qua DomainService, không inject Repository trực tiếp), **thêm mới `BarcodeDomainService`** (file mới `barcode/application/barcode-domain.service.ts`, đúng mẫu `ProductDomainService`):

```ts
@Injectable()
export class BarcodeDomainService {
  constructor(
    @Inject(BARCODE_REPOSITORY)
    private readonly barcodeRepository: IBarcodeRepository,
  ) {}

  hasActiveBarcodesInUnit(unitId: string): Promise<boolean> {
    return this.barcodeRepository.hasActiveBarcodesInUnit(unitId);
  }
}
```

- `IBarcodeRepository`/`PrismaBarcodeRepository` thêm `hasActiveBarcodesInUnit(unitId)` — `where: { unitId, deletedAt: null }` (Barcode không có `status`, không cần lọc thêm — khác Product).
- `BarcodeModule.exports` thêm `BarcodeDomainService` (giữ nguyên `BARCODE_REPOSITORY` export hiện có — không xóa, ngoài phạm vi SPEC này, đúng nguyên tắc chạm tối thiểu đã áp dụng cho `product` ở T006 Decision Q8/S03).
- `UnitModule` thêm `imports: [..., BarcodeModule]`, `UnitService` inject thêm `BarcodeDomainService`.

**Sửa `hasActiveProductsInUnit()` theo Decision SU01** (touch thứ 2 tới module `product`, ngoài `BarcodeDomainService` mới ở `barcode`):

```ts
// prisma-product.repository.ts — TRƯỚC
async hasActiveProductsInUnit(unitId: string): Promise<boolean> {
  const found = await this.prisma.product.findFirst({
    where: { unitId, deletedAt: null },
    select: { id: true },
  });
  return !!found;
}

// SAU (Decision SU01 — chỉ tính Product status=ACTIVE, không tính INACTIVE/ARCHIVED)
async hasActiveProductsInUnit(unitId: string): Promise<boolean> {
  const found = await this.prisma.product.findFirst({
    where: { unitId, deletedAt: null, status: 'ACTIVE' },
    select: { id: true },
  });
  return !!found;
}
```

**Đây là thay đổi hành vi có chủ đích** (không chỉ thêm field) — trước đây MỌI Product chưa xóa mềm (bất kể status) đều chặn xóa Unit; sau Decision SU01, chỉ Product `status=ACTIVE` mới chặn. 1 Unit chỉ còn Product `INACTIVE`/`ARCHIVED` tham chiếu **sẽ xóa được** sau thay đổi này (trước đây không xóa được) — cần test riêng xác nhận đúng hành vi mới (§13), và ghi vào Breaking/Behavior Change khi viết Release Note.

**Hiệu năng (Decision SU09)**: cả `hasActiveProductsInUnit()` và `hasActiveBarcodesInUnit()` dùng `findFirst` + `select: { id: true }` — biên dịch thành truy vấn dạng EXISTS/LIMIT 1 ở tầng Prisma/Postgres, không tải toàn bộ dữ liệu, không N+1 (chỉ 2 query độc lập, không lặp trong vòng lặp nào).

**`UnitService.remove()` mới:**

```ts
const hasProducts = await this.productDomainService.hasActiveProductsInUnit(id);
if (hasProducts) throw new UnprocessableEntityException(withCode(ErrorCode.UNIT_IN_USE, 'Không thể xóa đơn vị tính đang có sản phẩm sử dụng'));

const hasBarcodes = await this.barcodeDomainService.hasActiveBarcodesInUnit(id);
if (hasBarcodes) throw new UnprocessableEntityException(withCode(ErrorCode.UNIT_IN_USE, 'Không thể xóa đơn vị tính đang có mã vạch sử dụng'));
```

Tái dùng đúng 1 error code `UNIT_IN_USE` (`UNIT_003`, đã có) cho cả 2 điều kiện, khác thông điệp — đúng tinh thần "1 error code cho 1 loại nghiệp vụ" đã áp dụng cho `CATEGORY_HAS_ACTIVE_DESCENDANT` (bao toàn bộ cây, không cần code riêng từng cấp).

**Đây là thay đổi DUY NHẤT chạm tới code `barcode`** (module đã có sẵn) — được Decision RQ5 xác nhận tường minh là hợp lệ, đúng phạm vi tối thiểu như Category từng chạm `product` ở T006 (Decision Q8/S03).

## 9. Restore

`POST /units/:id/restore` (Decision RQ3): xóa `deletedAt`, set `status = INACTIVE` (luôn luôn, không phụ thuộc giá trị trước Archive). **Không có guard nghiệp vụ nào khác** — Unit không phân cấp (không có chuỗi tổ tiên như Category), không cần kiểm tra gì thêm ngoài "đã từng bị xóa mềm chưa" (đúng mẫu `CATEGORY_NOT_DELETED`/tương đương `BRAND_NOT_DELETED` — thêm `UNIT_NOT_DELETED` mới).

## 10. Repository

### 10.1 `IUnitRepository` — thay đổi interface

```ts
// Decision SU03 — organizationId bắt buộc trong where của MỌI method ghi, đúng chuẩn mới áp
// dụng lần đầu ở Unit (Product/Category/Brand chưa đổi, chờ đúng Sprint của từng module).
update(id: string, organizationId: string, expectedVersion: number, input: UpdateUnitInput): Promise<UnitEntity>;
// ném UnitConcurrencyConflictError nếu version không khớp HOẶC id/organizationId không khớp dòng nào
softDelete(id: string, organizationId: string, deletedBy: string): Promise<void>;
restore(id: string, organizationId: string, restoredBy: string): Promise<void>;
findByIdIncludingDeleted(id: string, organizationId: string): Promise<UnitEntity | null>;
```

**Chữ ký khác Brand/Category** (vốn không có `organizationId` ở `update`/`softDelete`) — đây là divergence có chủ đích theo Decision SU03, không phải lỗi thiếu nhất quán. `updateMany`/`prisma.unit.update` ở `PrismaUnitRepository` dùng `where: { id, organizationId, version: expectedVersion }` (update) hoặc `where: { id, organizationId }` (softDelete/restore).

Thêm vào `UpdateUnitInput`: `status?: UnitStatus`. Thêm `UnitSearchParams`/`UnitSearchResult` (đúng mẫu Brand §7.1) với `isActive?`/`sortBy`/`sortOrder`. Thêm type `UnitSortField = 'name' | 'code' | 'createdAt'`, `UnitSortOrder = 'asc' | 'desc'`.

**Lỗi domain mới**: `UnitConcurrencyConflictError` (file mới `domain/errors/unit.errors.ts`, đúng mẫu `brand.errors.ts`/`category.errors.ts`).

### 10.2 `search()` — `isActive` (đúng mẫu Brand §7.2)

`AND` composition giữa `status` và `isActive` khi cả 2 cùng gửi (không cái nào override cái nào) — đúng thiết kế đã dùng cho Brand.

### 10.3 `UNIT_REPOSITORY` — export (Decision RQ6)

**KHÔNG thay đổi.** Tiếp tục export, tiếp tục 0 consumer trực tiếp. Không tạo `UnitDomainService` (Decision RQ6 — YAGNI, xác nhận lại từ Decision U08).

## 11. DTO

- `CreateUnitDto`: thêm `status?` (§5).
- `UpdateUnitDto`: thêm `status?`, thêm `version` (bắt buộc).
- `UnitResponseDto`: thêm `status`, `version`.
- **`UnitQueryDto`**: thêm `isActive`, `sortBy` (`name`/`code`/`createdAt`, default `name`), `sortOrder` (default `asc`).

## 12. Event (Decision RQ4 — CHỈ định nghĩa, KHÔNG publish)

| Event | Khi nào |
|---|---|
| `UnitCreated` | Sau `POST /units` thành công |
| `UnitUpdated` | Sau `PATCH /units/:id` thành công |
| `UnitArchived` | Sau `DELETE /units/:id` thành công |
| `UnitRestored` | Sau `POST /units/:id/restore` thành công |

4 hook no-op trong `UnitService` (đúng mẫu `CategoryService`/`BrandService`), không TODO/FIXME.

## 13. Test

Theo `TEST_RULES.md` (5 lớp):

1. **Unit** (đúng danh sách bắt buộc Decision SU08 — "Không được thiếu"): Delete Guard Product (đã có, cập nhật cho filter `status=ACTIVE` mới — Decision SU01, gồm case Product `INACTIVE` KHÔNG còn chặn xóa); Delete Guard Barcode (**mới**, Decision RQ5); Optimistic Lock (conflict → 409, thành công tăng `version`); Restore (thành công →`INACTIVE`, restore khi chưa xóa → lỗi); Pagination (không đổi, xác nhận không vỡ); Search (không đổi); Sort (`sortBy=code`/`createdAt`/`name`); Multi Tenant (Decision SU03 — `update`/`softDelete`/`restore` với `organizationId` khác tổ chức → không tìm thấy/không sửa được dòng nào); Permission (`unit:restore` riêng); Regression (toàn bộ `npx jest`). Thêm test mới cho `BarcodeDomainService.hasActiveBarcodesInUnit()` và `hasActiveProductsInUnit()` bản sửa (module `product`/`barcode`, phạm vi tối thiểu).
2. **Integration**: cập nhật `unit.e2e-spec.ts` (đã tồn tại) — thêm case Restore/Optimistic Lock/Barcode-guard/isActive, đúng mẫu đã làm cho `brand.e2e-spec.ts` ở T007. PENDING nếu không có Docker.
3. **Architecture**: không viết mới cho `UnitDomainService` (không tạo — Decision RQ6). Có thể cần xác nhận Architecture Test hiện có (nếu có) không vỡ do `UnitModule` thêm `imports: [BarcodeModule]`.
4. **Performance** (Decision SU09): không cần benchmark script riêng (Unit không có cấu trúc cây, quy mô dữ liệu nhỏ, đúng lý do đã áp dụng cho Brand) — chỉ cần xác nhận qua code review 2 method Delete Guard dùng `findFirst`/`select` (không N+1, không tải toàn bộ dữ liệu), đã ghi ở §8.
5. **Security**: không tạo mới.

## 14. Acceptance Criteria

| # | Tiêu chí |
|---|---|
| 1 | Build/Lint/TypeCheck PASS |
| 2 | Unit Test PASS, Coverage module `unit` không thấp hơn baseline (Audit §11: unit.service.ts 100%, prisma-unit.repository.ts 100% stmt — tổng thể phải giữ tương đương hoặc cao hơn) |
| 3 | `PATCH /units/:id` sai `version` → `409`, mọi UPDATE đều tăng `version` |
| 4 | `POST /units/:id/restore` hoạt động đúng, permission `unit:restore` riêng, luôn set `status=INACTIVE` |
| 5 | `DELETE /units/:id` chặn nếu còn Product **HOẶC** Barcode chưa xóa mềm tham chiếu (Decision RQ5) — 2 kịch bản test riêng |
| 6 | `GET /units` hỗ trợ đủ 7 tham số Query Convention (Decision RQ7) |
| 7 | `isActive` không tạo cột schema mới, chỉ alias cho `status` (§0) |
| 8 | Không tạo `UnitDomainService` (Decision RQ6) |
| 9 | `BarcodeDomainService` mới chỉ có đúng 1 method (`hasActiveBarcodesInUnit`) — không mở rộng thêm ngoài nhu cầu Decision RQ5 |
| 10 | Migration A/B độc lập, có rollback, không `DROP` dữ liệu hiện có |
| 11 | Existing Tests (37 test hiện có ở `unit`, tests hiện có ở `barcode`) không vỡ |
| 12 | Regression Baseline (T005+T006+T007) vẫn PASS |
| 13 | `hasActiveProductsInUnit()` chỉ chặn khi Product `status=ACTIVE` (Decision SU01) — Product `INACTIVE`/`ARCHIVED` không còn chặn xóa Unit |
| 14 | `existsByCode()` giữ nguyên, không xóa, không refactor (Decision SU02 — Reserved API) |
| 15 | Mọi method ghi (`update`/`softDelete`/`restore`) của `unit` lọc `organizationId` trong `where` (Decision SU03) |
| 16 | Integration Test PASS — PENDING nếu không có Docker |
| 17 | Không TODO/FIXME/`any` không cần thiết |

## 15. Implementation Order

```
Migration A (version) → Migration B (UnitStatus)
  ↓
product module (sửa hasActiveProductsInUnit() thêm status=ACTIVE — Decision SU01, phạm vi tối thiểu)
  ↓
barcode module (BarcodeDomainService mới, hasActiveBarcodesInUnit — Decision RQ5, phạm vi tối thiểu)
  ↓
Repository unit (UnitEntity, IUnitRepository, PrismaUnitRepository, unit.errors.ts — bao gồm organizationId ở where, Decision SU03)
  ↓
Application unit (UnitService: Restore, Optimistic Lock, Delete Guard mở rộng gọi cả 2 DomainService, Event hook no-op)
  ↓
Controller + DTO unit (UnitQueryDto mở rộng, route restore mới)
  ↓
permission-catalog.ts (unit:restore)
  ↓
Test
  ↓
Documentation
  ↓
Architecture Review
```

`product`/`barcode` đi TRƯỚC `unit` Repository vì `UnitService` cần cả `ProductDomainService` (đã sửa) và `BarcodeDomainService` (mới) tồn tại trước khi wiring Delete Guard — đúng thứ tự phụ thuộc kỹ thuật thật, không phải tùy ý. Chi tiết chia commit cụ thể (số lượng, gộp/tách `product`+`barcode`) thuộc phạm vi Implementation Plan, không phải SPEC.

## 16. Rollback Plan

- **Schema**: Rollback A: `ALTER TABLE units DROP COLUMN version`. Rollback B: `ALTER TABLE units DROP COLUMN status`, `DROP TYPE "UnitStatus"`. Không có `DROP VALUE` enum (enum hoàn toàn mới).
- **Code**: nếu Acceptance Criteria không đạt, không merge/commit.
- **`barcode` module**: nếu cần rollback riêng phần `BarcodeDomainService`, chỉ xóa file mới + dòng export — không ảnh hưởng `BARCODE_REPOSITORY`/`BarcodeService` hiện có (thuần thêm mới, không sửa code cũ).

## Lịch sử quyết định

- **RFC-0004 — Unit Domain (Version 1.0)** — Claude Code viết theo ủy quyền `ARCHITECTURE REVIEW – Unit Dependency Audit` (Decision U12), trình bày trung lập (không đề xuất 1 phương án) cho Lifecycle/Optimistic Lock/Archive-Restore/Domain Events (Decision U10), phát hiện thêm 1 câu hỏi mới (Barcode guard).
- **`ARCHITECTURE REVIEW – RFC-0004 Unit Domain`** (Decision RQ1-RQ10) — APPROVED WITH FINAL DECISIONS: UnitStatus riêng 3 giá trị (RQ1), version (RQ2), Restore→INACTIVE (RQ3), Domain Event reserve-only (RQ4), Delete Guard mở rộng Product+Barcode (RQ5), giữ YAGNI Repository Boundary (RQ6), Query Convention đủ 7 tham số (RQ7), permission `unit:restore` (RQ8), Migration độc lập không backfill phức tạp (RQ9), xác nhận flag governance của Claude Code là đúng, không đổi PROJECT_RULES (RQ10). Ủy quyền viết SPEC-UNIT-001, không Implementation Plan, không code, không commit SPEC.
- **`ARCHITECTURE REVIEW – SPEC-UNIT-001`** (Decision SU01-SU10) — APPROVED WITH FINAL DECISIONS: chốt cả 3 câu hỏi còn mở (SU01 sửa `hasActiveProductsInUnit()` thêm `status=ACTIVE`, SU02 giữ `existsByCode()` là Reserved API, SU03 thêm `organizationId` vào `where` mọi method ghi — áp dụng ngay cho Unit, chưa áp dụng ngược cho Product/Category/Brand), xác nhận `isActive` là alias và trở thành chuẩn Master Data (SU04), APPROVE `BarcodeDomainService` đúng 1 method (SU05), xác nhận Repository Boundary hiện tại (SU06), Migration Strategy APPROVED (SU07), danh sách Test bắt buộc (SU08), yêu cầu hiệu năng EXISTS/COUNT không N+1 (SU09), SPEC LOCKED sau khi cập nhật (SU10). Ủy quyền bắt đầu Implementation Plan, không code/migration/commit.
- SPEC-UNIT-001 (tài liệu này, đã cập nhật theo SU01-SU10) — LOCKED, không còn điểm mở nào.
