# T005.1 — Product Refactor Implementation Plan

**Nguồn:** `SPEC-PRODUCT-001` (APPROVED WITH MINOR REVISIONS, Decision A01-A10). **Không code, không commit** — kế hoạch cho lần triển khai THẬT sau khi có Architecture Review lần cuối.

## 1. Danh sách file sẽ sửa

### 1.1 Module `product` (lõi — 22 file, 5 file mới)

| # | File | Loại | Nội dung thay đổi |
|---|---|---|---|
| 1 | `backend/prisma/schema.prisma` | Sửa | `ProductStatus`, `ProductType` (mới), `Product` (field mới), `Barcode` (thêm `organizationId`, đổi unique) |
| 2 | `backend/prisma/migrations/<ts>_product_refactor/migration.sql` | **Mới** | Toàn bộ SQL ở SPEC §3, đúng thứ tự |
| 3 | `domain/entities/product.entity.ts` | Sửa | Bỏ `isService`, thêm `type`/`parentProductId`/`version` |
| 4 | `domain/repositories/product.repository.interface.ts` | Sửa | `CreateProductInput`/`UpdateProductInput`, `update()` nhận `expectedVersion`, thêm `findChildrenByParentId()`/`hasActiveVariantChildren()` |
| 5 | `domain/errors/product.errors.ts` | **Mới** | `ProductConcurrencyConflictError` (mẫu `InventoryConcurrencyConflictError`) |
| 6 | `infrastructure/persistence/prisma-product.repository.ts` | Sửa | Compare-and-swap trên `update()`, query theo constraint Barcode mới, 2 method mới |
| 7 | `infrastructure/persistence/prisma-product.repository.spec.ts` | Sửa | Test cho mọi thay đổi ở #6 |
| 8 | `application/product-domain.service.ts` | **Mới** | 4 method (SPEC §8) |
| 9 | `application/product-domain.service.spec.ts` | **Mới** | Test cho #8 |
| 10 | `single-writer.architecture.spec.ts` → đổi tên `product-repository-boundary.architecture.spec.ts` | **Mới** | Kiểm tra không module nào ngoài `product` inject `PRODUCT_REPOSITORY`; `ProductModule` chỉ export `ProductDomainService`; 5 module phụ thuộc import `ProductModule` (mẫu `inventory/single-writer.architecture.spec.ts`, đặt tên đúng bản chất "Repository Boundary" theo SPEC §8, không phải "Single Writer") |
| 11 | `application/product.service.ts` | Sửa | Guard đổi `type` (A06), guard Archive/Variant Active, Restore→INACTIVE (A05), versioning (A09), Event hook (§10) |
| 12 | `application/product.service.spec.ts` | Sửa | Test cho mọi guard mới ở #11 |
| 13 | `application/mappers/product.mapper.ts` | Sửa | Map field mới, bỏ `isService` |
| 14 | `application/dto/create-product.dto.ts` | Sửa | Thêm `type` (bắt buộc), `parentProductId` (optional) |
| 15 | `application/dto/create-product.dto.spec.ts` | Sửa | Test validate field mới |
| 16 | `application/dto/update-product.dto.ts` | Sửa | Thêm `type`, `parentProductId`, `version` (bắt buộc) |
| 17 | `application/dto/product-query.dto.ts` | Sửa | Thêm filter `type`/`unitId`/`parentProductId` (A07) |
| 18 | `application/dto/product-response.dto.ts` | Sửa | Thêm `type`/`parentProductId`/`version`, bỏ `isService`, label `sku` = "Product Code" (Decision 6) |
| 19 | `presentation/product.controller.ts` | Sửa | Không đổi route — chỉ theo DTO mới |
| 20 | `presentation/product.controller.spec.ts` | Sửa | Test DTO mới truyền qua đúng |
| 21 | `product.module.ts` | Sửa | `exports: [PRODUCT_REPOSITORY]` → `exports: [ProductDomainService]` |
| 22 | `test/product.e2e-spec.ts` | Sửa | Field mới trong request/response; **PENDING nếu sandbox không có Docker** (`TEST_RULES.md` §6) |

### 1.2 5 module phụ thuộc (15 file, đúng thứ tự Category → Brand → Unit → Barcode → Cart, SPEC §13)

| # | Module | File | Thay đổi |
|---|---|---|---|
| 1 | `category` | `application/category.service.ts` | Inject `ProductDomainService` thay `PRODUCT_REPOSITORY`; gọi `hasActiveProductsInCategory()` qua đó |
| 2 | | `application/category.service.spec.ts` | Mock `ProductDomainService` |
| 3 | | `category.module.ts` | Import `ProductModule` (nếu chưa) |
| 4 | `brand` | `application/brand.service.ts` | Tương tự #1, `hasActiveProductsInBrand()` |
| 5 | | `application/brand.service.spec.ts` | Mock |
| 6 | | `brand.module.ts` | Import `ProductModule` (nếu chưa) |
| 7 | `unit` | `application/unit.service.ts` | Tương tự #1, `hasActiveProductsInUnit()` |
| 8 | | `application/unit.service.spec.ts` | Mock |
| 9 | | `unit.module.ts` | Import `ProductModule` (nếu chưa) |
| 10 | `barcode` | `application/barcode.service.ts` | Tương tự #1, `findById()` |
| 11 | | `application/barcode.service.spec.ts` | Mock |
| 12 | | `barcode.module.ts` | Import `ProductModule` (nếu chưa) |
| 13 | `cart` | `application/cart.service.ts` | Tương tự #1, `findById()` — **có tham chiếu `isService`/`ProductStatus` trong fixture test, xác nhận bằng grep** (xem §4 Risk) |
| 14 | | `application/cart.service.spec.ts` | Mock + cập nhật fixture `ProductEntity` (bỏ `isService`, thêm `type`) |
| 15 | | `cart.module.ts` | Xác nhận đã import `ProductModule` (khả năng đã có sẵn — cần kiểm tra khi code thật, không giả định) |

**Tổng cộng: 37 file (22 lõi + 15 phụ thuộc), trong đó 5 file mới hoàn toàn.**

## 2. Thứ tự sửa

Đúng nguyên văn SPEC §13 (Decision A04) — **không đảo**: Migration → Repository → Domain Service → Application → Controller → 5 module phụ thuộc (Category → Brand → Unit → Barcode → Cart) → Test → Architecture Review.

## 3. Migration Plan

Tóm tắt từ SPEC §3 (chi tiết SQL đầy đủ nằm ở đó, không lặp lại ở đây):

1. `ProductStatus`: `RENAME VALUE 'DISCONTINUED' TO 'ARCHIVED'` → `ADD VALUE 'DRAFT'`.
2. `ProductType`: tạo enum → thêm cột `DEFAULT 'STANDARD'` → backfill từ `isService` → bỏ default → drop `isService`.
3. `parentProductId`: thêm cột nullable + FK self-reference `Restrict` + index.
4. `Barcode`: thêm `organizationId` nullable → backfill từ `Product` → `NOT NULL` → FK → **tạo unique constraint mới TRƯỚC** → drop constraint cũ SAU (đã sửa thứ tự theo A08).
5. `version`: thêm cột `INTEGER NOT NULL DEFAULT 1`.

**Điều kiện chặn bắt buộc trước bước 4**: chạy script kiểm tra trùng (SPEC §3.4) trên dữ liệu thật (staging trước, production sau) — nếu > 0 dòng, DỪNG, không tiếp tục migration, xử lý dữ liệu trùng thủ công trước.

**Cần xác minh riêng trước khi code thật (không giả định)**: phiên bản Postgres của môi trường deploy có cho phép dùng giá trị enum mới thêm (`ADD VALUE`) trong CÙNG transaction với câu lệnh khác hay không (PostgreSQL ≥12 cho phép, <12 thì không) — nếu môi trường dùng bản cũ hơn 12, bước 1/2 cần tách thành 2 migration riêng thay vì gộp chung.

## 4. Rollback Plan

Tóm tắt từ SPEC §14:

- Mỗi bước migration xuôi cần soạn migration ngược TƯƠNG ỨNG, cùng lúc (không soạn sau khi đã chạy xuôi).
- `ADD VALUE 'DRAFT'` không có `DROP VALUE` trực tiếp trong Postgres — rollback thật cần tái tạo toàn bộ enum type (tốn kém, cần quyết định trước khi chạy migration thật, không phải sau khi phát hiện cần rollback).
- Nếu Barcode duplicate-check FAIL — không cần rollback (migration chưa từng chạy tới bước đổi constraint), chỉ cần xử lý dữ liệu trùng rồi chạy lại.
- Code: chưa từng commit thì không cần `git revert` — chỉ cần không merge nếu Acceptance Criteria (SPEC §12, 17 tiêu chí) không đạt đủ.

## 5. Risk Matrix

| # | Rủi ro | Xác suất | Ảnh hưởng | Giảm thiểu |
|---|---|---|---|---|
| 1 | Barcode có dữ liệu trùng `(organizationId, code)` trong dữ liệu thật hiện có | Trung bình (chưa kiểm tra dữ liệu thật) | Cao — chặn migration hoàn toàn (Decision 7: "phải FAIL, không tự merge") | Chạy script kiểm tra (SPEC §3.4) trên bản sao dữ liệu thật TRƯỚC khi lên kế hoạch ngày triển khai, không đợi tới lúc migrate thật mới biết |
| 2 | Optimistic Lock (`version` bắt buộc trên `PATCH`) phá vỡ client hiện có (nếu đã có Frontend gọi API Product) | Chưa xác định (cần kiểm tra Frontend có đang gọi `PATCH /products/:id` chưa) | Cao nếu có Frontend tích hợp sẵn | Kiểm tra Frontend trước khi code; nếu có, cần đồng bộ thay đổi 2 phía cùng lúc |
| 3 | Postgres version không hỗ trợ dùng enum value mới thêm trong cùng transaction | Thấp (đa số bản deploy hiện đại ≥12) | Trung bình — migration lỗi khi chạy thật | Xác minh version Postgres môi trường đích trước khi soạn migration.sql thật (§3) |
| 4 | Sót 1 trong 5 module phụ thuộc chưa đổi hết DI (còn sót lời gọi `PRODUCT_REPOSITORY`) | Thấp (có Architecture Test chặn) | Thấp — bắt được ngay ở bước Test, không lọt tới Production | Architecture Test (#10 ở §1.1) chạy SAU CÙNG bước 6, đúng thứ tự SPEC §13 |
| 5 | `cart.service.spec.ts` và các test khác có fixture cứng `isService`/`ProductStatus` cũ, quên cập nhật gây test vỡ không do lỗi logic thật | Trung bình (đã xác nhận bằng grep — xem dưới) | Thấp — phát hiện ngay khi chạy Unit Test | Đã liệt kê rõ trong File List (§1.2 #14); chạy `grep isService\|DISCONTINUED` trong toàn `backend/src` sau khi code xong, xác nhận 0 kết quả còn sót |
| 6 | Migration Backfill (bước 4, `organizationId` cho Barcode) chạy trên bảng lớn gây khóa dài | Thấp (quy mô dữ liệu hiện tại nhỏ, dự án chưa production thật) | Thấp ở giai đoạn hiện tại, có thể tăng khi dữ liệu lớn hơn | Không cần xử lý đặc biệt ở Sprint-01; ghi nhận làm lưu ý cho lần deploy production thật sau này |
| 7 | 11 module tham chiếu Product (Inventory/Purchase/...) có test fixture ẩn khác chưa phát hiện qua grep `isService\|DISCONTINUED` | Thấp (đã grep xác nhận, xem dưới) | Trung bình nếu có sót | Grep xác nhận: ngoài `product` module, CHỈ `cart.service.spec.ts` tham chiếu `isService`/`DISCONTINUED` — không có module nào khác trong 11 module còn lại |

**Bằng chứng cho rủi ro #5/#7**: `grep -rn "isService\|DISCONTINUED" backend/src` cho kết quả tại 11 file — 10 file thuộc chính `product` module (dự kiến sửa ở §1.1), và đúng 1 file NGOÀI `product`: `cart/application/cart.service.spec.ts` (đã đưa vào §1.2 #14). Không có module nào trong 11 module tham chiếu Product (Inventory/Purchase/Transfer/StockCount/Adjustment/Order/Return/Supplier/Invoice) xuất hiện trong kết quả grep này.

## 6. Test Matrix

| Lớp (theo `TEST_RULES.md`) | Phạm vi | Ước tính số case mới/thay đổi |
|---|---|---|
| Unit — Entity/Mapper | `product.entity.ts`, `product.mapper.ts` | ~3-5 (field mới map đúng) |
| Unit — Repository | `prisma-product.repository.spec.ts` | ~10-15 (Optimistic Lock conflict, `findChildrenByParentId`, `hasActiveVariantChildren`, Barcode uniqueness theo org) |
| Unit — Domain Service | `product-domain.service.spec.ts` (mới) | ~4-6 (4 method × happy-path + edge case) |
| Unit — Application Service | `product.service.spec.ts` | ~10-12 (guard đổi Type, guard Archive/Variant Active, Restore→INACTIVE, versioning, mapping lỗi Concurrency) |
| Unit — DTO Validation | `create-product.dto.spec.ts` | ~4-6 (`type` bắt buộc, `parentProductId` UUID hợp lệ) |
| Unit — Controller | `product.controller.spec.ts` | ~2-4 (field mới truyền qua đúng) |
| Unit — 5 module phụ thuộc | 5× `*.service.spec.ts` | ~5-8 (chủ yếu đổi mock, +1 test khẳng định gọi đúng `ProductDomainService`/module mỗi nơi) |
| **Architecture** | `product-repository-boundary.architecture.spec.ts` (mới) | ~8-10 (mẫu `single-writer.architecture.spec.ts`: 3 test quét file + 1 test export + 5 test import từng module) |
| Integration (e2e) | `product.e2e-spec.ts` | Cập nhật field, KHÔNG tính vào "PASS" nếu sandbox không có Docker (PENDING) |

**Tổng ước tính: ~50-65 test case mới hoặc thay đổi** (không tính e2e nếu PENDING).

## 7. Estimated Impact

- **Trực tiếp**: `product` module (viết lại đáng kể tầng Repository/Application, thêm tầng Domain Service mới) + 5 module phụ thuộc (đổi DI, không đổi logic).
- **Gián tiếp qua compile dependency (Decision 14 — không đổi logic, chỉ cần biên dịch qua)**: 11 module tham chiếu `productId` (Inventory, PurchaseItem, PurchaseReturnItem, OrderItem, ReturnItem, TransferItem, StockCountItem, InventoryAdjustmentItem, SupplierProduct, InvoiceItem) — không sửa file nào ở các module này, chỉ cần xác nhận `npx tsc --noEmit`/test hiện có của chúng vẫn PASS sau khi Product Entity đổi shape (Acceptance Criteria #8/#13).
- **Không đổi**: API route (không thêm/bớt route nào), Permission catalog (không thêm code mới), luồng nghiệp vụ Checkout/Purchase/Inventory (Decision 14 — ngoài phạm vi Sprint-01).

## 8. Estimated Files Changed

**37 file** (§1) — 5 file mới, 32 file sửa. Không tính file governance/docs cập nhật kèm theo (vd `gate-status.md` khi Sprint-01 có Gate riêng).

## 9. Estimated Test Count

**~50-65 test case mới/thay đổi** (§6), cộng với việc chạy lại TOÀN BỘ bộ test hiện có của dự án (tính tới thời điểm viết plan này: 135 suite / 1223 test, xem `docs/implementation/sprint-00-t004-report.md`) để xác nhận Acceptance Criteria #8/#13 (không phá vỡ 11 module phụ thuộc).
