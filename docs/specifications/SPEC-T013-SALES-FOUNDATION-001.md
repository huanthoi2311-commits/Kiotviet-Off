# SPEC-T013-SALES-FOUNDATION-001 — Sales Foundation

**Status:** APPROVED WITH REQUIRED REVISIONS (SP02-SP12) — v2, cập nhật theo `ARCHITECT REVIEW — SPEC-T013-SALES-FOUNDATION-001`.
**Nguồn:** `RFC-T013 — Sales Foundation` v1 (Architect) → `ARCHITECTURE REVIEW — RFC-T013 Sales Foundation` (Claude Code) → `ARCHITECT RESOLUTION` (Decision AR01-AR18) → `RFC-T013` v2 (Claude Code) → `SPEC-T013-SALES-FOUNDATION-001` v1 (Claude Code) → `ARCHITECT REVIEW — SPEC-T013-SALES-FOUNDATION-001` (Decision SP02-SP12 + Decision AD07, APPROVED WITH REQUIRED REVISIONS) → SPEC v2 (tài liệu này).
**Bản chất:** Evolution (Decision AR01/AR05) của hệ thống Checkout/Cart/Invoice/Payment đã chạy thật. Bổ sung: (1) Idempotency cho `POST /checkout` với thiết kế chịu được crash/timeout thật (không chỉ lý thuyết), (2) Snapshot phân loại Mandatory/Conditional, (3) SERVICE-product không trừ tồn kể cả giỏ hàng hỗn hợp, (4) Invoice Number dùng `Branch.invoicePrefix` + `SequenceCodeGeneratorService`, (5) 4 Repository Boundary fix, (6) Transaction Propagation tường minh, (7) Risk Register.
**Tác giả SPEC:** Claude Code, theo ủy quyền tường minh (AR18 mục 2; SPEC Review AUTHORIZATION mục 1: "Cập nhật SPEC theo SP02, SP03, SP07, SP10, SP11, SP12").
**Quy trình:** Type A đầy đủ (Decision AD06) — sau SPEC này là `IMPLEMENTATION-PLAN-T013.md` (bước riêng).
**Nguyên tắc kiến trúc áp dụng:** Decision AD07 — Checkout Command Pattern (`Cart → Checkout Command → Atomic Business Transaction → Immutable Invoice`, không phát triển theo hướng CRUD Invoice — xem `docs/project-governance/AI_WORKFLOW.md`).

---

## 0. Các điểm cụ thể hóa khi viết SPEC

1. **Không đổi tên bất kỳ bảng/model nào** — `Invoice`/`InvoiceItem`/`Payment`/`Order` giữ nguyên tên.
2. **Idempotency — Option A (bảng `CheckoutOperation` riêng), không chọn Option B** — lý do chi tiết ở §13. **[SP02 revision]** Thiết kế v2 tách "reserve" (transaction riêng, commit ngay) khỏi "business transaction" chính — xem §13.2, để `PROCESSING` thực sự là trạng thái *durable*, có thể quan sát và phục hồi được khi crash, thay vì chỉ tồn tại trong 1 transaction chưa commit (không thể quan sát từ bên ngoài).
3. **Unit conversion — hoãn, ngoài phạm vi T013.**
4. **Partial payment (`dueAmount > 0`) — KHÔNG mở rộng trong T013.**
5. **Price override — KHÔNG xây trong T013.**
6. **Permission — chỉ giữ `pos:access` cho `POST /checkout`, không tạo bộ `sales:*` mới.**
7. **`CartDomainService` — method tối thiểu:** `findByUserId`, `clearAfterCheckout`.
8. **`CustomerPointDomainService` — method tối thiểu:** `usePoint(tx)`.
9. **`Branch.invoicePrefix` null fallback = `'HD'`.**
10. **Sequence invoice number tách theo `branchId`** — `sequenceName` = `` `invoice_code_${branchId}` ``.
11. **[SP01/SP02] `checkout_operations` — schema đầy đủ + retention/cleanup/recovery policy** — xem §3.2/§3.3.
12. **[SP03] Transaction Propagation — mục riêng, §14.**
13. **[SP07] Snapshot phân loại Mandatory/Conditional** — xem §1.3.
14. **[SP06] Mixed cart (physical + service) phải xử lý đúng trong cùng 1 checkout** — xem §12.

Không còn điểm nào khác cần làm rõ ngoài 14 điểm trên.

## 1. Entity

### 1.1 `InvoiceEntity` — thay đổi so với hiện tại

```ts
export type InvoiceStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED'; // không đổi (AR08)

export interface InvoiceEntity {
  id: string;
  organizationId: string;         // MỚI trên entity
  branchId: string;
  orderId: string | null;
  customerId: string | null;
  code: string;
  status: InvoiceStatus;
  totalAmount: string;
  paidAmount: string;
  dueAmount: string;
  dueDate: Date | null;
  customerCodeSnapshot: string | null;
  customerNameSnapshot: string | null;
  customerPhoneSnapshot: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: InvoiceItemEntity[];
}
```

### 1.2 `InvoiceItemEntity` — thay đổi so với hiện tại

```ts
export interface InvoiceItemEntity {
  id: string;
  productId: string;
  barcodeId: string | null;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxAmount: string;
  totalAmount: string;
  productCodeSnapshot: string;
  productNameSnapshot: string;
  barcodeSnapshot: string | null;
  unitNameSnapshot: string;
}
```

### 1.3 Snapshot Classification (Decision SP07)

| Field | Phân loại | Lý do |
|---|---|---|
| `Invoice.customerCodeSnapshot`/`customerNameSnapshot`/`customerPhoneSnapshot` | **Mandatory** — chỉ ghi khi có `customerId` (null nếu khách lẻ) | Customer có thể bị sửa/archive sau — Invoice phải giữ nguyên thông tin tại thời điểm bán |
| `InvoiceItem.productCodeSnapshot`/`productNameSnapshot` | **Mandatory** | Product luôn tồn tại trên mọi dòng hàng — bắt buộc snapshot 100% |
| `InvoiceItem.unitNameSnapshot` | **Mandatory** | Product luôn có `unitId` (không nullable ở schema) — snapshot tên Unit tại thời điểm bán, không phụ thuộc Unit có bị sửa/archive sau |
| Giá bán đã áp dụng (`unitPrice`, `discount`, `taxAmount`, `totalAmount` trên `InvoiceItem`) | **Mandatory** — **đã có sẵn**, không phải field mới | Đây là cách "giá đã snapshot" hiện tại của hệ thống — không cần cột mới, chỉ cần xác nhận không đọc lại giá từ Product khi hiển thị Invoice cũ |
| `InvoiceItem.barcodeId`/`barcodeSnapshot` | **Conditional** — chỉ có giá trị khi dòng hàng được thêm qua quét Barcode cụ thể (không phải mọi Product đều có Barcode) | Phụ thuộc dữ liệu Barcode có tồn tại cho Product đó hay không — null hợp lệ nếu Cart item không gắn Barcode |
| Tax breakdown chi tiết hơn `taxAmount` hiện có (vd `taxRate` snapshot riêng) | **Conditional — KHÔNG thêm trong T013** | `Product.vat` (%) đã đủ để suy ra `taxRate` nếu cần, không cần cột riêng — chỉ thêm nếu SPEC tương lai (T020 Reports) cần hiển thị riêng `taxRate` đã áp dụng |
| Unit conversion (`baseQuantity`, hệ số quy đổi) | **Conditional — hoãn hoàn toàn (§0.3)** | Không có hạ tầng conversion trong Product Foundation hiện tại |

**Nguyên tắc:** Field **Mandatory** phải có trong Migration A của T013 và được ghi ở MỌI lần checkout thành công (không được `null` trừ trường hợp nghiệp vụ hợp lệ như "không có Customer"). Field **Conditional** có thể `null` hợp lệ tùy dữ liệu đầu vào, không bắt buộc migration bổ sung nếu không phát sinh nhu cầu thật trong T013.

## 2. Aggregate

```
Cart (Redis, Draft — không đổi)
      ↓ Checkout Command (Decision AD07 — Aggregate Root, không đổi tên, không tạo mới)
Atomic Business Transaction
      ↓
Invoice (immutable, kết quả) + Payment (immutable, kết quả)
```

`CheckoutOperation` (mới) là bảng hỗ trợ kỹ thuật (idempotency), không phải aggregate nghiệp vụ.

## 3. Migration

**Không migration nào được tạo ở bước SPEC này.** 2 migration độc lập (Decision SP08 — tách theo mục đích, không gộp):

### 3.1 Migration A — Snapshot fields trên `invoices`/`invoice_items`

```sql
ALTER TABLE "invoices" ADD COLUMN "customerCodeSnapshot" TEXT;
ALTER TABLE "invoices" ADD COLUMN "customerNameSnapshot" TEXT;
ALTER TABLE "invoices" ADD COLUMN "customerPhoneSnapshot" TEXT;

ALTER TABLE "invoice_items" ADD COLUMN "barcodeId" UUID;
ALTER TABLE "invoice_items" ADD COLUMN "productCodeSnapshot" TEXT;
ALTER TABLE "invoice_items" ADD COLUMN "productNameSnapshot" TEXT;
ALTER TABLE "invoice_items" ADD COLUMN "barcodeSnapshot" TEXT;
ALTER TABLE "invoice_items" ADD COLUMN "unitNameSnapshot" TEXT;
```

Cột mới đều nullable — không backfill dữ liệu cũ (dự án chưa có dữ liệu production thật).

**Không cần Migration riêng cho Invoice Number (AR10)** — chỉ đổi code (`sequenceName` truyền vào `SequenceCodeGeneratorService`), không đổi schema. `Branch.invoicePrefix` đã tồn tại từ trước.

### 3.2 Migration B — `checkout_operations` (Idempotency, Option A) — Schema đầy đủ (Decision SP01)

```sql
CREATE TABLE "checkout_operations" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "branchId"       UUID NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash"    TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'PROCESSING', -- PROCESSING | SUCCEEDED | FAILED
  "invoiceId"      UUID,                                -- NULL khi PROCESSING/FAILED
  "paymentId"      UUID,                                -- NULL khi PROCESSING/FAILED
  "createdBy"      UUID,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"    TIMESTAMP(3),                        -- set khi chuyển sang SUCCEEDED hoặc FAILED
  "expiresAt"      TIMESTAMP(3) NOT NULL,                -- = createdAt + 48h, dùng cho retention/cleanup

  CONSTRAINT "checkout_operations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "checkout_operations_organizationId_idempotencyKey_key"
  ON "checkout_operations"("organizationId", "idempotencyKey");
CREATE INDEX "checkout_operations_status_createdAt_idx"
  ON "checkout_operations"("status", "createdAt");   -- phục vụ query tìm PROCESSING bị treo
CREATE INDEX "checkout_operations_expiresAt_idx"
  ON "checkout_operations"("expiresAt");              -- phục vụ cleanup job
```

`branchId` được thêm theo yêu cầu SP01 (không có trong bản v1 của SPEC) — dùng để lọc theo chi nhánh khi cần audit/hỗ trợ vận hành, dù unique constraint chỉ cần `(organizationId, idempotencyKey)` (branch không phải một phần của khóa duy nhất — 1 idempotency key luôn gắn với đúng 1 request, request đó luôn thuộc đúng 1 branch cụ thể).

### 3.3 Retention Policy / Cleanup Job / PROCESSING Recovery (Decision SP01)

**Retention Policy:**
- Mỗi row có `expiresAt = createdAt + 48 giờ` — đủ dài để hấp thụ mọi kịch bản network-retry/timeout thực tế (client hiếm khi retry sau nhiều giờ), đủ ngắn để không tích lũy vô hạn.
- Sau khi `expiresAt` trôi qua, row đủ điều kiện xóa bởi Cleanup Job. Nếu client gửi lại cùng `idempotencyKey` SAU khi row cũ đã bị xóa → được coi là **request hoàn toàn mới** (không có gì để so khớp), tạo `checkout_operations` mới bình thường — đây là câu trả lời tường minh cho "cùng key có được tái sử dụng sau khi hết hạn hay không": **có**, một khi row cũ đã bị dọn.

**Cleanup Job:**
- Tái sử dụng hạ tầng BullMQ đã có sẵn trong dự án (`@nestjs/bullmq`, không cần thêm dependency mới) — 1 repeatable job (vd chạy mỗi 15 phút):
  1. Xóa row `status IN ('SUCCEEDED', 'FAILED')` AND `expiresAt < now()`.
  2. Xử lý PROCESSING Recovery (xem dưới) TRƯỚC khi áp dụng bước xóa cho các row PROCESSING — không bao giờ xóa thẳng 1 row đang `PROCESSING` mà chưa qua bước Recovery.

**PROCESSING Recovery (row bị treo do crash server giữa transaction chính):**
- Vì bước "reserve" (insert `PROCESSING`) và "business transaction chính" là **2 transaction tách biệt** (xem §13.2), một row có thể ở trạng thái `PROCESSING` durable (đã commit) nhưng business transaction phía sau **không bao giờ hoàn tất** (server crash, timeout, exception không được catch đúng cách) — đây là kịch bản "PROCESSING bị treo" thật, khác với race condition bình thường.
- Ngưỡng "bị treo": `status = 'PROCESSING'` AND `createdAt < now() - INTERVAL '2 minutes'` (2 phút là khoảng thời gian rộng rãi so với thời gian xử lý checkout thực tế, tính bằng giây).
- Xử lý: Cleanup Job (hoặc lazy-check ngay khi có request mới cùng key — xem §13.2 bước `tryReclaim`) cập nhật row đó: `status = 'FAILED'`, `completedAt = now()`. Sau đó row này tuân theo Retention Policy bình thường (bị xóa sau 48h kể từ `createdAt` gốc, không phải kể từ lúc chuyển FAILED).

**FAILED Recovery (row đã được đánh dấu thất bại — do lỗi nghiệp vụ thật HOẶC do PROCESSING Recovery ở trên):**
- Một row `FAILED` có nghĩa: business transaction đã chắc chắn không tạo ra Invoice/Payment nào (`invoiceId`/`paymentId` vẫn `null`) — an toàn để cho phép thử lại ngay, không cần chờ hết `expiresAt`.
- Xử lý: request mới với cùng `idempotencyKey` gặp row `FAILED` → `tryReclaim()` (compare-and-swap, §9.5) đặt lại `status = 'PROCESSING'`, `requestHash` mới, `createdAt` mới → tiếp tục luồng Bước 2 bình thường.
- Không phân biệt "FAILED do lỗi nghiệp vụ" (vd hết tồn kho) và "FAILED do PROCESSING Recovery" (crash) ở tầng dữ liệu — cả hai đều là "chưa từng tạo được Invoice", nên chính sách retry giống nhau.

**Retry Policy (tổng hợp — áp dụng cho mọi trường hợp client gọi lại `POST /checkout` với cùng `Idempotency-Key`):**

| Trạng thái row tìm thấy | Hành động |
|---|---|
| `SUCCEEDED`, hash khớp | Trả lại kết quả cũ (200, không tạo giao dịch mới) |
| `SUCCEEDED`, hash khác | `409 CHECKOUT_IDEMPOTENCY_KEY_REUSED` — không cho retry với payload khác trên cùng key |
| `PROCESSING`, còn hạn (< 2 phút) | `409 CHECKOUT_IDEMPOTENCY_CONFLICT` — có request khác đang xử lý thật, client tự retry sau vài giây |
| `PROCESSING`, quá hạn (≥ 2 phút, coi là treo) | Cho phép retry ngay qua `tryReclaim()` |
| `FAILED` | Cho phép retry ngay qua `tryReclaim()` (xem FAILED Recovery ở trên) |
| Không tìm thấy (chưa từng có, hoặc đã bị Cleanup Job xóa sau khi hết hạn) | Coi là request hoàn toàn mới, `create()` bình thường |

## 4. API

### 4.1 Route hiện có — thay đổi

| Route | Thay đổi |
|---|---|
| `POST /checkout` | Bắt buộc header `Idempotency-Key`. Thiếu header → `400`. Payload không đổi. |
| `GET /invoices`, `GET /invoices/:id` | Không đổi route/permission. Response DTO thêm snapshot fields. |
| `GET /payments`, `GET /payments/:id` | Không đổi. |
| `POST/GET/PATCH/DELETE /cart` | Không đổi (Decision AD07 — đây là nơi duy nhất chỉnh sửa trước khi Checkout). |

### 4.2 Route mới

**Không có** (Decision AD07 — không phát triển Checkout theo hướng CRUD Invoice, không tạo `/sales-invoices/*`). `CheckoutOperation` không có Controller/route public.

## 5. Validation

`Idempotency-Key` header: bắt buộc, `@IsString()`, 1-100 ký tự, đọc qua `@Headers('idempotency-key')`.

## 6. Permission

Không thêm permission mới. Giữ `pos:access`, `invoice:view`, `payment:view`.

## 7. Multi-tenant (BR01)

Idempotency lookup scope theo `organizationId` (unique constraint `(organizationId, idempotencyKey)`).

## 8. Archive Guard

Không áp dụng.

## 9. Repository / Domain Service / Repository Boundary

### 9.1 `CartDomainService` — MỚI (Decision SP04)

```ts
@Injectable()
export class CartDomainService {
  constructor(
    @Inject(CART_REPOSITORY) private readonly cartRepository: ICartRepository,
  ) {}

  findByUserId(organizationId: string, userId: string): Promise<CartEntity | null> {
    return this.cartRepository.findByUserId(organizationId, userId);
  }

  clearAfterCheckout(organizationId: string, userId: string): Promise<void> {
    return this.cartRepository.delete(organizationId, userId);
  }
}
```

`CartModule.exports`: `[CART_REPOSITORY]` → `[CartService, CartDomainService]`.

### 9.2 `CustomerPointDomainService` — MỚI (Decision SP04)

```ts
@Injectable()
export class CustomerPointDomainService {
  constructor(
    @Inject(CUSTOMER_POINT_REPOSITORY)
    private readonly customerPointRepository: ICustomerPointRepository,
  ) {}

  usePoint(
    input: UsePointInput,
    tx?: Prisma.TransactionClient,
  ): Promise<CustomerPointLedgerEntity> {
    return this.customerPointRepository.usePoint(input, tx);
  }
}
```

`CustomerPointModule.exports`: `[CUSTOMER_POINT_REPOSITORY]` → `[CustomerPointDomainService]`.

### 9.3 `InvoiceModule`/`PaymentModule` — gỡ repository khỏi exports (Decision SP04)

`InvoiceModule.exports`: `[InvoiceService, INVOICE_REPOSITORY]` → `[InvoiceService]`.
`PaymentModule.exports`: `[PaymentService, PAYMENT_REPOSITORY]` → `[PaymentService]`.

### 9.4 `CheckoutService` — cập nhật constructor injection

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly cartDomainService: CartDomainService,
  private readonly customerDomainService: CustomerDomainService,
  private readonly customerPointDomainService: CustomerPointDomainService,
  private readonly inventoryDomainService: InventoryDomainService,
  @Inject(VOUCHER_REPOSITORY) private readonly voucherRepository: IVoucherRepository,
  private readonly discountEngine: DiscountEngineService,
  private readonly invoiceService: InvoiceService,
  private readonly paymentService: PaymentService,
  private readonly checkoutOperationService: CheckoutOperationService,
  private readonly productDomainService: ProductDomainService, // MỚI — kiểm tra ProductType.SERVICE (Decision SP06)
  private readonly auditLogService: AuditLogService,
  private readonly eventPublisher: DomainEventPublisher,
) {}
```

### 9.5 `ICheckoutOperationRepository` — MỚI, đầy đủ (Decision SP01)

```ts
export interface CreateCheckoutOperationInput {
  organizationId: string;
  branchId: string;
  idempotencyKey: string;
  requestHash: string;
  createdBy: string;
}

export interface CheckoutOperationEntity {
  id: string;
  organizationId: string;
  branchId: string;
  idempotencyKey: string;
  requestHash: string;
  status: 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  invoiceId: string | null;
  paymentId: string | null;
  createdAt: Date;
  completedAt: Date | null;
  expiresAt: Date;
}

export interface ICheckoutOperationRepository {
  findByKey(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<CheckoutOperationEntity | null>;

  /** INSERT mới (lần đầu tiên thấy key này) — dùng transaction RIÊNG, commit ngay (§14). */
  create(
    input: CreateCheckoutOperationInput,
  ): Promise<CheckoutOperationEntity>;

  /**
   * Compare-and-swap: chiếm lại 1 row đang FAILED, hoặc PROCESSING nhưng đã quá hạn "bị treo"
   * (createdAt < now() - 2 phút), đặt lại PROCESSING với requestHash mới. Trả về null nếu row
   * không ở trạng thái có thể chiếm lại (đang PROCESSING hợp lệ, hoặc đã SUCCEEDED).
   */
  tryReclaim(
    id: string,
    requestHash: string,
  ): Promise<CheckoutOperationEntity | null>;

  /** Bước cuối BÊN TRONG business transaction chính (§14) — cùng transaction với Invoice/Payment. */
  markSucceeded(
    id: string,
    invoiceId: string,
    paymentId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void>;

  /** Gọi NGOÀI transaction đã rollback, hoặc bởi Cleanup Job cho row bị treo. */
  markFailed(id: string): Promise<void>;

  /** Dùng bởi Cleanup Job — tìm row PROCESSING quá hạn 2 phút. */
  findStuckProcessing(olderThanMs: number): Promise<CheckoutOperationEntity[]>;

  /** Dùng bởi Cleanup Job — xóa row đã hết hạn (SUCCEEDED/FAILED, expiresAt < now()). */
  deleteExpired(): Promise<number>;
}

export const CHECKOUT_OPERATION_REPOSITORY = Symbol('CHECKOUT_OPERATION_REPOSITORY');
```

`CheckoutOperationService` (application layer, module `checkout`, **không export**) bọc repository này — xem luồng đầy đủ ở §13.

### 9.6 Repository Boundary Architecture Test — mới (Decision SP04 — bắt buộc kèm Implementation)

- `cart-repository-boundary.architecture.spec.ts`
- `invoice-repository-boundary.architecture.spec.ts`
- `payment-repository-boundary.architecture.spec.ts`
- `customer-point-repository-boundary.architecture.spec.ts`

Mỗi file xác nhận: module tương ứng chỉ export Domain Service (không export repository token); không module nào khác import repository token/interface trực tiếp; `checkout.service.ts` không còn chứa `CART_REPOSITORY`/`CUSTOMER_POINT_REPOSITORY`.

## 10. DTO

- `CheckoutDto`: không đổi.
- `InvoiceResponseDto`/`InvoiceItemResponseDto`: thêm các field snapshot (§1.3).

## 11. Event

Không đổi — giữ nguyên `CHECKOUT_COMPLETED_EVENT`/`CHECKOUT_FAILED_EVENT`/`POINT_USED_EVENT`.

## 12. Service Product Handling (Decision SP06)

**Invariant nghiệp vụ bắt buộc:** `InventoryDomainService` **không được gọi** cho dòng hàng có
`Product.type === 'SERVICE'`.

**Xử lý giỏ hàng hỗn hợp (physical + service trong cùng 1 Cart/Checkout):**

```ts
for (const item of cart.items) {
  const product = await this.productDomainService.findById(item.productId, actor.organizationId);
  if (product?.type === 'SERVICE') {
    continue; // Không gọi InventoryDomainService.decrease() — vẫn có mặt trên Invoice/Payment
  }
  await this.inventoryDomainService.decrease(tx, { /* như hiện tại */ });
}
```

- Product SERVICE: được phép bán, có trên `InvoiceItem`, tính vào `totalAmount`/`Payment` bình
  thường — **chỉ** loại trừ khỏi bước gọi Inventory.
- Product không phải SERVICE trong CÙNG giỏ hàng: vẫn trừ tồn bình thường, không bị ảnh hưởng bởi
  sự có mặt của dòng SERVICE khác.
- `ProductDomainService.findById()` được gọi 1 lần cho mỗi item (đã có sẵn service này, dùng lại
  đúng Repository Boundary — không inject Product Repository trực tiếp).

## 13. Idempotency Design (Decision AR11/SP01/SP02 — thiết kế chịu crash thật)

### 13.1 Option A vs Option B (giữ nguyên phân tích v1, xem thêm điều chỉnh SP02)

**Option A (đã chọn):** Bảng `CheckoutOperation` riêng — tách biệt hoàn toàn khỏi vòng đời Invoice,
cho phép "giữ chỗ" (reserve) một `idempotencyKey` TRƯỚC KHI biết Invoice có được tạo thành công hay
không.

**Option B (loại bỏ):** Metadata trên `Invoice` — không giữ chỗ được trước khi Invoice tồn tại, nên
không bảo vệ được khoảng thời gian giữa lúc request bắt đầu và lúc `INSERT INTO invoices` thật sự
chạy — đúng race condition nghiêm trọng nhất mà AR11 lo ngại.

### 13.2 Luồng chi tiết — 2 transaction tách biệt (điều chỉnh SP02, quan trọng nhất của bản v2 này)

**Vấn đề của thiết kế v1 (đã sửa):** Nếu "reserve" + "business logic" + "mark succeeded" nằm
**trong cùng 1 transaction**, một row `PROCESSING` sẽ **không bao giờ** được transaction khác quan
sát thấy (Postgres không cho đọc dữ liệu chưa commit) — nghĩa là nếu app crash giữa chừng, toàn bộ
transaction (kể cả dòng `checkout_operations`) bị rollback, không để lại dấu vết gì để "phục hồi".
Điều này khiến yêu cầu "PROCESSING recovery" của SP01 không thể thực hiện được với thiết kế 1
transaction. **Thiết kế v2 tách thành 2 bước, 2 transaction riêng biệt** để `PROCESSING` là trạng
thái **durable** (đã commit, quan sát được), cho phép phục hồi thật khi crash giữa chừng:

```
Bước 1 — RESERVE (transaction ngắn, commit ngay lập tức)
  │
  ├─ Tính requestHash (SHA-256 của payload checkout đã chuẩn hóa)
  ├─ findByKey(organizationId, idempotencyKey)
  │    ├─ Không tìm thấy → create() mới (status=PROCESSING) → commit → sang Bước 2
  │    ├─ Tìm thấy, SUCCEEDED, hash khớp → trả cached response (dựng lại từ invoiceId/paymentId), DỪNG
  │    ├─ Tìm thấy, hash KHÁC → 409 CHECKOUT_IDEMPOTENCY_KEY_REUSED, DỪNG
  │    ├─ Tìm thấy, PROCESSING, còn hạn (< 2 phút) → 409 CHECKOUT_IDEMPOTENCY_CONFLICT, DỪNG
  │    ├─ Tìm thấy, PROCESSING, đã treo (≥ 2 phút) → tryReclaim() → thành công → sang Bước 2
  │    │                                                          → thất bại (race) → 409, DỪNG
  │    └─ Tìm thấy, FAILED → tryReclaim() → sang Bước 2
  │
  ▼
Bước 2 — BUSINESS TRANSACTION (1 transaction atomic, đúng mô hình hiện có, không đổi)
  │
  ├─ Validate Cart / Customer / Product / Barcode
  ├─ Tính giá + giảm giá (Discount Engine)
  ├─ Xử lý Voucher / Customer Point
  ├─ Tạo Invoice (kèm snapshot)
  ├─ Tạo Payment
  ├─ Gọi InventoryDomainService (bỏ qua SERVICE product — §12)
  ├─ markSucceeded(operationId, invoice.id, payment.id, tx)  ← CÙNG transaction này
  ▼
Commit Bước 2
  │
  ├─ Thành công → xóa Redis Cart (Bước 3, ngoài transaction, như hiện tại)
  └─ Thất bại (exception) → transaction Bước 2 rollback TOÀN BỘ (Invoice/Payment/Inventory/
     markSucceeded đều rollback — row checkout_operations vẫn ở PROCESSING vì nó thuộc Bước 1 đã
     commit riêng) → catch ở Service layer → markFailed(operationId) (transaction/query riêng,
     nhanh) → ném lỗi nghiệp vụ tương ứng cho client
```

**Vì sao không vi phạm "không nested transaction" (SP03):** Bước 1, Bước 2, và `markFailed` (khi
lỗi) là **3 lời gọi `prisma.$transaction()`/query riêng biệt, tuần tự, không lồng nhau** — không
phải 1 transaction cha chứa nhiều transaction con. Đây chính là mô hình Saga đơn giản 2 bước, không
phải nested transaction.

**Trường hợp crash thật giữa Bước 1 và Bước 2 (server chết, không exception nào được catch):** Row
ở lại `PROCESSING` mãi mãi cho tới khi: (a) client retry với đúng key → Bước 1 tự phát hiện quá hạn
2 phút → `tryReclaim()` → cho phép thử lại, hoặc (b) Cleanup Job (§3.3) quét thấy và chuyển
`FAILED` trước, dọn dẹp theo Retention Policy sau đó.

### 13.3 Response khi trả lại kết quả cũ (duplicate request)

Khi Bước 1 phát hiện `SUCCEEDED` + hash khớp: gọi `InvoiceService.getById(invoiceId)` +
`PaymentService.getById(paymentId)`, dựng lại đúng `CheckoutResponseDto`, trả về **status 200**
(không phải 201 — đây không phải lần tạo mới) kèm header `Idempotency-Replayed: true` để client
phân biệt được (không bắt buộc theo AR11, nhưng là thực hành tốt — SPEC ghi nhận, Implementation
Plan quyết định có làm hay không vì không phải yêu cầu bắt buộc).

## 14. Transaction Propagation (Decision SP03 — mục riêng bắt buộc)

**Nguyên tắc:**

1. **Domain Service không tự mở transaction mới khi nhận `tx` từ caller.** Mọi Domain Service liên
   quan (`InventoryDomainService`, `CustomerDomainService`, `CartDomainService`,
   `CustomerPointDomainService`) nhận tham số `tx?: Prisma.TransactionClient` (hoặc bắt buộc với
   Inventory, đã đúng hiện trạng) và dùng **trực tiếp** `tx.model.method()` — không gọi
   `this.prisma.$transaction()` bên trong khi đã có `tx` truyền vào.
2. **Repository dùng đúng transaction context được truyền.** Pattern hiện có (`tx?:
   Prisma.TransactionClient`, dùng `tx ?? this.prisma`) tiếp tục áp dụng cho `InvoiceService`/
   `PaymentService`/`ICheckoutOperationRepository.markSucceeded` — tất cả đều nhận `tx` và ghi vào
   đúng transaction đó, không tự mở transaction riêng khi đang nằm trong luồng Checkout.
3. **Không có nested transaction ngoài chủ đích của Prisma** — nghĩa là:
   - **Đúng 1** `prisma.$transaction()` cấp cao nhất cho toàn bộ "Bước 2 — Business Transaction"
     (§13.2), do `CheckoutService` mở — giữ nguyên mô hình hiện có, không đổi.
   - "Bước 1 — Reserve" và "markFailed" (khi lỗi) là **transaction/query độc lập, KHÔNG lồng vào**
     Bước 2 — chúng chạy TRƯỚC (Bước 1) hoặc SAU KHI Bước 2 đã rollback xong (markFailed) — không
     bao giờ đồng thời "đang mở" cùng lúc với Bước 2. Đây là 2-3 transaction **tuần tự**, không
     phải **lồng nhau** — không vi phạm nguyên tắc.
   - `Prisma.TransactionClient` (`tx` bên trong `$transaction(async (tx) => {...})`) tự nó KHÔNG
     được dùng để mở thêm `tx.$transaction()` con — không module nào trong T013 làm việc này (đã
     rà soát `checkout.service.ts` hiện tại, xác nhận không có nested call).
4. **`prisma.$transaction()` isolation level:** giữ mặc định (`ReadCommitted`, mặc định của Prisma/
   Postgres) — đủ cho mô hình hiện tại vì `InventoryDomainService`/`ICheckoutOperationRepository`
   đã tự bảo vệ bằng compare-and-swap (`updateMany` + check `count`), không dựa vào isolation level
   cao hơn để đảm bảo đúng.

## 15. Test

1. Checkout thành công (happy path) — regression, giữ nguyên.
2. Checkout trừ tồn đúng một lần — giữ.
3. Idempotency — cùng key + cùng payload → trả kết quả cũ (status 200), không tạo Invoice/Payment
   mới, không trừ tồn/consume voucher/point lần 2.
4. Idempotency — cùng key + payload khác → `409 CHECKOUT_IDEMPOTENCY_KEY_REUSED`.
5. Idempotency — 2 request đồng thời cùng key (giả lập qua mock `create()`/`tryReclaim()` ném xung
   đột ở lần gọi thứ 2) → chỉ 1 Invoice/Payment/Inventory movement, request thứ 2 nhận `409
   CHECKOUT_IDEMPOTENCY_CONFLICT`.
6. Idempotency — Bước 2 (business transaction) thất bại hoàn toàn (vd hết tồn kho) → row
   `checkout_operations` chuyển `FAILED` (không rollback vì nó thuộc transaction riêng đã commit ở
   Bước 1) → retry ngay với cùng key → `tryReclaim()` thành công → tạo được Invoice ở lần thử thứ 2.
7. **[SP10] Network timeout sau commit** — mô phỏng: Bước 2 commit thành công (Invoice/Payment/
   Inventory/markSucceeded đều đã ghi) nhưng response bị mất do timeout mạng (client không nhận
   được) → client tự động retry với CÙNG key → Bước 1 tìm thấy `SUCCEEDED` → trả lại đúng Invoice
   cũ, KHÔNG tạo giao dịch mới.
8. **[SP10] PROCESSING recovery** — mô phỏng row `PROCESSING` với `createdAt` giả lập quá 2 phút
   (không có business transaction nào chạy tiếp — giả lập crash thật) → gọi lại checkout cùng key
   → `tryReclaim()` phát hiện quá hạn → cho phép xử lý lại như request mới → tạo Invoice thành công.
9. **[SP10] Expired idempotency key** — row đã bị Cleanup Job xóa (giả lập `expiresAt` trong quá
   khứ + gọi `deleteExpired()`) → gọi lại checkout cùng key → được coi là request hoàn toàn mới
   (không tìm thấy row cũ) → tạo Invoice mới bình thường, không lỗi.
10. SERVICE product không trừ tồn, có mặt trên Invoice/Payment — mới.
11. **Mixed cart (physical + service)** — 1 giỏ hàng có cả 2 loại → chỉ dòng physical bị trừ tồn,
    dòng service không — mới (Decision SP06).
12. Customer ACTIVE/INACTIVE/ARCHIVED — giữ.
13. Money calculation đúng (Discount Engine) — giữ, không viết lại.
14. Snapshot — Invoice/InvoiceItem lưu đúng tại thời điểm checkout; sửa Product/Customer sau đó
    không ảnh hưởng Invoice cũ đã đọc lại — mới, phân biệt rõ field Mandatory (luôn kiểm tra) và
    Conditional (chỉ kiểm tra khi có dữ liệu, vd có Barcode).
15. Cross-organization/cross-branch bị chặn — giữ.
16. Repository Boundary Architecture Test — `cart`/`invoice`/`payment`/`customer-point` (4 file
    mới).
17. Audit Log — giữ.
18. Invoice Number Generator — dùng đúng `Branch.invoicePrefix`, fallback `'HD'`, sequence độc lập
    theo branchId — mới.
19. Full regression, Build, Typecheck, Lint, Prisma validate.
20. **[SP11] GitHub Backend CI phải PASS** sau khi Implementation hoàn tất (không chỉ local).

## 16. Acceptance Criteria

| # | Tiêu chí |
|---|---|
| 1 | Build/Lint/TypeCheck PASS |
| 2 | `POST /checkout` bắt buộc header `Idempotency-Key`, thiếu → `400` |
| 3 | Cùng key + cùng payload → trả kết quả cũ (200, không tạo giao dịch mới) |
| 4 | Cùng key + payload khác → `409` |
| 5 | 2 request đồng thời cùng key → chỉ 1 Invoice/Payment/Inventory movement |
| 6 | Business transaction fail hoàn toàn → row `FAILED`, key retry được ngay |
| 7 | PROCESSING bị treo (crash thật, quá 2 phút) → phục hồi được qua `tryReclaim()` hoặc Cleanup Job |
| 8 | Row hết hạn (`expiresAt`) bị Cleanup Job xóa → key tái sử dụng được như request mới |
| 9 | SERVICE product: có trên Invoice/Payment, KHÔNG trừ tồn/tạo Inventory Movement, kể cả giỏ hàng hỗn hợp |
| 10 | Invoice/InvoiceItem lưu đủ snapshot Mandatory (Customer nếu có/Product/Unit/giá đã áp dụng); Conditional (Barcode) đúng khi có dữ liệu |
| 11 | Invoice Number dùng `Branch.invoicePrefix` (fallback `'HD'`), atomic, không trùng, độc lập theo branch |
| 12 | `CART_REPOSITORY`/`INVOICE_REPOSITORY`/`PAYMENT_REPOSITORY`/`CUSTOMER_POINT_REPOSITORY` không còn trong export module tương ứng; Architecture Test xác nhận |
| 13 | 2 migration độc lập, có rollback, không `DROP` dữ liệu |
| 14 | Regression Baseline (T005-T012) PASS |
| 15 | Integration Test PASS — PENDING nếu không có Docker |
| 16 | End-to-End Acceptance Scenario (RFC v2 §35) chạy được khi có môi trường Docker |
| 17 | **[SP11] GitHub Backend CI (workflow `backend-ci.yml`) phải PASS toàn bộ sau Implementation** — không lặp lại tình huống CI đỏ 3 release liên tiếp (T009/T011/T012) trước khi được phát hiện |
| 18 | **[SP11] Không phát sinh Repository Boundary violation MỚI nào** ngoài 4 vi phạm đã biết và đã sửa (`cart`/`invoice`/`payment`/`customer-point`) — Architecture Test phải bao phủ toàn bộ module mới/sửa trong T013 |

## 17. Risk Register (Decision SP12)

| # | Risk | Impact | Mitigation | Verification |
|---|---|---|---|---|
| 1 | Redis failure (Cart không đọc được) | Không thể checkout hoàn toàn (Cart là draft duy nhất, không có fallback Postgres) | Ngoài phạm vi T013 để "xây fallback" — nhưng phải đảm bảo lỗi Redis trả về lỗi rõ ràng (`5xx` có message), không để checkout treo vô thời hạn hoặc silent-fail | Test: mock Redis timeout/connection error, xác nhận Checkout trả lỗi rõ ràng, không tạo Invoice/Payment dở dang |
| 2 | Concurrent checkout (2 request đồng thời cùng Idempotency-Key) | Có thể tạo 2 Invoice nếu thiết kế sai | Unique constraint DB-level (`organizationId, idempotencyKey`) là lớp bảo vệ cuối cùng, không dựa vào application-level lock | Test #5 (§15) — mô phỏng race, xác nhận chỉ 1 Invoice |
| 3 | Inventory rollback (hết tồn giữa chừng) | Invoice/Payment có thể bị tạo dở dang nếu transaction boundary sai | Giữ nguyên 1 transaction atomic hiện có (đã đúng, không sửa — AR06) | Test #6 (§15, đã có từ trước — regression) |
| 4 | Voucher rollback (voucher bị consume nhưng transaction sau đó fail) | Voucher bị "mất lượt" dù giao dịch không thành | Đã nằm trong CÙNG business transaction (Bước 2, §13.2) — rollback tự động hoàn tác `incrementUsage()` nếu bước sau đó fail — không cần xử lý thêm | Test: giả lập fail sau bước áp voucher (vd hết tồn kho ở bước sau), xác nhận `usedCount` của Voucher không bị tăng sau rollback |
| 5 | PROCESSING recovery (row treo do crash thật) | Idempotency key bị "khóa" vĩnh viễn nếu không có cơ chế phục hồi | `tryReclaim()` (lazy, ngay khi có request mới cùng key) + Cleanup Job (chủ động, định kỳ) — 2 lớp bảo vệ độc lập | Test #8 (§15) cho lazy path; Implementation Plan phải có test riêng cho Cleanup Job (BullMQ) |
| 6 | Cleanup Job tự nó lỗi/không chạy (BullMQ down) | Row tích lũy vô hạn, có thể ảnh hưởng hiệu năng query `checkout_operations` theo thời gian dài | Index `(status, createdAt)` và `(expiresAt)` đã thiết kế sẵn (§3.2) giữ query nhanh dù bảng lớn; không phải rủi ro chặn Release (không ảnh hưởng đúng đắn nghiệp vụ, chỉ ảnh hưởng dọn dẹp) | Không bắt buộc test riêng trong T013 — ghi vào Technical Debt nếu Cleanup Job chưa kịp triển khai đầy đủ trong Implementation |

## 18. Implementation Order — ghi chú (Implementation Plan là tài liệu riêng)

Xem `IMPLEMENTATION-PLAN-T013.md` (tài liệu riêng, theo Decision AD06/SPEC Review AUTHORIZATION mục 3).

## 19. Rollback Plan

- Rollback A: `ALTER TABLE invoices DROP COLUMN "customerCodeSnapshot", DROP COLUMN "customerNameSnapshot", DROP COLUMN "customerPhoneSnapshot"`; tương tự cho 5 cột mới trên `invoice_items`.
- Rollback B: `DROP TABLE "checkout_operations"`.
- Code: nếu Acceptance Criteria không đạt, không merge/commit.
- Repository Boundary: nếu cần rollback, revert export về trạng thái cũ (tạm thời, không khuyến nghị).

## Lịch sử quyết định

- **RFC-T013 v1 (PROPOSED)** — Architect soạn trực tiếp, Type A.
- **`ARCHITECTURE REVIEW — RFC-T013 Sales Foundation`** — phát hiện brownfield trưởng thành, one-shot atomic, không idempotency, Repository Boundary violation, không snapshot.
- **`ARCHITECT RESOLUTION` (AR01-AR18)** — APPROVED WITH DECISIONS.
- **RFC-T013 v2** — Claude Code cập nhật theo AR01-AR17.
- **SPEC-T013-SALES-FOUNDATION-001 v1** — Claude Code soạn theo AR18, đề xuất Option A cho Idempotency (thiết kế 1-transaction, sau này phát hiện không đáp ứng được PROCESSING recovery thật).
- **`ARCHITECT REVIEW — SPEC-T013-SALES-FOUNDATION-001` (Decision SP01-SP12 + Decision AD07)** — APPROVED WITH REQUIRED REVISIONS: SP01 yêu cầu schema đầy đủ + retention/cleanup/recovery cho `checkout_operations`; SP02 (ngầm định qua yêu cầu PROCESSING recovery) buộc tách 2-transaction; SP03 yêu cầu mục Transaction Propagation riêng; SP04 xác nhận 4 Repository Boundary fix + Architecture Test bắt buộc; SP05 xác nhận Invoice Number đúng hướng; SP06 yêu cầu chi tiết SERVICE product + mixed cart; SP07 yêu cầu phân loại Snapshot Mandatory/Conditional; SP08 xác nhận tách migration đúng; SP09 xác nhận API Compatibility đúng; SP10 bổ sung 3 test (timeout+retry, PROCESSING recovery, expired key); SP11 bổ sung Acceptance (CI PASS, không Repository Boundary violation mới); SP12 yêu cầu Risk Register. Decision AD07 (Checkout Command Pattern) ban hành mới, ghi vào `AI_WORKFLOW.md`. AUTHORIZATION: cập nhật SPEC theo SP02/SP03/SP07/SP10/SP11/SP12 (SP01/SP04-SP06/SP08/SP09 đã đúng hướng, chỉ cần chi tiết hóa), ghi nhận AD07, sau đó viết `IMPLEMENTATION-PLAN-T013.md`.
- **SPEC-T013-SALES-FOUNDATION-001 v2** (tài liệu này) — Claude Code cập nhật theo SP01-SP12, thiết kế lại Idempotency thành 2-transaction (reserve tách khỏi business transaction) để PROCESSING recovery khả thi thật sự, thêm Transaction Propagation (§14), Snapshot Classification (§1.3), Risk Register (§17), mở rộng Test (§15)/Acceptance (§16).
