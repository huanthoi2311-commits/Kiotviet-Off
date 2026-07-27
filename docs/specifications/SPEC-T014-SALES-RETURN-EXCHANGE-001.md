# SPEC-T014-SALES-RETURN-EXCHANGE-001 — Sales Return & Exchange

**Nguồn:** `RFC-T014-SALES-RETURN-EXCHANGE.md` v1.1 (APPROVED), Architecture Review: `docs/architecture/T014-rfc-v1.1-architecture-review.md`, Architect Decisions AD27-AD45 (`docs/project-governance/AI_WORKFLOW.md`).
**Bản chất:** SPEC chốt chi tiết kỹ thuật chính xác — trả lời các Open Question RFC §45 để lại, không thay đổi bất kỳ nguyên tắc kiến trúc nào RFC đã APPROVED (AD27-AD45).

---

## 0. Các điểm cụ thể hóa khi viết SPEC (trả lời Open Question RFC §45)

1. **[OQ1] Trạng thái Invoice hợp lệ để Return** — `Invoice.status !== 'CANCELLED'`. Không dùng riêng `'PAID'` dù đó là trạng thái DUY NHẤT Checkout hiện tạo (`dueAmount` luôn hardcode `0`) — chọn "khác CANCELLED" để tương thích ngược nếu tương lai có bán trả góp (`UNPAID`/`PARTIAL`) mà không cần sửa lại rule này. `Invoice` không có `deletedAt` (xác nhận qua schema — Invoice không bao giờ soft-delete, đúng AD11), nên không cần kiểm tra riêng.
2. **[OQ2] Trường product-type/stock-managed** — `InvoiceItem` KHÔNG snapshot `Product.type` (xác nhận qua schema — chỉ có `productCodeSnapshot/productNameSnapshot/unitNameSnapshot/barcodeSnapshot`). SPEC quyết định: đọc `Product.type` HIỆN TẠI qua `ProductDomainService.findById()` tại thời điểm `RECEIVED` để quyết định bypass Inventory hay không — **không** thêm cột snapshot mới vào `InvoiceItem` (tránh đụng lại baseline đã đóng băng T013 Phase 5/AD13, tránh cần RFC mới theo AD15). Giới hạn đã biết, chấp nhận cho v1: nếu Product bị đổi `type` sau khi bán (STANDARD→SERVICE hoặc ngược lại — hiếm, chưa xác nhận có bị chặn ở Product module hay không), Return sẽ dùng phân loại HIỆN TẠI, có thể khác lúc bán. Ghi vào Risk Register §18.
3. **[OQ3] Cơ chế khóa/serialization cụ thể** — xem §13 (Concurrency & Serialization Design), dùng raw SQL `SELECT ... FOR UPDATE` qua `tx.$queryRaw` trong Prisma transaction (Prisma Client fluent API không hỗ trợ row lock trực tiếp).
4. **[OQ4] Quy ước retry hiện có** — **không có** cơ chế auto-retry nội bộ nào trong dự án (xác nhận qua kiểm tra `checkout`/`purchase-return`/`inventory`). "Retry" trong dự án này luôn có nghĩa: lỗi được surface thành lỗi HTTP có mã (409 Conflict), client tự quyết định gọi lại — SPEC theo đúng quy ước này, không tự tạo internal retry loop mới.
5. **[OQ5] Phạm vi/prefix Sequence** — `sales_return_code`, org-scoped (không branch-scoped — Return không có khái niệm "Branch.invoicePrefix" như Invoice), prefix `SR`, pad 6 chữ số → `SR000001`. **Dùng `SequenceCodeGeneratorService` dùng chung (đúng AD12)** — KHÔNG copy pattern cũ của `SequencePurchaseReturnCodeGenerator` (module đó viết trước AD12, tự gọi `prisma.sequence.upsert()` trực tiếp — đã lỗi thời, không phải precedent đúng để theo cho document MỚI).
6. **[OQ6] Tên RBAC cuối cùng** — `sales_return:{view,create,update,submit,approve,receive,complete,cancel,refund,view_refund}` — giữ nguyên đề xuất RFC §31, đã đối chiếu catalog hiện có, không trùng lặp ngữ nghĩa với `order:return` (stub cũ, không đụng tới).
7. **[OQ7] Phân bổ discount/tax cho return value** — Return value của 1 dòng = `(unitPrice - discount) * returnedQty/soldQty ... `; cụ thể: `lineReturnValue = (invoiceItem.totalAmount / invoiceItem.quantity) * returnedQty` (đơn giá tỉ lệ theo `totalAmount` đã có sẵn discount+tax phân bổ từ Checkout — không tính lại discount/tax riêng, dùng tỷ lệ tuyến tính trên `totalAmount` gốc của dòng, đơn giản và nhất quán với cách `InvoiceItem.totalAmount` đã được tính ở Checkout).
8. **[OQ8] Nhiều Refund trên 1 Return** — Có. `SalesReturnRefund` là 1-nhiều với `SalesReturn` (khớp RFC §29.4 "One SalesReturn may have zero or more Refunds").
9. **[OQ9] Route/DTO naming** — xem §4/§10.
10. **[OQ10] Cơ chế idempotency hiện có** — Sales Return KHÔNG cần Idempotency-Key riêng như Checkout (T013 §13) — các action là state-transition theo `id` cụ thể (không phải "tạo mới" lặp lại có nguy cơ duplicate như Checkout), Optimistic Lock (`version`) đã đủ để chặn double-submit trùng lặp trên CÙNG 1 Return document. Không mở rộng phạm vi thêm cơ chế Idempotency mới.
11. **[OQ11] Suy ra Warehouse gốc** — `Invoice` KHÔNG lưu `warehouseId` (xác nhận qua schema — Checkout chỉ dùng `dto.warehouseId` để ghi `InventoryMovement`, không lưu lại trên `Invoice`). Warehouse gốc được suy ra bằng cách truy vấn `InventoryMovement WHERE referenceType='POS' AND referenceId=<invoiceId>`, lấy `warehouseId` từ bất kỳ dòng nào khớp (mọi dòng cùng 1 Invoice dùng chung 1 `warehouseId` vì Checkout chỉ nhận đúng 1 `warehouseId`/request). Với Invoice toàn dòng SERVICE (không có `InventoryMovement` nào — đúng AD14/Phase 6), không suy ra được — client PHẢI tự chọn Warehouse cho `SalesReturnItem` thay vì để hệ thống default.
12. **[OQ12] Cấu hình Auto-approval** — KHÔNG triển khai ở v1. `SUBMITTED → APPROVED` luôn cần thao tác `approve()` tường minh (dù cùng 1 actor gọi liên tiếp 2 API). Approval Policy pluggable (RFC §22, v1.0) bị hoãn — không có trong RFC v1.1, xác nhận: v1.1 không nhắc lại yêu cầu này, coi là đã loại bỏ khỏi phạm vi T014.

## 1. Entity

```ts
export type SalesReturnStatus =
  | 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'RECEIVED' | 'COMPLETED' | 'CANCELLED';

export type SalesReturnReason =
  | 'DAMAGED' | 'DEFECTIVE' | 'WRONG_PRODUCT' | 'CUSTOMER_CHANGED_MIND'
  | 'EXPIRED' | 'TRANSPORT_DAMAGE' | 'OTHER';

export type SalesReturnRefundStatus =
  | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface SalesReturnItemEntity {
  id: string;
  invoiceItemId: string;
  productId: string;
  warehouseId: string | null; // null hợp lệ nếu Product hiện là SERVICE (không cần phục hồi tồn)
  quantity: string;           // Decimal(18,3), luôn > 0
  unitPrice: string;
  discount: string;
  taxAmount: string;
  totalAmount: string;        // lineReturnValue, xem §0.7
  productCodeSnapshot: string;
  productNameSnapshot: string;
  unitNameSnapshot: string;
  reason: SalesReturnReason;
  reasonNote: string | null;  // bắt buộc non-null khi reason = 'OTHER'
  createdAt: Date;
  updatedAt: Date;
}

export interface SalesReturnRefundEntity {
  id: string;
  amount: string;
  method: 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'E_WALLET'; // tái dùng PaymentMethod hiện có
  status: SalesReturnRefundStatus;
  externalReference: string | null;
  failureReason: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number; // Optimistic Lock riêng cho Refund transition
}

export interface SalesReturnEntity {
  id: string;
  organizationId: string;
  branchId: string;
  invoiceId: string;
  customerId: string | null; // denormalize từ Invoice.customerId, chỉ để query nhanh — không phải nguồn sự thật
  code: string;
  status: SalesReturnStatus;
  totalAmount: string; // tổng lineReturnValue của mọi item — tổng "giá trị có thể refund"
  note: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number; // Optimistic Lock — bảo vệ chính document này (AD41), KHÔNG phải cơ chế chống over-return (đó là AD44, §13)
  items: SalesReturnItemEntity[];
  refunds: SalesReturnRefundEntity[];
}
```

## 2. Aggregate

```
Invoice (immutable, đọc-only)          Product/Unit (đọc-only qua Domain Service)
        │                                        │
        ▼                                        ▼
  SalesReturn (Aggregate Root, MỚI)
    ├── SalesReturnItem[] (owned)
    └── SalesReturnRefund[] (owned)
        │
        ├──► InventoryDomainService.increase()   (RECEIVED, dòng stock-managed)
        ├──► SequenceCodeGeneratorService         (sinh mã)
        ├──► AuditLogService                      (sau commit)
        └──► DomainEventPublisher                 (sau commit)
```

`SalesReturn` KHÔNG sở hữu Invoice/Inventory/Product/Customer/Payment — chỉ điều phối qua Domain Service (đúng AD28/AD42).

## 3. Migration

**Migration 1 — `sales_returns` core**

```sql
CREATE TYPE "SalesReturnStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'RECEIVED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "SalesReturnReason" AS ENUM ('DAMAGED', 'DEFECTIVE', 'WRONG_PRODUCT', 'CUSTOMER_CHANGED_MIND', 'EXPIRED', 'TRANSPORT_DAMAGE', 'OTHER');
CREATE TYPE "SalesReturnRefundStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE "sales_returns" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "branchId"       UUID NOT NULL,
  "invoiceId"      UUID NOT NULL,
  "customerId"     UUID,
  "code"           TEXT NOT NULL,
  "status"         "SalesReturnStatus" NOT NULL DEFAULT 'DRAFT',
  "totalAmount"    DECIMAL(18,2) NOT NULL DEFAULT 0,
  "note"           TEXT,
  "createdBy"      UUID,
  "updatedBy"      UUID,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "version"        INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "sales_returns_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_returns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "sales_returns_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT,
  CONSTRAINT "sales_returns_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT,
  CONSTRAINT "sales_returns_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "sales_returns_organizationId_code_key" ON "sales_returns"("organizationId", "code");
CREATE INDEX "sales_returns_organizationId_idx" ON "sales_returns"("organizationId");
CREATE INDEX "sales_returns_invoiceId_idx" ON "sales_returns"("invoiceId");
CREATE INDEX "sales_returns_status_idx" ON "sales_returns"("status");

CREATE TABLE "sales_return_items" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "salesReturnId"       UUID NOT NULL,
  "invoiceItemId"       UUID NOT NULL,
  "productId"           UUID NOT NULL,
  "warehouseId"         UUID,
  "quantity"            DECIMAL(18,3) NOT NULL,
  "unitPrice"           DECIMAL(18,2) NOT NULL,
  "discount"            DECIMAL(18,2) NOT NULL DEFAULT 0,
  "taxAmount"           DECIMAL(18,2) NOT NULL DEFAULT 0,
  "totalAmount"         DECIMAL(18,2) NOT NULL,
  "productCodeSnapshot" TEXT NOT NULL,
  "productNameSnapshot" TEXT NOT NULL,
  "unitNameSnapshot"    TEXT NOT NULL,
  "reason"              "SalesReturnReason" NOT NULL,
  "reasonNote"          TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sales_return_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_return_items_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "sales_returns"("id") ON DELETE CASCADE,
  CONSTRAINT "sales_return_items_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "invoice_items"("id") ON DELETE RESTRICT,
  CONSTRAINT "sales_return_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT,
  CONSTRAINT "sales_return_items_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT
);
CREATE INDEX "sales_return_items_salesReturnId_idx" ON "sales_return_items"("salesReturnId");
CREATE INDEX "sales_return_items_invoiceItemId_idx" ON "sales_return_items"("invoiceItemId");

CREATE TABLE "sales_return_refunds" (
  "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
  "salesReturnId"      UUID NOT NULL,
  "amount"             DECIMAL(18,2) NOT NULL,
  "method"             "PaymentMethod" NOT NULL,
  "status"             "SalesReturnRefundStatus" NOT NULL DEFAULT 'PENDING',
  "externalReference"  TEXT,
  "failureReason"      TEXT,
  "createdBy"          UUID,
  "updatedBy"          UUID,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  "version"            INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "sales_return_refunds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sales_return_refunds_salesReturnId_fkey" FOREIGN KEY ("salesReturnId") REFERENCES "sales_returns"("id") ON DELETE RESTRICT
);
CREATE INDEX "sales_return_refunds_salesReturnId_idx" ON "sales_return_refunds"("salesReturnId");
```

**Không migration nào đụng tới `invoices`/`invoice_items`/`payments`** (đúng AD13/AD11 — Invoice Snapshot Freeze/Checkout Orchestrator Freeze không bị vi phạm). Bảng `returns`/`return_items`/`orders`/`order_items` (scaffold cũ) giữ nguyên, không đụng tới (RFC §35 — "dormant Order-based scaffold SHALL remain untouched").

**Migration 2 — RBAC seed** (10 permission mới, xem §6).

Cả 2 migration đều additive, kèm `rollback.sql` (DROP TABLE theo thứ tự ngược FK, DROP TYPE).

## 4. API

| Method | Route | Command/Query |
|---|---|---|
| `POST` | `/sales-returns` | CreateSalesReturn (DRAFT) |
| `PATCH` | `/sales-returns/:id` | UpdateSalesReturnDraft (chỉ khi DRAFT) |
| `POST` | `/sales-returns/:id/submit` | SubmitSalesReturn |
| `POST` | `/sales-returns/:id/approve` | ApproveSalesReturn |
| `POST` | `/sales-returns/:id/receive` | ReceiveSalesReturn (Inventory + serialization, §13) |
| `POST` | `/sales-returns/:id/complete` | CompleteSalesReturn |
| `POST` | `/sales-returns/:id/cancel` | CancelSalesReturn |
| `GET` | `/sales-returns/:id` | GetSalesReturn |
| `GET` | `/sales-returns` | SearchSalesReturns |
| `GET` | `/sales-returns/eligibility?invoiceId=` | GetInvoiceReturnEligibility |
| `POST` | `/sales-returns/:id/refunds` | CreateSalesReturnRefund |
| `POST` | `/sales-returns/refunds/:refundId/process` | ProcessSalesReturnRefund |
| `POST` | `/sales-returns/refunds/:refundId/complete` | CompleteSalesReturnRefund |
| `POST` | `/sales-returns/refunds/:refundId/fail` | FailSalesReturnRefund |
| `POST` | `/sales-returns/refunds/:refundId/cancel` | CancelSalesReturnRefund |

Mọi mutating route yêu cầu body `{ version }` khi thao tác trên entity đã tồn tại (Optimistic Lock, đúng convention Customer/Supplier/Barcode/Branch).

## 5. Validation

- `CreateSalesReturnDto.invoiceId` — bắt buộc, phải resolve được Invoice hợp lệ (§0.1).
- `items[]` — tối thiểu 1 dòng; mỗi dòng `quantity > 0`; `invoiceItemId` phải thuộc đúng `invoiceId`; không được trùng `invoiceItemId` trong CÙNG 1 Return (reject, không tự gộp — SPEC chọn reject thay vì normalize theo đề xuất RFC §16).
- `reason` bắt buộc; `reasonNote` bắt buộc non-empty khi `reason = 'OTHER'`.
- Validate Eligible Quantity SƠ BỘ (không dưới lock) ở bước `Create`/`Update Draft`/`Submit`/`Approve` — chỉ mang tính UX, KHÔNG phải nguồn sự thật (đúng RFC §15.3 "UI validation is advisory only"). Nguồn sự thật DUY NHẤT là bước `Receive` dưới serialization (§13).
- `warehouseId` bắt buộc cho mọi dòng mà `Product.type` (đọc hiện tại) KHÁC `SERVICE` tại thời điểm `Receive` (không phải tại thời điểm Create — Product có thể đổi loại giữa Draft và Receive, dùng giá trị tại `Receive`).

## 6. Permission (RBAC)

Thêm vào `permission-catalog.ts`, nhóm `sales_return`:

```ts
{ code: 'sales_return:view', group: 'sales_return', description: 'Xem phiếu trả hàng' },
{ code: 'sales_return:create', group: 'sales_return', description: 'Tạo phiếu trả hàng' },
{ code: 'sales_return:update', group: 'sales_return', description: 'Sửa phiếu trả hàng (Draft)' },
{ code: 'sales_return:submit', group: 'sales_return', description: 'Gửi phiếu trả hàng chờ duyệt' },
{ code: 'sales_return:approve', group: 'sales_return', description: 'Duyệt phiếu trả hàng' },
{ code: 'sales_return:receive', group: 'sales_return', description: 'Nhận hàng trả, phục hồi tồn kho' },
{ code: 'sales_return:complete', group: 'sales_return', description: 'Hoàn tất phiếu trả hàng' },
{ code: 'sales_return:cancel', group: 'sales_return', description: 'Hủy phiếu trả hàng' },
{ code: 'sales_return:refund', group: 'sales_return', description: 'Tạo/xử lý hoàn tiền' },
{ code: 'sales_return:view_refund', group: 'sales_return', description: 'Xem thông tin hoàn tiền' },
```

Không đụng tới stub `order:*`/`debt:view`/`cashbook:view` (ngoài phạm vi, Discovery §9 đã ghi nhận là dead entries).

## 7. Multi-tenant

Mọi query/command bắt buộc lọc `organizationId` (đúng BR01 xuyên suốt dự án). `SalesReturn.branchId` KHÔNG bắt buộc trùng với actor's branch hiện tại trong v1 (đơn giản hoá — không có khái niệm "current branch" tách biệt actor như Checkout's `dto.branchId`) — `branchId` lấy từ `Invoice.branchId` trực tiếp (đúng RFC §12 "Default branch policy is Return branch equals Invoice branch", không cho override trong v1 — cross-branch return "out of scope" theo RFC).

## 8. Archive Guard

Không áp dụng — `SalesReturn` không có khái niệm Archive/Restore (chỉ có Cancel, một trạng thái lifecycle riêng, không phải soft-delete theo nghĩa Master Data). `deletedAt` có mặt trên bảng chỉ để nhất quán schema-level với `PurchaseReturn` (không có route xóa nào sử dụng nó trong phạm vi T014).

## 9. Repository / Domain Service / Repository Boundary

- `SALES_RETURN_REPOSITORY`/`ISalesReturnRepository` — nội bộ module `sales-return`, KHÔNG export (đúng AD42/ADR-0010).
- `SalesReturnModule` export duy nhất (nếu cần cross-module trong tương lai, hiện tại v1 KHÔNG có module nào cần consume `SalesReturn` — không tạo `SalesReturnDomainService` khi chưa có consumer thật, đúng nguyên tắc YAGNI đã áp dụng cho Category T006).
- Import: `InvoiceModule` (đọc `InvoiceService.getById()`), `ProductModule` (đọc `ProductDomainService.findById()`), `UnitModule` (không cần trực tiếp — product-name/unit-name đã có sẵn trên `InvoiceItem` snapshot, chỉ `productType` cần đọc lại), `InventoryModule` (`InventoryDomainService.increase()`), `BranchModule`/`WarehouseModule`/`CustomerModule` (đọc-only nếu cần hiển thị), `RbacModule`.
- **KHÔNG** import `PaymentModule` — đúng AD32/AD37/§0 Refund không đụng Payment.
- **KHÔNG** import `CheckoutModule` — Exchange (Return + New Sale) gọi Checkout hiện có từ phía client (2 request riêng biệt), KHÔNG có dependency code-level giữa `sales-return` và `checkout` (đúng RFC §21 "T014 SHALL NOT introduce one distributed atomic transaction across Return and New Sale").

## 10. DTO

```ts
export class CreateSalesReturnItemDto {
  invoiceItemId: string;
  quantity: number;
  reason: SalesReturnReason;
  reasonNote?: string;
  warehouseId?: string; // bắt buộc nếu Product không phải SERVICE — validate ở service layer, không phải class-validator tĩnh
}

export class CreateSalesReturnDto {
  invoiceId: string;
  note?: string;
  items: CreateSalesReturnItemDto[];
}

export class CreateSalesReturnRefundDto {
  amount: number;
  method: 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'E_WALLET';
  externalReference?: string;
}
```

`SalesReturnResponseDto`/`SalesReturnItemResponseDto`/`SalesReturnRefundResponseDto` mirror Entity 1:1 (Decimal → string, đúng convention `InvoiceResponseDto`).

## 11. Event

`SalesReturnCreated`, `SalesReturnSubmitted`, `SalesReturnApproved`, `SalesReturnReceived`, `InventoryRestored`, `SalesReturnCompleted`, `SalesReturnCancelled`, `SalesReturnRefundCreated`, `SalesReturnRefundCompleted`, `SalesReturnRefundFailed` — publish qua `DomainEventPublisher.publish()` SAU commit, đúng RFC §26/DI (T013 §14 pattern).

## 12. Product-Type Handling (SERVICE bypass)

Tại bước `Receive`, với mỗi `SalesReturnItem`:
```ts
const product = await this.productDomainService.findById(item.productId, organizationId);
if (product.type === 'SERVICE') {
  continue; // không gọi InventoryDomainService.increase(), warehouseId có thể null
}
await this.inventoryDomainService.increase(tx, {
  organizationId, warehouseId: item.warehouseId!, productId: item.productId,
  quantity: Number(item.quantity), unitCost: 0, // xem ghi chú unitCost bên dưới
  movementType: 'RETURN', referenceType: 'RETURN', referenceId: salesReturn.id,
  createdBy: actor.userId,
});
```
**Ghi chú `unitCost`**: `InventoryDomainService.increase()` dùng `unitCost` để tính lại Average Cost (đúng vai trò tham số này ở Purchase Order). Với Sales Return, hàng trả về nên giữ nguyên Average Cost hiện tại của kho (không nên tính lại theo giá BÁN — sẽ làm sai giá vốn). SPEC quyết định: dùng `unitCost` = giá vốn (`avgCost`) hiện tại của Warehouse tại thời điểm phục hồi (đọc qua `InventoryDomainService`/`getByProduct()` trước khi gọi `increase()`) — **không** dùng `InvoiceItem.unitPrice` (đó là giá BÁN, không phải giá vốn). Đây là điểm khác biệt quan trọng với `PurchaseReturn.complete()` (dùng `decrease()`, không cần `unitCost`).

Mirror đúng AD14/AD45 — cùng pattern Checkout Phase 6 đã dùng để bỏ qua SERVICE.

## 13. Concurrency & Serialization Design (AD44 — cơ chế chống over-return)

Đây là phần quan trọng nhất của SPEC, trả lời trực tiếp RFC §15/AD44.

**Bước `Receive`, MỘT transaction (`prisma.$transaction`)**:

```ts
await this.prisma.$transaction(async (tx) => {
  const invoiceItemIds = [...new Set(salesReturn.items.map(i => i.invoiceItemId))].sort();

  // 1. Row lock — Prisma fluent API không hỗ trợ FOR UPDATE, dùng raw SQL (đúng OQ3)
  await tx.$queryRaw`
    SELECT id FROM invoice_items
    WHERE id = ANY(${invoiceItemIds}::uuid[])
    ORDER BY id
    FOR UPDATE
  `;

  // 2. Recalculate — SAU khi có lock, đọc lại tổng đã return từ mọi SalesReturn khác
  //    đang ở RECEIVED/COMPLETED cho CÙNG invoiceItemId (query trực tiếp trong tx)
  for (const invoiceItemId of invoiceItemIds) {
    const counted = await tx.salesReturnItem.aggregate({
      where: {
        invoiceItemId,
        salesReturn: { status: { in: ['RECEIVED', 'COMPLETED'] } },
      },
      _sum: { quantity: true },
    });
    const invoiceItem = await tx.invoiceItem.findUniqueOrThrow({ where: { id: invoiceItemId } });
    const eligibleQty = invoiceItem.quantity.minus(counted._sum.quantity ?? 0);
    const requestedQty = /* tổng quantity của các SalesReturnItem hiện tại ứng với invoiceItemId này */;
    if (requestedQty.greaterThan(eligibleQty)) {
      throw new SalesReturnQtyExceededError(invoiceItemId, eligibleQty.toString());
    }
  }

  // 3. Persist transition RECEIVED
  await tx.salesReturn.update({ where: { id: salesReturn.id, version: expectedVersion }, data: { status: 'RECEIVED', version: { increment: 1 } } });

  // 4. Restore inventory (§12) — bên trong CÙNG transaction, dùng InventoryDomainService.increase(tx, ...)

  // 5. Commit tự động khi callback resolve — publish events + audit SAU khi Promise của $transaction() resolve (§14)
});
```

**Vì sao đây là serialization boundary thật sự**: `SELECT ... FOR UPDATE` trên Postgres khóa CHÍNH XÁC các row `invoice_items` đó cho tới khi transaction COMMIT hoặc ROLLBACK. Một transaction `Receive` thứ hai nhắm vào CÙNG `invoiceItemId` sẽ BLOCK ở bước 1 cho tới khi transaction đầu tiên kết thúc — sau đó mới đọc được `counted` MỚI NHẤT (đã bao gồm return vừa persist), nên không thể cùng vượt qua bước 2. Thứ tự sort (`ORDER BY id`) đúng theo RFC §15.3 "Lock order SHALL be deterministic" — ngăn deadlock khi 2 Return có tập `invoiceItemId` giao nhau nhưng thứ tự request khác nhau.

**Deadlock/lock-timeout**: Postgres tự phát hiện deadlock (ném `40P01`) hoặc lock timeout (nếu cấu hình `lock_timeout`) — Prisma raise thành `PrismaClientKnownRequestError`. `SalesReturnRepository` bắt lỗi này, ném `SalesReturnConcurrencyRetryError` → map `409 SALES_RETURN_CONCURRENCY_RETRY` — client tự retry (đúng OQ4, không có internal retry loop).

**KHÔNG dùng Optimistic Lock (`version`) cho việc này** — `version` trên `SalesReturn` (AD41) chỉ bảo vệ 2 request CÙNG sửa 1 Return document (vd double-submit), không giải quyết được race giữa 2 Return KHÁC NHAU cùng nhắm 1 `InvoiceItem` — đây chính là lý do RFC v1.0 sai và v1.1 sửa đúng (AD44).

## 14. Transaction Propagation

| Bước | Transaction | Ghi chú |
|---|---|---|
| Create Draft | 1 transaction ngắn | Sinh mã, tạo Return + Items, không đụng Eligibility |
| Update Draft | 1 transaction ngắn | Chỉ khi `status = DRAFT` |
| Submit/Approve | 1 transaction ngắn mỗi bước | Validate status + version, transition |
| **Receive** | **1 transaction** (§13) | Lock + Recalculate + Validate + Transition + Inventory — TẤT CẢ trong 1 transaction, đúng RFC §24 |
| Complete | 1 transaction ngắn | Validate `RECEIVED`, transition `COMPLETED`. Refund KHÔNG phải điều kiện tiên quyết (AD43) |
| Refund (mọi transition) | Transaction RIÊNG, KHÔNG lồng vào Return transaction | Đúng RFC §24 "Refund uses its own transaction and lifecycle" |
| Audit + Event | NGOÀI transaction, SAU khi commit | Đúng §0.OQ nào không có — xem §25 RFC, khớp `AuditLogService` thật (không nhận `tx`) |

## 15. Refund Model (chi tiết)

- `Refund` lifecycle độc lập hoàn toàn: `PENDING → PROCESSING → {COMPLETED|FAILED}`, hoặc `PENDING → CANCELLED`.
- Tổng `amount` của mọi Refund có status `PENDING`/`PROCESSING`/`COMPLETED` thuộc 1 `SalesReturn` KHÔNG được vượt `SalesReturn.totalAmount` — validate ở `CreateSalesReturnRefund`.
- `FAILED`/`CANCELLED` Refund KHÔNG hoàn tác Inventory hay đổi status của `SalesReturn` (đúng AD43 — độc lập hoàn toàn).
- `method` tái dùng `PaymentMethod` enum hiện có (không tạo enum mới) — nhưng KHÔNG ghi vào bảng `payments` (đúng §0/AD32/RFC §20/§40).

## 16. Test

- **Unit**: mỗi state transition (Return + Refund riêng), quyết định bypass SERVICE, tính `lineReturnValue` (§0.7), validate `reasonNote` bắt buộc khi OTHER, Complete không cần Refund.
- **Integration**: repository CRUD, `SequenceCodeGeneratorService` sinh đúng `SR000001`, Receive transaction (mock `tx.$queryRaw` được gọi đúng tham số sort), Inventory `increase()` được gọi đúng cho dòng stock-managed/bỏ qua dòng SERVICE, Audit/Event sau commit.
- **Concurrency Gate (cần Postgres thật, không chạy được trong sandbox Docker-less hiện tại — ghi vào Known Limitations)**: 2 Return cùng target 1 `InvoiceItem`, tổng vượt `SoldQty` → chỉ 1 thành công, request kia nhận `SALES_RETURN_QTY_EXCEEDED` (sau khi lock giải phóng) hoặc `SALES_RETURN_CONCURRENCY_RETRY` (nếu đụng deadlock/timeout).
- **Regression**: `checkout`/`invoice`/`payment`/`purchase-return` không đổi hành vi; `inventory/single-writer.architecture.spec.ts` cập nhật `it.each` list thêm `SalesReturnModule`.
- **Architecture Test mới**: `sales-return-repository-boundary.architecture.spec.ts` (không module nào ngoài `sales-return` import `SALES_RETURN_REPOSITORY`; `sales-return` không import `PAYMENT_REPOSITORY`/`INVOICE_REPOSITORY`/`INVENTORY_REPOSITORY` trực tiếp).

## 17. Acceptance Criteria

Tất cả 18 mục RFC §42 PASS + bổ sung:
19. `SequenceCodeGeneratorService` được dùng (không copy pattern cũ của `SequencePurchaseReturnCodeGenerator`).
20. `unitCost` khi phục hồi tồn dùng Average Cost hiện tại của kho, không dùng giá bán.
21. Warehouse gốc suy ra đúng qua `InventoryMovement` khi có thể; bắt buộc client chọn khi Invoice toàn SERVICE.

## 18. Risk Register

| Rủi ro | Mức độ | Giảm thiểu |
|---|---|---|
| Product đổi `type` sau khi bán làm sai lệch quyết định bypass Inventory (§0.2) | Thấp | Chấp nhận cho v1, ghi nhận limitation, không thêm snapshot mới lên InvoiceItem (tránh vi phạm AD13/AD15) |
| `SELECT ... FOR UPDATE` qua raw SQL — cú pháp Prisma raw có thể lệch giữa version | Thấp | Integration Test xác nhận query chạy đúng cú pháp; Concurrency Gate cần Postgres thật mới xác nhận được hành vi khóa thật (Known Limitation — môi trường hiện tại không có Docker/Postgres) |
| `lineReturnValue` (§0.7) là xấp xỉ tuyến tính, có thể lệch vài đồng do làm tròn khi `soldQty` lớn/lẻ | Thấp | Chấp nhận, ghi rõ công thức, review lại nếu Kế toán (T017+) cần chính xác tuyệt đối |
| Không có Concurrency Gate thật trong môi trường phát triển hiện tại | Trung bình | Ghi vào Known Limitations, giống tiền lệ Integration Test/E2E của mọi Task T009-T013 trước đó — không chặn Implementation, chặn Release thật (giống RC Validation Gate, AD17) |

## 19. Implementation Order

1. Migration 1 (`sales_returns`/`sales_return_items`/`sales_return_refunds` + enums).
2. Migration 2 (RBAC seed).
3. Domain (Entity, Repository interface, Errors).
4. Infrastructure (Prisma Repository — bao gồm §13's raw SQL lock, Generator adapter dùng `SequenceCodeGeneratorService`).
5. Application (Service — toàn bộ state machine Return + Refund, `ReturnEligibilityService`).
6. API (Controller, DTO).
7. Domain Events.
8. Architecture Test (Repository Boundary + cập nhật Single Writer allow-list).
9. Unit + Integration Test.
10. Regression toàn dự án.
11. Feature Enablement xác nhận cơ chế (AD40 — SPEC không mở rộng thêm platform mới, chỉ 1 boolean check kiểu `isProductRefactorEnabled()`).
12. Implementation Report → Architect Review → Phase tiếp theo (nếu Architect muốn chia Phase Gate như T013).

## 20. Rollback Plan

- Rollback 1: `DROP TABLE sales_return_refunds, sales_return_items, sales_returns CASCADE; DROP TYPE "SalesReturnRefundStatus", "SalesReturnReason", "SalesReturnStatus";`
- Rollback 2: xóa 10 permission seed (nếu chưa gán cho Role nào).
- Code: nếu Acceptance Criteria không đạt, không merge/commit — đúng convention xuyên suốt dự án.

---

## Lịch sử quyết định

- **RFC-T014-SALES-RETURN-EXCHANGE v1.1** — APPROVED bởi Architect (2 Critical Finding A1/A2 của v1.0 đã giải quyết ở mức kiến trúc). Decision AD27-AD45 trở thành baseline chính thức (`docs/project-governance/AI_WORKFLOW.md`).
- **SPEC-T014-SALES-RETURN-EXCHANGE-001** (tài liệu này) — Claude Code soạn theo ủy quyền tường minh ("Claude Code hiện được phép bắt đầu SPEC-T014"), chốt toàn bộ 12 Open Question RFC §45 để lại — đặc biệt OQ2 (product-type qua đọc lại, không snapshot mới), OQ3 (raw SQL `FOR UPDATE`), OQ5 (dùng `SequenceCodeGeneratorService`, không copy pattern cũ), OQ11 (suy ra Warehouse gốc qua `InventoryMovement`). Chưa code, chưa migration, chưa commit — chờ `ARCHITECT REVIEW — SPEC-T014`.
