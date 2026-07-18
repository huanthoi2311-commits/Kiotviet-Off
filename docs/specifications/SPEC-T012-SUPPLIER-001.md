# SPEC-T012-SUPPLIER-001 — Supplier Domain

**Status:** APPROVED WITH DECISIONS (SP01-SP13) — cập nhật theo SP05/SP10/SP11/SP12, Implementation đang triển khai (Fast Track, không cần Implementation Plan).
**Nguồn:** `RFC-T012 — Supplier Domain` v1 (Architect) → `ARCHITECTURE REVIEW — RFC-T012 Supplier Domain` (Claude Code, `docs/architecture/T012-architecture-review.md`) → `ARCHITECT RESOLUTION — RFC-T012 SUPPLIER DOMAIN` (Decision SR01-SR14, APPROVED WITH DECISIONS) → `RFC-T012 — Supplier Domain` v2 (`docs/rfc/RFC-T012-supplier-domain.md`, Claude Code cập nhật theo ủy quyền tường minh) → `ARCHITECTURE REVIEW — SPEC-T012-SUPPLIER-001` (Decision SP01-SP13, APPROVED WITH DECISIONS) — ràng buộc bắt buộc của SPEC này.
**Bản chất:** Refactor/mở rộng module `supplier` **đang chạy thật** (brownfield — Decision SR01, "Evolution") — thêm `version`/`SupplierStatus` riêng, thêm code generator mới (chưa từng có), sửa Repository Boundary violation (`supplier-debt` inject thẳng `SUPPLIER_REPOSITORY`/`SUPPLIER_PRODUCT_REPOSITORY`), **chuẩn hóa** (không viết lại) Archive Guard đã có sẵn (`hasPurchaseOrders()`), thêm Activate/Deactivate. Excel Import/Export giữ nguyên hoàn toàn (Decision SR04), không đụng tới.
**Tác giả SPEC:** Claude Code, theo ủy quyền tường minh trong `AUTHORIZATION` của `ARCHITECT RESOLUTION — RFC-T012 SUPPLIER DOMAIN` (Decision SR01-SR14, mục 2: "Viết SPEC-T012-SUPPLIER-001").

---

## 0. Các điểm cụ thể hóa khi viết SPEC (chưa có trong RFC v2 — cần Architecture Review xác nhận)

1. **Giữ tên field hiện có, không đổi theo RFC §5** — `paymentTerm` (không đổi thành `paymentTermDays`), `companyName` (hiện thực "name" của RFC), `deletedAt` (hiện thực "archivedAt" của RFC) — đúng nguyên tắc SR01 "giảm breaking change", đúng tiền lệ Customer (`fullName` giữ nguyên, không đổi "name").
2. **Không cần thêm field mới nào ngoài `version`/`status`** — khác Customer (cần thêm `contactName`/`paymentTermDays` hoàn toàn mới), Supplier **đã có sẵn** toàn bộ field "tối thiểu" của RFC §5 (`contactName`, `paymentTerm`, v.v.) — chỉ thiếu `version` và status model 3 giá trị. Migration vì vậy đơn giản hơn Customer (2 migration thay vì 3 — không cần Migration "field mới" hay "phone unique removal", vì Supplier chưa từng có unique constraint trên `phone`).
3. **Status model** — thêm enum `SupplierStatus` riêng (`ACTIVE`/`INACTIVE`/`ARCHIVED`), tách khỏi `CommonStatus` (đang dùng chung 5 model khác) — đúng mẫu Customer/Barcode Migration B (backfill `ARCHIVED` từ `deletedAt IS NOT NULL`).
4. **Tên public read port** — đã chốt sẵn trong RFC §9/Decision SR06: `SupplierDomainService` — không cần quyết định thêm.
5. **Generator mới — chốt cụ thể (Decision SR07):** tái sử dụng đúng pattern `Sequence` table (giống `SequenceCustomerCodeGenerator`/`SequenceSkuGenerator`) — tạo `SequenceSupplierCodeGenerator`, định dạng `NCC000001` (giữ đúng ví dụ `NCC001` đã có sẵn trong Swagger hiện tại — `create-supplier.dto.ts:17`, chỉ chuẩn hóa độ dài padding cho nhất quán với Customer/Barcode — 6 chữ số).
6. **Archive Guard "chuẩn hóa" (Decision SR02/SR03) — cụ thể hóa:** giữ nguyên hoàn toàn logic nghiệp vụ hiện có (`hasPurchaseOrders()` check + `SUPPLIER_HAS_PURCHASE_ORDERS`), chỉ tích hợp lại vào luồng `softDelete()` mới có Optimistic Lock (kiểm tra guard trước, rồi mới gọi `softDelete(id, organizationId, expectedVersion, ...)` — không đổi thứ tự/điều kiện guard).
7. **BR06/BR07 (debt/projection fields) không áp dụng thực tế** — Audit xác nhận Supplier hiện không có cột `currentDebt`/`payableBalance`/`totalPurchase`/`totalOrder` nào trên schema — không có migration nào liên quan các field này trong T012 (khác Customer, vốn có `currentDebt` cần deprecate).
8. **Excel Import (`ImportSupplierRow`) tiếp tục yêu cầu `code` bắt buộc, không áp dụng "optional input" của Create thường** — đúng Decision SR04 ("không đổi API" của Import/Export) — Import là luồng nhập hàng loạt, tách biệt hoàn toàn khỏi `POST /suppliers` thường, giữ nguyên hành vi hiện tại (client luôn cung cấp code trong file Excel).
9. **[SP05] Generator dùng chung — phạm vi cụ thể hóa:** Architecture Review của SPEC (Decision SP05) yêu cầu generator mới của Supplier KHÔNG được sao chép logic của `SequenceCustomerCodeGenerator`, phải dùng chung một abstraction. Khảo sát xác nhận có **10 generator `Sequence*Generator` độc lập** đã tồn tại trong dự án (branch, customer, inventory-adjustment, invoice, organization, product/sku, purchase-order, purchase-return, stock-count, transfer) — cùng lặp lại một pattern `prisma.sequence.upsert()`. Quyết định phạm vi (Claude Code, cần Architect xác nhận nếu không đồng ý): T012 chỉ tạo `SequenceCodeGeneratorService` dùng chung và áp dụng cho **đúng 2 module SP05 nêu tên — Customer và Supplier**; KHÔNG đụng tới 8 generator còn lại (ngoài phạm vi RFC-T012, cần một task hạ tầng riêng nếu Architect muốn dọn toàn bộ). Xem §9.3b.

Không còn điểm nào khác cần làm rõ ngoài 9 điểm trên.

## 1. Entity

### 1.1 `SupplierEntity` — thay đổi so với hiện tại

```ts
export type SupplierStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';  // ĐỔI — 3 giá trị thay vì 2

export interface SupplierEntity {
  id: string;
  organizationId: string;
  code: string;
  taxCode: string | null;
  companyName: string;             // không đổi — hiện thực "name" của RFC §5
  contactName: string | null;      // đã có sẵn, không đổi
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  province: string | null;
  district: string | null;
  ward: string | null;
  bankName: string | null;
  bankAccount: string | null;
  paymentTerm: number | null;      // không đổi tên — hiện thực "paymentTermDays" của RFC §5
  creditLimit: string | null;
  status: SupplierStatus;          // ĐỔI — 3 giá trị
  version: number;                 // MỚI — Optimistic Lock (BR09)
  note: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;          // giữ — đồng bộ với status=ARCHIVED
}
```

`SupplierProductEntity` — không đổi (ngoài phạm vi T012, xem §0.8 và Architecture Review §C1).

## 2. Aggregate

```
Supplier (Aggregate Root, version — BR09)
```

Không có entity con (`SupplierProduct` là aggregate riêng, ngoài phạm vi T012). Thuộc về Organization (bắt buộc). Không thuộc Branch. Quan hệ ra ngoài Aggregate (schema hiện có, không đổi ở T012): `PurchaseOrder[]`, `PurchaseReturn[]`, `Debt[]`, `Payment[]`, `SupplierProduct[]` — chỉ tham chiếu `id`.

## 3. Migration

**Không migration nào được tạo ở bước SPEC này.** 2 migration độc lập (ít hơn Customer — xem §0.2 lý do):

### 3.1 Migration A — `version` (Optimistic Lock, BR09)

```sql
ALTER TABLE "suppliers" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
```

### 3.2 Migration B — `SupplierStatus`

```sql
CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
ALTER TABLE "suppliers" ADD COLUMN "status_new" "SupplierStatus" NOT NULL DEFAULT 'ACTIVE';
UPDATE "suppliers" SET "status_new" = 'ARCHIVED' WHERE "deletedAt" IS NOT NULL;
UPDATE "suppliers" SET "status_new" = "status"::text::"SupplierStatus" WHERE "deletedAt" IS NULL;
ALTER TABLE "suppliers" DROP COLUMN "status";
ALTER TABLE "suppliers" RENAME COLUMN "status_new" TO "status";
```

Không `DROP` dữ liệu. **Không có Migration C** (Decision SR11 — Repository Boundary cleanup là thay đổi code, không cần migration schema).

## 4. API

### 4.1 Route hiện có — thay đổi

| Route | Thay đổi |
|---|---|
| `POST /suppliers` | `code` chuyển thành **optional** (Decision SR07) — nếu không gửi, tự sinh qua `SequenceSupplierCodeGenerator` mới. Không nhận `status` (luôn `ACTIVE` khi tạo). |
| `GET /suppliers` | Không đổi shape, thêm `status=ARCHIVED` là giá trị hợp lệ mới cho filter. |
| `GET /suppliers/:id` | Không đổi. |
| `PATCH /suppliers/:id` | Thêm `version` **bắt buộc** (409 nếu sai). Không nhận `status` (chuyển sang route riêng). |
| `DELETE /suppliers/:id` | Nhận body `{ version }` bắt buộc (hiện tại không có body). **Archive Guard giữ nguyên** (`hasPurchaseOrders()` — Decision SR02), chỉ thêm version check sau guard. |
| `POST /suppliers/:id/restore` | Nhận body `{ version }` bắt buộc (hiện tại không có body). Trả `status` về `INACTIVE` — hành vi không đổi, chỉ thêm version check. |
| `POST /suppliers/import`, `GET /suppliers/export` | **Không đổi** (Decision SR04) — giữ nguyên 100%, không thêm `version`/optional-code vào luồng Import. |

### 4.2 Route mới

| Route | Mô tả |
|---|---|
| `POST /suppliers/:id/activate` | **MỚI**. `INACTIVE → ACTIVE`. Nhận body `{ version }` bắt buộc. Sai transition → `422` (`SUPPLIER_INVALID_TRANSITION`). |
| `POST /suppliers/:id/deactivate` | **MỚI**. `ACTIVE → INACTIVE`. Nhận body `{ version }` bắt buộc. |

Cả 2 route dùng chung repository method `changeStatusWithVersion()`.

## 5. Validation

**`CreateSupplierDto`:**
- `code?: string` — đổi từ bắt buộc sang **optional** (`@IsOptional()` thêm vào `@IsString() @Length(1,50)` đã có).
- Bỏ `status?` (luôn `ACTIVE` khi tạo — đúng thiết kế Customer T011).
- Toàn bộ field khác giữ nguyên như hiện có.

**`UpdateSupplierDto`:**
- `version: number` — **MỚI, bắt buộc** (`@IsInt()`).
- Bỏ `status?` (chuyển sang route Activate/Deactivate/Archive/Restore riêng).
- Toàn bộ field khác giữ nguyên.

**`SupplierVersionDto`** (mới, dùng chung Archive/Restore/Activate/Deactivate): `{ version: number }` — đúng mẫu `CustomerVersionDto`/`BarcodeVersionDto`.

**`SupplierQueryDto`:** không đổi default sort (`createdAt desc`) — RFC không chỉ định default sort riêng cho Supplier (khác Customer §12 "name ASC" tường minh) — giữ nguyên hành vi hiện tại, đúng nguyên tắc SR01 giảm thay đổi không cần thiết. Thêm `ARCHIVED` vào enum `status` filter hợp lệ.

**Import Excel (`ImportSupplierRow`, `UpsertSupplierProductDto`)** — không đổi (Decision SR04/§0.8).

## 6. Permission (Decision SR12)

Giữ 7 permission hiện có (`supplier:view`/`create`/`update`/`delete`/`restore`/`import`/`export`, từ `crud('supplier', 'nhà cung cấp', ['restore', 'import', 'export'])`), thêm 2 permission mới:

`permission-catalog.ts:154` hiện tại: `...crud('supplier', 'nhà cung cấp', ['restore', 'import', 'export'])` → đổi thành `...crud('supplier', 'nhà cung cấp', ['restore', 'import', 'export', 'activate', 'deactivate'])`.

## 7. Multi-tenant (BR01)

Toàn bộ method ghi (`update`/`softDelete`/`restore`/`changeStatusWithVersion`) phải nhận **và lọc** `organizationId` trong `where` — sửa đúng lỗ hổng đã tồn tại (Architecture Review §B5: hiện tại `where: { id }` thuần). Đúng lỗi hệ thống đã sửa ở Brand/Unit/Barcode/Customer.

## 8. Archive Guard (BR08 — chuẩn hóa, KHÔNG viết lại — Decision SR02/SR03)

**Giữ nguyên 100% logic nghiệp vụ hiện có:**

```ts
// SupplierService.remove() — chỉ thêm version, KHÔNG đổi điều kiện guard
const supplier = await this.supplierRepository.findById(id, organizationId);
if (!supplier) throw notFound();

const hasPurchaseOrders = await this.supplierRepository.hasPurchaseOrders(id);
if (hasPurchaseOrders) {
  throw new UnprocessableEntityException(withCode(ErrorCode.SUPPLIER_HAS_PURCHASE_ORDERS,
    'Không thể xóa nhà cung cấp đã có đơn nhập hàng'));
}

await this.supplierRepository.softDelete(id, organizationId, version, actor.userId);
```

`hasPurchaseOrders()` **không đổi** (vẫn là query nội bộ trong `PrismaSupplierRepository`, không cross-module). T015 Purchase Foundation không được viết Archive Guard mới cho Supplier — chỉ mở rộng guard này nếu phát sinh trạng thái nghiệp vụ mới (Decision SR03).

## 9. Repository

### 9.1 `ISupplierRepository` — thay đổi interface

```ts
create(input: CreateSupplierInput): Promise<SupplierEntity>;
findById(id: string, organizationId: string): Promise<SupplierEntity | null>;             // không đổi
findByCode(organizationId: string, code: string): Promise<SupplierEntity | null>;          // MỚI (RFC §10)
findByIdIncludingDeleted(id: string, organizationId: string): Promise<SupplierEntity | null>; // không đổi
update(id: string, organizationId: string, expectedVersion: number, input: UpdateSupplierInput): Promise<SupplierEntity>;  // + organizationId + expectedVersion
changeStatusWithVersion(id: string, organizationId: string, expectedVersion: number, status: SupplierStatus, updatedBy: string): Promise<SupplierEntity>;  // MỚI
softDelete(id: string, organizationId: string, expectedVersion: number, deletedBy: string): Promise<void>;   // + organizationId + expectedVersion
restore(id: string, organizationId: string, expectedVersion: number, restoredBy: string): Promise<void>;      // + organizationId + expectedVersion
search(params: SupplierSearchParams): Promise<SupplierSearchResult>;                        // không đổi
findAllForExport(params): Promise<SupplierEntity[]>;                                        // không đổi (SR04)
existsByCode(organizationId: string, code: string, excludeId?: string): Promise<boolean>;   // ĐÃ CÓ — không viết lại (Decision SR08)
hasPurchaseOrders(supplierId: string): Promise<boolean>;                                    // không đổi (Decision SR02)
importBatch(...): Promise<ImportSupplierResult>;                                            // không đổi (SR04)
```

**Lỗi domain mới**: `SupplierConcurrencyConflictError` (file mới `domain/errors/supplier.errors.ts`, đúng mẫu `customer.errors.ts`).

### 9.2 `existsByCode()` — wiring thật (mới, hiện chưa gọi)

Method đã tồn tại nhưng `SupplierService.create()` hiện tại **chưa gọi trước khi ghi** (Architecture Review §B6) — chỉ dựa vào `@@unique([organizationId, code])` + bắt `P2002`. T012 thêm pre-check: gọi `existsByCode(organizationId, code)` **TRƯỚC** khi ghi nếu `code` được client cung cấp — đúng mẫu Customer/Barcode (2 lớp: pre-check nghiệp vụ + `P2002` làm lớp bảo vệ cuối).

### 9.3 `SupplierDomainService` — MỚI (Decision SR05/SR06)

```ts
// backend/src/modules/supplier/application/supplier-domain.service.ts — file mới
@Injectable()
export class SupplierDomainService {
  constructor(
    @Inject(SUPPLIER_REPOSITORY) private readonly supplierRepository: ISupplierRepository,
  ) {}

  findById(organizationId: string, supplierId: string): Promise<SupplierEntity | null> {
    return this.supplierRepository.findById(supplierId, organizationId);
  }

  async findActiveById(organizationId: string, supplierId: string): Promise<SupplierEntity | null> {
    const supplier = await this.supplierRepository.findById(supplierId, organizationId);
    return supplier && supplier.status !== 'ARCHIVED' ? supplier : null;
  }

  async findUsableForPurchase(organizationId: string, supplierId: string): Promise<SupplierEntity | null> {
    const supplier = await this.supplierRepository.findById(supplierId, organizationId);
    return supplier && supplier.status === 'ACTIVE' ? supplier : null;
  }

  existsByCode(organizationId: string, code: string, excludeId?: string): Promise<boolean> {
    return this.supplierRepository.existsByCode(organizationId, code, excludeId);
  }

  async assertBelongsToOrganization(organizationId: string, supplierId: string): Promise<void> {
    const supplier = await this.supplierRepository.findById(supplierId, organizationId);
    if (!supplier) throw new NotFoundException(withCode(ErrorCode.SUPPLIER_NOT_FOUND, 'Không tìm thấy nhà cung cấp'));
  }

  async assertNotArchived(organizationId: string, supplierId: string): Promise<void> {
    const supplier = await this.supplierRepository.findById(supplierId, organizationId);
    if (supplier?.status === 'ARCHIVED') {
      throw new UnprocessableEntityException(withCode(ErrorCode.SUPPLIER_ARCHIVED, 'Nhà cung cấp đã bị lưu trữ'));
    }
  }
}
```

`SupplierDomainService` là public domain API — export **duy nhất** từ `SupplierModule`. **Gỡ `SUPPLIER_REPOSITORY` VÀ `SUPPLIER_PRODUCT_REPOSITORY` khỏi `exports`** (Decision SR05 — cả 2 token, không chỉ 1, khác Customer chỉ có 1 token export sai).

### 9.3b `SequenceCodeGeneratorService` — abstraction dùng chung (Decision SP05, MỚI)

```ts
// backend/src/prisma/sequence-code-generator.service.ts — file mới, đăng ký trong PrismaModule (@Global())
@Injectable()
export class SequenceCodeGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(
    organizationId: string,
    sequenceName: string,
    prefix: string,
    padLength: number,
  ): Promise<string> {
    const sequence = await this.prisma.sequence.upsert({
      where: { organizationId_name: { organizationId, name: sequenceName } },
      create: { organizationId, name: sequenceName, value: 1 },
      update: { value: { increment: 1 } },
    });
    return `${prefix}${sequence.value.toString().padStart(padLength, '0')}`;
  }
}
```

`PrismaModule` (`backend/src/prisma/prisma.module.ts`, đã `@Global()`) thêm `SequenceCodeGeneratorService` vào `providers`+`exports` — có sẵn ở mọi module không cần import tường minh, đúng cách `PrismaService` hiện có.

**`SequenceCustomerCodeGenerator` (đã có, T011) — refactor thành adapter mỏng, KHÔNG đổi hành vi:**

```ts
// backend/src/modules/customer/infrastructure/generators/sequence-customer-code.generator.ts — sửa lại
@Injectable()
export class SequenceCustomerCodeGenerator implements ICustomerCodeGenerator {
  constructor(private readonly generator: SequenceCodeGeneratorService) {}

  generate(organizationId: string): Promise<string> {
    return this.generator.generate(
      organizationId, CUSTOMER_CODE_SEQUENCE_NAME, CUSTOMER_CODE_PREFIX, CUSTOMER_CODE_PAD_LENGTH,
    );
  }
}
```

`CUSTOMER_CODE_SEQUENCE_NAME`/`CUSTOMER_CODE_PREFIX`/`CUSTOMER_CODE_PAD_LENGTH` giữ nguyên giá trị hiện có (`'customer_code'`/`'CUS'`/`6`) — refactor chỉ đổi CÁCH sinh code (gọi qua service dùng chung), KHÔNG đổi giá trị sinh ra. Regression Test của Customer (T011) phải PASS nguyên trạng để xác nhận (§12 SP11 điểm 2).

**`SequenceSupplierCodeGenerator` — MỚI, adapter mỏng thứ hai:**

```ts
// backend/src/modules/supplier/infrastructure/generators/sequence-supplier-code.generator.ts — file mới
export const SUPPLIER_CODE_SEQUENCE_NAME = 'supplier_code';
export const SUPPLIER_CODE_PREFIX = 'NCC';
export const SUPPLIER_CODE_PAD_LENGTH = 6;

@Injectable()
export class SequenceSupplierCodeGenerator implements ISupplierCodeGenerator {
  constructor(private readonly generator: SequenceCodeGeneratorService) {}

  generate(organizationId: string): Promise<string> {
    return this.generator.generate(
      organizationId, SUPPLIER_CODE_SEQUENCE_NAME, SUPPLIER_CODE_PREFIX, SUPPLIER_CODE_PAD_LENGTH,
    );
  }
}
```

Tên sequence khác nhau (`customer_code` vs `supplier_code`) → độc lập hoàn toàn trong bảng `Sequence` (khóa `organizationId_name`), không thể trùng số dù chung 1 service.

**[SP05] Phạm vi — công khai tường minh, không âm thầm mở rộng:** 8 generator còn lại (`Sequence*Generator` của branch/inventory-adjustment/invoice/organization/product-sku/purchase-order/purchase-return/stock-count/transfer) **KHÔNG bị đụng tới trong T012** — SP05 chỉ nêu tên Customer+Supplier. Đây là một pattern trùng lặp có hệ thống trên toàn dự án, ghi nhận làm technical debt/candidate cho một task hạ tầng riêng trong tương lai (không tự tạo task đó ở đây).

### 9.4 Repository Boundary — xử lý Technical Debt (Decision SR05, BẮT BUỘC trong T012)

`supplier-debt.service.ts:10-11,36-37,68` hiện đang inject `SUPPLIER_REPOSITORY` trực tiếp, chỉ gọi `findById()`. Đổi sang inject `SupplierDomainService`, gọi `findById()` (giữ nguyên tên method, chỉ đổi nguồn — đúng mẫu `customer-point` ở T011, không dùng `findActiveById()` vì đồng bộ công nợ không phải giao dịch mua hàng mới).

`SupplierModule.imports` không đổi (`[RbacModule]`) — không phát sinh dependency mới, không cần `forwardRef()`, không cần Reference Module (không có circular dependency).

**Architecture Test mới** (`supplier-repository-boundary.architecture.spec.ts`) — **[SP10] assertion cụ thể, không mô tả chung chung:**

```ts
const exportsMetadata = Reflect.getMetadata(MODULE_METADATA.EXPORTS, SupplierModule) as unknown[];
expect(exportsMetadata).toEqual([SupplierDomainService]);   // đúng 1 phần tử, không còn 2 token cũ
expect(exportsMetadata).not.toContain(SUPPLIER_REPOSITORY);
expect(exportsMetadata).not.toContain(SUPPLIER_PRODUCT_REPOSITORY);

const importsMetadata = Reflect.getMetadata(MODULE_METADATA.IMPORTS, SupplierModule) as unknown[];
expect(importsMetadata.some((m) => typeof m === 'function' && m.name === 'forwardRef')).toBe(false);

// Quét nội dung file — không module nào ngoài supplier/ tham chiếu trực tiếp token
const offendingFiles = filesOutsideSupplierModule.filter((f) =>
  /SUPPLIER_REPOSITORY|ISupplierRepository|SUPPLIER_PRODUCT_REPOSITORY|ISupplierProductRepository/.test(f.content),
);
expect(offendingFiles).toEqual([]);
```

Đúng mẫu `customer-repository-boundary.architecture.spec.ts` (T011) — 5 assertion tương đương, thay tên token.

## 10. DTO

- `CreateSupplierDto`: `code` đổi sang optional; bỏ `status?`.
- `UpdateSupplierDto`: thêm `version` (bắt buộc); bỏ `status?`.
- `SupplierVersionDto` (mới): `{ version: number }`.
- `SupplierResponseDto`: thêm `version`. Giữ nguyên toàn bộ field hiện có.
- `SupplierQueryDto`: thêm `ARCHIVED` vào enum `status` hợp lệ, không đổi default sort.

## 11. Event

Module `supplier` hiện tại **không có** cơ chế Domain Event nào (khác Customer, vốn đã có publish thật từ trước) — giữ nguyên, **không thêm Domain Event mới trong T012** (ngoài phạm vi RFC, không có BR nào yêu cầu).

## 12. Test

Theo `TEST_RULES.md`/`MASTER_DATA_TEMPLATE.md` — nhóm bắt buộc: CRUD (2 nhánh code: client cung cấp/tự sinh), Restore, Optimistic Lock (Update/Activate/Deactivate/Archive/Restore — 5 route), Search, Sort, Permission, Multi Tenant, Repository, Validation, API Contract, Regression. Thêm riêng theo Decision SR13:

1. Archive Guard — Supplier có `PurchaseOrder` chưa hoàn tất → Archive Fail (`422`, `SUPPLIER_HAS_PURCHASE_ORDERS`).
2. Archive Guard — Supplier không có `PurchaseOrder` → Archive Success.
3. Generator concurrency — 2 lần gọi `generate()` đồng thời không trả trùng code (test ở tầng generator, không cần thật sự chạy song song — xác nhận cơ chế `Sequence.upsert` atomic).
4. Repository Boundary Architecture Test — `supplier-debt` không còn inject `SUPPLIER_REPOSITORY`.
5. Regression Baseline (T005-T012).

**[SP11] 3 test bổ sung — cụ thể hóa yêu cầu của Architecture Review (SPEC), riêng cho abstraction generator dùng chung §9.3b:**

6. **Cách ly sequence dùng chung** — `SequenceCodeGeneratorService.generate()` gọi với `sequenceName='customer_code'` và `sequenceName='supplier_code'` trên cùng `organizationId` phải sinh 2 dãy số độc lập (không trộn số) — xác nhận khóa `organizationId_name` cách ly đúng dù dùng chung 1 service.
7. **Regression Customer sau refactor** — sau khi `SequenceCustomerCodeGenerator` đổi thành adapter mỏng gọi `SequenceCodeGeneratorService` (§9.3b), toàn bộ test hiện có của Customer code-generation (T011) phải PASS nguyên trạng, không đổi assertion — xác nhận refactor không đổi hành vi sinh mã Customer.
8. **`existsByCode` pre-check** — `SupplierService.create()` với `code` client cung cấp trùng code đã tồn tại phải trả lỗi nghiệp vụ (`409`/`422`) từ pre-check `existsByCode()` TRƯỚC khi chạm DB, không rơi xuống bắt `P2002` thô (đúng §9.2).

## 13. Acceptance Criteria

| # | Tiêu chí |
|---|---|
| 1 | Build/Lint/TypeCheck PASS |
| 2 | Coverage module `supplier` ≥ 90% |
| 3 | `PATCH`/`DELETE`/`restore`/`activate`/`deactivate` đều bắt buộc `version`, sai → `409` |
| 4 | Code: optional ở input; client cung cấp → validate + unique; không cung cấp → tự sinh qua `SequenceSupplierCodeGenerator` mới (atomic, không `count()+1`/`MAX(code)`) |
| 5 | `SUPPLIER_REPOSITORY`/`SUPPLIER_PRODUCT_REPOSITORY` không còn trong `SupplierModule.exports`; `supplier-debt` không còn inject trực tiếp — dùng `SupplierDomainService`; Architecture Test xác nhận |
| 6 | Archive Guard (`hasPurchaseOrders()`) giữ nguyên hành vi — cả 2 chiều (có/không có đơn nhập hàng) đều test |
| 7 | `POST /suppliers/import`, `GET /suppliers/export` không thay đổi hành vi/API |
| 8 | Response DTO giữ nguyên toàn bộ field hiện có |
| 9 | 2 migration (version/status) độc lập, có rollback, không `DROP` dữ liệu |
| 10 | Permission dùng dấu hai chấm, khớp `crud()` convention |
| 11 | Regression Baseline (T005-T011) PASS |
| 12 | Integration Test PASS — PENDING nếu không có Docker |
| 13 | **[SP12] End-to-End Acceptance Scenario** — xem §13.1 |

### 13.1 End-to-End Acceptance Scenario (Decision SP12)

Kịch bản đầy đủ, chạy tuần tự trên 1 dataset, mô phỏng đúng luồng "trước/sau" của một brownfield refactor thật:

1. **Supplier cũ** — dữ liệu Supplier có sẵn trước T012 (status `CommonStatus`, không có `version`) tồn tại trong DB.
2. **Migration** — chạy Migration A (`version` default 1) + Migration B (`SupplierStatus`, backfill từ `deletedAt`) — xác nhận toàn bộ Supplier cũ có `version=1` và `status` đúng ánh xạ (còn `deletedAt` → `ARCHIVED`, còn lại giữ nguyên `ACTIVE`/`INACTIVE`).
3. **Build** — `npm run build` (backend) PASS sau migration + toàn bộ thay đổi code T012.
4. **Regression** — `npx jest` toàn bộ suite (T005-T012) PASS, không suite nào vỡ do đổi `SupplierEntity`/interface.
5. **Supplier mới tạo được** — `POST /suppliers` không gửi `code` → tạo thành công, trả về entity có `code` dạng `NCC000001` (hoặc số tiếp theo), `version=1`, `status=ACTIVE`.
6. **Generator đúng** — gọi tạo liên tiếp 2 Supplier không gửi `code` → 2 code khác nhau, tăng dần, không trùng với dãy `customer_code` (test riêng ở §12 điểm 6).
7. **Archive Guard đúng** — Supplier có `PurchaseOrder` chưa hoàn tất → `DELETE /suppliers/:id` trả `422 SUPPLIER_HAS_PURCHASE_ORDERS`; Supplier không có `PurchaseOrder` → Archive thành công, `status=ARCHIVED`, `deletedAt` được set.
8. **Import đúng** — `POST /suppliers/import` với file Excel mẫu (code bắt buộc trong file) chạy y hệt hành vi trước T012 — không có `version`/optional-code lọt vào luồng này.
9. **Export đúng** — `GET /suppliers/export` trả về file chứa toàn bộ field hiện có (kể cả Supplier vừa tạo ở bước 5) — không thiếu field, không đổi shape.
10. **`SupplierDebt` hoạt động** — `supplier-debt` module (đã chuyển sang inject `SupplierDomainService` ở Commit 5) vẫn tra cứu đúng Supplier qua `findById()` — không lỗi, không đổi hành vi nghiệp vụ công nợ.

Toàn bộ 10 bước PASS mới coi Acceptance Criteria #13 đạt — đây là **"phép thử quan trọng nhất của T012"**, đúng vai trò SR14/§13.1 đã đóng ở T011 (Architect gọi test tương đương là "the most important test of T011").

## 14. Implementation Order — Commit Strategy (Decision SR14, Fast Track — Type B)

```
Commit 1 — Migration
  Migration A (version) → Migration B (SupplierStatus) + cập nhật schema.prisma

Commit 2 — Domain
  SupplierEntity (SupplierStatus 3 giá trị), ISupplierRepository (organizationId+version,
  findByCode/changeStatusWithVersion mới), SupplierConcurrencyConflictError,
  SupplierDomainService mới (6 method)

Commit 3 — Application
  SupplierService: code optional-input (generator mới), Activate/Deactivate mới,
  existsByCode wiring thật, bỏ status khỏi Update, Archive Guard giữ nguyên + version check

Commit 4 — Presentation
  SupplierController: route activate/deactivate mới, version bắt buộc ở 5 route ghi,
  SupplierVersionDto mới, permission-catalog.ts (supplier:activate/deactivate)

Commit 5 — Repository Boundary
  supplier-debt.service.ts chuyển sang SupplierDomainService; gỡ SUPPLIER_REPOSITORY +
  SUPPLIER_PRODUCT_REPOSITORY khỏi SupplierModule.exports;
  supplier-repository-boundary.architecture.spec.ts mới

Commit 6 — Tests
  Toàn bộ test đơn vị cập nhật/mới (Decision SR13), Regression Baseline

Commit 7 — Documentation
  Release note T012, CHANGELOG.md, PROJECT_STATUS.md, SPRINT_DASHBOARD.md
```

## 15. Rollback Plan

- Rollback A: `ALTER TABLE suppliers DROP COLUMN version`.
- Rollback B: khôi phục `status` về `CommonStatus` 2 giá trị (ARCHIVED gộp về INACTIVE), đúng mẫu Customer Rollback B.
- Code: nếu Acceptance Criteria không đạt, không merge/commit.
- `supplier-debt`: nếu cần rollback, revert về inject `SUPPLIER_REPOSITORY` trực tiếp (tạm thời, không khuyến nghị).

## Lịch sử quyết định

- **RFC-T012 — Supplier Domain v1 (PROPOSED)** — Architect soạn trực tiếp (Short RFC).
- **`ARCHITECTURE REVIEW — RFC-T012 Supplier Domain`** (Claude Code, `docs/architecture/T012-architecture-review.md`) — phát hiện Supplier là brownfield trưởng thành hơn Customer lúc T011: Archive Guard thật đã tồn tại (A1), Repository Boundary violation cùng dạng T011 nhưng nặng hơn (A2, export cả 2 token), Excel Import/Export thật đã tồn tại dù RFC liệt kê Out of Scope (A3).
- **`ARCHITECT RESOLUTION — RFC-T012 SUPPLIER DOMAIN`** (Decision SR01-SR14) — kết quả APPROVED WITH DECISIONS: SR01 xác nhận brownfield; SR02/SR03 Archive Guard giữ nguyên, chuẩn hóa không viết lại, T015 chỉ mở rộng không viết mới; SR04 Import/Export giữ nguyên 100%, Out of Scope nghĩa là "không xây mới" không phải "chưa tồn tại"; SR05/SR06 Repository Boundary + SupplierDomainService 6 method; SR07 code generator mới (khác Customer, phải xây từ đầu); SR08 existsByCode giữ nguyên; SR09 field thừa được giữ; SR10 debt field (nếu có) deprecated không xóa — audit xác nhận hiện không tồn tại; SR11 2 migration; SR12 permission dấu hai chấm; SR13 test bổ sung; SR14 thứ tự triển khai. AUTHORIZATION: cập nhật RFC + viết SPEC-T012-SUPPLIER-001.
- **RFC-T012 — Supplier Domain v2** (`docs/rfc/RFC-T012-supplier-domain.md`) — Claude Code cập nhật theo SR01-SR14, đánh dấu rõ từng mục thay đổi, giữ lịch sử bản v1.
- **SPEC-T012-SUPPLIER-001** (tài liệu này) — Claude Code soạn theo ủy quyền tường minh, cụ thể hóa RFC v2 thành 8 quyết định triển khai (§0), 2 migration, entity/repository/domain-service/API/DTO/test đầy đủ. DRAFT lần đầu — đã qua Architecture Review.
- **`ARCHITECTURE REVIEW — SPEC-T012-SUPPLIER-001`** (Decision SP01-SP13) — kết quả APPROVED WITH DECISIONS: SP01-SP04/SP06-SP09/SP13 xác nhận nguyên trạng SPEC v1; **SP05** yêu cầu bổ sung — generator mới của Supplier phải dùng chung abstraction với `SequenceCustomerCodeGenerator`, không sao chép logic (→ §0.9, §9.3b: `SequenceCodeGeneratorService` dùng chung, đăng ký trong `PrismaModule`, cả Customer và Supplier refactor thành adapter mỏng; 8 generator khác trong dự án không đụng tới, công khai làm technical debt); **SP10** yêu cầu assertion Architecture Test cụ thể thay vì mô tả chung (→ §9.4, code mẫu `Reflect.getMetadata` + quét file); **SP11** yêu cầu bổ sung 3 test (→ §12 điểm 6-8: cách ly sequence dùng chung, regression Customer sau refactor, `existsByCode` pre-check); **SP12** yêu cầu kịch bản Acceptance Test đầu-cuối đầy đủ (→ §13.1, 10 bước từ Supplier cũ tới SupplierDebt). AUTHORIZATION: cập nhật SPEC theo SP05/SP10/SP11/SP12 (xong — tài liệu này), sau đó bắt đầu Implementation trực tiếp (Fast Track, không cần Implementation Plan). **SPEC status: APPROVED — Implementation đang triển khai.**
