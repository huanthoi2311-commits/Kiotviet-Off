# SPEC-PRODUCT-001 — Product Refactor

**Status:** APPROVED WITH MINOR REVISIONS (ARCHITECTURE REVIEW, Decision A01-A10) — chuyển sang Implementation Plan (T005.1). **SPEC này vẫn không code/không migration/không commit** — chỉ Implementation Plan (T005.1) và code THẬT (Sprint sau, sau Architecture Review lần cuối) mới được phép động vào code thật.
**Nguồn:** `RFC-0001` (APPROVED WITH REVISIONS, 15 Decision) + `ARCHITECTURE REVIEW – SPEC-PRODUCT-001` (Decision A01-A10) — ràng buộc bắt buộc của SPEC này. Toàn bộ điểm A01-A10 đã hợp nhất vào nội dung dưới đây; 4 câu hỏi mở ở bản trước đã được A01/A05/A06/A07 giải quyết (không còn mục "Câu hỏi còn mở").
**Bản chất:** đây là **Refactor**, không phải module mới (Decision 1) — mọi mục dưới đây mô tả thay đổi trên module `product` **đang chạy thật**, đang được tham chiếu bởi 11 model khác (`Inventory`, `PurchaseItem`, `PurchaseReturnItem`, `OrderItem`, `ReturnItem`, `TransferItem`, `StockCountItem`, `InventoryAdjustmentItem`, `SupplierProduct`, `InvoiceItem`) và Cart (snapshot).

## 0. Sửa 1 phát hiện sai trong báo cáo Review RFC trước đó

Báo cáo Review RFC-0001 trước liệt kê **6 module** inject `PRODUCT_REPOSITORY` trực tiếp, gồm cả `supplier-product.service.ts`. Đây là **kết quả sai** — do grep dùng pattern không có ranh giới từ, bắt nhầm `SUPPLIER_PRODUCT_REPOSITORY` (token hoàn toàn khác, thuộc domain Supplier-Product, không liên quan `product` module) làm khớp `PRODUCT_REPOSITORY`.

Đã xác minh lại bằng regex có ranh giới từ (`[^_]PRODUCT_REPOSITORY\b`): **chỉ 5 module** thực sự inject `PRODUCT_REPOSITORY`: `cart`, `barcode`, `unit`, `brand`, `category`. `supplier-product` KHÔNG liên quan, không cần refactor gì trong SPEC này.

**Điều chỉnh so với Decision 13**: Decision 13 liệt kê "Cart, SupplierProduct, Barcode, Brand, Category, Unit" (6 mục) — dựa trên phát hiện sai đó. Phạm vi thực tế của mục "Repository Refactor" (§7.3) là **5 module**: `cart`, `barcode`, `unit`, `brand`, `category`. Nêu rõ ở đây để Architecture Review xác nhận — không tự ý sửa Decision, chỉ áp dụng đúng bằng chứng đã xác minh lại.

## 1. Entity

### 1.1 `ProductEntity` — thay đổi so với hiện tại (`product.entity.ts`)

```ts
// XÓA
isService: boolean;
status: 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED';

// THÊM
type: 'STANDARD' | 'SERVICE' | 'VARIANT_PARENT' | 'VARIANT_CHILD';  // Decision 5
status: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';                // Decision 3
parentProductId: string | null;                                      // Decision 9
version: number;                                                     // §6, Optimistic Lock — xem ghi chú
```

Toàn bộ field còn lại (`id`, `organizationId`, `categoryId`, `brandId`, `unitId`, `sku`, `slug`, `name`, `description`, `costPrice`, `vat`, `weight`, `length`, `width`, `height`, `minStock`, `maxStock`, `allowSale`, `isActive`, `createdAt`, `updatedAt`, `deletedAt`, `prices`, `images`, `barcodes`) **giữ nguyên** — không nằm trong phạm vi Decision nào.

**Xác nhận qua Architecture Review, Decision A02**: đề xuất `version: Int` được duyệt — `version INT NOT NULL DEFAULT 1` (không phải `DEFAULT 0`, xem §3.5). Đây nay là **chuẩn chung của toàn dự án kể từ Sprint-01**: mọi Aggregate Root MỚI đều phải có `version` (Aggregate Root → version). `Inventory` sẽ được nâng cấp lên cùng chuẩn ở 1 Sprint sau (ngoài phạm vi SPEC này). **Quy tắc versioning (Decision A09)**: mọi `UPDATE` trên `Product` đều phải tăng `version` (`version++`), cập nhật `updatedAt`/`updatedBy` — `version` không bao giờ reset (kể cả khi restore/archive/activate).

### 1.2 Entity con — không đổi (Decision 8: không đổi schema `ProductPrice`)

`ProductPriceEntity`, `ProductImageEntity`, `ProductBarcodeEntity` giữ nguyên shape. Riêng ràng buộc DB của `Barcode` đổi (§3.4).

## 2. Aggregate

```
Product (Aggregate Root)
├── ProductPrice[]        — không đổi (Decision 8)
├── ProductImage[]        — không đổi
├── Barcode[]              — ràng buộc unique đổi (Decision 7), shape không đổi
└── Product[] (variants)  — self-reference qua parentProductId (Decision 9), KHÔNG tạo model Variant riêng
```

`Category`/`Brand`/`Unit` — tham chiếu qua ID, KHÔNG nằm trong Aggregate (giữ nguyên từ RFC gốc, khớp thiết kế FK hiện tại).

**Không nằm trong Aggregate, chỉ tham chiếu Product qua FK `productId` (không đổi bởi SPEC này)**: `Inventory`, `InventoryMovement`, `PurchaseItem`, `PurchaseReturnItem`, `OrderItem`, `ReturnItem`, `TransferItem`, `StockCountItem`, `InventoryAdjustmentItem`, `SupplierProduct`, `InvoiceItem`, `PriceHistory`, Cart (snapshot `productName`).

## 3. Migration

**Không migration nào được tạo trong bước SPEC này — chỉ mô tả kế hoạch cho khi được duyệt code (T-sau).**

### 3.1 `ProductStatus` — Decision 3

```sql
ALTER TYPE "ProductStatus" RENAME VALUE 'DISCONTINUED' TO 'ARCHIVED';
ALTER TYPE "ProductStatus" ADD VALUE 'DRAFT';
```

Dùng `RENAME VALUE` (không phải drop+recreate) — đúng tiền lệ đã áp dụng ở `OrganizationStatus` (T002: `CANCELLED` → `ARCHIVED`). Toàn bộ dòng `DISCONTINUED` hiện có tự động thành `ARCHIVED`, không cần `UPDATE` thủ công. `ACTIVE`/`INACTIVE` không đổi.

### 3.2 `ProductType` — Decision 5

```sql
CREATE TYPE "ProductType" AS ENUM ('STANDARD', 'SERVICE', 'VARIANT_PARENT', 'VARIANT_CHILD');
ALTER TABLE "products" ADD COLUMN "type" "ProductType" NOT NULL DEFAULT 'STANDARD';
UPDATE "products" SET "type" = 'SERVICE' WHERE "isService" = true;
ALTER TABLE "products" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "products" DROP COLUMN "isService";
```

### 3.3 `parentProductId` — Decision 9

```sql
ALTER TABLE "products" ADD COLUMN "parentProductId" UUID NULL;
ALTER TABLE "products" ADD CONSTRAINT "products_parentProductId_fkey"
  FOREIGN KEY ("parentProductId") REFERENCES "products"("id") ON DELETE RESTRICT;
CREATE INDEX "products_parentProductId_idx" ON "products"("parentProductId");
```

`onDelete: Restrict` — nhất quán với quy ước FK còn lại trong `Product` (mọi FK khác của `Product` đều `Restrict`, trừ `brandId` là `SetNull`). Không cho xóa cứng 1 Parent còn Child tham chiếu (dù Product dùng soft-delete, `Restrict` vẫn là lưới an toàn tầng DB).

Không có bước migrate DỮ LIỆU cho mục này — chưa có Variant nào tồn tại trước SPEC này (đúng Decision 9: "Variant sẽ được tạo sau migration", tức tạo bằng nghiệp vụ bình thường sau khi trường đã sẵn sàng, không phải data backfill).

### 3.4 `Barcode` unique constraint — Decision 7

**Bước bắt buộc trước khi đổi constraint** (Decision 7 chưa nêu, cần bổ sung vì lý do kỹ thuật cụ thể): bảng `barcodes` hiện **không có cột `organizationId`** (`schema.prisma:915-934`) — chỉ suy ra tenant gián tiếp qua `productId → Product.organizationId`. Để tạo `@@unique([organizationId, code])`, bắt buộc thêm cột `organizationId` trực tiếp trên `Barcode` trước (denormalize từ `Product`, đúng mẫu đã dùng cho các bảng con khác trong dự án — vd `InventoryMovement`, `PurchaseItem` đều tự có `organizationId` dù suy ra được từ FK cha).

```sql
ALTER TABLE "barcodes" ADD COLUMN "organizationId" UUID NULL;
UPDATE "barcodes" b SET "organizationId" = p."organizationId"
  FROM "products" p WHERE b."productId" = p."id";
ALTER TABLE "barcodes" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "barcodes" ADD CONSTRAINT "barcodes_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT;
```

**Kiểm tra dữ liệu trùng TRƯỚC khi đổi unique constraint (bắt buộc theo Decision 7 — "Nếu phát hiện trùng dữ liệu trong cùng Organization: Migration phải FAIL. Không tự merge."):**

```sql
-- Chạy TRƯỚC migration đổi constraint. Nếu trả về > 0 dòng → DỪNG migration, không tự sửa dữ liệu.
SELECT "organizationId", "code", COUNT(*) 
FROM "barcodes" 
WHERE "deletedAt" IS NULL
GROUP BY "organizationId", "code" 
HAVING COUNT(*) > 1;
```

**Thứ tự bắt buộc (Decision A08 — "Không được shortcut"), đã sửa thứ tự so với bản trước**: Add `organizationId` → Backfill → `NOT NULL` → **tạo Unique Constraint MỚI trước** → **drop Constraint CŨ sau**. Lý do đổi thứ tự: tạo constraint mới trước khi xóa constraint cũ tránh 1 khoảng thời gian ngắn KHÔNG có ràng buộc unique nào bảo vệ `code` (nếu drop trước rồi mới tạo, có 1 cửa sổ dữ liệu trùng có thể lọt vào giữa 2 câu lệnh).

```sql
CREATE UNIQUE INDEX "barcodes_organizationId_code_key" ON "barcodes"("organizationId", "code");
DROP INDEX "barcodes_code_key";  -- bỏ @unique toàn cục, chỉ sau khi index mới đã tồn tại
```

### 3.5 `version` (Optimistic Lock) — §1.1, Decision A02

```sql
ALTER TABLE "products" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
```

## 4. API

**Không thêm endpoint mới cho Archive/Activate** — tái sử dụng route hiện có, thêm business rule/side-effect vào đúng chỗ (tránh lạm dụng trừu tượng hóa — `CODING_RULES.md` §6):

| Route hiện có | Thay đổi |
|---|---|
| `POST /products` | Thêm field `type` (bắt buộc), `parentProductId` (optional, bắt buộc nếu `type=VARIANT_CHILD` — xem §5). |
| `GET /products`, `GET /products/:id` | Trả thêm `type`, `parentProductId`, `version`, bỏ `isService`. Filter mới trên `GET /products` — xem bảng riêng dưới đây (Decision A07). |
| `PATCH /products/:id` | Thêm field `type` (optional — nhưng xem quy tắc "không đổi Type sau khi phát sinh giao dịch" ở §5, đã có định nghĩa chính thức theo Decision A06). Optimistic Lock: request bắt buộc mang `version` hiện tại (client gửi lại giá trị đã đọc), phản hồi lỗi nếu `version` không khớp; mỗi lần `PATCH` thành công tăng `version` (Decision A09). |
| `DELETE /products/:id` | **Đổi hành vi** — nay set CẢ `status = ARCHIVED` LẪN `deletedAt` (Decision 4), thay vì chỉ `deletedAt` như hiện tại. Thêm guard nghiệp vụ: từ chối nếu còn Variant Child `status=ACTIVE` tham chiếu Product này qua `parentProductId` (RFC §8: "Không cho Archive nếu còn Variant đang Active"). |
| `POST /products/:id/restore` | **Đã quyết định (Decision A05)**: restore luôn trả `status` về **`INACTIVE`** (không phải `ACTIVE`) — tránh vô tình bán lại sản phẩm đã archive; người dùng phải chủ động gọi `PATCH .../status=ACTIVE` (Activate) sau đó. |

**Filter cho `GET /products` (Decision A07 — danh sách đầy đủ, "không cần filter khác"):**

```
type, status, categoryId, brandId, unitId, parentProductId, keyword
```

`keyword` ánh xạ vào field `search` hiện có của `ProductSearchParams` (tìm theo tên/sku, hành vi giữ nguyên, chỉ đổi tên hiển thị trong DTO nếu cần khớp thuật ngữ RFC). `categoryId`/`brandId`/`status`/`search`/pagination/sort đã tồn tại sẵn trong `ProductQueryDto` — không đổi. Thêm mới: `type`, `unitId`, `parentProductId`. Các filter khác đã có sẵn trước SPEC này (`createdFrom/To`, `updatedFrom/To`, `includeDeleted`) KHÔNG nằm trong phạm vi Decision A07 — giữ nguyên, không xóa (A07 quy định không cần THÊM filter nào khác ngoài danh sách trên, không yêu cầu bớt filter đã có).

Không có route mới nào cho "quản lý Variant" riêng — tạo/sửa Variant Child dùng nguyên `POST /products`/`PATCH /products/:id` với `type=VARIANT_CHILD` + `parentProductId` (đúng Decision 9: Variant Child chỉ là 1 Product).

## 5. Validation

Thêm vào `CreateProductDto`/`UpdateProductDto`:

```ts
@IsEnum(['STANDARD', 'SERVICE', 'VARIANT_PARENT', 'VARIANT_CHILD'])
type: ProductType;

@IsOptional()
@IsUUID()
parentProductId?: string;

@IsOptional()
@IsInt()
version?: number; // bắt buộc trên UpdateProductDto để Optimistic Lock hoạt động, optional trên Create (chưa có version)
```

Quy tắc validate theo Business Rule (RFC §8, thực thi ở tầng Service/Repository, không chỉ decorator):
- `type = VARIANT_CHILD` → `parentProductId` BẮT BUỘC, và Product tại `parentProductId` phải có `type = VARIANT_PARENT` (không cho gán con vào 1 Product không phải Parent).
- `type != VARIANT_CHILD` → `parentProductId` PHẢI là `null`.
- **Định nghĩa chính thức "đã phát sinh giao dịch" (Decision A06, quy tắc bất biến)**: nếu `productId` xuất hiện trong BẤT KỲ bảng nào sau — `OrderItem`, `InvoiceItem`, `PurchaseItem`, `PurchaseReturnItem`, `TransferItem`, `InventoryAdjustmentItem`, `StockCountItem` — thì KHÔNG cho đổi `type`. Lưu ý: danh sách này **không gồm** `InventoryMovement`/`Inventory` (snapshot/ledger tồn kho) — chỉ kiểm tra các bảng dòng giao dịch (line item) liệt kê ở trên. `PATCH` đổi `type` phải kiểm tra tồn tại ≥1 bản ghi ở 1 trong 7 bảng này (theo `productId`) trước khi cho phép, nếu có → từ chối.
- `sku` (hiển thị UI là "Product Code", Decision 6) — giữ nguyên validate hiện có (`@@unique([organizationId, sku])`), không đổi.
- `Barcode.code` unique theo `(organizationId, code)` thay vì toàn cục (Decision 7) — cập nhật `existsByBarcode()` trong Repository để filter theo `organizationId` (hiện tại đã nhận `organizationId` làm tham số nhưng constraint DB chưa khớp — sau migration §3.4 mới thực sự đúng).

## 6. Permission

**Không cần permission code mới.** Permission `product:*` hiện có (`crud('product', 'sản phẩm', ['restore'])` — `permission-catalog.ts:60`) đã đủ: `product:create`, `product:view`, `product:update`, `product:delete`, `product:restore`. Archive dùng `product:delete` (route không đổi), Variant Child dùng `product:create`/`product:update` (route không đổi).

## 7. Repository

### 7.1 `IProductRepository` — thay đổi interface

Thêm vào `CreateProductInput`/`UpdateProductInput`: `type: ProductType`, `parentProductId?: string | null`. Bỏ `isService`.

Thêm method mới:
```ts
findChildrenByParentId(parentProductId: string, organizationId: string): Promise<ProductEntity[]>;
hasActiveVariantChildren(parentProductId: string): Promise<boolean>; // dùng cho guard "không Archive nếu còn Variant Active"
```

`update()` đổi chữ ký để hỗ trợ Optimistic Lock:
```ts
update(id: string, expectedVersion: number, input: UpdateProductInput): Promise<ProductEntity>;
// ném ProductConcurrencyConflictError nếu version không khớp (đúng mẫu InventoryConcurrencyConflictError, ADR-0007)
```

**Quy tắc versioning bắt buộc (Decision A09)**: MỌI thao tác `UPDATE` trên `Product` (qua `update()`, và tương đương trong `softDelete()`/`restore()` — cả 2 đều là ghi vào cùng bảng `products`) đều phải: tăng `version` (`version + 1`), cập nhật `updatedAt`, cập nhật `updatedBy`. `version` không bao giờ reset về giá trị cũ (kể cả Archive/Restore/Activate).

### 7.2 `PRODUCT_REPOSITORY` — không export (Decision 2/13, ADR-0010)

`product.module.ts` đổi `exports: [PRODUCT_REPOSITORY]` → `exports: [ProductDomainService]`. `PRODUCT_REPOSITORY`/`IProductRepository`/`PrismaProductRepository` trở thành provider nội bộ.

### 7.3 Phạm vi Refactor 5 module phụ thuộc (đã sửa từ 6 xuống 5, xem §0)

| Module | File cần sửa | Method đang gọi trực tiếp → đổi sang gọi qua `ProductDomainService` |
|---|---|---|
| `cart` | `cart.service.ts` (dòng 49, 128) | `productRepository.findById()` → `productDomainService.findById()` |
| `barcode` | `barcode.service.ts` (dòng 161) | `productRepository.findById()` → `productDomainService.findById()` |
| `unit` | `unit.service.ts` (dòng 128) | `productRepository.hasActiveProductsInUnit()` → `productDomainService.hasActiveProductsInUnit()` |
| `brand` | `brand.service.ts` (dòng 130) | `productRepository.hasActiveProductsInBrand()` → `productDomainService.hasActiveProductsInBrand()` |
| `category` | `category.service.ts` (dòng 178) | `productRepository.hasActiveProductsInCategory()` → `productDomainService.hasActiveProductsInCategory()` |

Cả 5 module đổi `@Inject(PRODUCT_REPOSITORY) productRepository: IProductRepository` → inject class `ProductDomainService` trực tiếp (đúng mẫu Checkout refactor ở T004 — chỉ đổi tầng DI, KHÔNG đổi business logic/transaction của 5 module này).

## 8. Domain Service

`ProductDomainService` — khác về BẢN CHẤT so với `InventoryDomainService` dù cùng MẪU THIẾT KẾ (Decision 2 nói "tương tự Inventory Sprint-00" — đúng về pattern, cần làm rõ 1 điểm để Architecture Review không hiểu nhầm phạm vi):

- `InventoryDomainService` giải quyết vấn đề **Single Writer thật** (nhiều module từng CÙNG GHI vào Inventory, gây race condition — ADR-0005).
- `ProductDomainService` giải quyết vấn đề **Repository Boundary/export hygiene** (ADR-0010) — CHỈ `product` module tự ghi vào `Product` từ trước tới nay; 5 module phụ thuộc chỉ ĐỌC. Không có race condition ghi xuyên module nào từng tồn tại cho Product.

Vì vậy bề mặt public của `ProductDomainService` **chỉ cần đúng 4 phương thức** mà 5 module phụ thuộc thực sự gọi tới hôm nay (không thêm phương thức "phòng khi cần sau" — `CODING_RULES.md` §6):

```ts
class ProductDomainService {
  findById(id: string, organizationId: string): Promise<ProductEntity | null>;
  hasActiveProductsInCategory(categoryId: string): Promise<boolean>;
  hasActiveProductsInBrand(brandId: string): Promise<boolean>;
  hasActiveProductsInUnit(unitId: string): Promise<boolean>;
}
```

Toàn bộ 4 phương thức đều đọc (delegate thẳng `IProductRepository`, không có transaction/`tx` tham số — khác `InventoryDomainService` vì đây không phải thao tác ghi). `create`/`update`/`search`/`softDelete`/`restore`/... KHÔNG lộ ra `ProductDomainService` — chỉ `ProductService` (nội bộ module `product`, dùng bởi `ProductController`) mới gọi các method ghi/tìm kiếm đầy đủ của `IProductRepository`.

**Đã xác nhận qua Architecture Review (Decision A01, A03)**: giữ đúng nguyên tắc YAGNI — **KHÔNG** thêm `create()`/`update()`/`archive()`/`activate()` (hay bất kỳ method ghi nào) vào `ProductDomainService`, kể cả cho nhu cầu tương lai của Promotion/CRM (RFC §1, Decision 14 — ngoài phạm vi Sprint-01). `ProductDomainService` **chỉ phục vụ Repository Boundary** (đọc, chống bypass) — toàn bộ Business Logic tiếp tục nằm ở `ProductService` (Application Service nội bộ). Không biến `ProductDomainService` thành "God Service". Khi module khác phát sinh nhu cầu MỚI thật sự, mới bổ sung — không thêm trước.

## 9. DTO

- `CreateProductDto`/`UpdateProductDto`: thêm `type`, `parentProductId` (§5). Bỏ `isService`.
- `UpdateProductDto`: thêm `version` (bắt buộc để Optimistic Lock — client phải gửi lại giá trị đã đọc).
- `ProductResponseDto`: thêm `type`, `parentProductId`, `version`. Bỏ `isService`. **UI hiển thị `sku` dưới nhãn "Product Code"** (Decision 6 — không đổi tên field DTO, chỉ đổi label hiển thị ở tầng Frontend/Swagger `@ApiProperty({ description: 'Product Code' })`).
- `ProductQueryDto`: thêm filter `type`, `unitId`, `parentProductId` (bắt buộc theo Decision A07 — xem danh sách đầy đủ ở §4).

## 10. Event (Decision 11 — CHỈ định nghĩa, KHÔNG publish ở Sprint-01)

| Event | Publisher | Khi nào |
|---|---|---|
| `ProductCreated` | `product` module (`ProductService.create()`, sau transaction commit) | Sau khi `POST /products` thành công |
| `ProductUpdated` | `product` module | Sau khi `PATCH /products/:id` thành công (mọi field, không riêng status) |
| `ProductArchived` | `product` module | Sau khi `DELETE /products/:id` thành công (status → ARCHIVED) |
| `ProductActivated` | `product` module | Sau khi `PATCH /products/:id` đổi `status` → `ACTIVE` (từ bất kỳ status nào khác) |

Đúng ADR-0009 (publish sau commit) + ADR-0011 (Outbox Pattern — ghi `OutboxEvent` cùng `tx`, không `emit()` trực tiếp) — nhưng **Sprint-01 KHÔNG implement cơ chế phát/nhận thật** (Decision 11: "Implementation: Sprint Event"). SPEC này chỉ:
1. Định nghĩa tên event + payload shape tối thiểu (`{ productId, organizationId, occurredAt }`, mở rộng field cụ thể khi Sprint Event triển khai thật).
2. Chừa hook trong `ProductService` (tương tự `InventoryDomainService.onMovementRecorded()` ở T004) — no-op, không publish, không TODO/FIXME.

## 11. Test

Theo `TEST_RULES.md` (5 lớp):

1. **Unit**: cập nhật toàn bộ test hiện có của `product` module (Entity/Service/Repository) cho field mới (`type`/`parentProductId`/`version`). Thêm test case: tạo Variant Child thiếu `parentProductId` → lỗi; gán `parentProductId` trỏ tới Product không phải `VARIANT_PARENT` → lỗi; đổi `type` sau khi có giao dịch → lỗi; Archive khi còn Variant Active → lỗi; Optimistic Lock conflict (`version` không khớp) → `ProductConcurrencyConflictError`.
2. **Integration**: cập nhật `product.e2e-spec.ts` (nếu có) cho field/behavior mới. Trạng thái PENDING nếu sandbox không có Docker — không báo PASS khi chưa chạy thật (`TEST_RULES.md` §6).
3. **Architecture**: viết `single-writer.architecture.spec.ts`-tương-đương cho Product — kiểm tra (a) không module nào ngoài `product` import `PRODUCT_REPOSITORY`/`IProductRepository`, (b) `ProductModule` chỉ export `ProductDomainService`, (c) cả 5 module ở §7.3 xác nhận import `ProductModule`. Đây LÀ bằng chứng chính cho Acceptance Criteria "Repository Boundary" (§12).
4. **Performance**: chưa thiết lập (đúng trạng thái chung dự án, `TEST_RULES.md` §4) — không tạo mới trong SPEC này.
5. **Security**: chưa thiết lập — không tạo mới trong SPEC này.

## 12. Acceptance Criteria

| # | Tiêu chí | Cách xác minh |
|---|---|---|
| 1 | Build/Lint/TypeCheck PASS | Chuẩn `REVIEW_RULES.md` §1 |
| 2 | Unit Test PASS, Coverage không thấp hơn baseline trước refactor | So sánh qua `git stash` (đúng phương pháp đã dùng ở T004) |
| 3 | `PRODUCT_REPOSITORY` không còn export ngoài `product` module | Architecture Test (§11.3) |
| 4 | Đúng 5 module (`cart`/`barcode`/`unit`/`brand`/`category`) xác nhận gọi qua `ProductDomainService` | Architecture Test (§11.3) |
| 5 | `ProductStatus`/`ProductType` migration không mất dữ liệu (mọi `DISCONTINUED` cũ → `ARCHIVED`, mọi `isService=true` → `SERVICE`) | Kiểm tra sau migration bằng query đối chiếu số dòng trước/sau |
| 6 | Barcode duplicate-check chạy TRƯỚC migration đổi constraint, FAIL migration nếu phát hiện trùng — không tự merge | Chạy thử script §3.4 trên dữ liệu hiện tại trước khi áp dụng |
| 7 | Optimistic Lock hoạt động đúng cho Product (giống Inventory) | Test case tranh chấp đồng thời, tương tự `inventory-concurrency.md` |
| 8 | Không ảnh hưởng hành vi 11 module tham chiếu Product hiện có (Inventory/Purchase/Transfer/StockCount/Adjustment/Order/Return/Supplier/Invoice/Cart) ngoại trừ phụ thuộc compile (Decision 14) | Chạy lại toàn bộ Unit Test hiện có của các module này, xác nhận không có test nào vỡ vì field/behavior đổi |
| 9 | Không TODO/FIXME/`any` không cần thiết | grep trong phạm vi code đã sửa |

**Bổ sung theo Decision A10 — Implementation CHỈ được coi là PASS khi TẤT CẢ đạt:**

| # | Tiêu chí | Ghi chú |
|---|---|---|
| 10 | Migration PASS | Chạy thật trên dữ liệu (staging/local có Docker), không chỉ đọc script |
| 11 | Rollback PASS | Chạy thử migration ngược (§14) thành công trên cùng môi trường |
| 12 | Existing API Compatibility PASS | Toàn bộ request/response shape CŨ (trước SPEC này) vẫn hoạt động cho field không đổi — không phá vỡ client hiện có ngoài field cố ý đổi (`isService` bị bỏ là thay đổi có chủ đích, đã biết trước) |
| 13 | Existing Tests PASS | Toàn bộ test hiện có (không riêng `product`) — 0 test nào vỡ |
| 14 | New Tests PASS | Toàn bộ test mới viết cho SPEC này (§11) |
| 15 | Architecture PASS | Architecture Test (§11.3) |
| 16 | Repository Boundary PASS | Trùng tiêu chí #3/#4, nhắc lại theo đúng khung A10 |
| 17 | Optimistic Lock PASS | Trùng tiêu chí #7, nhắc lại theo đúng khung A10 |

## 13. Implementation Order (Decision A04 — bắt buộc, KHÔNG được đảo thứ tự)

```
Migration
  ↓
Repository
  ↓
Domain Service
  ↓
Application
  ↓
Controller
  ↓
5 module phụ thuộc: Category → Brand → Unit → Barcode → Cart
  ↓
Test
  ↓
Architecture Review
```

Chi tiết từng bước (không thực hiện ở bước SPEC này — chỉ mô tả kế hoạch cho Implementation Plan T005.1 và code thật sau này):

1. **Migration** — schema (§3.1 → §3.5), theo đúng thứ tự nội bộ: `ProductStatus` → `ProductType` (+ backfill từ `isService`) → `parentProductId` → `Barcode.organizationId` + duplicate-check + tạo constraint mới + drop constraint cũ (§3.4, đã sửa thứ tự theo A08) → `version` (`DEFAULT 1`, A02).
2. **Repository** — `ProductEntity`, `IProductRepository`, `PrismaProductRepository`: thêm field mới, đổi `update()` nhận `expectedVersion` (Optimistic Lock), thêm `findChildrenByParentId()`/`hasActiveVariantChildren()`, cập nhật `existsByBarcode()` theo constraint mới.
3. **Domain Service** — tạo `ProductDomainService` (§8, đúng 4 method, không hơn — A01/A03), đổi `product.module.ts` exports.
4. **Application** — `ProductService`: thêm business rule (guard đổi `type` theo A06, guard Archive theo Variant Active, Restore→INACTIVE theo A05, versioning theo A09), chừa Event hook (§10).
5. **Controller** — `ProductController`: cập nhật DTO binding cho field mới, không đổi route (§4).
6. **5 module phụ thuộc, ĐÚNG THỨ TỰ**: `category` → `brand` → `unit` → `barcode` → `cart` — mỗi module đổi DI (inject `ProductDomainService` thay `PRODUCT_REPOSITORY`), không đổi business logic (đúng mẫu Checkout T004).
7. **Test** — Unit trước (từng bước 1-6 khi hoàn thành), Architecture Test SAU CÙNG (chỉ có ý nghĩa xác nhận invariant khi bước 6 đã xong hết).
8. **Architecture Review** — trình kết quả, chờ duyệt lần cuối trước khi merge/commit.

## 14. Rollback Plan

- **Schema**: mỗi bước migration ở §3 cần migration NGƯỢC tương ứng (drop column/constraint, `RENAME VALUE` ngược lại) — soạn cùng lúc với migration xuôi, không soạn sau. Riêng `ALTER TYPE ... ADD VALUE` (thêm `DRAFT`) KHÔNG thể rollback trực tiếp trong Postgres (không có `DROP VALUE`) — nếu cần rollback thật, phải tạo lại toàn bộ enum type (đổi tên, tạo mới, migrate cột, xóa cũ) — chi phí cao, cần cân nhắc kỹ trước khi chạy migration thật, không phải sau.
- **Code**: nếu Architecture Test (§11.3) hoặc Acceptance Criteria (§12) không đạt sau khi code xong, KHÔNG merge/commit — sửa tại chỗ hoặc rollback toàn bộ nhánh code (chưa từng commit thì đơn giản, không cần git revert).
- **Dữ liệu**: nếu migration Barcode (§3.4) phát hiện trùng dữ liệu và FAIL — không có "rollback" cần thiết vì migration chưa từng chạy (fail trước khi đổi constraint) — chỉ cần xử lý dữ liệu trùng thủ công (do người vận hành quyết định, KHÔNG tự động merge theo đúng Decision 7) rồi chạy lại migration.

## Lịch sử quyết định

- **RFC-0001 Revision 1** (15 Decision) — APPROVED WITH REVISIONS, xác định đây là Refactor (không phải module mới), chốt migration `ProductStatus`/`ProductType`/`parentProductId`/`Barcode` unique/Optimistic Lock/`ProductDomainService`.
- **ARCHITECTURE REVIEW – SPEC-PRODUCT-001** (Decision A01-A10) — APPROVED WITH MINOR REVISIONS, giải quyết toàn bộ 4 câu hỏi mở của bản SPEC trước (Restore→INACTIVE, định nghĩa "đã phát sinh giao dịch", filter list đầy đủ, giữ `ProductDomainService` tối thiểu), bổ sung Implementation Order (§13) và mở rộng Acceptance Criteria (§12).
- Không còn câu hỏi mở nào chặn Implementation Plan (T005.1).
