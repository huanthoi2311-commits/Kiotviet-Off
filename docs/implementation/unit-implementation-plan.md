# Unit Implementation Plan (T008, dựa trên SPEC-UNIT-001)

**Trạng thái:** Chờ Architecture Review. **Không code, không migration, không commit** ở bước này — chỉ kế hoạch.
**Nguồn:** `SPEC-UNIT-001` (APPROVED WITH FINAL DECISIONS, Decision SU01-SU10, LOCKED).

---

## 1. File Impact

### 1.1 New (5 file)

| File | Nội dung |
|---|---|
| `backend/src/modules/unit/domain/errors/unit.errors.ts` | `UnitConcurrencyConflictError` (đúng mẫu `brand.errors.ts`) |
| `backend/src/modules/barcode/application/barcode-domain.service.ts` | `BarcodeDomainService`, đúng 1 method `hasActiveBarcodesInUnit()` (Decision SU05) |
| `backend/src/modules/barcode/application/barcode-domain.service.spec.ts` | Test cho service mới |
| `backend/prisma/migrations/<timestamp>_unit_version/migration.sql` + `rollback.sql` | Migration A |
| `backend/prisma/migrations/<timestamp>_unit_status/migration.sql` + `rollback.sql` | Migration B |

### 1.2 Modify — module `unit` (11 file)

| File | Thay đổi |
|---|---|
| `domain/entities/unit.entity.ts` | Thêm `status: UnitStatus`, `version: number` |
| `domain/repositories/unit.repository.interface.ts` | Thêm `UnitStatus` type, `UnitSortField`/`UnitSortOrder`, `UnitSearchParams`/`UnitSearchResult`; `update()`/`softDelete()` thêm `organizationId` (Decision SU03); thêm `restore()`, `findByIdIncludingDeleted()` |
| `infrastructure/persistence/prisma-unit.repository.ts` | `update()` dùng `updateMany` compare-and-swap WHERE `id`+`organizationId`+`version`; `softDelete()`/`restore()` thêm `organizationId` vào `where`; `search()` thêm `isActive`/`sortBy`/`sortOrder` (AND composition, đúng mẫu Brand) |
| `infrastructure/persistence/prisma-unit.repository.spec.ts` | Cập nhật mock `updateMany`/`findUniqueOrThrow`, thêm test Optimistic Lock conflict, `organizationId` scoping, `restore()`, `isActive`/`sortBy` |
| `application/unit.service.ts` | `update()` dùng `dto.version`; thêm `restore()`; Delete Guard gọi thêm `BarcodeDomainService.hasActiveBarcodesInUnit()`; thêm 4 event hook no-op; `search()` truyền `isActive`/`sortBy`/`sortOrder` |
| `application/unit.service.spec.ts` | Cập nhật + thêm test theo §5 Test Strategy |
| `application/mappers/unit.mapper.ts` | Map thêm `status`, `version` |
| `application/dto/create-unit.dto.ts` | Thêm `status?` |
| `application/dto/update-unit.dto.ts` | Thêm `status?`, `version` (bắt buộc) |
| `application/dto/unit-query.dto.ts` | Thêm `isActive?`, `sortBy?`, `sortOrder?` |
| `application/dto/unit-response.dto.ts` | Thêm `status`, `version` |
| `presentation/unit.controller.ts` | Thêm route `POST /units/:id/restore`, Swagger update cho `GET`/`PATCH` |
| `presentation/unit.controller.spec.ts` | Cập nhật + thêm test route `restore` |
| `unit.module.ts` | Thêm `imports: [..., BarcodeModule]` |

### 1.3 Modify — ngoài module `unit` (8 file)

| File | Thay đổi |
|---|---|
| `modules/product/infrastructure/persistence/prisma-product.repository.ts` | `hasActiveProductsInUnit()` thêm `status: 'ACTIVE'` vào `where` (Decision SU01) |
| `modules/product/infrastructure/persistence/prisma-product.repository.spec.ts` | Thêm test xác nhận `where` có `status: 'ACTIVE'`; thêm case Product `INACTIVE` → không chặn |
| `modules/barcode/domain/repositories/barcode.repository.interface.ts` | Thêm `hasActiveBarcodesInUnit(unitId): Promise<boolean>` |
| `modules/barcode/infrastructure/persistence/prisma-barcode.repository.ts` | Implement `hasActiveBarcodesInUnit()` — `where: { unitId, deletedAt: null }` |
| `modules/barcode/infrastructure/persistence/prisma-barcode.repository.spec.ts` | Thêm test cho method mới |
| `modules/barcode/barcode.module.ts` | `providers`/`exports` thêm `BarcodeDomainService` |
| `common/errors/error-codes.ts` | Thêm `UNIT_VERSION_CONFLICT: 'UNIT_004'`, `UNIT_NOT_DELETED: 'UNIT_005'` |
| `modules/rbac/infrastructure/permission-catalog.ts` | Dòng 63: `crud('unit', 'đơn vị tính')` → `crud('unit', 'đơn vị tính', ['restore'])` |

### 1.4 Delete

Không có file nào bị xóa.

### 1.5 Tổng: 5 mới + 11 sửa (`unit`) + 8 sửa (ngoài `unit`: `product` ×2, `barcode` ×4, `error-codes.ts`, `permission-catalog.ts`) = **24 file**

So với Brand (17 file, 0 module khác ngoài 2 file dùng chung), Unit chạm **2 module nghiệp vụ thật** (`product`, `barcode`) — đúng Decision U09 "High Impact Aggregate".

## 2. Migration Plan

**2 migration độc lập** (Decision RQ9/SU07 — không backfill phức tạp, có rollback):

### Migration A — `version`

```sql
ALTER TABLE "units" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
```

**Rollback:** `ALTER TABLE "units" DROP COLUMN "version";`
**Verify:** `SELECT COUNT(*) FROM units;` trước/sau phải bằng nhau; `SELECT COUNT(*) FROM units WHERE version = 1;` khớp tổng số dòng.

### Migration B — `UnitStatus`

```sql
CREATE TYPE "UnitStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
ALTER TABLE "units" ADD COLUMN "status" "UnitStatus" NOT NULL DEFAULT 'ACTIVE';
UPDATE "units" SET "status" = 'ARCHIVED' WHERE "deletedAt" IS NOT NULL;
```

**Rollback:** `ALTER TABLE "units" DROP COLUMN "status";` rồi `DROP TYPE "UnitStatus";`
**Verify:** `SELECT COUNT(*) FROM units WHERE status = 'ARCHIVED' AND "deletedAt" IS NULL;` phải bằng `0` (không có dòng ARCHIVED mà chưa xóa mềm — xác nhận backfill đúng).

Cả 2 migration thuần `ADD COLUMN`/`CREATE TYPE`, không `DROP` dữ liệu hiện có (Decision SU07). Backfill B chỉ 1 câu `UPDATE` dựa trên `deletedAt` — không phức tạp (đúng yêu cầu Decision RQ9).

## 3. Dependency Impact

| Module | Ảnh hưởng |
|---|---|
| **Product** | **Có** — `hasActiveProductsInUnit()` đổi hành vi lọc (Decision SU01): thêm điều kiện `status='ACTIVE'`. Đây là thay đổi hành vi thật (không chỉ thêm field) — Product `INACTIVE`/`ARCHIVED` không còn chặn xóa Unit như trước. `Product.unitId` (FK, bắt buộc, `Restrict`) không đổi. |
| **Barcode** | **Có** — thêm mới `BarcodeDomainService` (1 method), thêm `hasActiveBarcodesInUnit()` vào Repository. `Barcode.unitId` (FK, optional, `SetNull`) không đổi cấu trúc, nhưng nay được dùng trong Delete Guard của Unit lần đầu tiên. |
| **Purchase** (`purchase-order`, `purchase-return`) | Grep xác nhận 0 tham chiếu `Unit`/`unitId` — 0 ảnh hưởng (đúng kết quả Audit §1). |
| **Inventory** (`inventory`, `inventory-adjustment`) | 0 tham chiếu — 0 ảnh hưởng. |
| **Supplier**, **Transfer**, **Invoice**, **StockCount** | 0 tham chiếu tới `Unit` (không có FK `unitId`) — 0 ảnh hưởng. |
| **Permission** | Thêm đúng 1 permission `unit:restore`. |
| **Swagger** | Route mới `POST /units/:id/restore`; `GET /units`/`PATCH /units/:id` cập nhật mô tả tham số mới. |
| **Tests** | 4 suite hiện có (`unit`, 37 test) cập nhật; 2 suite `product` cập nhật (`prisma-product.repository.spec.ts`, có thể `product-domain.service.spec.ts` không cần đổi vì chỉ test pass-through); `barcode` thêm 1 suite mới. Regression Baseline (T005+T006+T007) phải PASS. |

**Kết luận**: khác Brand (0 module nghiệp vụ khác bị chạm), Unit chạm đúng 2 module theo đúng dự đoán của Decision U09 — không có ảnh hưởng nào ngoài phạm vi đã nêu trong SPEC-UNIT-001 (không tự mở rộng sang Purchase/Inventory/Supplier — xác nhận 0 tham chiếu).

## 4. Commit Strategy

**9 commit** (nhiều hơn Brand's 6 — lý do: 2 migration độc lập thay vì 1, và 2 module nghiệp vụ khác bị chạm thay vì 0; mỗi thay đổi vẫn giữ đúng nguyên tắc "1 đơn vị logic = 1 commit", không gộp/squash):

| # | Commit | Nội dung |
|---|---|---|
| 1 | Migration A | `version` — `migration.sql` + `rollback.sql` |
| 2 | Migration B | `UnitStatus` — `migration.sql` + `rollback.sql` |
| 3 | Product fix | `hasActiveProductsInUnit()` thêm `status='ACTIVE'` (Decision SU01) + test |
| 4 | Barcode DomainService | `BarcodeDomainService` mới, `hasActiveBarcodesInUnit()` (Decision RQ5/SU05) + test |
| 5 | Repository (unit) | `unit.entity.ts`, `unit.repository.interface.ts`, `unit.errors.ts` (mới), `prisma-unit.repository.ts`, `prisma-unit.repository.spec.ts` — bao gồm `organizationId` ở `where` (Decision SU03) |
| 6 | Application (unit) | `unit.service.ts`, `unit.service.spec.ts`, `unit.mapper.ts`, `update-unit.dto.ts`, `unit-query.dto.ts`, `unit-response.dto.ts`, `create-unit.dto.ts` |
| 7 | Presentation (unit) | `unit.controller.ts`, `unit.controller.spec.ts`, `unit.module.ts` (thêm import `BarcodeModule`), `permission-catalog.ts`, `error-codes.ts` (đặt ở đây vì `UNIT_VERSION_CONFLICT`/`UNIT_NOT_DELETED` cần có mặt trước Commit 6 dùng — **điều chỉnh giống Risk R5 của Brand: đưa `error-codes.ts` lên Commit 6 (Application), không phải Commit 7**) |
| 8 | Tests | Bổ sung case còn thiếu theo Test Strategy (§5) nếu Commit 3-7 chưa phủ hết |
| 9 | Documentation | Release note T008, `PROJECT_STATUS.md`, `technical-debt.md` nếu có PENDING mới |

**Sửa lại thứ tự `error-codes.ts`** (đúng bài học Risk R5 từ Brand Implementation Plan): đưa vào **Commit 6 (Application)**, không phải Commit 7, vì `UnitService` cần `ErrorCode.UNIT_VERSION_CONFLICT`/`UNIT_NOT_DELETED` tồn tại trước khi dùng `withCode()`.

## 5. Test Strategy

Đúng danh sách bắt buộc Decision SU08 ("Không được thiếu"):

| Nhóm | Nội dung |
|---|---|
| **Delete Guard Product** | Cập nhật test hiện có cho filter `status=ACTIVE` mới (Decision SU01); thêm case Product `INACTIVE` không chặn xóa (hành vi MỚI, khác trước) |
| **Delete Guard Barcode** | Mới — Barcode chưa xóa mềm tham chiếu Unit → chặn Archive (Decision RQ5) |
| **Optimistic Lock** | `PATCH` đúng `version` → thành công, tăng `version`; sai `version` → `409` |
| **Restore** | Đã xóa mềm → restore → `status=INACTIVE`; chưa từng xóa → restore → lỗi (`UNIT_NOT_DELETED`) |
| **Pagination** | Không đổi hành vi, xác nhận không vỡ |
| **Search** | Không đổi hành vi (`name`/`code`), xác nhận không vỡ |
| **Sort** | `sortBy=name`(default)/`code`/`createdAt` × `sortOrder=asc`/`desc` |
| **Multi Tenant** | `update`/`softDelete`/`restore` với `id` đúng nhưng `organizationId` khác tổ chức → không tìm thấy/0 dòng ảnh hưởng (Decision SU03 — method mới có `organizationId` trong `where`) |
| **Permission** | `POST /units/:id/restore` yêu cầu đúng `unit:restore`, thiếu → `403` |
| **Regression** | Toàn bộ `npx jest` — xác nhận Sprint-00 + T005 + T006 + T007 vẫn PASS |
| **isActive** | `isActive=true/false` lọc đúng theo `status`; `status`+`isActive` đồng thời → AND |
| **BarcodeDomainService** (mới) | `hasActiveBarcodesInUnit()` pass-through đúng, test riêng ở `barcode` module |
| **Architecture** | Không viết mới cho `UnitDomainService` (không tạo — Decision SU06). Xác nhận không có Architecture Test nào vỡ do `UnitModule` thêm `imports: [BarcodeModule]` |
| **Performance** (Decision SU09) | Không cần benchmark riêng — xác nhận qua code review `hasActiveProductsInUnit()`/`hasActiveBarcodesInUnit()` dùng `findFirst`/`select` (EXISTS-style, không N+1) |

**Ước tính**: +18 test case mới (Delete Guard Barcode ×2, Optimistic Lock ×2, Restore ×3, Multi Tenant ×3, Permission restore ×2, isActive ×3, BarcodeDomainService ×2, Product status-filter ×1), cộng dồn vào 37 test hiện có của `unit` → **~55 test case**, cộng test mới ở `product`/`barcode`.

## 6. Risk Matrix

| # | Risk | Impact | Mitigation | Verification |
|---|---|---|---|---|
| R1 | Sửa `hasActiveProductsInUnit()` (Decision SU01) đổi hành vi đã có từ trước — nếu có dữ liệu thật đã dựa vào hành vi cũ (chặn cả Product `INACTIVE`), sau khi sửa 1 số Unit trước đây "bị khóa" nay xóa được | Trung bình | Đây là thay đổi được Architect xác nhận tường minh (Decision SU01, không phải phát hiện tự ý) — ghi rõ vào Release Note như 1 Behavior Change có chủ đích, không phải Bug fix âm thầm | Test case riêng xác nhận đúng hành vi mới; Release Note liệt kê rõ |
| R2 | `unit.update()`/`softDelete()`/`restore()` đổi chữ ký (thêm `organizationId`) — khác chữ ký Brand/Category hiện tại, có thể gây nhầm lẫn khi đọc code song song 2 module | Thấp | Ghi rõ trong code comment + SPEC §10.1 rằng đây là divergence có chủ đích (Decision SU03), không phải lỗi thiếu nhất quán — Product/Category/Brand sẽ được cập nhật vào đúng Sprint riêng của từng module | Code review xác nhận comment rõ ràng tại điểm khác biệt |
| R3 | `BarcodeDomainService` mới — `UnitModule` import `BarcodeModule`, `BarcodeModule` lại import `ProductModule` (đã có) — cần xác nhận không tạo circular dependency (`unit`→`barcode`→`product`, không có chiều ngược) | Thấp | `barcode` không import `unit` ở bất kỳ đâu (xác nhận qua grep Audit §2) — chiều phụ thuộc 1 chiều, an toàn | `npm run build` (NestJS sẽ báo lỗi ngay nếu có circular DI) |
| R4 | `error-codes.ts` cần đặt đúng thứ tự trước khi `UnitService` dùng (giống Risk R5 của Brand) | Thấp | Đã điều chỉnh trong Commit Strategy (§4) — đặt ở Commit 6 (Application), không phải Commit 7 | Build PASS sau mỗi commit theo đúng thứ tự đã điều chỉnh |
| R5 | 2 migration độc lập (A: version, B: status) — nếu chạy sai thứ tự hoặc bỏ sót 1 trong 2 khi deploy thật | Thấp | Tên thư mục migration theo timestamp tuần tự (A trước B), Prisma tự áp theo thứ tự thư mục — không có phụ thuộc kỹ thuật giữa A/B nên thứ tự ngược cũng không lỗi, nhưng vẫn giữ đúng thứ tự đã định để nhất quán | `npx prisma migrate deploy` áp dụng tự động theo thứ tự |

## 7. Rollback Strategy

**Nếu migration lỗi:**
1. Chạy `rollback.sql` tương ứng (Migration A hoặc B, độc lập — §2).
2. Verify: `SELECT COUNT(*) FROM units;` khớp đúng số dòng trước migration.
3. Không mất dữ liệu — cả 2 migration thuần `ADD COLUMN`/`CREATE TYPE`, Migration B có `UPDATE` backfill nhưng backfill dựa trên `deletedAt` đã có sẵn (không có nguồn dữ liệu nào bị ghi đè/mất).

**Nếu code lỗi:**
- Chưa merge/commit → sửa tại chỗ hoặc bỏ nhánh code chưa từng commit.
- Đã commit nhưng chưa push → `git reset --soft HEAD~1` sau khi xác nhận qua `git log origin/main..HEAD`.
- Đã push → không revert tự động, báo cáo Architect.

**Nếu `BarcodeDomainService`/sửa `hasActiveProductsInUnit()` cần rollback riêng:**
- `BarcodeDomainService`: xóa file mới + dòng export trong `barcode.module.ts` — không ảnh hưởng `BarcodeService`/`BARCODE_REPOSITORY` hiện có (thuần thêm mới).
- `hasActiveProductsInUnit()`: revert lại đúng 1 dòng (`status: 'ACTIVE'` trong `where`) — không ảnh hưởng method nào khác của `prisma-product.repository.ts`.

## 8. Acceptance Checklist

- [ ] SPEC-UNIT-001 LOCKED, không có thay đổi nào chưa qua Architecture Review kể từ đó (Decision SU10)
- [ ] Migration Plan (§2) xác nhận: 2 migration độc lập, mỗi cái có `rollback.sql` + bước Verify
- [ ] File Impact (§1) không sót file nào — đối chiếu lại với `unit-dependency-audit.md`
- [ ] Dependency Impact (§3) xác nhận đúng 2 module bị chạm (`product`, `barcode`), 0 module khác
- [ ] Commit Strategy (§4) đã điều chỉnh đúng theo bài học Risk R5/Brand: `error-codes.ts` ở Commit 6, không phải Commit 7
- [ ] Test Strategy (§5) đủ 14 nhóm theo Decision SU08, không thiếu nhóm nào
- [ ] Risk Matrix (§6) không còn Risk "Cao" nào thiếu Mitigation cụ thể
- [ ] Rollback Strategy (§7) xác nhận không có bước nào gây mất dữ liệu
- [ ] `AUTHORIZATION — T008 – Unit Implementation` từ Architect đã có trước khi chạm Commit 1
- [ ] Đúng thứ tự Coding Rules: Migration → Build PASS → TypeCheck PASS → Lint PASS → (lặp lại cho từng commit tiếp theo) — không gộp bước
- [ ] Regression Baseline (Sprint-00 + T005 + T006 + T007) PASS trước khi đóng T008
- [ ] Coverage module `unit` không thấp hơn baseline hiện tại (Audit §11)
- [ ] Hành vi mới của `hasActiveProductsInUnit()` (Decision SU01) được ghi rõ trong Release Note như Behavior Change có chủ đích

## Lịch sử quyết định

- **SPEC-UNIT-001** — LOCKED (Decision SU01-SU10).
- **`ARCHITECTURE REVIEW – SPEC-UNIT-001`** — APPROVED WITH FINAL DECISIONS, ủy quyền tạo Implementation Plan này.
- Implementation Plan này (tài liệu hiện tại) — chờ Architecture Review, chỉ AUTHORIZATION riêng `T008 – Unit Implementation` mới được bắt đầu code (đúng mẫu Decision T007-04).
