# Architecture Review — RFC-T013 Sales Foundation

**Nguồn:** `RFC-T013 — Sales Foundation` (Architect, `docs/rfc/RFC-T013-sales-foundation.md`), Type A (Business-Critical).
**Phạm vi:** Audit toàn diện, KHÔNG sửa source/migration/commit — đúng AUTHORIZATION §39.
**Kết luận ngắn gọn:** Sales Foundation **KHÔNG phải greenfield** — một hệ thống Checkout/Cart/Invoice/Payment **đã chạy thật, khá trưởng thành** tồn tại từ Sprint-00 (comment code ghi rõ "Prompt 033/034/035"). Kiến trúc thực tế **khác về cơ bản** so với mô hình RFC giả định (mutable Draft Sales Invoice) — đây là **conflict lớn nhất**, cần Architect Resolution trước khi viết SPEC.

---

## 1. Existing Architecture Map

| RFC concept | Module thực tế | Trạng thái |
|---|---|---|
| Cart | `modules/cart` | Có thật — Redis-backed, TTL 30 phút |
| Checkout/Finalization | `modules/checkout` | Có thật — 1 endpoint `POST /checkout`, atomic single-shot |
| Sales Invoice (Draft→Complete) | `modules/invoice` | Có thật NHƯNG là `Invoice` bất biến, KHÔNG có Draft |
| Order | Model `Order`/`OrderItem` trong schema | **Model tồn tại nhưng KHÔNG có NestJS module** — chỉ là placeholder, `orderId` trên `Invoice` luôn `null` |
| Payment | `modules/payment` | Có thật — chỉ tạo bởi Checkout Engine, không có route tạo độc lập |
| Sales Return | Model `Return`/`ReturnItem` | Model tồn tại, không có module — ngoài phạm vi T013 (đúng RFC §3) |
| Cashbook | Model `CashBook` | Model tồn tại, không có module — ngoài phạm vi T013 (đúng RFC §21) |
| Debt Ledger | Model `Debt`, field `Customer.currentDebt` | Model tồn tại, không có module; `currentDebt` đã bị **deprecate** từ T011 (không ai ghi) |
| Discount Engine | `modules/discount` | Có thật — engine cascading đa nguồn (Manual→Promotion→Voucher→Member), **vượt xa** RFC §15's "basic line/invoice discount" |
| Customer Point | `modules/customer-point` | Có thật — checkout publish `POINT_USED_EVENT`, đúng ADR-0009 |
| Inventory Single Writer | `InventoryDomainService` (`modules/inventory`) | Có thật, trưởng thành, đã document rõ (SPEC-INV-001) — checkout đã dùng đúng |
| Audit Log | `AuditLogService` | Có thật — checkout đã ghi `checkout.completed` |

## 2. Current Aggregate / Source of Truth

Không có 1 aggregate "SalesInvoice" như RFC giả định. Nguồn sự thật thực tế theo từng giai đoạn:

- **Trước khi hoàn tất:** Cart (Redis) là "draft" — key `cart:{organizationId}:{userId}`, KHÔNG có branchId trong entity, KHÔNG persist ở Postgres.
- **Tại thời điểm hoàn tất:** `CheckoutService.checkout()` là orchestrator DUY NHẤT, mở đúng 1 `prisma.$transaction()` bao trọn: Point → Voucher → tạo `Invoice` (luôn `status: 'PAID'`, `paidAmount = totalAmount`) → tạo `Payment` → `InventoryDomainService.decrease()` cho từng dòng.
- **Sau khi hoàn tất:** `Invoice`/`Payment` là chứng từ **bất biến** — comment gốc: *"hóa đơn là chứng từ bất biến sau khi tạo"*. Không update/delete method nào tồn tại trong `IInvoiceRepository`/`IPaymentRepository`.

**Không có khái niệm DRAFT Invoice trong Postgres.** "Draft" hoàn toàn là Cart (Redis).

## 3. Checkout Flow Hiện Tại

`POST /checkout` (permission `pos:access`, không phải `sales:*`) nhận `CheckoutDto`:
```
branchId, warehouseId, customerId?, paymentMethod, voucherCode?, pointsToUse?, manualDiscount?
```
**Không có mảng `items` trong request** — item lấy từ Cart (Redis) tự động. Không có cơ chế client override giá theo dòng hàng (chỉ Cart snapshot giá RETAIL tại thời điểm add).

Trình tự bên trong 1 transaction (file `checkout.service.ts:126-257`):
1. Validate Customer ACTIVE (`CustomerDomainService.findActiveById`) — đã đúng chuẩn RFC §10.
2. Validate + áp Voucher (nếu có) qua `VoucherRepository` nội bộ module `checkout`.
3. Tính discount qua `DiscountEngineService` (Manual → Point → Voucher, thứ tự cascading).
4. Tạo `Invoice` qua `InvoiceService.createInvoice()` — luôn `PAID`, không có trạng thái trung gian.
5. Tạo `Payment` qua `PaymentService.createPayment()`.
6. Trừ tồn kho từng dòng qua `InventoryDomainService.decrease()`.
7. Sau khi transaction commit: xóa Cart (Redis), publish `CHECKOUT_COMPLETED_EVENT` + `POINT_USED_EVENT` (nếu có), ghi Audit Log.

## 4. Cart/Redis Dependency

- Cart lưu **100% trên Redis** (`RedisCartRepository`, `REDIS_CLIENT`), TTL 30 phút, KHÔNG có bản sao Postgres.
- Redis **là bắt buộc** cho toàn bộ luồng bán hàng hiện tại — nếu Redis down, không thể checkout (Cart không đọc được).
- Cart entity KHÔNG có `branchId` — branch chỉ được chọn tại `CheckoutDto.branchId` lúc hoàn tất, không gắn với Cart trong quá trình thêm hàng.
- Cart chỉ hỗ trợ 1 loại giá (`RETAIL`, hardcode), không hỗ trợ chọn Unit/Barcode khác nhau cho cùng Product — không có unit conversion trong Cart/Checkout hiện tại.

## 5. Inventory Write Flow

`InventoryDomainService` (SPEC-INV-001, Decision 3/11/12) là **Single Writer thật, đã trưởng thành**:
- 5 method public (`increase`/`decrease`/`adjust`/`transfer`/`recordMovement`), tất cả nhận `tx: Prisma.TransactionClient` bắt buộc — không tự mở transaction.
- `decrease()` (dùng cho Checkout) luôn kiểm tra âm kho, ném `InventoryInsufficientStockError`/`InventoryConcurrencyConflictError` — Checkout đã bắt và dịch đúng 2 lỗi này (`mapError()`).
- Repository (`IInventoryRepository`) không export ra ngoài module — chỉ `InventoryDomainService` export. **Không có Repository Boundary violation ở Inventory.**
- Checkout gọi `decrease()` đúng bên trong transaction chung — **không có nguy cơ trừ tồn 2 lần trong 1 lần checkout** (atomic).
- **KHÔNG có check `product.type === 'SERVICE'` trước khi decrease** — mọi dòng Cart hiện tại đều bị trừ tồn kho vô điều kiện, kể cả nếu Product là `SERVICE` (schema đã có `ProductType.SERVICE` từ lâu). Đây là **gap thật**, không phải giả định.

## 6. Payment / Debt Flow

- `Payment` chỉ được tạo bởi Checkout Engine (không route public tạo), luôn full-paid (`amount = finalTotal`) — **không có khái niệm thanh toán một phần** trong luồng hiện tại dù schema `Invoice.status` có giá trị `PARTIAL`.
- **`Customer.currentDebt` KHÔNG bị Checkout cập nhật** — đã deprecate từ T011 (Decision CR02), Checkout không đụng tới field này. **Không có conflict với RFC §20** (RFC lo ngại việc này, nhưng thực tế Checkout hiện tại sạch).
- `Debt` model tồn tại trong schema nhưng không module nào ghi vào — đúng như RFC kỳ vọng (Debt Ledger = T017).
- `CashBook` model tồn tại, không module — Payment hiện tại KHÔNG ghi vào CashBook (đúng RFC §21, "không tạo Cashbook giả").

## 7. Customer Point Flow

- Checkout gọi `customerPointRepository.usePoint()` (trực tiếp `CUSTOMER_POINT_REPOSITORY`, không qua Domain Service!) bên trong transaction, sau đó publish `POINT_USED_EVENT` sau khi commit.
- `customer-point` module publish/subscribe theo đúng ADR-0009 (đã xác nhận ở T011's audit trước đây).
- **Repository Boundary violation:** `checkout.service.ts` inject thẳng `CUSTOMER_POINT_REPOSITORY`/`ICustomerPointRepository` (dòng 20-23) thay vì qua 1 Domain Service — không có `CustomerPointDomainService` nào tồn tại để bọc lại. Đây là vi phạm ADR-0010 **có sẵn từ trước**, giống pattern đã thấy ở Customer(T011)/Supplier(T012) nhưng chưa module nào xử lý cho `customer-point`.

## 8. Repository Boundary Audit

| Module | Export hiện tại | Vi phạm? |
|---|---|---|
| `cart` | `exports: [CART_REPOSITORY]` — không export Service nào | **CÓ** — `checkout.service.ts` inject thẳng `CART_REPOSITORY`/`ICartRepository` |
| `invoice` | `exports: [InvoiceService, INVOICE_REPOSITORY]` | **CÓ** — repository token vẫn bị export dù có Service |
| `payment` | `exports: [PaymentService, PAYMENT_REPOSITORY]` | **CÓ** — tương tự |
| `customer-point` | (chưa kiểm tra exports module, nhưng) checkout inject thẳng `CUSTOMER_POINT_REPOSITORY` | **CÓ** |
| `inventory` | Chỉ export `InventoryDomainService` | Không — đúng chuẩn |
| `customer` | Chỉ export `CustomerDomainService` (từ T011) | Không — đúng chuẩn |
| `discount` | Internal service, không Controller/route public | Không áp dụng |
| `checkout` (voucher) | `VOUCHER_REPOSITORY` chỉ dùng nội bộ module, không export | Không |

**Kết luận:** Có 3 Repository Boundary violation tồn tại từ trước T013 (`cart`, `invoice`, `payment`), cộng 1 vi phạm tương tự ở cách Checkout tiêu thụ `customer-point`. RFC §25 yêu cầu Sales module mới không được vi phạm boundary — nhưng các module NÓ SẼ PHẢI GỌI (cart/invoice/payment/customer-point) đã tự vi phạm ranh giới của chính mình từ trước. Cần Architect quyết định: sửa cả 4 module này trong phạm vi T013, hay giữ nguyên và chỉ đảm bảo *module Sales mới* không thêm vi phạm mới.

## 9. Transaction Boundary Audit

- Đã có transaction boundary rõ ràng, đúng nguyên tắc "Toàn bộ → Một Transaction" (comment gốc `checkout.service.ts:64-69`): 1 `prisma.$transaction()` duy nhất bao Point + Voucher + Invoice + Payment + Inventory.
- Cart (Redis) và Domain Event nằm **ngoài** transaction Postgres — chỉ thực hiện sau khi transaction commit thành công (đúng thứ tự, tránh xóa Cart sớm nếu transaction fail).
- Nếu transaction throw, `catch` publish `CHECKOUT_FAILED_EVENT` rồi ném lại lỗi đã map — Cart KHÔNG bị xóa khi lỗi (đúng, giữ nguyên giỏ hàng để thử lại).
- **Không có transaction retry/backoff logic** — 1 lỗi `InventoryConcurrencyConflictError` sẽ trả thẳng `409` cho client, client phải tự gọi lại `POST /checkout`.

## 10. Idempotency / Concurrency Audit

- **Không có bất kỳ cơ chế idempotency nào** (đã grep toàn backend, 0 kết quả cho "idempotent").
- Gọi `POST /checkout` 2 lần liên tiếp (network retry, double-click, v.v.) với Cart chưa bị xóa (race giữa transaction commit và Cart delete) → **sẽ tạo 2 Invoice + 2 Payment + trừ tồn 2 lần**. Đây là rủi ro thật, đúng như RFC §19/§38 lo ngại — hiện tại **hoàn toàn chưa có bảo vệ**.
- Concurrency ở tầng Inventory đã có (`InventoryConcurrencyConflictError`), nhưng đó là bảo vệ tồn kho khỏi ghi đè đồng thời — KHÔNG phải bảo vệ khỏi double-submit của cùng 1 checkout request.

## 11. Schema Conflicts

1. **`Invoice.status` (`InvoiceStatus`: UNPAID/PARTIAL/PAID/CANCELLED) là payment-status, KHÔNG phải lifecycle DRAFT/COMPLETED/CANCELLED mà RFC §8 giả định.** Đây là conflict schema lớn nhất — RFC's `SalesInvoiceStatus` (DRAFT/COMPLETED/CANCELLED) không map trực tiếp vào enum hiện có.
2. `Invoice`/`InvoiceItem` **không có `version`** (không Optimistic Lock) — nhất quán với pattern mọi module scaffold trước Sprint-01 (Brand/Unit/Barcode/Customer/Supplier đều thiếu tương tự trước khi được thêm).
3. `InvoiceItem` **không có snapshot field** nào (`productCodeSnapshot`, `productNameSnapshot`, `barcodeSnapshot`, `unitNameSnapshot`) — chỉ có `productId` FK sống. Sửa Product sau này **sẽ** ảnh hưởng cách hiển thị hóa đơn cũ nếu đọc qua relation thay vì lưu cứng — vi phạm trực tiếp RFC §7 ("Snapshot là bắt buộc").
4. `InvoiceItem` **không có `barcodeId`/`unitId`/`baseQuantity`** — Product hiện tại chỉ có 1 `unitId` cố định, KHÔNG có bảng unit-conversion nào (`UnitConversion`/`ProductUnit` không tồn tại) — RFC §12's "unitId phải thuộc Product hoặc conversion hợp lệ" **không có hạ tầng sẵn để tái sử dụng**, sẽ cần thiết kế mới hoàn toàn nếu muốn hỗ trợ multi-unit.
5. `Invoice` **không có `subtotal`/`lineDiscountTotal`/`invoiceDiscount`/`taxTotal`/`outstandingAmount`** riêng biệt — chỉ có `totalAmount`/`paidAmount`/`dueAmount` gộp.
6. `Branch.invoicePrefix` (String?, `@@unique([organizationId, invoicePrefix])`) **đã tồn tại trong schema nhưng KHÔNG được `SequenceInvoiceCodeGenerator` sử dụng** — generator hiện tại hardcode prefix `'HD'` toàn Organization, bỏ qua field này hoàn toàn. Có `BRANCH_INVOICE_PREFIX_CONFLICT` error code đã định nghĩa (`BRANCH_004`) nhưng chưa từng dùng ở đâu (dead code/error chờ tính năng này được triển khai — rất có thể chính là dành cho T013).
7. `Order`/`OrderItem` model tồn tại nhưng **không NestJS module nào dùng** — `orderId` trên `Invoice` luôn `null` theo thiết kế (comment tường minh trong schema + entity).

## 12. API Conflicts

- Route hiện tại: `POST /checkout` (không phải `/sales-invoices`), `GET/GET:id /invoices` (chỉ đọc), `GET/GET:id /payments` (chỉ đọc), `GET/POST/PATCH/DELETE /cart` (Cart CRUD, xem `cart.controller.ts` — chưa đọc chi tiết route nhưng module tồn tại đầy đủ).
- **RFC's đề xuất `/sales-invoices` với đầy đủ `POST/PATCH/POST items/PATCH items/DELETE items/POST complete/POST cancel` KHÔNG tồn tại dưới bất kỳ hình thức nào hiện tại** — đây thực chất là **route hoàn toàn mới**, không phải đổi tên route cũ. Không có xung đột đặt tên trực tiếp, nhưng có xung đột **mô hình luồng nghiệp vụ**: `/checkout` (one-shot, atomic) vs `/sales-invoices/*` (multi-step draft CRUD) là 2 triết lý API khác nhau phục vụ cùng 1 mục đích.

## 13. Permission Conflicts

- Permission hiện có liên quan: `pos:access` (guard cho toàn bộ `/checkout`), `invoice:view`, `payment:view`, `payment:create` (**đã seed nhưng KHÔNG có route nào dùng** — permission "chết", có thể dành sẵn cho T013).
- RFC §29 đề xuất `sales:create/read/update/complete/cancel/override-price/apply-discount` — **hoàn toàn mới**, không trùng permission hiện có. Không xung đột đặt tên.
- Cần Architect quyết định: `pos:access` (guard hiện tại của checkout) có bị thay thế bởi `sales:*` không, hay 2 bộ permission cùng tồn tại song song (vd giữ `pos:access` cho POS UI nói chung, thêm `sales:*` cho thao tác cụ thể)?

## 14. Migration Risks

- Toàn bộ bảng liên quan (`Order`, `OrderItem`, `Invoice`, `InvoiceItem`, `Payment`, `Return`, `ReturnItem`, `CashBook`, `Debt`) được tạo trong **1 migration duy nhất** (`20260715030000_invoice_module`) — không có migration riêng sau đó cho từng bảng (khác Brand/Unit/Barcode/Customer/Supplier vốn có version/status migration riêng theo từng Task).
- Nếu SPEC quyết định thêm `version`/snapshot fields/đổi `InvoiceStatus` — đây sẽ là **migration đầu tiên chạm vào bảng `invoices`/`invoice_items` kể từ khi tạo** — rủi ro tương tự Customer/Supplier (backfill status, thêm cột) nhưng **chưa có dữ liệu production thật** (dự án v0.x, chưa release) nên rủi ro thấp hơn về mặt dữ liệu.
- Nếu đổi `InvoiceStatus` enum (thêm DRAFT hoặc tách thành 2 field riêng — payment status vs lifecycle status) — đây là thay đổi kiến trúc lớn, cần ADR theo đúng RFC §38 ("Có thay đổi kiến trúc lớn cần ADR").

## 15. Existing Tests and Coverage

| Module | Test file | Ghi chú |
|---|---|---|
| `checkout` | `checkout.service.spec.ts` (16 `it()`), `checkout.dto.spec.ts`, `checkout.controller.spec.ts`, `prisma-voucher.repository.spec.ts` | Test hiện tại chỉ phủ luồng one-shot hiện có — không có test nào cho draft/version/idempotency vì các khái niệm này chưa tồn tại |
| `invoice` | `invoice.service.spec.ts`, `invoice.controller.spec.ts`, `prisma-invoice.repository.spec.ts`, `sequence-invoice-code.generator.spec.ts`, `invoice-query.dto.spec.ts` | Phủ create/read/search — không có update/cancel vì chưa tồn tại |
| `payment` | `payment.service.spec.ts`, `payment.controller.spec.ts`, `prisma-payment.repository.spec.ts` | Chỉ create/read |
| `cart` | `cart.service.spec.ts`, `cart.controller.spec.ts`, `redis-cart.repository.spec.ts`, `cart.entity.spec.ts`, `cart-item.dto.spec.ts` | Phủ add/update/remove/clear |

Không có Architecture Test nào cho Repository Boundary của `cart`/`invoice`/`payment`/`customer-point` (khác Customer/Supplier đã có từ T011/T012).

## 16. RFC Conflicts (tổng hợp)

1. **[Nghiêm trọng]** RFC giả định SalesInvoice là aggregate mutable với vòng đời DRAFT→COMPLETED/CANCELLED và item CRUD. Thực tế: Invoice bất biến, "draft" hoàn toàn nằm ở Cart (Redis), Checkout là thao tác one-shot atomic tạo thẳng Invoice đã hoàn tất.
2. **[Nghiêm trọng]** RFC Out-of-Scope loại trừ "Promotion engine, Coupon engine" nhưng hệ thống hiện tại **đã có** `DiscountEngineService` cascading đa nguồn (Manual/Promotion/Voucher/Member) đang hoạt động thật trong Checkout.
3. **[Trung bình]** `InvoiceStatus` hiện tại là payment-status (UNPAID/PARTIAL/PAID/CANCELLED), không phải lifecycle-status RFC muốn.
4. **[Trung bình]** Không có snapshot field nào trên `InvoiceItem`/`Invoice` — RFC yêu cầu bắt buộc snapshot.
5. **[Trung bình]** Không có unit-conversion infrastructure — RFC §7/§12 giả định đã có "conversion hợp lệ".
6. **[Thấp]** Repository Boundary violation tồn tại sẵn ở `cart`/`invoice`/`payment`/cách checkout dùng `customer-point` — RFC §25 chỉ nói về module Sales mới, không nói rõ có phải dọn luôn 4 module cũ này không.
7. **[Thấp]** Không check `product.type === 'SERVICE'` trước khi trừ tồn kho trong checkout hiện tại.
8. **[Thấp]** `Branch.invoicePrefix` đã có trong schema nhưng chưa được generator nào dùng — có thể là ý định ban đầu cho tính năng branch-scoped invoice numbering mà RFC §9 đang hỏi.

## 17. Open Questions (cần Architect quyết định, không tự chọn)

1. **T013 có kế thừa/mở rộng Checkout hiện tại (Evolution triệt để, giữ one-shot atomic + Cart Redis), hay xây MỘT aggregate SalesInvoice mutable mới song song, hay thay thế hoàn toàn Checkout bằng SalesInvoice draft workflow?** Đây là quyết định kiến trúc nền tảng nhất, mọi phần khác của SPEC phụ thuộc vào câu trả lời này.
2. Nếu giữ Checkout one-shot: RFC's toàn bộ §8 (Lifecycle DRAFT/COMPLETED/CANCELLED), §18 (multi-step transaction với version check ở từng bước), §19 (idempotency cho complete), §24 (Optimistic Lock cho add/update/remove item) có còn áp dụng được không, hay cần viết lại RFC cho phù hợp với mô hình one-shot?
3. `DiscountEngineService` (Manual/Promotion/Voucher/Member) — giữ nguyên toàn bộ như hiện có (kể cả Promotion/Member dù Checkout hiện chưa dùng 2 nguồn này), hay RFC's "không hỗ trợ promotion engine" có nghĩa là T013 phải tháo gỡ/không dùng 2 nguồn Promotion/Member?
4. `InvoiceStatus` — đổi enum, tách thành 2 field riêng (payment status + lifecycle status), hay giữ nguyên và RFC's DRAFT/COMPLETED/CANCELLED chỉ áp dụng ở tầng ứng dụng (không cần cột DB riêng nếu one-shot không có trạng thái trung gian thật)?
5. Snapshot fields (customer/product/barcode/unit) — thêm mới hoàn toàn vào `InvoiceItem`, migration thêm cột, hay chấp nhận rủi ro đọc qua relation (không snapshot) cho tới khi có nhu cầu thật?
6. Unit conversion — có cần xây bảng mới (`ProductUnit`/`UnitConversion`) trong phạm vi T013, hay hoãn qua Task khác vì đây là thay đổi Product Foundation, không phải Sales Foundation?
7. Idempotency — cơ chế nào? (Idempotency-Key header, hay unique constraint trên 1 field nào đó, hay giữ nguyên rủi ro hiện tại và chỉ thêm kiểm tra Cart đã xóa/chưa trước khi cho phép checkout lại?)
8. Repository Boundary của `cart`/`invoice`/`payment`/`customer-point` — sửa trong phạm vi T013 hay để nguyên (chỉ đảm bảo module Sales MỚI không vi phạm thêm)?
9. `pos:access` permission hiện tại — thay bằng `sales:*`, giữ song song, hay `sales:*` chỉ bổ sung cho các thao tác cụ thể trong khi `pos:access` vẫn là gate tổng?
10. `Branch.invoicePrefix` — dùng cho invoice numbering theo branch trong T013 hay bỏ qua (giữ nguyên global `HD` prefix)?
11. `payment:create` permission đã seed nhưng chưa dùng — có phải dành cho route mới của T013 không?

## 18. Recommended Architecture Options (KHÔNG tự chọn — trình bày để Architect quyết định)

**Option A — Evolution tối thiểu:** Giữ nguyên Checkout one-shot atomic + Cart Redis làm "draft" đang hoạt động tốt. T013 chỉ bổ sung: snapshot fields, version (Optimistic Lock chỉ có ý nghĩa nếu có thao tác update sau tạo — cân nhắc bỏ nếu Invoice thực sự bất biến), đổi/tách `InvoiceStatus`, thêm route `POST /invoices/:id/cancel` cho hủy Invoice vừa tạo (nếu nghiệp vụ cần), sửa Repository Boundary 4 module, thêm idempotency ở tầng Checkout. RFC cần revise mạnh (bỏ phần lớn "Draft workflow", "Add/Update/Remove item" vì không còn ý nghĩa khi tạo 1 lần).

**Option B — Song song 2 mô hình:** Giữ `/checkout` một-shot cho luồng POS nhanh (giỏ hàng → thanh toán ngay, phổ biến ở bán lẻ), xây thêm `SalesInvoice` draft aggregate MỚI cho luồng cần soạn thảo trước (vd bán buôn, đặt hàng giữ chỗ). Phức tạp hơn, có 2 nguồn tạo Invoice — cần rule rõ ràng invoice nào tạo qua đường nào.

**Option C — Thay thế hoàn toàn:** Xây `SalesInvoice` đúng như RFC mô tả (Draft→Complete/Cancel, version, item CRUD), Checkout hiện tại refactor thành lớp mỏng gọi vào SalesInvoice (tạo Draft → complete ngay trong 1 request để giữ trải nghiệm one-shot cho POS nhanh). Rủi ro cao nhất (đổi nhiều nhất), nhưng khớp RFC nguyên bản nhất.

Claude Code không đề xuất chọn phương án nào — cần Architect quyết định trước khi có SPEC.

## 19. Danh sách file tài liệu thay đổi

- `docs/rfc/RFC-T013-sales-foundation.md` (mới, lưu nguyên văn RFC — AUTHORIZATION mục 1)
- `docs/architecture/T013-architecture-review.md` (tài liệu này — AUTHORIZATION mục 4)
- `PROJECT_STATUS.md` (cập nhật T013 = ARCHITECTURE REVIEW — AUTHORIZATION mục 5)
- `docs/SPRINT_DASHBOARD.md` (cập nhật T013 = ARCHITECTURE REVIEW — AUTHORIZATION mục 5)

## 20. Xác nhận không sửa source/migration/commit

Xác nhận: không có file `.ts`/`.prisma`/migration nào bị sửa trong quá trình Audit này. Không chạy `git add`/`commit`/`push`/`tag`. Không tự ban hành ADR. Không viết SPEC/Implementation Plan.

---

Dừng hoàn toàn tại đây. Chờ **ARCHITECT RESOLUTION — RFC-T013 SALES FOUNDATION**.
