# SPEC-BARCODE-001 — Barcode Domain

**Status:** APPROVED WITH FINAL DECISIONS (`ARCHITECTURE REVIEW – SPEC-BARCODE-001`, Decision SB01-SB10) — LOCKED (Decision SB10). §9.3/§9.4/§9.5 (module composition) đã qua 2 vòng Amendment (Decision CD01-CD12, sau đó RPC01-RPC12) và **LOCKED lại ở thiết kế cuối cùng** (3 module: `BarcodePersistenceModule`/`BarcodeReferenceModule`/`BarcodeModule`) — xem §9.5.
**Nguồn:** `RFC-0005 — Barcode Domain (Version 1.0)` (Architect soạn trực tiếp) + `ARCHITECTURE REVIEW – RFC-0005 Barcode Domain` (Claude Code, liệt kê 1 mâu thuẫn + 8 khoảng trống + 7 câu hỏi mở) + `ARCHITECT RESOLUTION — RFC-0005 Barcode Domain` (Decision BQ1-BQ11) + `ARCHITECTURE REVIEW – SPEC-BARCODE-001` (Decision SB01-SB10) + `ARCHITECT RESOLUTION — T009 Circular Module Dependency` (Decision CD01-CD12) + `ARCHITECT RESOLUTION — T009 Barcode Repository Ownership Correction` (Decision RPC01-RPC12) — ràng buộc bắt buộc của SPEC này.
**Bản chất:** Refactor/mở rộng module `barcode` **đang chạy thật** (không phải module mới) — thêm `status`/`version`, Restore đầy đủ, route tra cứu org-wide mới, sửa 2 vi phạm ADR đã tồn tại từ trước (thiếu `organizationId` ở write path — ADR-0003; export `BARCODE_REPOSITORY` sai chuẩn — ADR-0010), Delete Guard đặc thù (default-barcode + Product status), Optimistic Lock mở rộng sang Archive/Restore/SetDefault (khác mặc định chuẩn dự án).
**Tác giả SPEC:** Claude Code, theo ủy quyền tường minh trong `AUTHORIZATION` của `ARCHITECT RESOLUTION — RFC-0005 Barcode Domain`.

## 0. Giải quyết 5 điểm cần lưu ý (Decision SB01-SB05, đã chốt — không còn mở)

Bản nháp SPEC ban đầu có 5 điểm lệch khỏi mặc định chuẩn/hệ quả kiến trúc cần xác nhận. Toàn bộ đã được `ARCHITECTURE REVIEW – SPEC-BARCODE-001` chốt:

1. **Route hybrid** (BQ1) — **Decision SB01**: APPROVED, ghi nhận chính thức là **Exception có chủ đích** của `MASTER_DATA_TEMPLATE.md` §7, không coi là vi phạm.
2. **Optimistic Lock mở rộng Archive/Restore/SetDefault** (BQ10) — **Decision SB02**: APPROVED. Module-specific Decision (BQ10) có hiệu lực cao hơn `DEFAULT_DECISIONS.md` — không cần sửa `DEFAULT_DECISIONS.md`, tài liệu đó vẫn đúng vai trò "mặc định trừ khi RFC nói khác."
3. **`UnitDomainService` mới** (hệ quả BQ11) — **Decision SB03**: APPROVED. Xác nhận đây không phải SPEC tự mở rộng phạm vi — BQ11 tạo ra consumer thứ 2 của Unit, đây chính là thời điểm nguyên tắc YAGNI (Decision U08/RQ6/SU06/UP02) kết thúc theo đúng logic ban đầu của chính nguyên tắc đó (chỉ tạo khi có consumer thật).
4. **Xóa `UNIT_REPOSITORY` khỏi `UnitModule.exports`** — **Decision SB04**: APPROVED, thực hiện trong phạm vi T009. Sau khi có `UnitDomainService`, `UnitModule` chỉ export `UnitDomainService`. Bổ sung Architecture Test tương tự Barcode (§9.3) cho `unit`.
5. **Diễn giải BQ9 (Audit không vào transaction)** — **Decision SB05**: APPROVED, xác nhận đúng cách hiểu bảo thủ đã chọn — `AuditLogService` giữ nguyên kiến trúc hiện tại, KHÔNG đưa vào Prisma Transaction. "Atomic" ở Decision BQ9 chỉ áp dụng cho dữ liệu nghiệp vụ (Barcode row), không áp dụng cho Audit Infrastructure.

Không còn điểm nào bỏ ngỏ trong SPEC này.

## 1. Entity

### 1.1 `BarcodeEntity` — thay đổi so với hiện tại

```ts
export type BarcodeStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';  // Decision BQ3 — 3 giá trị hợp lệ, KHÔNG tuần tự bắt buộc

export interface BarcodeEntity {
  id: string;
  organizationId: string;   // MỚI thêm lại vào Entity (hiện bị bỏ qua ở toEntity()) — nhất quán hình dạng Entity với Product/Category/Brand/Unit
  productId: string;
  unitId: string | null;
  code: string;
  type: BarcodeType;
  isDefault: boolean;
  status: BarcodeStatus;    // MỚI — Decision BQ3
  version: number;          // MỚI — Decision RQ2 gốc/BQ10
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
```

`status` mặc định `ACTIVE` khi tạo mới (đúng tiền lệ toàn dự án).

## 2. Aggregate

```
Barcode (Aggregate Root, version — Decision BQ10)
```

Không có entity con. Quan hệ ra ngoài Aggregate: **thuộc về** `Product` (bắt buộc, `onDelete: Cascade` — khác mọi Master Data khác, Barcode là con của Product, không phải Product tham chiếu Barcode); tham chiếu tùy chọn `Unit` (`unitId`, optional, `onDelete: SetNull`). `productId` **bất biến sau khi tạo** (Decision BQ4 — không cho chuyển Barcode sang Product khác, phải Archive + tạo mới).

## 3. Migration

**Không migration nào được tạo ở bước SPEC này.** 2 migration độc lập, đúng nguyên tắc dự án:

### 3.1 Migration A — `version`

```sql
ALTER TABLE "barcodes" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
```

### 3.2 Migration B — `BarcodeStatus`

```sql
CREATE TYPE "BarcodeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
ALTER TABLE "barcodes" ADD COLUMN "status" "BarcodeStatus" NOT NULL DEFAULT 'ACTIVE';
UPDATE "barcodes" SET "status" = 'ARCHIVED' WHERE "deletedAt" IS NOT NULL;
```

Không `DROP` dữ liệu. **Không migration nào cho `BarcodeType`** — giữ nguyên `QR` trong enum, không đổi (Decision BQ5).

## 4. API

### 4.1 Route quản lý (lồng dưới Product, Decision BQ1)

| Route | Thay đổi |
|---|---|
| `POST /products/:productId/barcodes` | Thêm `status?` (optional, default `ACTIVE`). |
| `GET /products/:productId/barcodes` | Không đổi — trả toàn bộ barcode của 1 Product, **không phân trang** (Decision BQ1 — số lượng barcode/product luôn nhỏ). |
| `PATCH /barcodes/:id` | Thêm `version` bắt buộc (409 nếu sai). Thêm `status?` (chỉ `ACTIVE`/`INACTIVE`). |
| `DELETE /barcodes/:id` | Nhận body `{ version }` bắt buộc (Decision BQ10). Guard mới — xem §8. |
| `POST /barcodes/:id/restore` | **MỚI** (Decision BQ3). Nhận body `{ version }` bắt buộc. Trả `status` về `INACTIVE`. |
| `POST /barcodes/:id/default` | Nhận thêm `version` bắt buộc (Decision BQ10) — hành vi atomic giữ nguyên (Decision BQ9). |

**Ghi chú kỹ thuật**: `DELETE`/`POST :id/restore`/`POST :id/default` đều cần nhận `version` trong request body — khác tiền lệ Product/Category/Brand/Unit (các route này trước đây không nhận body). Dùng 1 DTO dùng chung tối giản `BarcodeVersionDto { version: number }` cho cả 3 route (§9).

### 4.2 Route tra cứu org-wide (MỚI, Decision BQ1)

| Route | Mô tả |
|---|---|
| `GET /barcodes` | Tìm kiếm/lọc/phân trang toàn Organization — dùng cho kiểm tra trùng mã, màn hình quản trị, tích hợp máy quét/POS sau này. |

### 4.3 Query Parameter cho `GET /barcodes` (Decision BQ1 "Follow MASTER_DECISION")

```
page, limit, search, sortBy, sortOrder, status, isActive
```

`search` chỉ tìm theo `code` (Barcode không có field `name`). `sortBy` nhận `code`/`createdAt`, mặc định `sortBy=createdAt`, `sortOrder=desc` (**Decision SB08** — APPROVED, xác nhận default cho mọi Aggregate không có field `name`, không cần RFC riêng cho quy tắc chung này; áp dụng ngay tại Barcode). `isActive` là alias cho `status=ACTIVE`, không cột schema mới (đúng `DEFAULT_DECISIONS.md` #3). Query Convention tuân theo `MASTER_DECISION.md` — không tạo shape riêng ngoài 7 tham số chuẩn (**Decision SB09**).

## 5. Validation

Thêm vào `CreateBarcodeDto`/`UpdateBarcodeDto`: `status?` (`@IsIn(['ACTIVE','INACTIVE'])`). Thêm vào `UpdateBarcodeDto`: `version` bắt buộc (`@IsInt()`). DTO mới `BarcodeVersionDto { version: number }` (`@IsInt()`) dùng cho Archive/Restore/SetDefault.

**Validate `unitId` (Decision BQ11) — KHÔNG thể validate bằng decorator, cần Service guard**: nếu `unitId` được gửi, phải xác nhận Unit đó (a) tồn tại, (b) cùng `organizationId`, (c) `status != 'ARCHIVED'` — qua `UnitDomainService` (§9), ném lỗi nghiệp vụ (`BARCODE_UNIT_NOT_USABLE`) nếu vi phạm bất kỳ điều kiện nào.

## 6. Permission

Thêm `barcode:restore` (Decision BQ1 ngụ ý qua việc thêm route restore — `crud('barcode', 'mã vạch', ['restore'])`). `setDefault`/Archive tiếp tục dùng `barcode:update`/`barcode:delete` hiện có, không tạo permission riêng. `GET /barcodes` (org-wide) dùng lại `barcode:view` (không phân biệt với `GET /products/:productId/barcodes`).

## 7. Multi-tenant (Decision BQ8, ADR-0003)

Toàn bộ method ghi (`update`/`softDelete`/`restore`/`setDefault`) đổi chữ ký thêm `organizationId`, lọc trong `where` — sửa đúng lỗ hổng ADR-0003 đã tồn tại từ trước (Architecture Review đã ghi nhận `where: { id }` thuần cho cả 3 method này). `existsByCode()` đổi chữ ký thêm `organizationId` (Decision BQ6).

## 8. Delete Guard (Decision BQ2 — khác Unit/T008)

**Quy tắc chính xác**: KHÔNG chặn Archive vì "Product đang ACTIVE" nói chung — chỉ chặn khi **ĐỒNG THỜI** `barcode.isDefault === true` VÀ `product.status === 'ACTIVE'`. Barcode thường (`isDefault=false`) luôn Archive được dù Product đang ACTIVE.

```ts
// UnitService.remove() tương đương cho Barcode — pseudocode logic
const barcode = await this.barcodeRepository.findById(id, organizationId);
if (!barcode) throw notFound();

if (barcode.isDefault) {
  const product = await this.productDomainService.findById(barcode.productId, organizationId);
  if (product?.status === 'ACTIVE') {
    throw new UnprocessableEntityException(withCode(ErrorCode.BARCODE_CANNOT_ARCHIVE_DEFAULT,
      'Không thể xóa mã vạch mặc định khi sản phẩm đang hoạt động — đặt mã khác làm mặc định hoặc chuyển sản phẩm sang ngừng hoạt động trước'));
  }
}
await this.barcodeRepository.softDelete(id, organizationId, dto.version, actor.userId);
```

Tái dùng `ProductDomainService.findById()` đã có sẵn (đang dùng trong `assertProductExists()`) — không cần method `ProductDomainService` mới.

## 9. Repository

### 9.1 `IBarcodeRepository` — thay đổi interface

```ts
create(input: CreateBarcodeInput): Promise<BarcodeEntity>;
findById(id: string, organizationId: string): Promise<BarcodeEntity | null>;
findByIdIncludingDeleted(id: string, organizationId: string): Promise<BarcodeEntity | null>;  // MỚI, cho Restore
listByProduct(productId: string, organizationId: string): Promise<BarcodeEntity[]>;           // không đổi
search(params: BarcodeSearchParams): Promise<BarcodeSearchResult>;                             // MỚI, org-wide (§4.2)
update(id: string, organizationId: string, expectedVersion: number, input: UpdateBarcodeInput): Promise<BarcodeEntity>;
softDelete(id: string, organizationId: string, expectedVersion: number, deletedBy: string): Promise<void>;   // + expectedVersion (Decision BQ10)
restore(id: string, organizationId: string, expectedVersion: number, restoredBy: string): Promise<void>;      // MỚI + expectedVersion
setDefault(id: string, organizationId: string, productId: string, expectedVersion: number, updatedBy: string): Promise<BarcodeEntity>;  // + expectedVersion
existsByCode(organizationId: string, code: string, excludeId?: string): Promise<boolean>;      // + organizationId (Decision BQ6)
hasActiveBarcodesInUnit(unitId: string): Promise<boolean>;                                     // không đổi (T008)
```

Tất cả method ghi dùng `updateMany` compare-and-swap: `where: { id, organizationId, version: expectedVersion }` (hoặc `{ productId, organizationId, ...}` cho phần "unset default" của `setDefault`, không kiểm version — chỉ dòng barcode ĐÍCH được set default mới cần compare-and-swap version, đúng tinh thần BQ10 "thao tác này phải kiểm tra version" nói về chính bản ghi bị tác động).

**Lỗi domain mới**: `BarcodeConcurrencyConflictError` (file mới `domain/errors/barcode.errors.ts`, đúng mẫu `unit.errors.ts`).

### 9.2 `existsByCode()` — wiring thật (Decision BQ6)

`BarcodeService.create()`/`update()` gọi `existsByCode(organizationId, code, excludeId)` **TRƯỚC** khi ghi, ném `BARCODE_DUPLICATE` (đã có, `BARCODE_002`) nếu trùng — đúng thông điệp lỗi nghiệp vụ rõ ràng thay vì chỉ dựa bắt `P2002`. Giữ nguyên `translateWriteError()` bắt `P2002` làm lớp bảo vệ cuối (race condition giữa lúc check và lúc ghi) — 2 lớp cùng tồn tại (Decision BQ6).

### 9.3 `BARCODE_REPOSITORY` — export (Decision BQ7 → **thay thế bởi RPC01-RPC12, xem §9.5**)

**Thiết kế cuối cùng** (không còn "xóa export" đơn giản — 3 module tách biệt theo trách nhiệm, xem §9.5 để biết đầy đủ lý do): `BARCODE_REPOSITORY` chỉ đăng ký + export duy nhất từ `BarcodePersistenceModule` (module hạ tầng thuần túy, mới) — `BarcodeModule` và `BarcodeReferenceModule` import module này để lấy repository, không module nghiệp vụ nào khác được phép.

**Thêm Architecture Test** (`barcode-repository-boundary.architecture.spec.ts`, mới, 12 assertion theo Decision RPC08 — xem §9.5) — đúng mẫu `single-writer.architecture.spec.ts` (ADR-0012 Layer 3).

### 9.4 `UnitDomainService` — MỚI (hệ quả Decision BQ11, xem §0 mục 3-4)

```ts
// backend/src/modules/unit/application/unit-domain.service.ts — file mới
@Injectable()
export class UnitDomainService {
  constructor(
    @Inject(UNIT_REPOSITORY) private readonly unitRepository: IUnitRepository,
  ) {}

  findByIdForReference(organizationId: string, unitId: string): Promise<UnitEntity | null> {
    return this.unitRepository.findById(unitId, organizationId);
  }
}
```

Tên method đổi thành `findByIdForReference` (Decision CD05 — gợi ý, cần chốt khi code thật) thay vì `findById` trơn, làm rõ đây là truy vấn phục vụ module khác tham chiếu, không phải API nội bộ `unit` dùng cho chính nó. `BarcodeService` inject `UnitDomainService`, gọi khi `dto.unitId` có giá trị: nếu `null` → `BARCODE_UNIT_NOT_USABLE`; nếu `status === 'ARCHIVED'` → cùng lỗi.

**Xác nhận (Decision SB04/RPC09)**: `UnitModule` tiếp tục là registration owner của `UNIT_REPOSITORY` (đăng ký nội bộ, KHÔNG export — khác Barcode, vì `UnitService` VÀ `UnitDomainService` đều thuộc cùng `UnitModule`, không có rào cản cross-module nào cần tách riêng — Decision RPC09 xác nhận không tạo `UnitPersistenceModule`, tránh refactor thừa). `UnitModule` chỉ export `UnitDomainService`. Bổ sung Architecture Test cho `unit` tương tự `barcode` (§9.3).

### 9.5 Architecture Amendment — Circular Module Dependency (Decision CD01-CD12 → RPC01-RPC12, LOCKED)

**Lịch sử phát hiện** (giữ nguyên, không xóa): `UnitModule` đã import `BarcodeModule` từ T008 (Delete Guard, Decision RQ5/UP07). Yêu cầu `BarcodeModule` import `UnitModule` ngược lại (cho `UnitDomainService`) tạo circular module dependency thật. `ARCHITECT RESOLUTION — T009 Circular Module Dependency` (Decision CD01-CD12) đề xuất tách `BarcodeReferenceModule` nhưng còn 1 mâu thuẫn nội tại (`BarcodeReferenceModule` vừa phải giữ `BARCODE_REPOSITORY` vừa không được export nó, trong khi `BarcodeService` ở module khác cần dùng) — đã báo cáo, không tự chọn phương án.

**Giải quyết cuối cùng**: `ARCHITECT RESOLUTION — T009 Barcode Repository Ownership Correction` (Decision RPC01-RPC12) — **thay thế 1 phần CD02/CD03/CD06/CD11 mục 7-8** (Decision RPC12, các phần còn lại của CD01-CD12 vẫn hiệu lực) — tách thêm **`BarcodePersistenceModule`** (phương án thứ 4, không phải 1 trong 3 phương án Claude Code từng liệt kê):

**3 module thay vì 2:**

| Module | Vai trò | Providers | Exports | Imports |
|---|---|---|---|---|
| `BarcodePersistenceModule` (mới) | Hạ tầng thuần túy — registration owner DUY NHẤT của `BARCODE_REPOSITORY` | `BARCODE_REPOSITORY` (`useClass: PrismaBarcodeRepository`) | `BARCODE_REPOSITORY` | *(không import module nghiệp vụ nào — không `Product`, không `Unit`, không `Barcode`/`BarcodeReference`)* |
| `BarcodeReferenceModule` (mới) | Read-only reference capability cho module khác | `BarcodeDomainService` | `BarcodeDomainService` (chỉ cái này) | `BarcodePersistenceModule` |
| `BarcodeModule` (sửa) | Domain đầy đủ (`BarcodeService`, Controller) | `BarcodeService` | *(không export gì mới)* | `RbacModule`, `ProductModule`, `UnitModule`, `BarcodePersistenceModule`, `BarcodeReferenceModule` |
| `UnitModule` (sửa) | Domain Unit đầy đủ | `UnitService`, `UnitDomainService`, `UNIT_REPOSITORY` (nội bộ, không export) | `UnitDomainService` | `RbacModule`, `ProductModule`, `BarcodeReferenceModule` *(KHÔNG `BarcodeModule`, KHÔNG `BarcodePersistenceModule`)* |

**Dependency graph** (DAG, không có cạnh nào quay ngược — xác nhận không circular):

```
BarcodePersistenceModule  (lá, không import gì thuộc nhóm này)
        ↑
BarcodeReferenceModule  →  BarcodePersistenceModule
        ↑
UnitModule  →  BarcodeReferenceModule (+ Rbac, Product)
        ↑
BarcodeModule  →  UnitModule, BarcodeReferenceModule, BarcodePersistenceModule (+ Rbac, Product)
```

`BarcodeModule` là "đỉnh" của đồ thị — không module nào import ngược lại `BarcodeModule`. `BarcodeService` **tiếp tục inject `BARCODE_REPOSITORY` trực tiếp** (không đổi write logic, không delegate qua service mới — Decision RPC04, bác bỏ cả phương án 2 và 3 Claude Code từng liệt kê) — chỉ khác nguồn gốc: lấy qua `BarcodePersistenceModule` thay vì tự đăng ký.

**Repository Boundary — nghĩa đúng (Decision RPC07, sửa lại cách hiểu CD11 mục 8)**: `BARCODE_REPOSITORY` KHÔNG được export từ `BarcodeModule`/`BarcodeReferenceModule` — nhưng ĐƯỢC PHÉP export từ `BarcodePersistenceModule`, chỉ tiêu thụ bởi đúng 2 module (`BarcodeModule`, `BarcodeReferenceModule`). Đây là "internal infrastructure export" (trong nội bộ 1 domain, qua 1 module hạ tầng riêng), không phải "public domain API" — khác về bản chất với việc 1 module nghiệp vụ khác (Unit/Product) inject thẳng Repository của Barcode.

**`UNIT_REPOSITORY` không cần tách `UnitPersistenceModule` tương tự** (Decision RPC09) — vì `UnitService` và `UnitDomainService` đều nằm chung `UnitModule`, không có rào cản cross-module nào buộc phải tách. Không mở rộng refactor ngoài nhu cầu thực tế.

## 10. DTO

- `CreateBarcodeDto`: thêm `status?`.
- `UpdateBarcodeDto`: thêm `status?`, `version` (bắt buộc).
- `BarcodeVersionDto` (mới, dùng chung Archive/Restore/SetDefault): `{ version: number }`.
- `BarcodeResponseDto`: thêm `status`, `version`.
- `BarcodeQueryDto` (mới, đúng chuẩn `MASTER_DECISION.md`, không shape riêng — Decision SB09): `search?`, `status?`, `isActive?`, `page?`, `limit?`, `sortBy?` (`code`/`createdAt`, default `createdAt`), `sortOrder?` (default `desc` — Decision SB08, xem §4.3).

## 11. Event (Decision — CHỈ định nghĩa, KHÔNG publish, đúng ADR-0009/0011)

| Event | Khi nào |
|---|---|
| `BarcodeCreated` | Sau `POST /products/:productId/barcodes` thành công |
| `BarcodeUpdated` | Sau `PATCH /barcodes/:id` thành công |
| `BarcodeArchived` | Sau `DELETE /barcodes/:id` thành công |
| `BarcodeRestored` | Sau `POST /barcodes/:id/restore` thành công |

4 hook no-op trong `BarcodeService`, đúng mẫu toàn dự án.

## 12. Test

Theo `TEST_RULES.md`/`MASTER_DATA_TEMPLATE.md` §16 — nhóm bắt buộc: CRUD, Restore, Optimistic Lock (bao gồm cả trên Archive/Restore/SetDefault — khác mặc định), Pagination (chỉ cho `GET /barcodes`, không cho `GET /products/:productId/barcodes`), Search, Sort, Permission, Multi Tenant, Repository, Validation, API Contract, Regression. Thêm riêng: Delete Guard default-barcode (2 case: `isDefault=true`+Product ACTIVE → chặn; `isDefault=false`+Product ACTIVE → không chặn), Unit Reference guard (unitId khác org → lỗi; unitId đã Archived → lỗi), Repository Boundary Architecture Test cho **cả 2 module** — `barcode` (§9.3) và `unit` (§9.4, Decision SB04).

## 13. Acceptance Criteria

| # | Tiêu chí |
|---|---|
| 1 | Build/Lint/TypeCheck PASS |
| 2 | Coverage module `barcode` ≥ 90% |
| 3 | `PATCH`/`DELETE`/`restore`/`default` đều bắt buộc `version`, sai → `409` |
| 4 | Delete Guard đúng Decision BQ2 (chỉ chặn default+Product ACTIVE) |
| 5 | `GET /barcodes` hỗ trợ đủ Query Convention, `GET /products/:productId/barcodes` không đổi (không phân trang) |
| 6 | `existsByCode()` được gọi thật từ Service, trả lỗi rõ ràng trước khi chạm P2002 |
| 7 | `BARCODE_REPOSITORY` không còn trong `BarcodeModule.exports`; `UNIT_REPOSITORY` không còn trong `UnitModule.exports` (Decision SB04); Architecture Test xác nhận cả 2 |
| 8 | `unitId` (nếu có) được xác nhận cùng org + chưa Archived qua `UnitDomainService` mới |
| 9 | `BarcodeType.QR` giữ nguyên, không migration enum (Decision BQ5) |
| 10 | `productId` bất biến sau khi tạo — `UpdateBarcodeDto` không có field này |
| 11 | Migration A/B độc lập, có rollback, không `DROP` dữ liệu |
| 12 | Regression Baseline (T005+T006+T007+T008) PASS |
| 13 | Integration Test PASS — PENDING nếu không có Docker |

## 14. Implementation Order

```
Migration A (version) → Migration B (BarcodeStatus)
  ↓
unit module (UnitDomainService mới — Decision BQ11, + xóa UNIT_REPOSITORY export nếu được xác nhận)
  ↓
Repository barcode (entity, interface, prisma repository — bao gồm organizationId+version ở mọi write path, xóa export sai — Decision BQ6/BQ7)
  ↓
Application barcode (BarcodeService: Restore, Optimistic Lock mở rộng, Delete Guard BQ2, existsByCode wiring, Unit validation)
  ↓
Controller + DTO barcode (route GET /barcodes mới, restore/default nhận version)
  ↓
permission-catalog.ts (barcode:restore)
  ↓
Architecture Test (Repository Boundary)
  ↓
Test
  ↓
Documentation
  ↓
Architecture Review
```

## 15. Rollback Plan

- Rollback A: `ALTER TABLE barcodes DROP COLUMN version`. Rollback B: `ALTER TABLE barcodes DROP COLUMN status`, `DROP TYPE "BarcodeStatus"`.
- Code: nếu Acceptance Criteria không đạt, không merge/commit.
- `unit` module: nếu cần rollback `UnitDomainService`, chỉ xóa file mới — không ảnh hưởng code cũ.

## Lịch sử quyết định

- **RFC-0005 — Barcode Domain (Version 1.0)** — Architect soạn trực tiếp.
- **`ARCHITECTURE REVIEW – RFC-0005 Barcode Domain`** (Claude Code) — 1 mâu thuẫn (QR enum), 8 khoảng trống, 7 câu hỏi mở.
- **`ARCHITECT RESOLUTION — RFC-0005 Barcode Domain`** (Decision BQ1-BQ11) — APPROVED WITH FINAL DECISIONS: route hybrid (BQ1), Delete Guard chỉ chặn default+Product ACTIVE (BQ2), Lifecycle không tuần tự (BQ3), Barcode Assignment định nghĩa rõ, productId bất biến (BQ4), giữ `QR` không migration (BQ5), `existsByCode()` 2 lớp kiểm tra (BQ6), xóa `BARCODE_REPOSITORY` export + Architecture Test (BQ7), unique theo org (BQ8), setDefault atomic (BQ9), Optimistic Lock mở rộng Archive/Restore/SetDefault (BQ10), Unit Reference phải cùng org + chưa Archived (BQ11). Ủy quyền viết SPEC-BARCODE-001, không Implementation Plan, không code, không commit SPEC.
- **`ARCHITECTURE REVIEW – SPEC-BARCODE-001`** (Decision SB01-SB10) — APPROVED WITH FINAL DECISIONS: route hybrid ghi nhận là Exception chính thức (SB01), Optimistic Lock mở rộng có hiệu lực cao hơn `DEFAULT_DECISIONS.md` (SB02), `UnitDomainService` xác nhận đúng logic YAGNI kết thúc khi có consumer thật (SB03), xóa `UNIT_REPOSITORY` export + Architecture Test cho `unit` (SB04), Audit giữ nguyên kiến trúc hiện tại không vào transaction (SB05), `BARCODE_004`-`007` được thêm (SB06), 2 Technical Debt sửa ngay trong T009 không tách Sprint riêng (SB07), default sort `createdAt`/`desc` cho Aggregate không có `name` (SB08), Query Convention không tạo shape riêng (SB09), SPEC LOCKED (SB10). Ủy quyền bắt đầu Implementation Plan, không code/migration/commit.
- **`ARCHITECTURE REVIEW – Barcode Implementation Plan`** (Decision IP01-IP10) — APPROVED WITH FINAL IMPLEMENTATION DECISIONS, ủy quyền bắt đầu T009 code.
- **Phát hiện trong lúc code (trước Step 3 gốc)**: `unit.module.ts` đã import `BarcodeModule` từ T008 — yêu cầu §9.4 gốc (Barcode import Unit) tạo circular module dependency thật. Migration A/B (không liên quan) đã hoàn thành trước khi phát hiện, giữ nguyên.
- **`ARCHITECT RESOLUTION — T009 Circular Module Dependency`** (Decision CD01-CD12) — từ chối `forwardRef()` (CD01), đề xuất tách `BarcodeReferenceModule` (CD02-CD04) — phát hiện thêm 1 mâu thuẫn nội tại (module vừa giữ vừa không được export `BARCODE_REPOSITORY`, trong khi `BarcodeService` ở module khác cần dùng) — báo cáo, không tự chọn giữa 3 phương án.
- **`ARCHITECT RESOLUTION — T009 Barcode Repository Ownership Correction`** (Decision RPC01-RPC12) — chọn phương án thứ 4 (không phải 1 trong 3 phương án đã liệt kê): tách thêm `BarcodePersistenceModule` làm registration owner hạ tầng thuần túy — thay thế 1 phần CD02/CD03/CD06/CD11 (Decision RPC12). Đây là thiết kế module composition CUỐI CÙNG cho T009.
- SPEC-BARCODE-001 (tài liệu này, đã cập nhật theo SB01-SB10 + CD01-CD12 (một phần) + RPC01-RPC12) — LOCKED, không còn điểm mở nào.
