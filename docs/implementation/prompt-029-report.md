# Implementation Report — Prompt 029: Supplier Debt Module

**Ngày:** 2026-07-14
**Phạm vi:** Quản lý công nợ Nhà cung cấp. Business Rules: Purchase increases Debt, Payment decreases Debt, Return decreases Debt; không update Debt trực tiếp. Acceptance: Debt luôn khớp.

## 1. Quyết định thiết kế quan trọng nhất: không tạo bảng `SupplierDebt`/`SupplierPayment` mới

Prompt 029 gọi tên 2 Entity là "SupplierDebt, SupplierPayment", nhưng Foundation schema đã có sẵn `Debt` (generic AR/AP: `type: RECEIVABLE|PAYABLE`, `supplierId`/`customerId` nullable, `amount`, `paidAmount`, `refType`/`refId`) và `Payment` (đã có `supplierId`, `purchaseOrderId`, `direction: IN|OUT`, `amount`, `method`) — **và Prompt 028 (Purchase Return, vừa đóng) đã BẮT ĐẦU ghi dữ liệu thật vào `Debt`** làm sổ cái ghi-thêm (mỗi dòng Return ghi 1 dòng `Debt` mới, `amount` âm, không update dòng nào có sẵn). Có 2 lựa chọn:

- **(A) Tạo `SupplierDebt`/`SupplierPayment` mới hoàn toàn** theo đúng tên Entity — nhưng khi đó dữ liệu Prompt 028 đã ghi vào `Debt` sẽ bị bỏ phí/orphan, và phải quay lại sửa Prompt 028 để ghi vào bảng mới thay vì `Debt`.
- **(B) Tiếp tục dùng `Debt`+`Payment`** làm sổ cái, hiện thực "SupplierDebt" như một khái niệm nghiệp vụ (aggregate được TÍNH, không phải 1 bảng) và "SupplierPayment" chính là `Payment` lọc theo `supplierId`+`direction=OUT`.

Chọn **(B)** — tránh 2 sổ cái song song cho cùng 1 khái niệm kế toán, giữ nguyên vẹn công sức Prompt 028 đã làm, và **chính là cách duy nhất hiện thực đúng nghĩa đen "không update Debt trực tiếp"**: công nợ hiện tại (`balance`) không được lưu ở bất kỳ đâu — nó luôn được TÍNH LẠI tại thời điểm truy vấn:

```
balance = SUM(Debt.amount WHERE type=PAYABLE AND supplierId=X)
        - SUM(Payment.amount WHERE direction=OUT AND supplierId=X)
```

Vì không có con số nào được lưu trung gian và không có bước UPDATE nào trên `Debt`/`Payment`, "Debt luôn khớp" đúng **theo cấu trúc (by construction)** — không có khả năng lệch pha giữa số hiển thị và dữ liệu gốc.

## 2. Nối dây "Purchase increases Debt" — sửa lại Prompt 027 (đã đóng, đã push)

Đây là business rule Prompt 029 tự nhận là của mình ("Purchase increases Debt"), nhưng vị trí ghi dữ liệu chính xác nhất là ngay trong `PurchaseOrderService.receive()`/`PrismaPurchaseOrderRepository.receive()` (Prompt 027) — nơi duy nhất một đơn nhập chuyển sang có hiệu lực. Prompt 028 (Purchase Return) đã ghi rõ trong báo cáo của mình: *"Prompt 027 CHƯA ghi dòng Debt nào khi Receive... việc nối dây được chủ đích để lại cho Prompt 029."* Thực hiện đúng như đã cam kết:

- Sửa `PrismaPurchaseOrderRepository.receive()`: sau khi ghi xong toàn bộ `InventoryMovement`/`Inventory` cho từng dòng hàng, ghi **thêm 1 dòng `Debt`** (`type: PAYABLE`, `refType: 'PurchaseOrder'`, `refId`, `amount: current.totalAmount` — dương, `status: 'OPEN'`) — **trong cùng 1 transaction** với phần Inventory đã có, không mở transaction riêng.
- Cập nhật `prisma-purchase-order.repository.spec.ts` (thêm mock `tx.debt.create` + assertion) và `test/purchase-order.e2e-spec.ts` (thêm truy vấn trực tiếp bảng `Debt` xác nhận đúng 1 dòng `PAYABLE` = `totalAmount`).
- **Không sửa gì khác của Prompt 027** (API, DTO, response không đổi — đây là side-effect nội bộ của `receive()`, không lộ ra field mới nào).

`status: 'OPEN'` cho dòng Purchase (chưa thanh toán) khác với `status: 'SETTLED'` mà Prompt 028 đã dùng cho dòng Return (một điều chỉnh tự thân, không chờ hành động gì thêm) — `status` không tham gia vào phép tính `balance` (chỉ tính qua `amount`), nên khác biệt này chỉ có ý nghĩa đọc-hiểu, không ảnh hưởng tính đúng đắn.

## 3. Quyết định thiết kế khác

1. **Route giữ nguyên dạng số ít `/supplier-debt`, `/supplier-payment` đúng theo Prompt 029** — khác với Prompt 028 (`/purchase-return` bị chuẩn hóa thành số nhiều vì có sibling `/purchase-orders` số nhiều ngay trong cùng loạt Prompt, gợi ý lỗi đánh máy). Prompt 029 dùng số ít nhất quán ở CẢ HAI endpoint của chính nó, không có sibling số nhiều nào để so sánh trực tiếp — đọc là tên miền nghiệp vụ (báo cáo công nợ / hành động thanh toán) hơn là 1 resource-collection REST chuẩn, nên giữ nguyên văn.
2. **2 Controller riêng** (`SupplierDebtController` tại `/supplier-debt`, `SupplierPaymentController` tại `/supplier-payment`) dùng chung 1 `SupplierDebtService` — vì NestJS `@Controller()` chỉ nhận 1 route gốc/class, và 2 endpoint có 2 route gốc khác nhau. Cùng mẫu tách controller đã dùng ở Supplier/SupplierProduct (Prompt 026).
3. **Không thêm permission mới** — tái dùng nguyên trạng `debt:view` và `payment:create` đã có sẵn trong catalog Foundation (Prompt 015), đúng mô tả sẵn có ("Xem công nợ", "Ghi nhận thanh toán").
4. **`GET /supplier-debt` trả về TẤT CẢ Supplier khớp filter** (kể cả `balance=0`, chưa từng phát sinh) — đúng tinh thần một màn hình "Công nợ Nhà cung cấp" tổng quan, không chỉ những NCC đang nợ.
5. **`POST /supplier-payment` chặn thanh toán vượt quá `balance` hiện tại** (đọc lại `balance` NGAY TRONG transaction trước khi ghi `Payment`, chặn race condition khi 2 thanh toán được tạo đồng thời) — quy tắc tự suy ra (không có trong Prompt) nhưng cần thiết để bảo vệ "Debt luôn khớp" không bị đẩy âm bất hợp lý bởi lỗi nhập liệu.
6. **`purchaseOrderId` trên Payment là tùy chọn** — một khoản thanh toán có thể gán cho 1 đơn nhập cụ thể hoặc là thanh toán chung cho công nợ NCC, đúng với việc field này vốn đã nullable trong Foundation `Payment`.

## 4. Chức năng đã hoàn thành

- **`GET /supplier-debt`**: danh sách công nợ hiện tại theo từng Nhà cung cấp (lọc `search`/`supplierId`, phân trang), mỗi dòng gồm `totalDebt`/`totalPaid`/`balance`.
- **`POST /supplier-payment`**: ghi nhận thanh toán cho Nhà cung cấp (giảm công nợ), chặn nếu vượt quá công nợ hiện tại.
- **Purchase Order Receive** (sửa lại, Prompt 027) giờ ghi công nợ đúng theo `totalAmount` đơn nhập.
- **Audit Log** cho `supplier_payment.create`.
- **Permission**: tái dùng `debt:view`/`payment:create` — không thêm gì mới.

## 5. File đã tạo/sửa

**Tạo mới** — `backend/src/modules/supplier-debt/` (không có `infrastructure/generators` vì không sinh mã nào — cả `SupplierDebt` lẫn `SupplierPayment` đều không có mã nghiệp vụ riêng): domain (entity `SupplierDebtEntity`/`SupplierPaymentEntity`, repository interface với `SupplierPaymentExceedsBalanceError`), application (DTO×3 + spec, mapper, service + spec — inject cả `ISupplierDebtRepository` lẫn `ISupplierRepository` từ module Prompt 026 để validate tồn tại NCC), infrastructure (Prisma repository + spec — trọng tâm phép tính `balance` bằng `groupBy`/`aggregate`, không lưu trung gian), presentation (2 controller + spec), `supplier-debt.module.ts` (import `SupplierModule`).
**Tạo mới khác**: `backend/test/supplier-debt.e2e-spec.ts`.
**Sửa**: `app.module.ts` (đăng ký `SupplierDebtModule`), `error-codes.ts` (+`SUPPLIER_DEBT_001`), **`purchase-order/infrastructure/persistence/prisma-purchase-order.repository.ts`** (nối dây Purchase increases Debt vào `receive()`) + spec + `test/purchase-order.e2e-spec.ts` tương ứng.
**Không sửa**: `schema.prisma` (không cần — tái dùng nguyên trạng `Debt`/`Payment`/`Supplier`), `permission-catalog.ts` (không cần — tái dùng permission có sẵn).

## 6. Migration

**Không có migration nào trong Prompt này** — không thêm/sửa bảng, cột, hay enum nào. Đây là Prompt Purchase-series đầu tiên không cần migration, vì toàn bộ hạ tầng dữ liệu cần thiết (`Debt`, `Payment`, cả 2 đều có sẵn từ migration khởi tạo) đã đủ dùng.

## 7. API

| Method | Path | Permission |
|---|---|---|
| GET | `/api/v1/supplier-debt` | `debt:view` |
| POST | `/api/v1/supplier-payment` | `payment:create` |

## 8. Test

- **Unit**: **702/702 PASS** toàn backend (tăng từ 682 sau Prompt 028). Supplier-debt-specific (20 test): `SupplierDebtService` (search map query; createPayment — 404 khi thiếu supplier, tạo thành công + audit, dịch `ExceedsBalanceError`→422), `PrismaSupplierDebtRepository` (search — tính đúng balance từ groupBy Debt/Payment, balance=0 khi chưa có dữ liệu, không gọi groupBy khi danh sách supplier rỗng; getBalance — tính đúng; createPayment — thành công trong hạn mức, ném lỗi khi vượt hạn mức, ném lỗi khi balance=0), 2 controller (permission metadata, ủy quyền), DTO validation. Purchase-order-specific bổ sung: test `receive()` giờ xác nhận thêm dòng `Debt` PAYABLE đúng `totalAmount`.
- **Coverage** (`supplier-debt/`, loại trừ `.module.ts`): **96.75% statement, 92.85% function, 97.9% line, 80% branch** — vượt mốc 90% yêu cầu ở statement/function/line.
- **Integration**: `test/supplier-debt.e2e-spec.ts` — **PURCHASE-INCREASES-DEBT** (nhận hàng 10×8000 → balance=80000 qua HTTP thật); **PAYMENT-DECREASES-DEBT** (thanh toán 30000 → balance giảm đúng 30000); **EXCEEDS-BALANCE** (thanh toán vượt balance hiện tại → 422); **RETURN-DECREASES-DEBT** (mua thêm 5×2000=10000, trả 2 → balance giảm đúng 2×2000=4000 — xác nhận toàn bộ chuỗi Purchase→Return→Debt hoạt động đúng xuyên suốt 3 module 027/028/029); tìm theo mã/tên NCC. **Chưa xác nhận PASS thật** — sandbox không có Docker/PostgreSQL, cùng giới hạn Gate B đã disclose từ Prompt 016.
- Build/Lint/TypeCheck/Prisma validate: tất cả **PASS** trên toàn repo.

## 9. Self-Review

- **Không TODO/FIXME/console.log/`any`** — `grep` xác nhận rỗng trong `src/modules/supplier-debt/`.
- **Architecture Review**: `SupplierDebtModule` phụ thuộc `SupplierModule` (lấy `SUPPLIER_REPOSITORY` để validate tồn tại NCC trước khi tạo Payment) — một chiều, không circular. Domain layer không import `@prisma/client` trực tiếp — `SupplierPaymentMethod` được định nghĩa lại dưới dạng string union nội bộ, cùng nguyên tắc đã áp dụng cho mọi status/enum khác trong dự án.
- **Security Review**: mọi truy vấn lọc `organizationId`; `balance` luôn tính từ dữ liệu gốc (không tin bất kỳ giá trị cache/derived nào), chặn thanh toán vượt hạn mức bảo vệ tính toàn vẹn số liệu.
- **Data Integrity (trọng tâm của Prompt này)**: "Debt luôn khớp" không phải một bất biến cần kiểm tra định kỳ — nó là hệ quả tất yếu của thiết kế sổ cái ghi-thêm + tính-tại-thời-điểm-truy-vấn, không có bất kỳ con số trung gian nào có thể lệch pha với dữ liệu gốc.
- **Performance**: `search()` dùng 3 truy vấn (`supplier.findMany`/`count` + 2 `groupBy`) thay vì N+1 — số lượng truy vấn không phụ thuộc số lượng supplier trả về. Chưa có benchmark khối lượng lớn (không có yêu cầu định lượng ở Prompt 029; sẽ là trọng tâm của Prompt 030 — Purchase Report).

**Definition of Done đạt được** (trừ Integration Test PASS thật — cùng giới hạn Gate B đã biết, đã disclose minh bạch). Toàn bộ chuỗi nghiệp vụ Purchase (027) → Purchase Return (028) → Supplier Debt (029) giờ đã khép kín và nhất quán: mọi thay đổi công nợ đều đi qua đúng 1 cơ chế sổ cái ghi-thêm dùng chung, không có đường nào update trực tiếp. Sẵn sàng cho Prompt 030 (Purchase Report — báo cáo tổng hợp trên toàn bộ dữ liệu đã xây dựng từ Prompt 026-029).
