# Barcode Implementation Plan (T009, dựa trên SPEC-BARCODE-001)

**Trạng thái:** Chờ Architecture Review. **Không code, không migration, không commit** ở bước này — chỉ kế hoạch.
**Nguồn:** `SPEC-BARCODE-001` (APPROVED WITH FINAL DECISIONS, Decision SB01-SB10, LOCKED).

---

## 1. File Impact

### 1.1 New (9 file)

| File | Nội dung |
|---|---|
| `backend/src/modules/barcode/barcode-persistence.module.ts` | **Mới (Decision RPC01)** — đăng ký + export DUY NHẤT `BARCODE_REPOSITORY` (`useClass: PrismaBarcodeRepository`), không import module nghiệp vụ nào |
| `backend/src/modules/barcode/barcode-reference.module.ts` | **Mới (Decision RPC03)** — `BarcodeDomainService` (di chuyển provider registration từ `barcode.module.ts`), import `BarcodePersistenceModule`, chỉ export `BarcodeDomainService` |
| `backend/src/modules/barcode/domain/errors/barcode.errors.ts` | `BarcodeConcurrencyConflictError` |
| `backend/src/modules/barcode/application/dto/barcode-query.dto.ts` | Query Convention 7 tham số (Decision SB09) |
| `backend/src/modules/barcode/application/dto/barcode-version.dto.ts` | `{ version: number }` dùng chung Archive/Restore/SetDefault |
| `backend/src/modules/barcode/barcode-repository-boundary.architecture.spec.ts` | 12 assertion theo Decision RPC08 |
| `backend/src/modules/unit/application/unit-domain.service.ts` | `UnitDomainService`, đúng 1 method `findByIdForReference()` (Decision BQ11/CD05) |
| `backend/src/modules/unit/application/unit-domain.service.spec.ts` | Test cho service mới |
| `backend/src/modules/unit/unit-repository-boundary.architecture.spec.ts` | Xác nhận không module nào ngoài `unit` import `UNIT_REPOSITORY` |
| `backend/prisma/migrations/<timestamp>_barcode_version/{migration,rollback}.sql` | Migration A |
| `backend/prisma/migrations/<timestamp>_barcode_status/{migration,rollback}.sql` | Migration B |

*(Đếm: 9 file code mới + 4 file migration = 13, tách riêng ở §1.3 cho rõ. Tăng 2 file so với bản gốc do `BarcodeReferenceModule` + `BarcodePersistenceModule` — Decision RPC01-RPC03.)*

### 1.2 Modify — module `barcode` (10 file)

| File | Thay đổi |
|---|---|
| `domain/entities/barcode.entity.ts` | Thêm `organizationId` (khôi phục lại vào Entity), `status: BarcodeStatus`, `version: number` |
| `domain/repositories/barcode.repository.interface.ts` | `update()`/`softDelete()`/`setDefault()` thêm `organizationId`+`expectedVersion`; thêm `restore()`, `findByIdIncludingDeleted()`, `search()`; `existsByCode()` thêm `organizationId`; thêm `BarcodeStatus`/`BarcodeSortField`/`BarcodeSortOrder`/`BarcodeSearchParams`/`BarcodeSearchResult` |
| `infrastructure/persistence/prisma-barcode.repository.ts` | 4 method ghi (`update`/`softDelete`/`restore`/`setDefault`) đổi sang `updateMany` compare-and-swap `{id, organizationId, version}`; `existsByCode()` thêm `organizationId`; thêm `search()` (AND composition `status`+`isActive`, đúng mẫu Brand/Unit); `toEntity()` thêm `organizationId`/`status`/`version` |
| `infrastructure/persistence/prisma-barcode.repository.spec.ts` | Cập nhật mock `updateMany`/`findUniqueOrThrow`, thêm test Optimistic Lock conflict cho cả 4 method, `organizationId` scoping, `restore()`, `search()` |
| `application/barcode.service.ts` | `update()` dùng `dto.version`; `remove()` thêm Delete Guard (Decision BQ2 — chỉ chặn `isDefault`+Product `ACTIVE`); thêm `restore()`; `setDefault()` nhận `expectedVersion`; `create()`/`update()` gọi `existsByCode()` trước khi ghi (Decision BQ6); validate `unitId` qua `UnitDomainService` mới (Decision BQ11); 4 event hook no-op; `listByProduct()` không đổi hành vi; thêm `search()` cho `GET /barcodes` |
| `application/barcode.service.spec.ts` | Cập nhật + thêm test theo §5 Test Strategy |
| `application/dto/create-barcode.dto.ts` | Thêm `status?` |
| `application/dto/update-barcode.dto.ts` | Thêm `status?`, `version` (bắt buộc) |
| `application/dto/barcode-response.dto.ts` | Thêm `status`, `version` |
| `application/mappers/barcode.mapper.ts` | Map thêm `status`, `version` |

### 1.3 Modify — module `unit` (1 file, ngoài file mới ở §1.1)

| File | Thay đổi |
|---|---|
| `unit.module.ts` | `imports` đổi từ `[..., BarcodeModule]` sang `[..., BarcodeReferenceModule]` (Decision RPC05 — KHÔNG import `BarcodeModule`/`BarcodePersistenceModule`); `exports` giữ chỉ `[UnitDomainService]`, `UNIT_REPOSITORY` vẫn đăng ký nội bộ nhưng không export (Decision RPC09); `providers` thêm `UnitDomainService` |

### 1.4 Modify — Controller + wiring (4 file)

| File | Thay đổi |
|---|---|
| `presentation/barcode.controller.ts` | Thêm `GET /barcodes` (org-wide search, `BarcodeQueryDto`); `PATCH`/`DELETE`/`POST :id/default` nhận thêm `version`; thêm `POST /barcodes/:id/restore` |
| `presentation/barcode.controller.spec.ts` | Cập nhật + thêm test route mới |
| `presentation/product-barcode.controller.ts` | Không đổi route, Swagger cập nhật nếu response thêm field |
| `presentation/product-barcode.controller.spec.ts` | Cập nhật nếu cần |
| `barcode.module.ts` | `imports` đổi thành `[RbacModule, ProductModule, UnitModule, BarcodePersistenceModule, BarcodeReferenceModule]`; `providers` CHỈ còn `BarcodeService` (KHÔNG tự đăng ký lại `BARCODE_REPOSITORY`/`PrismaBarcodeRepository`/`BarcodeDomainService` — Decision RPC04); `exports` rỗng |

### 1.5 Modify — ngoài `barcode`/`unit` (2 file)

| File | Thay đổi |
|---|---|
| `common/errors/error-codes.ts` | Thêm `BARCODE_VERSION_CONFLICT` (`BARCODE_004`), `BARCODE_NOT_DELETED` (`BARCODE_005`), `BARCODE_CANNOT_ARCHIVE_DEFAULT` (`BARCODE_006`), `BARCODE_UNIT_NOT_USABLE` (`BARCODE_007`) (Decision SB06) |
| `modules/rbac/infrastructure/permission-catalog.ts` | Dòng `crud('barcode', 'mã vạch')` → `crud('barcode', 'mã vạch', ['restore'])` |

### 1.6 Tổng: 13 file mới (9 code + 4 migration) + 10 sửa (`barcode`, §1.2) + 1 sửa (`unit`, §1.3) + 5 sửa (Controller+wiring, §1.4) + 2 sửa (ngoài 2 module, §1.5) = ~~31 file~~

`barcode.module.ts` chỉ tính 1 lần (thuộc §1.4) dù bị chạm ở nhiều commit (Commit 3-5 tạo tiền đề, Commit 7 sửa composition cuối cùng) — không phải nhiều file riêng.

So với Unit (T008, 24 file, chạm 2 module ngoài chính nó), Barcode chạm **1 module ngoài chính nó** (`unit`, sâu hơn — tạo file mới, không chỉ sửa 1 method) — quy mô tương đương, phân bổ khác: Unit rộng (2 module, mỗi module đổi 1 method), Barcode sâu (1 module, tạo hẳn 1 Domain Service + Architecture Test + đổi Repository Boundary).

### 1.7 Correction — File Impact §1 thiếu 5 file test (phát hiện ở Step 9, §8 Acceptance Checklist item 3)

Khi đối chiếu Acceptance Checklist "File Impact (§1) không sót file nào" với working tree thật ở Step 9 (Full Tests), phát hiện bảng §1.1/§1.2 **thiếu 5 file** — không phải sai thiết kế, chỉ là bỏ sót khi lập kế hoạch test:

| File | Loại | Lý do thiếu trong bản gốc |
|---|---|---|
| `application/dto/barcode-query.dto.spec.ts` | Mới | §1.1 liệt kê `barcode-query.dto.ts` nhưng quên spec đi kèm |
| `application/dto/barcode-version.dto.spec.ts` | Mới | §1.1 liệt kê `barcode-version.dto.ts` nhưng quên spec đi kèm |
| `application/dto/update-barcode.dto.spec.ts` | Mới | `update-barcode.dto.ts` có ở §1.2 (sửa) nhưng chưa từng có spec — file spec là mới hoàn toàn, không được liệt kê |
| `application/dto/create-barcode.dto.spec.ts` | Sửa | Thêm test case `status` — không liệt kê ở §1.2 dù file `create-barcode.dto.ts` có |
| `test/barcode.e2e-spec.ts` | Sửa | File có sẵn **từ trước T009** (scaffold commit `9a82000`, không phải do Plan này tạo) — không được đưa vào §1 khi lập kế hoạch; bị vỡ ngầm vì `PATCH`/`DELETE`/`restore`/`default` đổi chữ ký đòi `version` trong body, phát hiện và sửa ở Step 9, mở rộng thêm case Optimistic Lock/Delete Guard/Unit Reference Guard/`GET /barcodes` theo đúng SPEC §12/Decision IP04/IP07 |

**Tổng file thực tế: 37** (31 theo kế hoạch gốc + 5 file thiếu ở trên + `barcode.errors.ts` đã tính trong 9 file mới §1.1 nên không cộng thêm — đối chiếu qua `git status`/`git add -A --dry-run` xác nhận đúng 37: 19 sửa + 18 mới, không tính 5 file tài liệu Step 10 vì không thuộc phạm vi "code" của bảng này).

Không có file nào trong 5 file này ảnh hưởng thiết kế/API/behavior — thuần túy bổ sung test coverage theo đúng phạm vi đã AUTHORIZE (Decision IP04/IP07/SPEC §12), không phải thay đổi ngoài kế hoạch cần Architecture Review riêng.

## 2. Migration Plan

**2 migration độc lập** (đúng Decision RQ9 gốc, không backfill phức tạp):

### Migration A — `version`

```sql
ALTER TABLE "barcodes" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
```

**Rollback:** `ALTER TABLE "barcodes" DROP COLUMN "version";`
**Verify:** `SELECT COUNT(*) FROM barcodes;` trước/sau bằng nhau; `SELECT COUNT(*) FROM barcodes WHERE version = 1;` khớp tổng số dòng.

### Migration B — `BarcodeStatus`

```sql
CREATE TYPE "BarcodeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
ALTER TABLE "barcodes" ADD COLUMN "status" "BarcodeStatus" NOT NULL DEFAULT 'ACTIVE';
UPDATE "barcodes" SET "status" = 'ARCHIVED' WHERE "deletedAt" IS NOT NULL;
```

**Rollback:** `ALTER TABLE "barcodes" DROP COLUMN "status";` rồi `DROP TYPE "BarcodeStatus";`
**Verify:** `SELECT COUNT(*) FROM barcodes WHERE status = 'ARCHIVED' AND "deletedAt" IS NULL;` phải bằng `0`.

Không migration nào cho `BarcodeType` (giữ nguyên `QR`, Decision BQ5). Không `DROP` dữ liệu hiện có ở cả 2 migration.

## 3. Dependency Impact

| Module | Ảnh hưởng |
|---|---|
| **Unit** | **Có, sâu** — thêm mới `UnitDomainService` (1 method `findById`), đổi `UnitModule.exports` (bỏ `UNIT_REPOSITORY`, chỉ còn `UnitDomainService`), thêm Architecture Test mới. Đây là lần đầu Unit có consumer thật sự thứ 2 (sau chính `unit.service.ts`). |
| **Product** | **Không đổi code** — `ProductDomainService.findById()` đã tồn tại và được `barcode` dùng lại nguyên trạng cho Delete Guard (§8 SPEC), không cần method mới. `ProductBarcodeEntity` (denormalized barcode summary trong `product.entity.ts:20-23,58`) là read-model nội bộ của `product`, KHÔNG đổi theo `status`/`version` mới của Barcode — ngoài phạm vi SPEC-BARCODE-001, xác nhận qua grep không có phụ thuộc chức năng nào khác. |
| **Purchase/Inventory/Supplier/POS** | Grep xác nhận 0 tham chiếu `barcodeId`/`BARCODE_REPOSITORY`/`BarcodeEntity`/`BarcodeDomainService` ngoài `barcode`/`unit`/`product` — 0 ảnh hưởng. |
| **Permission** | Thêm đúng 1 permission `barcode:restore`. |
| **Swagger** | Route mới `GET /barcodes`, `POST /barcodes/:id/restore`; `PATCH`/`DELETE`/`POST :id/default` cập nhật mô tả nhận `version`. |
| **Tests** | 6 suite hiện có (`barcode` + `barcode-domain.service.spec.ts` từ T008) cập nhật; `unit` thêm 1 suite mới (`unit-domain.service.spec.ts`) + 1 Architecture Test mới; `barcode` thêm 1 Architecture Test mới. Regression Baseline (T005-T008) phải PASS. |

**Kết luận**: khác Unit (2 module bị chạm ngang nhau — mỗi module 1 method), Barcode chạm **đúng 1 module** (`unit`) nhưng SÂU hơn (tạo hẳn Domain Service mới + đổi Repository Boundary) — đúng dự đoán từ RFC-0005/SPEC §0 mục 3.

## 4. Commit Strategy

**10 commit** (1 đơn vị logic = 1 commit, không gộp — cập nhật theo Decision RPC11, thay thế bản 9-commit gốc):

| # | Commit | Nội dung |
|---|---|---|
| 1 | Migration A | `version` — `migration.sql` + `rollback.sql` |
| 2 | Migration B | `BarcodeStatus` — `migration.sql` + `rollback.sql` |
| 3 | `BarcodePersistenceModule` | File mới — đăng ký + export `BARCODE_REPOSITORY` (Decision RPC01/RPC02) |
| 4 | `BarcodeReferenceModule` | File mới — `BarcodeDomainService` (di chuyển provider registration), import `BarcodePersistenceModule` (Decision RPC03) |
| 5 | Unit Adjustment | `UnitDomainService` mới + spec, `unit.module.ts` đổi `imports` (bỏ `BarcodeModule`, thêm `BarcodeReferenceModule`) — KHÔNG export `UNIT_REPOSITORY` (giữ nguyên, không tách `UnitPersistenceModule` — Decision RPC05/RPC09) |
| 6 | Repository + Application (barcode) | `barcode.entity.ts`, `barcode.repository.interface.ts`, `barcode.errors.ts` (mới), `prisma-barcode.repository.ts` + spec (`organizationId`+`version` ở 4 method ghi); `barcode.service.ts` + spec, `barcode.mapper.ts`, DTO (`create`/`update`/`response`/`query`/`version`), `error-codes.ts` (`BARCODE_004`-`007`) |
| 7 | Presentation (barcode) | `barcode.controller.ts` (route `GET /barcodes` mới, `restore` mới, `version` trên 3 route), `product-barcode.controller.ts`, spec, `barcode.module.ts` (`imports` = `[Rbac, Product, Unit, BarcodePersistence, BarcodeReference]`, KHÔNG tự đăng ký lại 3 provider — Decision RPC04), `permission-catalog.ts` (`barcode:restore`) |
| 8 | Repository Boundary + Architecture Tests | `barcode-repository-boundary.architecture.spec.ts`, `unit-repository-boundary.architecture.spec.ts` — 12 assertion theo Decision RPC08 |
| 9 | Tests | Bổ sung case còn thiếu theo §5 nếu Commit 3-8 chưa phủ hết |
| 10 | Documentation | Release note T009, `PROJECT_STATUS.md`, `SPRINT_DASHBOARD.md`, `technical-debt.md` nếu có PENDING mới |

**Lưu ý thứ tự**: Commit 3→4→5 phải đúng thứ tự (Persistence trước Reference trước Unit) vì mỗi bước phụ thuộc kỹ thuật thật vào bước trước — `BarcodeReferenceModule` cần `BarcodePersistenceModule` tồn tại để import, `UnitModule` cần `BarcodeReferenceModule` tồn tại để import. Commit 6 (Repository+Application barcode) gộp 2 layer cũ thành 1 commit vì cả 2 đều thuộc về `BarcodeModule` (đã hình thành đủ ở Commit 3-5) — khác Unit/T008 vốn tách riêng do không có bước module-extraction xen giữa.

**Lưu ý riêng Commit 6**: gộp Repository+Application (khác thông lệ tách riêng ở Product/Category/Brand/Unit) vì lý do CHỈ ÁP DỤNG cho T009 — 5 commit đầu (1-5) đã dùng hết "ngân sách" các bước cấu trúc module cần tách riêng do circular dependency; tách thêm Repository/Application thành 2 commit sẽ đẩy tổng lên 11, vượt quá con số 10 bước RPC11 đã liệt kê tường minh. Đây là lựa chọn bám sát đúng thứ tự RPC11 nêu ("6. Barcode Repository and Application integration" — 1 dòng, 1 bước) — nếu ý Architect là vẫn tách 2 commit riêng (tổng 11), cần xác nhận lại.

## 5. Test Strategy

Đúng danh sách bắt buộc — 12 nhóm (`MASTER_DATA_TEMPLATE.md` §16) + 2 nhóm đặc thù Barcode:

| Nhóm | Nội dung |
|---|---|
| **CRUD** | Create/Read/Update giữ hành vi hiện có + `status` |
| **Restore** | Đã xóa mềm → restore → `status=INACTIVE`; chưa từng xóa → lỗi (`BARCODE_NOT_DELETED`) |
| **Optimistic Lock** | **4 route đều cần test riêng** (khác mọi module trước — Decision BQ10/SB02): `PATCH`, `DELETE`, `restore`, `default` — mỗi route: version đúng → thành công tăng version; version sai → `409` |
| **Pagination/Search/Sort** | Chỉ cho `GET /barcodes` (org-wide); `GET /products/:productId/barcodes` xác nhận KHÔNG đổi (không phân trang) |
| **Permission** | `barcode:restore` riêng cho route restore; `GET /barcodes` dùng `barcode:view` |
| **Multi Tenant** | Toàn bộ 4 method ghi + `existsByCode` với `organizationId` khác tổ chức → không tìm thấy/0 dòng ảnh hưởng |
| **Repository** | `search()` AND composition `status`+`isActive`; `existsByCode()` với `organizationId` |
| **Validation** | `status` không nhận `ARCHIVED` trên Create/Update; `version` bắt buộc trên `UpdateBarcodeDto`/`BarcodeVersionDto` |
| **API Contract** | e2e cho toàn bộ route, bao gồm route mới `GET /barcodes` |
| **Regression** | Toàn bộ `npx jest` — Sprint-00 + T005-T008 |
| **Delete Guard (đặc thù)** | 2 case: `isDefault=true` + Product `ACTIVE` → chặn (`BARCODE_CANNOT_ARCHIVE_DEFAULT`); `isDefault=false` + Product `ACTIVE` → KHÔNG chặn (khác Unit/T008 — đây là điểm dễ viết sai nhất, cần test tường minh cả 2 chiều) |
| **Unit Reference Guard (đặc thù)** | `unitId` thuộc org khác → lỗi; `unitId` đã `ARCHIVED` → lỗi; `unitId` hợp lệ → thành công; không gửi `unitId` → bỏ qua guard |

**Ước tính**: +30 test case mới (Optimistic Lock ×8 — 4 route × 2 case, Restore ×3, Delete Guard ×2, Unit Reference ×4, `existsByCode` wiring ×3, `search()`/`GET /barcodes` ×6, Repository Boundary Architecture Test ×2 file, `UnitDomainService` ×2), cộng dồn vào test hiện có của `barcode` (chưa xác nhận số chính xác — cần đối chiếu khi code thật) → ước tính tổng **~50-60 test case** cho `barcode`, +2-3 cho `unit`.

## 6. Risk Matrix

| # | Risk | Impact | Mitigation | Verification |
|---|---|---|---|---|
| R1 | Optimistic Lock trên 4 route (thay vì 1) — dễ quên áp dụng compare-and-swap nhất quán ở 1 trong 4 method (`update`/`softDelete`/`restore`/`setDefault`), đặc biệt `setDefault`'s bước "unset others" (không cần version) dễ nhầm với bước "set target" (cần version) | Trung bình | Code review đối chiếu đúng §9.1 SPEC — chỉ dòng barcode ĐÍCH của `setDefault` compare-and-swap version, bước unset-others dùng `updateMany` thường (không version) | Test case riêng xác nhận version-check CHỈ áp dụng đúng dòng đích, không áp dụng nhầm sang các dòng bị unset |
| R2 | Delete Guard (BQ2) dễ viết sai thành "chặn mọi barcode của Product ACTIVE" (cách hiểu (a) đã bị loại ở Architecture Review) thay vì đúng "chỉ chặn `isDefault=true`" | Cao — sai sẽ chặn nhầm cả sửa lỗi mã thường | Test case tường minh cả 2 chiều (Delete Guard đặc thù ở §5) — PASS cả 2 mới coi là đúng | Code review đối chiếu chính xác điều kiện `barcode.isDefault && product.status === 'ACTIVE'` |
| R3 | **[SAI — đã sửa qua source verification, xem Plan Amendment §9 bên dưới]** ~~`UnitDomainService` mới — `BarcodeModule` import `UnitModule`, `UnitModule` không import lại `barcode`/`product` theo chiều ngược nào — cần xác nhận không tạo circular DI. `unit.module.ts` hiện chỉ `imports: [RbacModule, ProductModule]`, không import `barcode`.~~ **Nhận định này SAI.** Xác nhận qua đọc trực tiếp `unit.module.ts:1-11`: `UnitModule` ĐÃ import `BarcodeModule` từ T008 (`imports: [RbacModule, ProductModule, BarcodeModule]`) để `UnitService` dùng `BarcodeDomainService.hasActiveBarcodesInUnit()` cho Delete Guard (Decision RQ5/UP07). Việc `BarcodeModule` cần thêm import `UnitModule` (cho `UnitDomainService`, Decision BQ11) tạo **circular module dependency thật sự** — phát hiện trước khi chạm Step 3 (Unit Adjustment), KHÔNG phải rủi ro giả định. Xử lý qua `ARCHITECT RESOLUTION — T009 Circular Module Dependency` (Decision CD01-CD12) — xem §9. | Cao (đã xảy ra) | forwardRef() bị từ chối (Decision CD01) — giải pháp: tách `BarcodeReferenceModule` (Decision CD02) | Đã xác nhận qua đọc source, không phải qua `npm run build` như dự kiến ban đầu |
| R4 | Xóa `BARCODE_REPOSITORY`/`UNIT_REPOSITORY` khỏi exports có thể phá vỡ test hiện tại nếu bất kỳ test nào (không phải code sản xuất) đang inject trực tiếp qua module thật (`Test.createTestingModule`) thay vì mock thủ công | Thấp | Toàn bộ `*.service.spec.ts`/`*.repository.spec.ts` hiện tại đều `new XxxService(mockRepo, ...)` thủ công (xác nhận qua code đã đọc), không dùng `Test.createTestingModule` với `barcode`/`unit` module thật — rủi ro thấp | Build + Test PASS sau Commit 3 và Commit 7 xác nhận không có test nào phụ thuộc export đã xóa |
| R5 | `error-codes.ts` cần đặt đúng thứ tự trước khi `BarcodeService` dùng (giống Risk R4/R5 đã gặp ở Brand/Unit) | Thấp | Đã đặt ở Commit 5 (Application), không phải Commit 6 (Presentation) | Build PASS sau mỗi commit theo đúng thứ tự đã điều chỉnh |
| R6 | 2 migration độc lập (A: version, B: status) trên bảng `barcodes` có thể có nhiều dữ liệu hơn `units` (barcode thường nhiều hơn unit theo tỷ lệ N:1 với Product) — migration `ADD COLUMN ... DEFAULT` trên bảng lớn có thể chậm hơn dự kiến trong môi trường Postgres thật | Thấp | `DEFAULT` constant (không phải `DEFAULT gen_random_uuid()` hay expression) trên Postgres 11+ không rewrite toàn bảng — an toàn kể cả bảng lớn | Đo thời gian migration thật khi có môi trường Docker (PENDING, cùng nhóm Integration Test) |

## 7. Rollback Strategy

**Nếu migration lỗi:**
1. Chạy `rollback.sql` tương ứng (Migration A hoặc B, độc lập).
2. Verify: `SELECT COUNT(*) FROM barcodes;` khớp đúng số dòng trước migration.
3. Không mất dữ liệu — cả 2 migration thuần `ADD COLUMN`/`CREATE TYPE`, Migration B có `UPDATE` backfill dựa trên `deletedAt` đã có sẵn.

**Nếu code lỗi:**
- Chưa merge/commit → sửa tại chỗ hoặc bỏ nhánh code chưa từng commit.
- Đã commit nhưng chưa push → `git reset --soft HEAD~1` sau khi xác nhận `git log origin/main..HEAD`.
- Đã push → không revert tự động, báo cáo Architect.

**Nếu `UnitDomainService`/Repository Boundary Fix cần rollback riêng:**
- `UnitDomainService`: xóa file mới + revert `unit.module.ts` về export `UNIT_REPOSITORY` như cũ — không ảnh hưởng `UnitService`/code cũ khác.
- Repository Boundary Fix (Commit 7): revert lại dòng export `BARCODE_REPOSITORY` trong `barcode.module.ts` — không ảnh hưởng method nào khác.

## 8. Acceptance Checklist

- [ ] SPEC-BARCODE-001 LOCKED, không có thay đổi nào chưa qua Architecture Review kể từ đó (Decision SB10)
- [ ] Migration Plan (§2) xác nhận: 2 migration độc lập, mỗi cái có `rollback.sql` + bước Verify
- [ ] File Impact (§1) không sót file nào
- [ ] Dependency Impact (§3) xác nhận đúng 1 module bị chạm sâu (`unit`), 0 module khác
- [ ] Commit Strategy (§4) đã đặt `error-codes.ts` đúng ở Commit 5 (Application), không phải Commit 6
- [ ] Test Strategy (§5) đủ 12 nhóm chuẩn + 2 nhóm đặc thù Barcode (Delete Guard, Unit Reference)
- [ ] Risk Matrix (§6) không còn Risk "Cao" nào thiếu Mitigation cụ thể (R2 đã có Mitigation + test 2 chiều)
- [ ] Rollback Strategy (§7) xác nhận không có bước nào gây mất dữ liệu
- [ ] `AUTHORIZATION — T009 – Barcode Implementation` từ Architect đã có trước khi chạm Commit 1
- [ ] Đúng thứ tự Coding Rules: mỗi commit Build+TypeCheck+Lint PASS trước khi sang commit kế tiếp — không gộp bước
- [ ] Regression Baseline (Sprint-00 + T005 + T006 + T007 + T008) PASS trước khi đóng T009
- [ ] Coverage module `barcode` ≥ 90% (Decision SB-series kế thừa UP09)
- [ ] Delete Guard (BQ2) test đúng CẢ 2 chiều — không chặn nhầm barcode thường

## 9. Plan Amendment — Circular Module Dependency (Decision CD01-CD12)

**Phát hiện trước Step 3** (đọc `unit.module.ts` trước khi sửa): `UnitModule` đã import `BarcodeModule` từ T008 (`imports: [RbacModule, ProductModule, BarcodeModule]`, dùng `BarcodeDomainService.hasActiveBarcodesInUnit()` cho Delete Guard — Decision RQ5/UP07). SPEC-BARCODE-001 §9.4 yêu cầu `BarcodeModule` import `UnitModule` — 2 chiều cùng tồn tại tạo circular module dependency thật. Đây là sai sót của chính Implementation Plan này (Risk R3 gốc khẳng định sai — xem đánh dấu SAI ở §6) do không đọc lại `unit.module.ts` khi viết Plan, không phải phát hiện mới về nghiệp vụ.

**`ARCHITECT RESOLUTION — T009 Circular Module Dependency`** (Decision CD01-CD12) đã xử lý:

- **CD01 — Từ chối `forwardRef()`**: không dùng ở bất kỳ phía nào (che giấu circular architecture, tiền lệ xấu cho Attribute/Variant sau này).
- **CD02 — Tách `BarcodeReferenceModule` mới** (file mới `backend/src/modules/barcode/barcode-reference.module.ts`, KHÔNG tạo thư mục module top-level riêng — giữ trong `modules/barcode/` vì chỉ là tách lại DI wiring của các file đã có, không di chuyển code): chứa đăng ký `BARCODE_REPOSITORY`/`PrismaBarcodeRepository`/`BarcodeDomainService`. Không import `UnitModule`/`ProductModule`, không chứa Controller/`BarcodeService`/write use case.
- **CD03/CD04 — Composition mới**: `BarcodeModule` imports `[RbacModule, ProductModule, UnitModule, BarcodeReferenceModule]`, không tự đăng ký lại 3 provider trên. `UnitModule` đổi `imports` từ `BarcodeModule` sang `BarcodeReferenceModule`.
- **CD05 — `UnitDomainService`**: vẫn tạo mới, method đổi tên gợi ý `findByIdForReference(organizationId, unitId)` (hoặc tên tương đương phù hợp convention — cần chốt khi code thật).
- **CD07 — Đã kiểm tra, KHÔNG áp dụng**: `BarcodeDomainService` hiện tại (`barcode-domain.service.ts`) chỉ inject `BARCODE_REPOSITORY`, không phụ thuộc `ProductModule`/`ProductDomainService` — `BarcodeReferenceModule` có thể độc lập với `ProductModule` như yêu cầu, không cần dừng vì lý do này.
- **CD08 — Migration A/B giữ nguyên**: đã hoàn thành trước khi phát hiện circular dependency, không rollback, không sửa lại.
- **CD10 — Commit Sequence mới**: Migration A → Migration B → **BarcodeReferenceModule extraction** → Unit Adjustment → Barcode Repository/Application → Barcode Presentation → Repository Boundary + Architecture Tests → Tests → Documentation (9 bước, thứ tự khác bản gốc — `BarcodeReferenceModule` đi TRƯỚC Unit Adjustment, không phải sau).

### Mâu thuẫn nội tại trong CD01-CD12 — ĐÃ giải quyết qua RPC01-RPC12

Đã báo cáo (không tự chọn 1 trong 3 phương án ban đầu). `ARCHITECT RESOLUTION — T009 Barcode Repository Ownership Correction` (Decision RPC01-RPC12) chọn **phương án thứ 4**: tách thêm **`BarcodePersistenceModule`** — module hạ tầng thuần túy, registration owner DUY NHẤT của `BARCODE_REPOSITORY`, không chứa business rule/Controller/Service nào.

**Thiết kế cuối cùng (3 module, thay thế 1 phần CD02/CD03/CD06/CD11 — Decision RPC12):**

| Module | File | Providers | Exports | Imports |
|---|---|---|---|---|
| `BarcodePersistenceModule` (mới) | `backend/src/modules/barcode/barcode-persistence.module.ts` | `BARCODE_REPOSITORY` (`useClass: PrismaBarcodeRepository`) | `BARCODE_REPOSITORY` | *(không import module nghiệp vụ nào)* |
| `BarcodeReferenceModule` (mới) | `backend/src/modules/barcode/barcode-reference.module.ts` | `BarcodeDomainService` | `BarcodeDomainService` | `BarcodePersistenceModule` |
| `BarcodeModule` (sửa) | `backend/src/modules/barcode/barcode.module.ts` | `BarcodeService` | *(không export)* | `RbacModule`, `ProductModule`, `UnitModule`, `BarcodePersistenceModule`, `BarcodeReferenceModule` |
| `UnitModule` (sửa) | `backend/src/modules/unit/unit.module.ts` | `UnitService`, `UnitDomainService`, `UNIT_REPOSITORY` (nội bộ) | `UnitDomainService` | `RbacModule`, `ProductModule`, `BarcodeReferenceModule` |

**Dependency graph (DAG, không circular)**: `BarcodePersistenceModule` (lá) ← `BarcodeReferenceModule` ← `UnitModule` ← `BarcodeModule` (đỉnh, cũng import trực tiếp `BarcodePersistenceModule`). Không module nào import ngược `BarcodeModule`.

`BarcodeService` **giữ nguyên cách inject `BARCODE_REPOSITORY` trực tiếp** (Decision RPC04 — không chuyển write logic, không delegate qua service mới) — chỉ đổi NGUỒN (qua `BarcodePersistenceModule` thay vì tự đăng ký). `UNIT_REPOSITORY` KHÔNG tách `UnitPersistenceModule` tương tự (Decision RPC09) — `UnitService`/`UnitDomainService` cùng `UnitModule`, không có rào cản cross-module cần tách.

## Lịch sử quyết định

- **SPEC-BARCODE-001** — LOCKED (Decision SB01-SB10).
- **`ARCHITECTURE REVIEW – SPEC-BARCODE-001`** — APPROVED WITH FINAL DECISIONS, ủy quyền tạo Implementation Plan này.
- **`ARCHITECTURE REVIEW – Barcode Implementation Plan`** (Decision IP01-IP10) — APPROVED WITH FINAL IMPLEMENTATION DECISIONS, ủy quyền bắt đầu code T009.
- **`ARCHITECT RESOLUTION — T009 Circular Module Dependency`** (Decision CD01-CD12) — xử lý circular dependency phát hiện trước Step 3 gốc — phát hiện thêm 1 mâu thuẫn nội tại, báo cáo, không tự chọn.
- **`ARCHITECT RESOLUTION — T009 Barcode Repository Ownership Correction`** (Decision RPC01-RPC12) — chọn phương án thứ 4 (`BarcodePersistenceModule`), thay thế 1 phần CD02/CD03/CD06/CD11. Thiết kế module composition CUỐI CÙNG.
- Implementation Plan này (tài liệu hiện tại) — Migration A/B đã hoàn thành (chưa commit). Tiếp tục Step 3 (`BarcodePersistenceModule`) theo đúng RPC01-RPC12.
