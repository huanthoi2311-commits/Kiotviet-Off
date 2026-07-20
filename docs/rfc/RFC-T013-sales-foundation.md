# RFC-T013 — Sales Foundation

**Status:** APPROVED WITH DECISIONS (AR01-AR18) — v2, cập nhật theo `ARCHITECT RESOLUTION — RFC-T013 SALES FOUNDATION`.
**Task:** T013
**Module Type:** TYPE A — BUSINESS CRITICAL
**Author:** Architect (v1) · Claude Code cập nhật v2 theo ủy quyền tường minh (AR18, mục 1)
**Project Mode:** Offline Single-Computer POS System
**Nguồn:** RFC-T013 v1 (Architect) → `ARCHITECTURE REVIEW — RFC-T013 Sales Foundation` (Claude Code, `docs/architecture/T013-architecture-review.md`) → `ARCHITECT RESOLUTION` (AR01-AR18, APPROVED WITH DECISIONS) → RFC-T013 v2 (tài liệu này).

---

## 0. CONTEXT

Master Data Foundation đã hoàn thành:

- Product
- Category
- Brand
- Unit
- Barcode
- Customer
- Supplier

T013 bắt đầu giai đoạn Core Business Flow.

Sales Foundation phải cung cấp nền tảng bán hàng chính xác, có thể kiểm toán,
và đủ ổn định để các task sau mở rộng:

- T014 Sales Return
- T017 Debt Ledger
- T018 Cashbook
- T019 Inventory Completion
- T020 Reports
- T021 Invoice Printing

T013 là module Type A.

Phải tuân thủ quy trình đầy đủ (Decision AD06):

RFC → Architecture Review → Architect Resolution → RFC Revision → SPEC → SPEC Review
→ Implementation Plan → Plan Review → Implementation → Implementation Report
→ Final Release Review → Commit → Tag

**[AR01] Xác nhận Brownfield bắt buộc:** Architecture Review phát hiện Cart (Redis), Checkout,
Invoice, Payment, Inventory integration, Discount engine **đã tồn tại và chạy thật** từ Sprint-00.
T013 **phải là Brownfield Evolution** — không được thay thế toàn bộ kiến trúc hiện có.

## 1. PURPOSE

Sales Foundation quản lý toàn bộ vòng đời của một giao dịch bán hàng cơ bản:

- ~~Tạo hóa đơn nháp.~~ **[AR02]** Tạo/soạn giỏ hàng (Cart, Redis) — đây là "Draft" thật của hệ
  thống, không phải Invoice.
- Thêm hoặc cập nhật dòng hàng — **thực hiện trên Cart** (đã có sẵn: `POST/PATCH/DELETE /cart`).
- Áp dụng giá bán và giảm giá — qua Discount Engine hiện có (Manual/Voucher/Promotion/Member).
- Chọn khách hàng.
- Ghi nhận thanh toán ban đầu.
- **[AR03/AR14]** Hoàn tất giao dịch qua Checkout — sinh Invoice **bất biến** (immutable), không
  còn khái niệm "hoàn tất hóa đơn" tách rời khỏi Checkout.
- ~~Hủy hóa đơn khi được phép.~~ **[AR12]** Hủy = xóa/bỏ Cart trước khi Checkout — không hủy Invoice
  (Invoice chỉ tồn tại sau khi Checkout đã thành công).
- Đọc và tìm kiếm lịch sử bán hàng.
- Phát sinh Inventory Movement khi Checkout thành công (đã có, qua `InventoryDomainService`).
- Chuẩn bị dữ liệu cho công nợ, thu chi, trả hàng và báo cáo.

Sales Invoice là source of truth của giao dịch bán hàng.

Sales Invoice không phải source of truth cuối cùng của:

- Số dư tồn kho.
- Số dư công nợ khách hàng.
- Số dư tiền mặt.
- Doanh thu báo cáo tổng hợp.

Các nguồn sự thật tương ứng sẽ thuộc:

- Inventory Ledger / Inventory Single Writer.
- Debt Ledger.
- Cashbook.
- Reporting Projection.

## 2. SCOPE

T013 bao gồm:

- ~~Sales Invoice aggregate.~~ **[AR04]** Checkout tiếp tục là Aggregate Root — không tạo aggregate
  mới tên `SalesInvoice`. Invoice là **kết quả** (immutable record) của Checkout.
- ~~Sales Invoice Item.~~ **[AR14]** `InvoiceItem` — bổ sung snapshot field, không có API
  Add/Update/Remove riêng (mọi chỉnh sửa dòng hàng diễn ra trên Cart).
- Sales payment allocation ban đầu — **đã có** (Payment được tạo trong cùng transaction Checkout).
- ~~Draft workflow.~~ **[AR02/AR12]** Draft = Cart (Redis), đã có sẵn — không xây thêm bảng Draft
  Postgres.
- Checkout/finalization workflow — **Evolution** của `CheckoutService` hiện có, không viết lại.
- ~~Cancel workflow.~~ **[AR12]** Cancel = xóa/bỏ Cart (đã có `DELETE /cart`) — không có "cancel
  Invoice" trong phạm vi T013.
- Customer validation — đã có (`CustomerDomainService.findActiveById`).
- Product/Barcode/Unit validation.
- Price and discount calculation — **đã có** (Discount Engine cascading Manual/Voucher/Promotion/
  Member).
- Tax calculation ở mức cơ bản — đã có (`Product.vat` snapshot ở Cart item).
- Inventory deduction thông qua Inventory Single Writer — **đã có, đúng chuẩn**, chỉ bổ sung
  SERVICE-product exemption (AR06/AR16).
- Initial payment recording — đã có.
- Remaining amount calculation — `Invoice.dueAmount` đã có field, hiện luôn `0` (checkout luôn thu
  đủ) — SPEC sẽ làm rõ có mở rộng partial payment trong T013 hay để nguyên.
- Search, filter, pagination — đã có cho Invoice.
- Permissions.
- Audit Log — đã có (`checkout.completed`).
- ~~Optimistic Lock.~~ **[AR08/AR14]** Không áp dụng cho Invoice (bất biến, không update). Áp dụng
  cho Inventory (đã có) và cho cơ chế Idempotency mới (AR11).
- **[AR11] Idempotency cho thao tác Checkout — MANDATORY, ưu tiên hàng đầu của T013.**
- Transaction boundary — giữ nguyên mô hình 1 transaction (AR15), bổ sung bước validate
  idempotency.
- REST API.
- Swagger.
- Unit tests.
- Integration tests.
- Architecture tests — bổ sung cho Repository Boundary (AR07/AR13).
- Migration và rollback — bổ sung cột (snapshot, idempotency), không đổi cấu trúc bảng hiện có.
- Documentation.

## 3. OUT OF SCOPE

Không thực hiện trong T013:

- Sales Return.
- Exchange workflow.
- Customer Debt Ledger đầy đủ.
- Debt collection.
- Customer statement.
- Cashbook hoàn chỉnh.
- Shift management.
- Cash drawer management.
- Loyalty point calculation mới — **Evolution, không đổi cơ chế Customer Point hiện có** (chỉ sửa
  Repository Boundary theo AR07).
- ~~Promotion engine.~~ ~~Coupon engine.~~ **[AR01/AR05, đúng tiền lệ Decision SR04 của T012]**
  "Out of Scope" nghĩa là **không xây mới** — Discount Engine (Manual/Voucher/Promotion/Member)
  **đã tồn tại và tiếp tục hoạt động nguyên trạng** (Evolution), không phải "không được có". T013
  không mở rộng thêm loại discount mới, không sửa `DiscountEngineService`.
- Complex tax engine.
- Delivery/shipping.
- Online order.
- Marketplace integration.
- E-commerce.
- Multi-currency.
- Installment payments.
- Commission.
- Sales quotation.
- Sales order reservation nâng cao.
- Batch/lot/expiry.
- Serial number.
- Invoice printing layout.
- Electronic invoice integration.
- Cloud sync.
- Offline multi-device sync.

T014 sẽ xử lý Sales Return.

T017 sẽ xử lý Debt Ledger.

T018 sẽ xử lý Cashbook.

T021 sẽ xử lý Invoice Printing.

## 4. BROWNFIELD REQUIREMENT

**[AR01/AR05] Đã xác nhận qua Architecture Review + Resolution — không còn là yêu cầu audit, mà
là kết luận chính thức:**

Repository hiện có đã có:

- Cart (Redis) — draft thật.
- Checkout — aggregate root thật, 1 transaction atomic.
- Invoice — immutable document, tạo bởi Checkout, không update/delete.
- Payment — tương tự Invoice.
- Inventory integration — Single Writer thật (`InventoryDomainService`, SPEC-INV-001).
- Discount engine — cascading đa nguồn thật.
- Customer Point — event-based, đúng ADR-0009 nhưng có Repository Boundary violation.

**[AR05] Phương án đã chọn: OPTION 1 — Evolution.** Không chọn Option 2 (song song 2 mô hình) hay
Option 3 (thay thế hoàn toàn) — lý do: rủi ro migration lớn, phá regression, phá test hiện có.

- Không rewrite toàn bộ.
- Không tạo aggregate trùng (`SalesInvoice` — đã loại bỏ, xem AR04).
- Không tạo API trùng.
- Không tạo bảng trùng.
- Ưu tiên Evolution.
- Bảo toàn dữ liệu.
- Bảo toàn hành vi đang hoạt động nếu không trái business invariant.

## 5. AGGREGATE

~~Aggregate Root đề xuất: SalesInvoice~~

~~Child Entity: SalesInvoiceItem~~

**[AR02/AR04] Aggregate Root xác nhận: `Checkout`** (giữ nguyên, không đổi tên, không tạo mới).

```
Cart (Redis, Draft)
      ↓
Checkout (Aggregate Root — orchestrator, 1 transaction atomic)
      ↓
Invoice (immutable, kết quả của Checkout — KHÔNG phải Draft, KHÔNG phải Aggregate Root)
      ↓
Payment (immutable, kết quả của Checkout)
```

Invoice/InvoiceItem là **entity con của kết quả Checkout**, không phải aggregate độc lập có thể
CRUD riêng.

Checkout/Invoice thuộc:

- Một Organization.
- Một Branch.
- Một người tạo.
- Có thể có hoặc không có Customer.

Không được tạo Invoice xuyên Organization hoặc Branch.

InvoiceItem không được truy cập hoặc sửa độc lập ngoài Invoice (đã đúng hiện trạng — không đổi).

## 6. MAIN FIELDS — INVOICE

~~Tối thiểu: ... status ... completedAt ... cancelledAt ... cancelReason ... version~~

**[AR08/AR14] Điều chỉnh — Invoice không có lifecycle riêng (không DRAFT/COMPLETED/CANCELLED,
không `completedAt`/`cancelledAt`/`cancelReason`/`version`).** Field thực tế cần bổ sung (SPEC sẽ
chốt migration cụ thể):

Đã có (giữ nguyên tên, không rename — Decision `AR01`/nguyên tắc "không rename gây breaking
change"):

- id
- organizationId
- branchId
- orderId (giữ `null`, không đụng tới — Order Module ngoài phạm vi)
- customerId
- code (invoice number — xem §9)
- status (`InvoiceStatus`: UNPAID/PARTIAL/PAID/CANCELLED — **giữ nguyên, là Payment Status, không
  đổi thành lifecycle** — AR08)
- totalAmount
- paidAmount
- dueAmount
- dueDate
- createdBy, createdAt, updatedAt

**[AR09/AR17] Bổ sung mới — Snapshot bắt buộc** (SPEC sẽ chốt tên cột cụ thể):

- customerCodeSnapshot / customerNameSnapshot / customerPhoneSnapshot (nếu có Customer)
- Giá bán đã áp dụng ở mức Invoice (subtotal/discount tổng nếu cần hiển thị lại đúng như lúc tạo)

Không thêm `version` (Invoice bất biến, không có thao tác update để cần Optimistic Lock).

## 7. MAIN FIELDS — INVOICE ITEM

**[AR09/AR17] Snapshot là bắt buộc** — Đã có (giữ nguyên):

- id
- invoiceId
- productId
- quantity
- unitPrice
- discount
- taxAmount
- totalAmount
- createdAt

**Bổ sung mới (SPEC sẽ chốt migration cụ thể):**

- barcodeId (nếu dùng barcode để thêm hàng)
- productCodeSnapshot / productNameSnapshot
- barcodeSnapshot (nếu có)
- unitNameSnapshot
- costSnapshot — nếu cần cho báo cáo lợi nhuận sau này (T020), đánh giá trong SPEC

~~unitId~~ ~~baseQuantity~~ **Ghi chú quan trọng:** Architecture Review xác nhận **Product hiện tại
chỉ có 1 `unitId` cố định, không có bảng unit-conversion nào (`UnitConversion`/`ProductUnit` không
tồn tại)**. SPEC phải quyết định: (a) hoãn multi-unit/conversion sang Task khác vì đây là thay đổi
Product Foundation chứ không phải Sales Foundation, hoặc (b) chỉ snapshot `unitNameSnapshot` từ
Product.unit hiện có (1-1), không xây conversion. Không tự xây bảng conversion mới trong T013 nếu
Architect không xác nhận riêng.

Snapshot là bắt buộc với các thông tin cần giữ lịch sử. Việc sửa Product/Customer sau này **không
được** thay đổi nội dung hóa đơn cũ (AR17).

## 8. LIFECYCLE

~~SalesInvoiceStatus tối thiểu: DRAFT / COMPLETED / CANCELLED~~
~~Allowed transitions: DRAFT → COMPLETED, DRAFT → CANCELLED~~

**[AR02/AR08/AR12] Thay thế hoàn toàn bằng mô hình thực tế đã được Architect xác nhận:**

```
Cart tồn tại (Redis)         = "Draft" — có thể sửa (add/update/remove item), có thể xóa (Cancel)
      │
      ▼ Checkout thành công (1 transaction atomic)
Invoice được tạo             = trạng thái cuối, bất biến — KHÔNG có COMPLETED/CANCELLED transition
                                trên chính Invoice
```

- Không có field lifecycle status trên Invoice — `InvoiceStatus` hiện có (UNPAID/PARTIAL/PAID/
  CANCELLED) là **Payment Status**, giữ nguyên ý nghĩa, không đổi thành lifecycle (AR08).
- "Hủy" trong T013 = xóa Cart trước khi Checkout (đã có `DELETE /cart`), **không phải** hủy một
  Invoice đã tạo.
- Hủy Invoice đã tạo (COMPLETED cancellation theo cách hiểu RFC v1) **không thuộc T013** — nếu cần
  trong tương lai (hoàn tiền, huỷ giao dịch sau khi đã trừ tồn/thu tiền), đó là phạm vi T014 (Sales
  Return) hoặc một Task riêng, vì ảnh hưởng Inventory/Payment/Debt/Reports (đúng RFC v1 §23 gốc,
  vẫn đúng).

## 9. INVOICE NUMBER

invoiceNumber (`Invoice.code`):

- Mandatory stored value — đã đúng hiện trạng.
- Organization scoped — đã đúng (`@@unique([organizationId, code])`).
- Không được trùng — đã đúng.
- Không được thay đổi sau khi tạo — đã đúng (Invoice bất biến).
- Phải sinh tự động, atomic, concurrency safe — đã đúng (`Sequence` table upsert).
- Không dùng count()+1/MAX() — đã đúng.

~~Ưu tiên tái sử dụng SequenceCodeGeneratorService. Prefix đề xuất: HD.~~

**[AR10] Quyết định cụ thể — khác đề xuất RFC v1:** Invoice Number Generator **phải tái sử dụng
đồng thời cả hai**:

1. `Branch.invoicePrefix` (field đã tồn tại trong schema từ trước, `@@unique([organizationId,
   invoicePrefix])`, hiện **chưa được dùng bởi bất kỳ generator nào**).
2. `SequenceCodeGeneratorService` (đã chuẩn hóa ở T012, Decision SP05).

**Không tạo generator mới** — refactor `SequenceInvoiceCodeGenerator` hiện có (hard-code prefix
`'HD'` toàn Organization) thành adapter mỏng trên `SequenceCodeGeneratorService`, đọc prefix từ
`Branch.invoicePrefix` của branch tương ứng thay vì hằng số cố định. SPEC phải:

- Quyết định sequence có tách theo `branchId` hay vẫn theo `organizationId` (ảnh hưởng tên
  `sequenceName` truyền vào `SequenceCodeGeneratorService`).
- Xử lý trường hợp `Branch.invoicePrefix` là `null` (branch chưa cấu hình prefix) — fallback hợp
  lý (SPEC quyết định, có thể dùng `'HD'` làm default).
- Đảm bảo `BRANCH_INVOICE_PREFIX_CONFLICT` (`BRANCH_004`, error code đã tồn tại nhưng chưa dùng)
  được áp dụng đúng chỗ nếu liên quan.

## 10. CUSTOMER RULES

Customer là optional để hỗ trợ khách lẻ.

Nếu không có customerId:

- Sử dụng khách lẻ mặc định hoặc snapshot khách lẻ theo convention hiện tại.
- Không tạo Customer mới tự động.

Nếu có customerId:

- Customer phải thuộc cùng Organization.
- Customer phải ACTIVE — **đã đúng hiện trạng** (`CustomerDomainService.findActiveById`, đúng
  BR04).
- Customer ARCHIVED hoặc INACTIVE không được dùng cho hóa đơn mới — đã đúng.
- Phải dùng CustomerDomainService — đã đúng.
- Không inject Customer Repository trực tiếp — đã đúng (không vi phạm, khác `cart`/`invoice`/
  `payment`/`customer-point`).

Customer data cần thiết phải được snapshot khi Checkout thành công (AR09/AR17).

## 11. PRODUCT / BARCODE / UNIT RULES

Mọi dòng hàng phải tham chiếu tới Product hợp lệ.

Product:

- Cùng Organization.
- Không ARCHIVED.
- Được phép bán (`allowSale` — đã có, Cart đã check).
- **[AR06/AR16] Product dịch vụ (`ProductType.SERVICE`, đã tồn tại trong schema) không trừ tồn
  kho.** Architecture Review xác nhận: hiện tại Checkout **chưa** check `product.type === 'SERVICE'`
  trước khi gọi `InventoryDomainService.decrease()` — đây là gap thật, phải sửa trong T013 (task
  implementation nhỏ, không phải thiết kế lại Inventory).

Barcode:

- Nếu sử dụng, phải thuộc đúng Product.
- Phải cùng Organization.
- Không ARCHIVED.

Unit:

- Phải thuộc Product hoặc conversion hợp lệ — xem ghi chú §7 (không có conversion infrastructure
  sẵn có, SPEC quyết định phạm vi).
- Phải cùng Organization.
- Không ARCHIVED.

Các module khác phải được gọi qua Domain Service hoặc public API đúng boundary. Không inject
repository của Product, Barcode hoặc Unit trực tiếp — **đã đúng hiện trạng** (Cart dùng
`ProductDomainService`).

## 12. QUANTITY RULES

quantity:

- Phải lớn hơn 0. Không cho quantity bằng 0/âm trong Sales Foundation. Số lượng trả hàng thuộc
  T014.

~~baseQuantity — tính theo unit conversion.~~ Không áp dụng nếu SPEC quyết định hoãn unit
conversion (xem §7/§11).

Không sử dụng floating-point JavaScript trực tiếp cho phép tính tiền/lượng — **đã đúng hiện trạng**
(`Prisma.Decimal` dùng xuyên suốt Cart/Discount Engine/Checkout).

## 13. MONEY RULES

Tất cả giá trị tiền dùng Decimal — **đã đúng hiện trạng** (`Prisma.Decimal`, làm tròn 2 chữ số có
cấu trúc trong `DiscountEngineService.clamp()`).

Không để client gửi grandTotal làm source of truth — **đã đúng** (CheckoutDto không nhận
`items`/`totalAmount` từ client, toàn bộ tính từ Cart + Discount Engine).

Server phải tự tính subtotal/lineDiscountTotal/taxTotal/grandTotal/outstandingAmount — đã đúng.

## 14. PRICE RULES

Giá bán mặc định lấy từ `ProductPrice` (type `RETAIL`) — đã đúng hiện trạng (Cart Service).

Client hiện tại **không có** cơ chế override giá theo dòng hàng — RFC v1 giả định có permission
này nhưng Architecture Review xác nhận **chưa tồn tại**. SPEC quyết định có xây trong T013 hay
hoãn (không có yêu cầu nghiệp vụ cụ thể nào trong AR01-AR18 yêu cầu xây mới tính năng này).

## 15. DISCOUNT RULES

~~T013 hỗ trợ mức cơ bản: Line discount, Invoice discount. Không hỗ trợ promotion engine.~~

**[AR01/AR05, xem §3]** Discount Engine hiện có (Manual/Voucher/Promotion/Member, cascading, cùng
`DiscountEngineService`) **giữ nguyên hoàn toàn, không sửa, không mở rộng thêm nguồn discount
mới**. T013 không xây thêm promotion/coupon engine mới — nhưng cũng không tháo gỡ các nguồn đã có
(Promotion/Member) dù Checkout hiện tại chưa thực sự cấp candidate cho 2 nguồn này.

Discount không âm, không vượt giá trị dòng/hóa đơn, có thứ tự tính rõ ràng, server tính lại —
**đã đúng hiện trạng** (`DiscountEngineService.clamp()`, `DISCOUNT_PRIORITY`).

## 16. TAX RULES

Schema hiện tại đã có tax (`Product.vat`, snapshot vào `CartItemEntity.tax`, `InvoiceItem.taxAmount`)
— **giữ mô hình đang dùng, không xây complex tax engine mới.**

## 17. INVENTORY INTEGRATION

Inventory chỉ được cập nhật khi Checkout thành công (trong transaction) — **đã đúng hiện trạng**.

Inventory deduction đi qua `InventoryDomainService` — **đã đúng, không sửa** (AR06 — "đã đúng.
Không sửa").

Không update tồn kho trực tiếp từ Sales Repository/Controller — đã đúng, không vi phạm.

**[AR06/AR16] Bổ sung bắt buộc:** Product loại `SERVICE`:

- Được phép bán, có mặt trên Invoice, có Payment.
- **Không** kiểm tra tồn kho, **không** tạo Inventory Movement, **không** trừ tồn kho.

Nếu không đủ tồn kho (Product không phải SERVICE): Checkout thất bại, không lưu trạng thái một
phần — **đã đúng hiện trạng** (nhờ 1 transaction atomic).

## 18. TRANSACTION BOUNDARY

**[AR15] Giữ mô hình 1 transaction nguyên tử — đã đúng hiện trạng, bổ sung bước Idempotency ở đầu.**
Thứ tự nghiệp vụ bắt buộc (SPEC sẽ mô tả chi tiết kỹ thuật):

1. Validate Idempotency (AR11 — bước mới).
2. Validate Cart.
3. Validate Customer.
4. Validate Product/Barcode.
5. Tính giá và giảm giá (Discount Engine).
6. Xử lý Voucher/Customer Point (nếu có).
7. Tạo Invoice.
8. Tạo Payment.
9. Gọi `InventoryDomainService` (bỏ qua nếu Product là SERVICE).
10. Commit transaction.
11. Xóa Redis Cart **sau khi** commit thành công (đã đúng hiện trạng — không đổi thứ tự).

**Không chuyển các thao tác cốt lõi sang eventual consistency trong T013** (Domain Event vẫn chỉ
publish SAU commit, như hiện tại — không đổi).

## 19. IDEMPOTENCY

**[AR11] MANDATORY — "lỗ hổng kiến trúc nghiêm trọng nhất được phát hiện trong Architecture
Review, phải được xử lý trong T013."**

Hiện trạng (đã xác nhận qua Architecture Review, không suy đoán): `POST /checkout` **không có bất
kỳ cơ chế idempotency nào**. Hai request giống nhau có thể: tạo 2 Invoice, tạo 2 Payment, trừ tồn
kho 2 lần, consume Voucher 2 lần, cộng/trừ Customer Point 2 lần.

**Kiến trúc mục tiêu:**

```
Client
   │
   ├── Idempotency-Key
   │
   ▼
Checkout
   │
   ▼
Validate Idempotency
   │
   ▼
Single Database Transaction
   │
   ├── Invoice
   ├── Payment
   ├── Inventory
   ├── Voucher
   └── Customer Point
   │
   ▼
Commit
   │
   ▼
Clear Redis Cart
```

**Nguyên tắc bắt buộc:**

1. `POST /checkout` phải yêu cầu header `Idempotency-Key`.
2. Key phải được scope tối thiểu theo `organizationId`; có thể mở rộng thêm `branchId` và người
   dùng nếu phù hợp (SPEC quyết định scope chính xác).
3. Cùng key + cùng payload → trả về Invoice đã tạo trước đó, **không** tạo giao dịch mới.
4. Cùng key + payload khác → trả về `409 Conflict`.
5. Hai request đồng thời cùng key → chỉ được phép tạo **một** Invoice, **một** Payment, **một**
   lần trừ tồn kho.
6. **Redis lock hoặc in-memory lock KHÔNG đủ để bảo đảm tính đúng đắn** — lớp bảo vệ cuối cùng
   phải nằm ở cơ sở dữ liệu bằng unique constraint và transaction.
7. Sau khi transaction commit thành công nhưng client timeout/mất kết nối, retry với cùng key phải
   trả về kết quả cũ (không tạo mới).
8. Nếu transaction thất bại hoàn toàn, key có thể được phép retry theo chính sách mô tả rõ trong
   SPEC.

**SPEC phải so sánh 2 hướng thiết kế và đề xuất một phương án (không tự chọn ở bước RFC này):**

- **Option A:** Bảng `CheckoutOperation` chuyên biệt (lưu key, request hash, trạng thái, kết quả
  tham chiếu Invoice/Payment) với unique constraint trên `(organizationId, idempotencyKey)`.
- **Option B:** Gắn metadata idempotency trực tiếp lên `Invoice` (thêm cột `idempotencyKey` +
  unique constraint `(organizationId, idempotencyKey)` trên chính bảng `invoices`).

SPEC phải phân tích ưu/nhược điểm (race condition khi request đầu tiên chưa kịp tạo Invoice nhưng
request thứ hai đã tới, khả năng mở rộng khi thao tác thất bại giữa chừng không tạo được Invoice để
gắn key vào, độ phức tạp migration, khả năng tái sử dụng cho các Checkout-like operation khác trong
tương lai) và đề xuất một phương án cụ thể.

## 20. PAYMENT FOUNDATION

T013 chỉ ghi nhận thanh toán ban đầu tối thiểu — **đã đúng hiện trạng**.

Phương thức thanh toán hiện có: CASH, BANK_TRANSFER, CARD, E_WALLET (`PaymentMethod` enum, rộng
hơn RFC v1 đề xuất — giữ nguyên, không thu hẹp).

`paidAmount` không âm, không vượt `grandTotal` trừ khi có xử lý tiền thừa rõ ràng — hiện tại
Checkout luôn set `paidAmount = finalTotal` (thu đủ 100%) — SPEC quyết định có mở rộng partial
payment (`dueAmount > 0`) trong phạm vi T013 hay giữ nguyên hành vi thu đủ.

**Xác nhận (Architecture Review):** Checkout **không** cập nhật `Customer.currentDebt` — đã sạch,
đúng Decision CR02 (T011), không có conflict cần Architect xử lý ở đây.

## 21. CASHBOOK BOUNDARY

T013 chưa xây Cashbook đầy đủ — **đã đúng hiện trạng**, `CashBook` model tồn tại nhưng không module
nào ghi vào. Không mở rộng trong T013.

## 22. LOYALTY / CUSTOMER POINT

Không mở rộng Loyalty trong T013.

~~Nếu checkout hiện tại đã phát Customer Point Domain Event: Audit và giữ nếu đúng ADR-0009.~~

**[AR07] Xác nhận có vi phạm Repository Boundary — phải sửa trong T013:** `checkout.service.ts`
hiện inject thẳng `CUSTOMER_POINT_REPOSITORY`/`ICustomerPointRepository` (không qua Domain Service
nào). Phải tạo `CustomerPointDomainService` (đúng mẫu `CustomerDomainService` T011,
`SupplierDomainService` T012) và chuyển Checkout sang dùng service này. Publish `POINT_USED_EVENT`
sau commit — giữ nguyên, đúng ADR-0009.

## 23. CANCEL RULES

~~DRAFT có thể CANCELLED... COMPLETED cancellation: không tự triển khai...~~

**[AR12/AR14] Thay thế:** "Cancel" trong T013 = xóa Cart (`DELETE /cart`, đã tồn tại) trước khi
Checkout. Không có khái niệm cancel Invoice trong T013 — Invoice chỉ tồn tại sau khi Checkout
thành công, và Checkout thành công là bất biến. Hủy một Invoice đã tạo (nếu cần trong tương lai)
thuộc phạm vi khác (T014 Sales Return hoặc Task riêng), ngoài phạm vi T013.

## 24. OPTIMISTIC LOCKING

~~Các thao tác bắt buộc version: Update Draft, Add item, Update item, Remove item, Apply invoice
discount, Complete, Cancel Draft.~~

**[AR08/AR14] Điều chỉnh — Invoice không có version/Optimistic Lock** (bất biến, tạo 1 lần, không
update). Optimistic Lock/concurrency protection áp dụng ở:

- Inventory (`InventoryConcurrencyConflictError` — đã có, không đổi).
- Cơ chế Idempotency mới (AR11) — bảo vệ ở tầng DB (unique constraint), không phải version field
  theo nghĩa truyền thống.
- Cart (Redis) — không cần Optimistic Lock kiểu Postgres; TTL + save toàn bộ object là đủ với mô
  hình 1-cart-per-user hiện tại (không đổi).

## 25. REPOSITORY BOUNDARY

**[AR13] Phải khắc phục các vi phạm cụ thể phát hiện qua Architecture Review — không phải nguyên
tắc chung chung nữa, mà là danh sách bắt buộc sửa trong T013:**

1. `CartModule` hiện `exports: [CART_REPOSITORY]` (không export Service nào) — phải đổi sang export
   1 `CartDomainService` (hoặc tái sử dụng `CartService` hiện có nếu đã đủ vai trò public port),
   không export repository token.
2. `InvoiceModule` hiện `exports: [InvoiceService, INVOICE_REPOSITORY]` — phải gỡ
   `INVOICE_REPOSITORY` khỏi exports, chỉ giữ `InvoiceService`.
3. `PaymentModule` hiện `exports: [PaymentService, PAYMENT_REPOSITORY]` — phải gỡ
   `PAYMENT_REPOSITORY` khỏi exports, chỉ giữ `PaymentService`.
4. `CheckoutService` hiện inject thẳng `CART_REPOSITORY`/`ICartRepository` VÀ
   `CUSTOMER_POINT_REPOSITORY`/`ICustomerPointRepository` — phải chuyển cả hai sang Domain
   Service tương ứng (CartDomainService mới, CustomerPointDomainService mới — AR07).

Các module chỉ giao tiếp qua Domain Service hoặc public application service — không dùng
`forwardRef()` nếu chưa có Architect approval. Nếu phát sinh circular dependency: dừng, báo cáo, đề
xuất Persistence/Reference Module hoặc event-based integration.

## 26. REPOSITORY REQUIREMENTS

~~createDraft, updateDraftWithVersion, replaceOrUpdateItemsWithVersion, completeWithVersion,
cancelWithVersion~~

**[AR03/AR14] Loại bỏ toàn bộ method liên quan tới Draft/version trên Invoice** — không còn ý
nghĩa vì Invoice bất biến, "Draft" là Cart (đã có method `findByUserId`/`save`/`delete` trên
`ICartRepository`, không đổi).

Repository thực tế cần cho T013 (giữ những gì đã có + bổ sung cho Idempotency):

- `IInvoiceRepository`: giữ `create`/`findById`/`search` hiện có, không thêm update/delete.
- `IPaymentRepository`: giữ nguyên hiện có.
- Idempotency repository mới (tên cụ thể tùy Option A/B ở §19 — SPEC quyết định): tối thiểu cần
  `findByKey(organizationId, idempotencyKey)`, `create(...)` trong cùng transaction với Invoice.
- `existsByInvoiceNumber`/`count` — đã có qua `create()` (dùng `@@unique` bắt P2002), không cần
  thêm method riêng nếu SPEC xác nhận cách hiện tại đã đủ.

Mọi read/write phải scope theo `organizationId`/`branchId` khi phù hợp — đã đúng hiện trạng.

## 27. SEARCH AND FILTER

Search tối thiểu: invoiceNumber, customer name/phone snapshot (sau khi có snapshot — AR09), product
code/name nếu query hỗ trợ.

Filter: status (Payment Status), branchId, customerId, createdAt range, createdBy, payment method
nếu có.

Default sort: `createdAt DESC`. Pagination theo convention hiện tại — `InvoiceQueryDto` đã có nền
tảng, SPEC bổ sung field filter còn thiếu.

## 28. API

~~Route gốc đề xuất: /sales-invoices, POST/PATCH/POST items/PATCH items/DELETE items/POST
complete/POST cancel~~

**[AR03/AR04/AR14] Không tạo route `/sales-invoices`.** Giữ nguyên route hiện có:

| Route hiện có | Thay đổi trong T013 |
|---|---|
| `POST /checkout` | Bắt buộc thêm header `Idempotency-Key` (AR11). Không đổi payload cấu trúc chính (branchId/warehouseId/customerId/paymentMethod/voucherCode/pointsToUse/manualDiscount), trừ khi SPEC phát hiện cần trường mới. |
| `GET /invoices`, `GET /invoices/:id` | Không đổi route, có thể mở rộng response DTO với snapshot field mới. |
| `GET /payments`, `GET /payments/:id` | Không đổi. |
| `POST/GET/PATCH/DELETE /cart` | Không đổi — đây chính là nơi "add/update/remove item" của Sales Foundation diễn ra (AR02). |

Không tự tạo route trùng `/orders`/`/sales` — `Order` model ngoài phạm vi T013 (AR01, giữ
`orderId` luôn `null`).

## 29. PERMISSIONS

Permission hiện có liên quan: `pos:access` (guard `POST /checkout`), `invoice:view`,
`payment:view`, `payment:create` (đã seed nhưng chưa có route dùng).

RFC v1 đề xuất `sales:create/read/update/complete/cancel/override-price/apply-discount` — vì mô
hình Aggregate đã đổi (Checkout, không phải SalesInvoice CRUD), phần lớn các permission này **không
còn khớp với route thực tế** (không có route "update draft"/"complete"/"cancel" riêng theo mô hình
RFC v1). SPEC phải chốt permission cụ thể dựa trên route thực tế ở §28 — khả năng cao chỉ cần giữ
`pos:access` cho checkout, không cần bộ `sales:*` đầy đủ như RFC v1 đề xuất, trừ khi Architecture
Review SPEC phát hiện nhu cầu khác.

## 30. ERROR CASES

Tối thiểu (điều chỉnh theo mô hình thực tế):

- Sales invoice not found.
- ~~Duplicate invoice number~~ — vẫn giữ (unique constraint), nhưng hiếm khi xảy ra do generator
  atomic.
- ~~Invalid status transition~~ — loại bỏ, không có transition trên Invoice.
- ~~Version conflict~~ (trên Invoice) — loại bỏ. Version conflict vẫn áp dụng cho Inventory (đã có).
- Empty invoice (Cart trống) — đã có (`CHECKOUT_EMPTY_CART`).
- Invalid quantity/price/discount.
- Customer not usable.
- Product not usable.
- Barcode invalid for product.
- Unit invalid for product.
- Insufficient inventory — đã có (`CHECKOUT_INSUFFICIENT_STOCK`).
- Payment exceeds allowed amount.
- ~~Invoice already completed/cancelled~~ — loại bỏ, không áp dụng.
- Cross-organization/cross-branch access.
- **[AR11] Mới:** Idempotency key conflict (cùng key, payload khác) → `409`. Idempotency key
  duplicate với cùng payload → trả kết quả cũ, không phải lỗi.

Tên error code phải theo catalog hiện tại (`CHECKOUT_xxx`, `INVOICE_xxx`, `CART_xxx`,
`PAYMENT_xxx`).

## 31. AUDIT LOG

Audit bắt buộc — **đã có** cho `checkout.completed`. SPEC xác nhận có cần bổ sung action nào khác
(vd audit riêng cho idempotency-conflict?) hay giữ nguyên.

## 32. DOMAIN EVENTS

~~SalesInvoiceCreated / SalesInvoiceCompleted / SalesInvoiceCancelled~~

**Đã có, giữ nguyên tên:** `CHECKOUT_COMPLETED_EVENT`, `CHECKOUT_FAILED_EVENT` (module
`checkout`), `POINT_USED_EVENT` (module `customer-point`). Không đổi tên event chỉ để khớp RFC v1 —
đúng nguyên tắc "không rename gây breaking change". Không tạo event mới không có consumer thật.

## 33. MIGRATION PRINCIPLES

Không tạo bảng trùng `Sale`/`Order`/`Invoice` mới — chỉ **thêm cột** vào bảng hiện có:

- `invoices`/`invoice_items`: snapshot fields (AR09/AR17).
- Bảng/cột mới cho Idempotency (Option A hoặc B, SPEC quyết định — §19).

Mỗi migration có rollback, backfill deterministic (nếu cần backfill snapshot cho dữ liệu cũ — SPEC
quyết định có cần không, dự án chưa có dữ liệu production thật nên rủi ro thấp). Migration không
chạy thật trong giai đoạn RFC/SPEC.

## 34. TEST REQUIREMENTS

Điều chỉnh theo mô hình thực tế (loại bỏ test không còn ý nghĩa, bổ sung test mới):

~~Add item, Update item, Remove item (trên Invoice)~~ — không cần, Cart đã có test riêng
(`cart.service.spec.ts`).
~~Double complete bị chặn~~ → đổi thành: **Double checkout với cùng Idempotency-Key bị chặn tạo
Invoice/Payment/Inventory movement thứ hai.**
~~Concurrent complete chỉ một request thành công~~ → đổi thành: **Concurrent checkout cùng
Idempotency-Key, chỉ 1 request tạo được Invoice, request còn lại nhận lại kết quả cũ (không phải
lỗi).**

SPEC sẽ liệt kê đầy đủ danh sách test cuối cùng, tối thiểu phải phủ:

1. Checkout thành công (happy path, có/không Customer, có/không Voucher/Point).
2. Checkout trừ tồn đúng một lần.
3. Idempotency: cùng key + cùng payload → trả kết quả cũ, không tạo mới.
4. Idempotency: cùng key + payload khác → `409`.
5. Idempotency: 2 request đồng thời cùng key → chỉ 1 Invoice/Payment/Inventory movement.
6. Insufficient inventory → rollback toàn bộ (không Invoice/Payment/Inventory dở dang).
7. Service product không trừ tồn (AR06/AR16 — mới).
8. Customer ACTIVE/INACTIVE/ARCHIVED — đã có, giữ nguyên.
9. Product/Barcode ARCHIVED bị chặn.
10. Money calculation đúng (Discount Engine — đã có test, không viết lại).
11. Snapshot không đổi khi Product/Customer đổi sau đó (mới).
12. Cross-organization/cross-branch bị chặn.
13. Repository Boundary Architecture Test — `cart`/`invoice`/`payment`/`customer-point` (mới, đúng
    mẫu T011/T012).
14. Audit Log.
15. Full regression, Build, Typecheck, Lint, Prisma validate.

## 35. ACCEPTANCE PRINCIPLES

T013 chỉ được release khi chứng minh được kịch bản:

- Đăng nhập → chọn chi nhánh → thêm sản phẩm vào Cart (qua Product/Barcode) → nhập số lượng → chọn
  khách hàng hoặc khách lẻ → áp dụng giảm giá hợp lệ (nếu có) → gọi `POST /checkout` với
  `Idempotency-Key` → hệ thống tính tiền, ghi nhận thanh toán, sinh Invoice bất biến → tồn kho giảm
  đúng một lần (trừ Product SERVICE) → hóa đơn đọc lại đúng snapshot → **gọi lại `POST /checkout`
  với cùng `Idempotency-Key` không tạo giao dịch mới** → search thấy hóa đơn → Audit Log tồn tại →
  Regression toàn backend PASS.

## 36. DOCUMENTATION

T013 sau này phải cập nhật: RFC (xong — tài liệu này), Architecture Review (xong), SPEC, Implementation
Plan, Release Note, API documentation, Permission catalog, Error catalog, PROJECT_STATUS,
SPRINT_DASHBOARD, CHANGELOG, Technical Debt, Dependency graph nếu có thay đổi.

## 37. ARCHITECTURE REVIEW QUESTIONS

**Đã trả lời đầy đủ trong `docs/architecture/T013-architecture-review.md`** — 26 câu hỏi, không lặp
lại nội dung ở đây. Tóm tắt các câu trả lời quan trọng nhất đã được phản ánh vào các mục §5, §8,
§17, §19, §25 ở trên.

## 38. STOP CONDITIONS

Đã áp dụng đúng trong Architecture Review — các điều kiện dừng đã được Architect Resolution xử lý
hết (AR01-AR17). Giữ nguyên danh sách cho các Task tương lai (T014+) tham khảo:

- Hai aggregate bán hàng cạnh tranh nhau.
- Cart/Checkout và Sales Invoice không có source of truth rõ ràng.
- Inventory bị ghi trực tiếp ở nhiều nơi.
- Customer debt bị cập nhật trực tiếp.
- Payment/Cashbook boundary không rõ.
- Double-completion risk.
- Circular dependency.
- Repository Boundary violation.
- Migration có nguy cơ mất dữ liệu.
- Existing API conflict.
- Existing COMPLETED cancellation.
- Redis là source of truth không phù hợp cho hóa đơn.
- Existing business rule mâu thuẫn RFC.
- Có thay đổi kiến trúc lớn cần ADR.

## 39. AUTHORIZATION

**[AR18] Claude Code được phép:**

1. Cập nhật RFC-T013 theo Decision AR01-AR17 (tài liệu này).
2. Viết `SPEC-T013-SALES-FOUNDATION-001.md`.
3. Dừng sau khi hoàn thành SPEC.

**Chưa được phép:**

- Viết Implementation Plan.
- Sửa source code.
- Tạo migration.
- Commit.
- Push.
- Tag.

## Lịch sử quyết định

- **RFC-T013 — Sales Foundation v1 (PROPOSED)** — Architect soạn trực tiếp, Type A.
- **`ARCHITECTURE REVIEW — RFC-T013 Sales Foundation`** (Claude Code, `docs/architecture/
  T013-architecture-review.md`) — phát hiện brownfield trưởng thành: Cart/Checkout/Invoice/Payment/
  Inventory/Discount Engine đã chạy thật, mô hình one-shot atomic khác cơ bản so với RFC's mutable
  Draft SalesInvoice; không có idempotency; 3+ Repository Boundary violation (`cart`/`invoice`/
  `payment`/cách dùng `customer-point`); `InvoiceStatus` là payment-status không phải lifecycle;
  không có snapshot; `Branch.invoicePrefix` tồn tại nhưng chưa dùng; không check SERVICE product
  trước khi trừ tồn.
- **`ARCHITECT RESOLUTION — RFC-T013 SALES FOUNDATION`** (Decision AR01-AR18) — APPROVED WITH
  DECISIONS: AR01 Brownfield bắt buộc; AR02 Cart = Draft, Invoice ≠ Draft; AR03 Invoice tiếp tục
  bất biến, không thêm Add/Remove/Update Item; AR04 Checkout tiếp tục là Aggregate Root, không tạo
  `SalesInvoice`; AR05 chọn Option 1 Evolution; AR06 Inventory đúng, chỉ bổ sung SERVICE-product
  exemption; AR07 phải tạo `CustomerPointDomainService`; AR08 không đổi `InvoiceStatus` (giữ
  Payment Status, lifecycle do Cart đảm nhiệm); AR09 Snapshot bắt buộc (Customer/Product/Barcode/
  Unit); AR10 Invoice Number Generator phải dùng `Branch.invoicePrefix` + `SequenceCodeGeneratorService`,
  không tạo generator mới; AR11 Idempotency MANDATORY, kiến trúc chi tiết + so sánh Option A
  (`CheckoutOperation` table) vs Option B (metadata trên Invoice) giao cho SPEC; AR12 Cart tiếp tục
  là Draft duy nhất, không bảng Draft Postgres mới; AR13 khắc phục Repository Boundary
  (`cart`/`invoice`/`payment`/`customer-point`); AR14 Invoice bất biến, không API Add/Remove/Update
  Item; AR15 giữ 1 transaction atomic, thứ tự nghiệp vụ cụ thể 11 bước; AR16 quy tắc SERVICE
  product chi tiết; AR17 Snapshot chi tiết; AR18 AUTHORIZATION cập nhật RFC + viết SPEC, dừng sau
  SPEC.
- **RFC-T013 — Sales Foundation v2** (tài liệu này) — Claude Code cập nhật theo AR01-AR17, đánh
  dấu rõ từng mục thay đổi bằng `[ARxx]`, giữ lại nội dung v1 bị thay thế dưới dạng gạch ngang để
  bảo toàn lịch sử.
