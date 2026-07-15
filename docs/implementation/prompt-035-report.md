# Implementation Report — Prompt 035: POS Checkout Engine

**Ngày:** 2026-07-15
**Phạm vi:** Checkout Engine — orchestrator chốt đơn từ Cart, chạy toàn bộ workflow trong **1 Prisma transaction**. Theo quyết định của user (Phương án 1), Prompt này **kéo trước** 2 module tối giản mà Checkout phụ thuộc — **Payment** và **Invoice** — thay vì đóng băng như đã làm với Sales Order (036) trước đây.

## 0. Vì sao phải kéo Payment/Invoice lên trước (bối cảnh quyết định)

Workflow Checkout (`Cart → Validate → Inventory Check → Discount → Point → Voucher → Payment → Invoice → Inventory Movement → Completed`) có 2 bước literally phụ thuộc Payment Engine và Invoice Module — nhưng chính user đã ghi rõ 2 module này thuộc Volume tiếp theo (036-040), **sau** Prompt 035. Đây là cùng dạng vấn đề dependency-ordering đã khiến Sales Order (036) bị đóng băng.

Khác với lần trước (Customer hoàn toàn không tồn tại), lần này user chủ động chọn: xây Payment + Invoice bản **tối giản** (Entity/Repository/DTO/Service/API/Test đầy đủ, nhưng chỉ đủ cho Checkout) ngay bây giờ, để Volume 036-040 sau này **mở rộng** (Multi Payment, Refund, Receipt, Advanced Invoice) chứ không viết lại từ đầu. Toàn bộ quyết định dưới đây tuân thủ đúng ràng buộc này.

## 1. Payment & Invoice — thiết kế "tối giản" nhưng đúng kiến trúc

### 1.1 Payment — tái sử dụng bảng `payments` dùng chung (không tạo bảng mới)

Bảng `payments` (Foundation) đã là sổ cái **chung cho 2 chiều tiền**: `direction OUT` (Supplier Debt, Prompt 029) và `direction IN` (module Payment mới, Prompt 035, luôn gắn `invoiceId`). Không có migration nào cho Payment — chỉ thêm 1 module đọc/ghi mới (`IPaymentRepository`) cùng bảng đã có, đúng tinh thần "Debt/Payment ledger dùng chung" đã thiết lập ở Prompt 029, tránh trùng lặp schema.

**Không có endpoint public để tạo Payment** — `PaymentService.createPayment()` chỉ được gọi bởi Checkout Engine (luôn kèm `tx`). API public chỉ có `GET /payments/:id` và `GET /payments?invoiceId=`.

### 1.2 Invoice — schema reconciliation: `orderId` bắt buộc → optional

Model `Invoice` (Foundation) có `orderId String @db.Uuid` **NOT NULL**, tham chiếu `Order` — nhưng Order Module không nằm trong phạm vi được yêu cầu kéo lên (user chỉ nói "Payment Engine và Invoice Module"), và bản thân workflow Checkout cũng không liệt kê bước "tạo Order" nào. Theo đúng tiền lệ đã áp dụng xuyên suốt dự án ("Prompt's literal field/entity list is authoritative over pre-existing Foundation schema" — dùng cho Supplier/PurchaseOrder/Customer/CustomerPointLedger trước đây): sửa `Invoice.orderId` thành **optional**, FK `Restrict` → `SetNull`, và thêm `Invoice.customerId` (optional — Cart Engine, Prompt 033, không bắt buộc khách hàng). Giữ nguyên field `orderId` (không xóa) để Order Module (Volume 036-040) sau này gắn ngược vào Invoice đã có **mà không cần đổi schema lần nữa** — đúng yêu cầu "chỉ mở rộng, không viết lại".

Đây **không phải** kiểu "vá bằng optional FK để né module thiếu" đã bị cấm trước đây (Customer/Cart) — khác biệt mấu chốt: lần trước là tôi tự ý né tránh khi CHƯA có quyết định từ user; lần này là hệ quả TRỰC TIẾP, ĐÃ ĐƯỢC DISCLOSE của chính quyết định phạm vi mà user vừa chốt (chỉ Payment + Invoice, không Order).

Thêm mới model `InvoiceItem` (chưa tồn tại trong Foundation — trước đây dòng hàng chi tiết nằm ở `OrderItem`, nhưng vì Invoice không còn bắt buộc qua Order, cần chỗ lưu dòng hàng riêng cho hóa đơn) — snapshot bất biến tại thời điểm Checkout, cùng field shape với `OrderItem`/`CartItem` (productId, quantity, unitPrice, discount, taxAmount, totalAmount). Bỏ `updatedBy`/`deletedAt` khỏi `Invoice` — hóa đơn là chứng từ tài chính, không soft-delete (chỉ đổi `status`, ví dụ `CANCELLED` qua Refund ở Volume sau).

**Không có endpoint public để tạo Invoice** — cùng lý do với Payment. API public chỉ có `GET /invoices` (phân trang) và `GET /invoices/:id`.

## 2. Mở rộng 2 repository đã có (additive, không đổi hành vi cũ)

### 2.1 `IInventoryRepository.recordSaleMovement()` — Optimistic Lock, không âm kho

Method `recordMovement()` sẵn có (Prompt 022) không có cơ chế khóa nào (chỉ `upsert` đơn thuần) — đủ cho các module trước (Purchase/Transfer/Adjustment tự kiểm tra âm kho trước khi gọi), nhưng Prompt 035 đòi hỏi **"Concurrency: 50 Cashier cùng bán. Không âm kho. Locking: Optimistic Lock"** — một yêu cầu chặt hơn hẳn. Thêm **method mới** `recordSaleMovement()` (không sửa `recordMovement()`, không ảnh hưởng caller cũ):

- Đọc `beforeQuantity`, tôn trọng setting `inventory.allowNegativeStock` (cùng cơ chế Purchase Return/Adjustment) — không đủ hàng và tổ chức không cho phép âm kho → `InventoryInsufficientStockError`.
- **Optimistic Lock**: `UPDATE ... WHERE quantity = <giá trị vừa đọc>` — nếu 1 giao dịch khác đã ghi đè `quantity` giữa lúc đọc và lúc ghi (race condition khi nhiều cashier bán cùng sản phẩm), `updateMany` trả `count = 0` → ném `InventoryConcurrencyConflictError` thay vì ghi đè mù. Đây là compare-and-swap ở cấp row, không cần thêm cột `version` riêng — dùng chính `quantity` làm "version".
- Nhận `tx?: Prisma.TransactionClient` tùy chọn để gộp vào transaction lớn hơn của Checkout.

### 2.2 `ICustomerPointRepository.usePoint()` — thêm `tx` tùy chọn

Method có sẵn (Prompt 032) tự mở `$transaction()` riêng — không compose được vào transaction của Checkout. Sửa thành nhận `tx?: Prisma.TransactionClient`: có truyền thì dùng thẳng, không truyền thì tự mở như cũ (100% tương thích ngược, không đổi hành vi/test cũ nào).

### 2.3 `DiscountLineItem.categoryId` → optional

Cart Engine không lưu `categoryId` cho từng dòng, và không Strategy nào ở Prompt 034 thực sự dùng field này (dự phòng cho Promotion theo danh mục, chưa triển khai) — sửa thành optional để Checkout không cần truy vấn Product chỉ để lấy 1 field không ai dùng.

## 3. Voucher — repository nội bộ, KHÔNG phải Voucher Module

Bảng `vouchers` (Foundation) đã tồn tại nhưng chưa có CRUD module (ngoài phạm vi Prompt 035). Vì "Voucher" là 1 bước literally có tên trong workflow Checkout, tôi viết `IVoucherRepository` **nằm trong chính module `checkout`** (không phải 1 module Voucher đầy đủ, không route, không permission riêng) — chỉ 2 việc: tra mã (`findActiveByCode`) và tăng lượt dùng có Optimistic Lock (`incrementUsage`, cùng cơ chế `WHERE usedCount = previousUsedCount` như Inventory). Validate hiệu lực (còn hạn, đủ lượt, đạt `minOrderAmount`) nằm ở `CheckoutService`, không phải repository.

## 4. Checkout Engine — thiết kế trung tâm

### 4.1 "Toàn bộ → Một Transaction"

`CheckoutService` là **orchestrator duy nhất** mở `PrismaService.$transaction()`. Mọi repository/service con (`recordSaleMovement`, `usePoint`, `incrementUsage`, `InvoiceService.createInvoice`, `PaymentService.createPayment`) đều nhận `tx` để nằm CHUNG transaction này — không method nào tự mở transaction riêng khi được Checkout gọi. Cart (Redis) và Domain Event nằm NGOÀI transaction Postgres, chỉ thực hiện SAU khi transaction đã commit — đảm bảo nếu bất kỳ bước nào lỗi (hết hàng, hết điểm, voucher conflict, ...), **toàn bộ rollback cùng lúc**, giỏ hàng Redis giữ nguyên (không mất dữ liệu, có thể thử lại ngay).

### 4.2 Thứ tự thực thi trong transaction khác thứ tự chữ trong workflow — có chủ đích

Prisma transaction là atomic bất kể thứ tự các lệnh bên trong — nên thứ tự triển khai thực tế là: **Manual Discount (tính toán thuần) → Point → Voucher → tạo Invoice (có `id` thật) → tạo Payment (tham chiếu `invoice.id`) → Inventory Movement (dùng `invoice.id` làm `referenceId`)**. Điều này gộp "Inventory Check" và "Inventory Movement" thành **một bước atomic duy nhất** ở cuối (đúng là Optimistic Lock: kiểm tra và ghi phải là 1 thao tác, tách rời 2 bước sẽ mở lại đúng race condition mà Optimistic Lock cần chặn) — thay vì kiểm tra sớm rồi ghi muộn (có khoảng hở race ở giữa). Vì cả giao dịch rollback cùng nhau, việc "kiểm tra" xảy ra muộn hơn vị trí liệt kê trong Prompt không ảnh hưởng tính đúng đắn.

### 4.3 Diễn giải "Discount → Point → Voucher" (3 bước, không phải trùng lặp với Discount Engine)

Prompt 034 định nghĩa Discount Engine với 4 priority Manual→Promotion→Voucher→Member; Prompt 035 lại liệt kê Discount, Point, Voucher như 3 bước RIÊNG trong Checkout — có vẻ trùng "Voucher". Quyết định: tại Checkout, **"Discount" = chỉ Manual** (thu ngân tự nhập tại quầy — Promotion/Member chưa có nguồn dữ liệu, đã disclose là gap ở báo cáo Prompt 034), **"Point"** là cơ chế RIÊNG (CustomerPointLedger, Prompt 032, không thuộc 4 nguồn của Discount Engine), **"Voucher"** tra bảng `vouchers` rồi áp qua đúng Strategy PERCENT/AMOUNT của Discount Engine theo `Voucher.type`. Cả 3 bước cascading tuần tự đúng thứ tự literal, mỗi bước tính trên phần còn lại sau bước trước — tái sử dụng `DiscountEngineService` (Prompt 034) cho cả Manual lẫn Voucher thay vì viết phép tính % / số tiền riêng.

**1 điểm = 1 đồng** (giả định tối giản, disclose rõ — không có bảng tỷ giá điểm nào trong Foundation). Số điểm dùng bị chặn không được vượt quá phần còn lại sau Manual Discount (`CHECKOUT_POINTS_EXCEED_TOTAL`) — tránh dùng thừa điểm cho giá trị không tồn tại.

**Thuế giữ nguyên theo Cart** (đã tính sẵn theo `Product.vat` từ lúc thêm vào giỏ, Prompt 033) — không tính lại thuế-sau-giảm-giá. `finalTotal = (subtotal − Manual − Point − Voucher) + totalTax`. Đơn giản hóa hợp lý cho bản tối giản, disclose rõ.

### 4.4 "Payment Fail → Rollback" — không có gateway thanh toán thật

Payment ở Prompt 035 là **single payment** ghi nhận ngay (không tích hợp cổng thanh toán thật, ngoài phạm vi "tối giản"). Về mặt kỹ thuật, "Payment Fail" được mô phỏng đúng ngữ nghĩa qua **bất kỳ lỗi nào xảy ra trong transaction TRƯỚC bước Payment** (hết hàng, hết điểm, voucher conflict) — vì Payment/Invoice/Inventory Movement đều nằm chung 1 transaction, lỗi ở bất kỳ đâu đều rollback toàn bộ, kể cả các bước đã "tưởng như" thành công trước đó. Test tích hợp minh chứng qua kịch bản hết hàng (xem mục 7).

### 4.5 Event & Audit

Publish `CheckoutCompleted`/`CheckoutFailed` (đúng yêu cầu Prompt) — `CheckoutFailed` chỉ publish khi lỗi xảy ra TRONG transaction thực sự (không publish cho lỗi validate sớm như giỏ hàng trống/voucher không hợp lệ, vì đó là từ chối input, chưa phải 1 "lần thử checkout" thất bại giữa chừng). Khi có dùng điểm, publish thêm `POINT_USED_EVENT` (Prompt 032) để `CustomerPointSubscriber` đồng bộ `Customer.totalPoint` — không cần sửa `CustomerPointService`/`AuditLogService` để hỗ trợ `tx` (tránh refactor lớn); Checkout tự publish event + tự ghi 1 dòng Audit Log tổng hợp (`checkout.completed`) sau khi transaction commit, thay vì để `CustomerPointService` ghi audit riêng cho bước con (tránh audit trùng lặp/rời rạc cho 1 hành động Checkout).

## 5. File đã tạo/sửa

**Tạo mới**: `backend/src/modules/payment/` (đầy đủ layer + test), `backend/src/modules/invoice/` (đầy đủ layer + code generator `HD000001` + test), `backend/src/modules/checkout/` (đầy đủ layer + Voucher repository nội bộ + test), `backend/prisma/migrations/20260715030000_invoice_module/`, `backend/test/checkout.e2e-spec.ts`.
**Sửa**: `schema.prisma` (Invoice/InvoiceItem/Product/Customer relations), `app.module.ts` (đăng ký 3 module mới), `error-codes.ts` (+`PAYMENT_001`, `INVOICE_001`, `CHECKOUT_001..006`), `cart.module.ts` (export `CART_REPOSITORY`), `discount/domain/entities/discount.entity.ts` (`categoryId` optional), `inventory.repository.interface.ts`/`.ts`/`.spec.ts` (+`recordSaleMovement`), `customer-point.repository.interface.ts`/`.ts`/`.spec.ts` (+`tx` cho `usePoint`).

## 6. API

| Method | Path | Permission |
|---|---|---|
| POST | `/api/v1/checkout` | `pos:access` |
| GET | `/api/v1/invoices` | `invoice:view` |
| GET | `/api/v1/invoices/:id` | `invoice:view` |
| GET | `/api/v1/payments` | `payment:view` |
| GET | `/api/v1/payments/:id` | `payment:view` |

Không thêm permission mới — tái sử dụng `pos:access`/`invoice:view`/`payment:view` đã seed sẵn từ Foundation.

## 7. Test

- **Unit**: 71 test mới (Payment 3 suite, Invoice 5 suite, Checkout 4 suite, cộng phần mở rộng Inventory/CustomerPoint) — tất cả PASS. Coverage riêng từng module mới: Payment 100%/100%/100%/100%, Invoice 100%/87.5%/100%/100% (application) với các layer khác 100%, Checkout 99.39%/84.8%/100%/99.37% tổng hợp (loại trừ `.module.ts`).
  - `CheckoutService` test: validate sớm (giỏ trống, khách không tồn tại, voucher không hợp lệ/hết hạn/hết lượt/chưa đạt tối thiểu) không mở transaction; luồng thành công tối giản + Manual Discount + Point (kèm publish `POINT_USED_EVENT`) + Voucher (kèm tăng `usedCount`); rollback đúng khi `InventoryInsufficientStockError`/`InventoryConcurrencyConflictError`/`CustomerPointInsufficientBalanceError`/`VoucherConcurrencyConflictError` — map đúng HTTP status (422/409) và publish `CheckoutFailed`.
  - `PrismaInventoryRepository.recordSaleMovement`: trừ đúng qua `updateMany` có điều kiện, chặn âm kho theo setting, cho phép âm kho khi bật setting, ném conflict khi optimistic lock thất bại, tạo mới dòng Inventory khi chưa có (trường hợp âm kho lần đầu), dùng đúng `tx` truyền vào.
- **Full backend suite**: 118 suite / 1061 test — **1060 PASS**, 1 fail (`argon2-password-hasher.spec.ts` timeout đã biết từ các Prompt trước, do tải máy; xác nhận lại 3/3 PASS khi chạy cô lập, không liên quan Prompt 035).
- **Integration**: `test/checkout.e2e-spec.ts` — luồng đầy đủ add cart → checkout (kèm Manual Discount 10%) → hóa đơn/thanh toán đúng số tiền → `GET /invoices/:id`/`GET /payments` xác nhận → giỏ hàng bị xóa; từ chối giỏ hàng trống (422); **rollback đúng khi vượt tồn kho** — giỏ hàng KHÔNG bị mất sau lỗi (Acceptance chính của Prompt 035). **Chưa xác nhận PASS thật** — sandbox không có Docker/Postgres/Redis, cùng giới hạn Gate B đã biết.
- Build/Lint/TypeCheck: **PASS** trên toàn repo. `prisma validate`: **PASS**.

## 8. Self-Review

- **Không TODO/FIXME/console.log/`any`** trong `payment/`, `invoice/`, `checkout/` — grep xác nhận rỗng.
- **"Rollback đúng. Không mất dữ liệu."** (Definition of Done) — đạt được bằng 1 Prisma transaction thật cho toàn bộ Postgres writes, cộng Redis Cart chỉ bị xóa SAU KHI transaction commit — test e2e minh chứng trực tiếp kịch bản hết hàng.
- **Optimistic Lock** áp dụng nhất quán ở cả Inventory VÀ Voucher (cùng kỹ thuật `WHERE <field> = <giá trị vừa đọc>`), không chỉ Inventory.
- **Không vi phạm "không gọi chéo Service tùy tiện"**: `CheckoutService` đóng vai trò orchestrator DUY NHẤT (đúng vai trò Prompt 035 giao) — gọi trực tiếp Repository cho Cart/Inventory/CustomerPoint/Voucher (đọc/ghi cấp thấp, mẫu đã dùng từ Prompt 032), và gọi `InvoiceService`/`PaymentService` (Application Service) vì user liệt kê rõ 2 Service này là **thành phần Checkout cần** — không phải chuỗi gọi tùy tiện qua nhiều domain không liên quan.
- **Các gap đã disclose rõ ràng, không âm thầm**: Order Module (orderId luôn null), Promotion tự động áp dụng, nguồn dữ liệu Member discount, tỷ giá điểm→VND cố định 1:1, tái tính thuế sau giảm giá — tất cả đều là quyết định phạm vi tối giản có chủ đích, không phải thiếu sót bị bỏ qua.

**Định nghĩa hoàn thành đạt được** cho cả 3 Prompt gộp lại trong đợt kéo-trước này (Payment tối giản, Invoice tối giản, Checkout Engine đầy đủ workflow) — trừ Integration Test PASS thật (giới hạn Gate B đã biết). Sẵn sàng cho Volume tiếp theo (036-040: Order/Invoice mở rộng/Payment Engine mở rộng/Multi Payment/Receipt & Refund) — mở rộng trên nền đã có, không viết lại.
