# Implementation Report — Prompt 028: Purchase Return Module

**Ngày:** 2026-07-14
**Phạm vi:** Trả hàng Nhà cung cấp. Workflow: Purchase → Return → Inventory Out → Debt Reduce. `InventoryMovement` bắt buộc.

## 1. Quyết định thiết kế

1. **Không tái dùng `Return`/`ReturnItem` (Foundation)** — model này gắn cứng với `Order`/`OrderItem` (trả hàng khách, `totalRefund`/`refundAmount`), không có đường nào dẫn tới `PurchaseOrder`/`Supplier`. Xây `PurchaseReturn`/`PurchaseReturnItem` hoàn toàn mới, cùng khuôn mẫu `X`/`XItem` đã dùng xuyên suốt (Transfer, StockCount, InventoryAdjustment, PurchaseOrder). Bảng mới hoàn toàn nên migration không cần backfill dữ liệu cũ.
2. **`PurchaseReturnItem` gắn với đúng 1 `PurchaseItem` gốc** (không chỉ `productId`) — để biết chính xác đã nhập vào **kho nào** với **đơn giá nào** (Prompt 027 đã cho phép mỗi dòng hàng nhập vào kho riêng), từ đó Inventory Out trừ đúng kho và Debt Reduce tính đúng theo giá vốn gốc. `warehouseId`/`unitCost` được suy ra từ `PurchaseItem` ở tầng Service, **không nhận từ client** — tránh trả sai kho/sai giá vốn do client tự khai.
3. **Trạng thái suy ra từ 2 action đã cho (`approve`, `complete`) + `create`**: `DRAFT → APPROVED → COMPLETED`. Không có action "submit" nào trong API list nên không có trạng thái trung gian trước `APPROVED`. `approve()` là cổng phê duyệt thuần túy (không đụng tồn kho/công nợ) — đúng mẫu đã áp dụng ở PurchaseOrder/InventoryAdjustment; `complete()` là nơi DUY NHẤT thực thi Inventory Out + Debt Reduce, khớp đúng chuỗi "Return → Inventory Out → Debt Reduce" của Prompt.
4. **Bổ sung `CANCELLED`** (không có trong bất kỳ liệt kê tường minh nào của Prompt 028) — lối thoát an toàn cho phiếu tạo nhầm, cùng mẫu đã áp dụng nhất quán ở MỌI module workflow trước (Transfer/StockCount/Adjustment/PurchaseOrder đều có cancel). Chỉ cho phép từ `[DRAFT, APPROVED]`, chặn sau `COMPLETED` (đã đụng tồn kho/công nợ, không tự động hoàn tác).
5. **Business rule tự suy ra (không có trong Prompt nhưng bắt buộc về logic nghiệp vụ)**: (a) chỉ được tạo phiếu trả từ Purchase Order đã **RECEIVED** — không thể trả hàng chưa từng nhận; (b) tổng số lượng trả (kể cả các phiếu trả trước đó, trừ phiếu đã hủy) của 1 dòng hàng **không được vượt quá `receivedQuantity`** — kiểm tra NGAY TRONG transaction lúc tạo (đọc lại `PurchaseItem.receivedQuantity` + tổng `PurchaseReturnItem` hiện có) để chặn race condition khi tạo nhiều phiếu trả đồng thời cho cùng 1 dòng hàng. Cả hai đều trực tiếp phục vụ acceptance criterion "Inventory đúng".
6. **Route dùng dạng số nhiều `/purchase-returns`** dù Prompt 028 viết `POST /purchase-return` (số ít) — nhất quán tuyệt đối với MỌI resource khác trong toàn hệ thống (`/suppliers`, `/purchase-orders`, `/warehouses`, ...). Hiểu là chưa nhất quán trong văn bản Prompt, không phải một quy ước route mới có chủ đích — đã disclose bằng comment ngay trong code.
7. **`Debt` (Foundation, chưa từng được ghi dữ liệu ở bất kỳ Prompt nào trước đây) trở thành sổ cái ghi-thêm (append-only ledger)**, cùng triết lý `InventoryMovement`: `complete()` ghi **1 dòng `Debt` mới** (`type: PAYABLE`, `refType: 'PurchaseReturn'`, `refId`, `amount` **âm** = giảm công nợ phải trả NCC, `status: SETTLED`) thay vì tìm và sửa (`UPDATE`) một dòng Debt đang mở — không có "update Debt trực tiếp" ở bất kỳ đâu, đúng tinh thần "không update Debt trực tiếp" mà chính Prompt 029 (kế tiếp) sẽ nêu tường minh. **Quan trọng**: Prompt 027 (Purchase Order, đã đóng) CHƯA ghi dòng Debt nào khi Receive — vế "Purchase increases Debt" là business rule được Prompt 029 nêu tường minh là của riêng nó, nên việc nối dây "Receive → ghi Debt dương" được **chủ đích để lại cho Prompt 029** thực hiện (kể cả việc quay lại chỉnh sửa `PurchaseOrderService`/`PrismaPurchaseOrderRepository.receive()` của Prompt 027 — hoàn toàn hợp lý vì Prompt 029 tự nhận sở hữu quy tắc đó). Prompt 028 chỉ chịu trách nhiệm đúng phần việc CỦA MÌNH: "Return decreases Debt".
8. **Chặn âm tồn kho tái dùng nguyên trạng `Setting.inventory.allowNegativeStock`** (đã có từ Prompt 025) — cùng cơ chế, cùng key, đọc trong transaction của `complete()`. Không thêm bảng/cột cấu hình mới.
9. **Không dùng `IInventoryRepository.recordMovement()`** — lý do giống hệt PurchaseOrder.receive() (Prompt 027): hàm đó tự mở transaction riêng, không thể tham gia transaction của `complete()`, vi phạm yêu cầu "InventoryMovement bắt buộc" phải nằm cùng 1 giao dịch với thay đổi trạng thái phiếu.
10. **Mã phiếu `PTHxxxxxx` ("Phiếu Trả Hàng") sinh qua bảng `Sequence`** — tái dùng chính xác cơ chế đã có.

## 2. Chức năng đã hoàn thành

- **`POST /purchase-returns`**: tạo phiếu (DRAFT), validate Purchase Order đã RECEIVED, validate từng dòng hàng thuộc đúng đơn, validate không vượt số lượng đã nhận, tự tính `unitCost`/`warehouseId`/`totalAmount` từ `PurchaseItem` gốc.
- **`GET /purchase-returns`** / **`GET /purchase-returns/:id`**: danh sách (lọc `status`/`purchaseOrderId`/`supplierId`/`search`, phân trang) và chi tiết.
- **`PATCH .../approve`**: `DRAFT → APPROVED`.
- **`PATCH .../complete`**: `APPROVED → COMPLETED` — ghi `InventoryMovement` (`RETURN`, số lượng âm) + đồng bộ `Inventory` (chặn âm tồn kho theo Setting) cho từng dòng, rồi ghi 1 dòng `Debt` (`PAYABLE`, âm) — tất cả trong 1 Transaction.
- **`PATCH .../cancel`**: hủy phiếu chưa Complete.
- **Audit Log** đầy đủ cho cả 4 hành động ghi.
- **Permission**: `purchase_return:view/create/approve/complete/cancel` (nhóm hoàn toàn mới).

## 3. File đã tạo/sửa

**Tạo mới** — `backend/src/modules/purchase-return/` (đủ 4 lớp + code generator riêng): domain (entity, repository interface với `PurchaseReturnStatusConflictError`/`PurchaseReturnExceedsReceivedError`/`PurchaseReturnNegativeStockError`, code-generator interface), application (DTO×3 + spec, mapper, service + spec — inject cả `IPurchaseReturnRepository` lẫn `IPurchaseOrderRepository` từ module Prompt 027), infrastructure (Prisma repository + spec — trọng tâm `create()` kiểm tra hạn mức đã nhận và `complete()` atomic Inventory-Out+Debt, `SequencePurchaseReturnCodeGenerator` + spec), presentation (controller + spec), `purchase-return.module.ts` (import `PurchaseOrderModule` để lấy `PURCHASE_ORDER_REPOSITORY`).
**Tạo mới khác**: `backend/test/purchase-return.e2e-spec.ts`, migration `20260714130000_purchase_return_module`.
**Sửa**: `schema.prisma` (thêm `PurchaseReturn`/`PurchaseReturnItem`/`PurchaseReturnStatus`/`PurchaseReturnReason`; back-relation trên `Organization`/`PurchaseOrder`/`Supplier`/`PurchaseItem`/`Product`/`Warehouse`), `app.module.ts` (đăng ký `PurchaseReturnModule`), `error-codes.ts` (+`PURCHASE_RETURN_001..008`), `permission-catalog.ts` (+5 permission `purchase_return:*`, viết tay thay vì dùng helper `crud()` vì không có endpoint update/delete).

## 4. Migration

`20260714130000_purchase_return_module`: 2 enum mới (`PurchaseReturnStatus`, `PurchaseReturnReason`); bảng `purchase_returns` (unique `[organizationId, code]`, index `purchaseOrderId`/`supplierId`/`status`); bảng `purchase_return_items` (FK tới `purchase_returns`/`purchase_items`/`products`/`warehouses`, index đầy đủ). Không có ALTER trên bảng cũ, không có rủi ro dữ liệu hiện có (bảng hoàn toàn mới).

## 5. API

| Method | Path | Permission |
|---|---|---|
| POST | `/api/v1/purchase-returns` | `purchase_return:create` |
| GET | `/api/v1/purchase-returns` | `purchase_return:view` |
| GET | `/api/v1/purchase-returns/:id` | `purchase_return:view` |
| PATCH | `/api/v1/purchase-returns/:id/approve` | `purchase_return:approve` |
| PATCH | `/api/v1/purchase-returns/:id/complete` | `purchase_return:complete` |
| PATCH | `/api/v1/purchase-returns/:id/cancel` | `purchase_return:cancel` |

Xác nhận qua `nest build`/`tsc --noEmit` sạch và toàn bộ constructor injection qua controller/service spec. **DI graph runtime** không bootstrap được `AppModule` thật trong sandbox này (Redis/Queue không có sẵn — cùng giới hạn đã ghi nhận ở Prompt 027); cấu trúc provider/token của `PurchaseReturnModule` giống hệt các module đã bootstrap thành công trước đó.

## 6. Test

- **Unit**: **682/682 PASS** toàn backend (tăng từ 632 sau Prompt 027). Purchase-return-specific (50 test): `PurchaseReturnService` (create — 404 khi thiếu PO, 422 khi PO chưa RECEIVED, 422 khi purchaseItemId không thuộc đơn, tính đúng unitCost/warehouseId/totalAmount từ PurchaseItem gốc + audit, dịch `ExceedsReceivedError`→422; findOne 404; search; approve/complete/cancel đều +audit +dịch conflict/negative-stock), `PrismaPurchaseReturnRepository` (create — thành công trong hạn mức, **ném ExceedsReceivedError khi vượt hạn mức**, **cộng dồn đúng số lượng đã trả trước đó**, P2002→409, P2003→400; findById/search/existsByCode; approve/cancel qua `updateMany`+conflict; **complete** — conflict khi không APPROVED, **ghi đúng Movement RETURN số lượng âm + đồng bộ Inventory + ghi đúng Debt PAYABLE âm** trong 1 transaction, ném NegativeStockError + không ghi gì khi vi phạm Setting, cho phép âm khi Setting=true), controller (permission metadata 6 method, ủy quyền), DTO validation, code generator.
- **Coverage** (`purchase-return/`, loại trừ `.module.ts`): **95.7% statement, 96.07% function, 97.5% line, 73.68% branch** — vượt mốc 90% yêu cầu ở statement/function/line.
- **Integration**: `test/purchase-return.e2e-spec.ts` — luồng đầy đủ qua HTTP thật: tạo Purchase Order → approve → receive (setup) → tạo Purchase Return → approve → complete, xác nhận `Inventory.quantity` giảm đúng (20→15), `GET /inventory/history?movementType=RETURN` trả đúng 1 Movement `-5` kèm `referenceId` = purchaseReturnId, **và truy vấn trực tiếp bảng `Debt` xác nhận đúng 1 dòng `PAYABLE` với `amount=-40000`**; từ chối tạo phiếu trả vượt số lượng đã nhận (422); từ chối tạo phiếu trả cho đơn còn DRAFT (422); hủy phiếu DRAFT + chặn hủy lại phiếu đã CANCELLED; chi tiết theo id + lọc danh sách theo purchaseOrderId. **Chưa xác nhận PASS thật** — sandbox không có Docker/PostgreSQL, cùng giới hạn Gate B đã disclose từ Prompt 016.
- Build/Lint/TypeCheck/Prisma validate: tất cả **PASS** trên toàn repo.

## 7. Self-Review

- **Không TODO/FIXME/console.log/`any`** — `grep` xác nhận rỗng trong `src/modules/purchase-return/`.
- **Architecture Review**: Clean Architecture giữ nguyên 4 lớp; `PurchaseReturnModule` phụ thuộc `PurchaseOrderModule` (import để lấy `PURCHASE_ORDER_REPOSITORY` — một chiều, không circular vì `PurchaseOrderModule` không biết gì về `PurchaseReturnModule`) — đây là phụ thuộc module-tới-module hợp lệ đầu tiên trong loạt Purchase, phản ánh đúng quan hệ nghiệp vụ thực (Return luôn xuất phát từ 1 Order có sẵn).
- **Security Review**: mọi truy vấn lọc `organizationId`; `unitCost`/`warehouseId`/`totalAmount` đều tính server-side từ dữ liệu gốc đã lưu, không tin client; P2003 dịch sang 400 rõ ràng.
- **Performance Review**: `complete()` xử lý tuần tự từng dòng hàng trong 1 transaction — chấp nhận được ở quy mô 1 phiếu trả thực tế; không có yêu cầu định lượng nào ở Prompt 028.
- **Concurrency**: `create()` kiểm tra hạn mức "không vượt receivedQuantity" NGAY TRONG transaction (đọc lại số liệu sống, không dùng giá trị đã fetch trước đó ở Service) — chặn race condition khi 2 phiếu trả được tạo đồng thời cho cùng 1 dòng hàng; `approve()`/`complete()`/`cancel()` đều đọc lại status trước khi ghi, cùng mẫu đã áp dụng từ Prompt 023.

**Definition of Done đạt được** (trừ Integration Test PASS thật và DI graph runtime bootstrap — cả hai bị chặn bởi hạ tầng không có sẵn trong sandbox, đã disclose minh bạch, đồng nhất với mọi Prompt trước). Sẵn sàng cho Prompt 029 (Supplier Debt — sẽ nối dây "Purchase increases Debt" còn thiếu và xây `GET /supplier-debt`/`POST /supplier-payment` trên nền `Debt` ledger vừa được khởi động ở Prompt này).
