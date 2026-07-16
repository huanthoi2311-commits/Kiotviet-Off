# Inventory — Transaction Boundary

> Tài liệu phân tích/thiết kế (T003.5). Không sửa code. Với mỗi luồng: mô tả **Hiện trạng** (đã verify trong code) và **Target** (đề xuất sau T004, chưa build).

## 1. Purchase Receive

**Hiện trạng** — `PrismaPurchaseOrderRepository.receive()`, 1 `$transaction` duy nhất bao trọn:
1. Đọc `PurchaseOrder` + `purchaseItems`, kiểm tra status phải là `APPROVED`.
2. Với MỖI item: đọc `Inventory` hiện tại → `applyInventoryDelta()` (delta dương, có `unitCost`) → upsert `Inventory` → tạo `InventoryMovement` (PURCHASE/PURCHASE) → cập nhật `PurchaseItem.receivedQuantity`.
3. Tạo `Debt` (PAYABLE, dương — tăng công nợ phải trả NCC).
4. Cập nhật `PurchaseOrder.status = RECEIVED`.

Đã atomic đúng nghĩa hôm nay (1 transaction, rollback-all-or-nothing) — vấn đề duy nhất là bước 2 tự viết thẳng vào `tx.inventory`/`tx.inventoryMovement` thay vì gọi qua `IInventoryRepository`.

**Target** — ranh giới transaction giữ nguyên như hiện tại. Bước 2 đổi thành gọi `inventoryRepository.recordMovement(input, tx)` (chữ ký mới, nhận `tx`) trong vòng lặp, thay cho code inline. Không có thay đổi về SỐ LƯỢNG/PHẠM VI thao tác trong 1 transaction — chỉ đổi AI thực hiện thao tác ghi Inventory.

## 2. Transfer — ranh giới CỐ Ý tách làm 2 transaction, KHÔNG gộp

**Hiện trạng** — `PrismaTransferRepository.transitionStatus()` là 1 hàm dùng chung, nhưng được gọi ở **2 thời điểm tách biệt**, mỗi lần mở transaction riêng:

- **Transaction 1 — `approve()`** (PENDING→APPROVED): trừ kho NGUỒN (`fromWarehouseId`) ngay lập tức — ghi `TRANSFER_OUT` cho từng item, snapshot `avgCost` hiện tại của kho nguồn vào `TransferItem.unitCost` (`captureUnitCostToItem: true`) để giữ đúng giá vốn khi hàng cập bến kho khác.
- **Transaction 2 — `receive()`** (APPROVED→RECEIVED): cộng kho ĐÍCH (`toWarehouseId`) — ghi `TRANSFER_IN` cho từng item, dùng `unitCost` đã snapshot ở bước approve.

Hai transaction này có thể cách nhau tùy ý về thời gian (phút/giờ/ngày — hàng đang trên đường vận chuyển thực tế).

**Đây là thiết kế ĐÚNG, không phải lỗi cần sửa.** Việc hàng "rời kho nguồn" và "đến kho đích" là 2 sự kiện nghiệp vụ thật sự tách biệt trong đời thực — gộp thành 1 transaction DB sẽ sai về mặt mô hình hóa (ngụ ý hàng dịch chuyển tức thời, bỏ qua khả năng thất lạc/hư hỏng trong khi vận chuyển — luồng xử lý thất lạc chưa được xây, xem [[inventory-concurrency]]).

**Target** — giữ nguyên 2 transaction boundary như hiện tại. Mỗi transaction, thay vì tự viết `tx.inventory.upsert()`, gọi `inventoryRepository.recordMovement(input, tx)`. Riêng bước lấy `avgCost` hiện tại của kho nguồn để snapshot vào `TransferItem.unitCost` cần một cách đọc `Inventory` (đã có sẵn qua `getByProduct`/tương đương) TRƯỚC khi gọi hàm ghi.

**Gap phát hiện được (không có trong 3 module còn lại):** `approve()` (trừ kho nguồn) **không hề kiểm tra `allowNegativeStock`** — khác với `purchase-return.complete()` và `inventory-adjustment.complete()` đều có check này trước khi trừ kho. Về lý thuyết, Transfer OUT có thể đẩy `quantity` xuống âm mà không bị chặn. Đây là điểm không nhất quán giữa 5 module, cần SPEC-INV-001 quyết định có nên thêm check này vào Transfer OUT không (xem [[inventory-migration-plan]] mục Transfer).

## 3. Adjustment (Inventory Adjustment)

**Hiện trạng** — `PrismaInventoryAdjustmentRepository.complete()`, 1 `$transaction`:
1. Đọc `InventoryAdjustment` + items, kiểm tra status = `APPROVED`.
2. Đọc `Setting` (`inventory.allowNegativeStock`).
3. Với mỗi item: đọc `Inventory` → tính `afterQuantity` → **nếu không cho phép âm kho và `afterQuantity < 0` → throw, rollback toàn bộ** → upsert `Inventory` → tạo `InventoryMovement` (ADJUSTMENT/SYSTEM).
4. Cập nhật `InventoryAdjustment.status = COMPLETED`.

**Target** — ranh giới giữ nguyên; bước 3 chuyển sang gọi `inventoryRepository.recordMovement(input, tx)`, với negative-stock check chuyển vào bên trong hàm ghi dùng chung thay vì lặp lại thủ công ở đây.

## 4. Checkout (Sale) — mẫu THAM CHIẾU đã đúng

**Hiện trạng** — `CheckoutService.checkout()`, 1 `$transaction` bao gồm: tạo `Invoice`, tạo `Payment`, và **với mỗi item trong giỏ: gọi `inventoryRepository.recordSaleMovement(input, tx)`** — TRUYỀN `tx` của chính transaction Checkout vào, không tự mở transaction riêng. Đây chính là mẫu Target mà 5 module còn lại cần copy.

Sau khi transaction commit (ngoài `$transaction`): xóa Cart, publish `CHECKOUT_COMPLETED_EVENT`, publish `POINT_USED_EVENT` (nếu có dùng điểm), ghi AuditLog. Đúng thứ tự "publish event sau khi commit" đã nêu ở [[inventory-event-flow]].

**Target** — không thay đổi gì, đã đúng chuẩn.

## 5. Refund — module CHƯA TỒN TẠI

Grep xác nhận: không có module `refund` trong `src/modules/`. Model `Return`/`ReturnItem` tồn tại trong schema nhưng có 0 tham chiếu code (đã ghi nhận từ Prompt A01). "Refund" ở đây khác với `purchase-return` (trả hàng NHÀ CUNG CẤP — đã có module) — đây là trả hàng từ KHÁCH HÀNG về cửa hàng (POS-side return), chưa được xây.

**Không có "Hiện trạng" để mô tả.** Chỉ có thể phác thảo Target theo tính đối xứng với Checkout: một `RefundService`/`SalesReturnService` tương lai sẽ mở 1 `$transaction`, gọi `inventoryRepository.recordMovement(input, tx)` với movement dương (hàng quay lại kho — hướng ngược Checkout), cập nhật status aggregate của chính nó, publish event sau khi commit. Đây là **thiết kế tương lai, không thuộc phạm vi T004** (T004 chỉ di chuyển 5 module đã tồn tại) — cần SPEC riêng khi module này thực sự được lên kế hoạch xây.

## 6. Stock Count

**Hiện trạng** — 2 bước tách biệt như Transfer, nhưng vì lý do khác:

- **`create()`**: chụp `systemQty` = `Inventory.quantity` HIỆN TẠI cho từng sản phẩm được chọn kiểm kê — đọc, KHÔNG mở transaction ghi Inventory.
- **`start()`**: DRAFT→COUNTING, chỉ đổi status, không đụng Inventory.
- **`complete()`** — 1 `$transaction`: đọc `StockCount` + items (status phải `COUNTING`) → với mỗi item có `actualQty` nhập vào: cập nhật `StockCountItem.actualQty`/`difference` → **nếu `difference != 0`**: đọc `Inventory` hiện tại (KHÔNG dùng lại `systemQty` đã chụp lúc `create()` — đọc lại giá trị MỚI NHẤT) → upsert `Inventory` → tạo `InventoryMovement` (COUNT/COUNT). Cuối cùng cập nhật status = `COMPLETED`.

**Điểm cần lưu ý về ranh giới thời gian:** khoảng cách giữa `create()` (chụp `systemQty`) và `complete()` (áp dụng chênh lệch) có thể dài tùy ý (nhân viên đi đếm hàng vật lý). Trong khoảng đó, các nghiệp vụ khác (Sale, Purchase Receive...) vẫn chạy bình thường trên cùng sản phẩm — không có gì "khóa" sản phẩm lại trong lúc đếm. `complete()` tự bảo vệ đúng bằng cách đọc `Inventory.quantity` MỚI NHẤT ngay trước khi tính `afterQuantity` (không dùng số cũ), nên kết quả SỐ LƯỢNG cuối cùng luôn đúng về mặt toán học — nhưng Ý NGHĨA của `StockCountItem.difference` (được tính so với `systemQty` chụp lúc tạo phiếu, không phải so với số dư ngay trước khi hoàn tất) có thể không còn phản ánh đúng "số đếm sai lệch bao nhiêu so với thực tế đếm", nếu có nghiệp vụ khác xen vào giữa. Phân tích sâu hơn ở [[inventory-concurrency]] Case 5.

**Target** — ranh giới giữ nguyên; bước ghi Inventory trong `complete()` chuyển sang gọi `inventoryRepository.recordMovement(input, tx)`. `movementType = COUNT` cần được exempt khỏi negative-stock check trong hàm ghi dùng chung (xem [[inventory-migration-plan]]).

## 7. Bảng tổng hợp

| Luồng | Số transaction | Có sẵn atomic đúng? | Cần đổi ranh giới ở T004? | Gap khác ngoài "bỏ qua interface" |
|---|---|---|---|---|
| Purchase Receive | 1 | ✅ | Không, chỉ đổi cách gọi | Không |
| Purchase Return | 1 | ✅ | Không, chỉ đổi cách gọi | Không |
| Transfer OUT (approve) | 1 (tách riêng) | ✅ | Không, chỉ đổi cách gọi | Thiếu negative-stock check |
| Transfer IN (receive) | 1 (tách riêng) | ✅ | Không, chỉ đổi cách gọi | Không |
| Stock Count complete | 1 | ✅ (số học đúng) | Không, chỉ đổi cách gọi | `difference` có thể lệch ý nghĩa nếu có biến động xen giữa |
| Inventory Adjustment | 1 | ✅ | Không, chỉ đổi cách gọi | Không |
| Checkout (Sale) | 1 | ✅ Đã đúng chuẩn | Không cần đổi | Không |
| Refund | — chưa tồn tại | N/A | Thiết kế mới, ngoài phạm vi T004 | N/A |

**Kết luận:** T004 KHÔNG cần thay đổi ranh giới transaction của bất kỳ luồng nào hiện có — mọi luồng đã atomic đúng. T004 chỉ cần thay "ai thực hiện thao tác ghi Inventory bên trong ranh giới đã đúng đó" — từ code inline sang gọi `IInventoryRepository` với `tx` composable.
