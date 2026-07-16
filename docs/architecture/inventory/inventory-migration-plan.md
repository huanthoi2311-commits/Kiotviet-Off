# Inventory — Migration Plan (for future T004)

> Tài liệu phân tích/thiết kế (T003.5). **KHÔNG sửa code, không tạo migration, không refactor ở đây.** Đây là kế hoạch mô tả T004 sẽ làm gì — chỉ thực thi sau khi `SPEC-INV-001` được duyệt "APPROVED FOR DEVELOPMENT".

## 1. Tiền đề bắt buộc — phải làm TRƯỚC khi migrate bất kỳ module nào trong 5 module

Cả 5 migration bên dưới đều phụ thuộc vào các thay đổi chung này tại `inventory` module (chi tiết thiết kế ở [[inventory-write-path]] và [[inventory-locking-strategy]]):

- **P1 — Chữ ký hàm ghi chấp nhận `tx` composable.** `recordMovement()` (hoặc hàm hợp nhất thay thế nó, xem [[inventory-write-path]] §4 Hướng A) phải nhận `tx?: Prisma.TransactionClient` giống hệt `recordSaleMovement()` đã có — đây là lý do kỹ thuật GỐC khiến 5 module bỏ qua interface (xem [[inventory-write-path]] §3), không giải quyết cái này thì không thể migrate module nào.
- **P2 — Tổng quát hóa Optimistic Lock.** Compare-and-swap (`updateMany WHERE quantity = beforeQuantity`) phải áp dụng cho MỌI `movementType`, không chỉ SALE.
- **P3 — Tập trung hóa negative-stock check.** Hiện bị lặp lại y hệt ở `purchase-return` và `inventory-adjustment` (đọc `Setting` key `inventory.allowNegativeStock`), THIẾU ở `transfer`, không áp dụng ở `purchase-order`/`stock-count`. Cần 1 nơi duy nhất trong hàm ghi dùng chung, có khả năng bật/tắt theo `movementType` (PURCHASE và COUNT luôn exempt — xem từng mục bên dưới).
- **P4 — Quyết định nguồn Setting.** Chọn giữ đọc bảng `Setting` cũ (key `inventory.allowNegativeStock`, hành vi hiện tại) hay cắt sang `OrganizationSettings.allowNegativeInventory` (field mới, đã có schema từ T002 nhưng CHƯA được bất kỳ đường ghi Inventory nào dùng — quyết định "hoãn tới Sprint Inventory Review" từ T002/T003 nay chính là sprint này). **[OPEN QUESTION cho SPEC-INV-001]**.
- **P5 — Đăng ký module.** Mỗi trong 5 module phải `import InventoryModule` vào `*.module.ts` của mình và inject `INVENTORY_REPOSITORY` — thao tác cơ học, đã có tiền lệ đúng ở `checkout.module.ts`.
- **P6 — Cập nhật test.** Toàn bộ `*.spec.ts` của 5 module hiện mock thẳng `PrismaService`/`tx.inventory.*`/`tx.inventoryMovement.*` — migrate sẽ đòi hỏi đổi mock sang mock `INVENTORY_REPOSITORY`. Đây là khối lượng việc không nhỏ (5 module × repository spec + có thể cả service spec), cần được ước lượng riêng khi lập kế hoạch T004 chi tiết, không nằm trong ước lượng của T003.5.

## 2. Từng module — chuỗi gọi hiện tại → chuỗi gọi Target

### 2.1 `purchase-order`

- **Hiện tại:** `PurchaseOrderController → PurchaseOrderService.receive() → PrismaPurchaseOrderRepository.receive()` — bên trong tự mở `$transaction`, tự viết `tx.inventory.upsert()` + `tx.inventoryMovement.create()` theo vòng lặp `purchaseItems`.
- **Target:** `PurchaseOrderController → PurchaseOrderService.receive() → PrismaPurchaseOrderRepository.receive()` — vẫn tự mở `$transaction` bao ngoài (ranh giới KHÔNG đổi, xem [[inventory-transaction-boundary]] §1), nhưng bên trong vòng lặp gọi `inventoryRepository.recordMovement(input, tx)` thay cho code inline.
- **Đặc thù cần lưu ý:** `movementType = PURCHASE` — luôn là nhập kho, KHÔNG cần negative-stock check (P3 phải exempt loại này). Không có thay đổi hành vi nghiệp vụ nào khác ngoài việc thêm Optimistic Lock (P2) — về lý thuyết CÓ THỂ khiến `receive()` thất bại/cần retry nếu đụng độ với thao tác khác trên cùng sản phẩm/kho, điều CHƯA từng xảy ra hôm nay (vì không có lock) — cần disclose rõ đây là thay đổi hành vi (dù đúng đắn hơn) khi trình SPEC-INV-001.

### 2.2 `purchase-return`

- **Hiện tại:** `PurchaseReturnController → PurchaseReturnService.complete() → PrismaPurchaseReturnRepository.complete()` — tự mở `$transaction`, tự đọc `Setting` để check âm kho, tự viết `tx.inventory.upsert()` + `tx.inventoryMovement.create()`.
- **Target:** `PurchaseReturnController → PurchaseReturnService.complete() → PrismaPurchaseReturnRepository.complete()` — giữ `$transaction` bao ngoài, gọi `inventoryRepository.recordMovement(input, tx)`; **negative-stock check chuyển vào bên trong hàm ghi dùng chung** (loại bỏ đoạn code đọc `Setting` trùng lặp khỏi `PrismaPurchaseReturnRepository`).
- **Đặc thù:** `movementType = RETURN`, `referenceType = RETURN` — CÓ negative-stock check, giữ nguyên hành vi hiện tại (không exempt).

### 2.3 `transfer`

- **Hiện tại:** `TransferController → TransferService.approve()/receive() → PrismaTransferRepository.transitionStatus()` — hàm dùng chung cho cả 2 pha (OUT/IN), tự mở `$transaction` riêng cho MỖI pha (2 transaction tách biệt theo thời gian — xem [[inventory-transaction-boundary]] §2, giữ nguyên thiết kế này), tự viết `tx.inventory.upsert()` + `tx.inventoryMovement.create()`, CÓ đọc/ghi `avgCost` hiện tại của kho nguồn để snapshot vào `TransferItem.unitCost` (`captureUnitCostToItem`).
- **Target:** `TransferController → TransferService.approve()/receive() → PrismaTransferRepository.transitionStatus()` — mỗi pha vẫn tự mở `$transaction` riêng (KHÔNG gộp 2 pha), gọi `inventoryRepository.recordMovement(input, tx)` cho mỗi item trong mỗi pha. Bước đọc `avgCost` để snapshot cần dùng đường ĐỌC của `IInventoryRepository` (đã sẵn có, không cần thay đổi) TRƯỚC khi gọi hàm ghi.
- **Đặc thù — 2 thay đổi hành vi cần SPEC duyệt riêng, không phải refactor thuần túy:**
  1. `movementType = TRANSFER_OUT` (pha approve): hiện **KHÔNG** có negative-stock check — nếu migrate mà bật check này lên (đưa vào P3 như mọi loại khác), Transfer OUT có thể bắt đầu TỪ CHỐI các phiếu điều chuyển mà trước đây được chấp nhận (dù kết quả là âm kho). Đây là SIẾT CHẶT nghiệp vụ, không phải bug fix thuần kỹ thuật — cần SPEC-INV-001 xác nhận có muốn áp dụng hay không.
  2. `movementType = TRANSFER_IN` (pha receive): không có check âm kho (đúng, vì đây là chiều CỘNG kho — không cần).

### 2.4 `stock-count`

- **Hiện tại:** `StockCountController → StockCountService.complete() → PrismaStockCountRepository.complete()` — tự mở `$transaction`, với mỗi item có `difference != 0`: tự viết `tx.inventory.upsert()` + `tx.inventoryMovement.create()`.
- **Target:** `StockCountController → StockCountService.complete() → PrismaStockCountRepository.complete()` — giữ `$transaction` bao ngoài, gọi `inventoryRepository.recordMovement(input, tx)` cho mỗi item có chênh lệch.
- **Đặc thù:** `movementType = COUNT`, `referenceType = COUNT` — hiện KHÔNG có negative-stock check (đúng đắn về logic: `actualQty` là số đếm thực tế, không âm theo bản chất — nếu validate `actualQty >= 0` đúng ở tầng DTO thì `afterQuantity` sau khi áp `difference` sẽ tự động bằng `actualQty`, không thể âm). **P3 phải exempt `COUNT` khỏi negative-stock check** giống `PURCHASE` — nếu vô tình bật check này lên cho COUNT, có thể chặn nhầm các lần kiểm kê hợp lệ. Cần lưu ý rõ trong lúc hiện thực T004 để không phá vỡ hành vi đúng hiện tại.

### 2.5 `inventory-adjustment`

- **Hiện tại:** `InventoryAdjustmentController → InventoryAdjustmentService.complete() → PrismaInventoryAdjustmentRepository.complete()` — tự mở `$transaction`, tự đọc `Setting` check âm kho, tự viết `tx.inventory.upsert()` + `tx.inventoryMovement.create()`.
- **Target:** `InventoryAdjustmentController → InventoryAdjustmentService.complete() → PrismaInventoryAdjustmentRepository.complete()` — giữ `$transaction` bao ngoài, gọi `inventoryRepository.recordMovement(input, tx)`; negative-stock check chuyển vào hàm ghi dùng chung (như Purchase Return).
- **Đặc thù:** `movementType = ADJUSTMENT`, `referenceType = SYSTEM` — CÓ negative-stock check, giữ nguyên hành vi hiện tại.

## 3. Bảng tổng hợp chuỗi gọi Target (đúng mẫu SPEC yêu cầu)

| Module nguồn | Chuỗi gọi Target |
|---|---|
| purchase-order | `purchase-order → PrismaPurchaseOrderRepository (giữ tx riêng) → InventoryRepository.recordMovement(tx)` |
| purchase-return | `purchase-return → PrismaPurchaseReturnRepository (giữ tx riêng) → InventoryRepository.recordMovement(tx)` |
| transfer | `transfer → PrismaTransferRepository (giữ 2 tx riêng theo pha) → InventoryRepository.recordMovement(tx)` |
| stock-count | `stock-count → PrismaStockCountRepository (giữ tx riêng) → InventoryRepository.recordMovement(tx)` |
| inventory-adjustment | `inventory-adjustment → PrismaInventoryAdjustmentRepository (giữ tx riêng) → InventoryRepository.recordMovement(tx)` |
| checkout (đã đúng, không cần migrate) | `checkout → CheckoutService (giữ tx riêng) → InventoryRepository.recordSaleMovement(tx)` |

Lưu ý điểm khác với ví dụ gốc của SPEC (`purchase-order → InventoryRepository → InventoryDomainService`): theo khảo sát thực tế (§5 của [[inventory-write-path]]), codebase KHÔNG có tầng `InventoryDomainService` tách biệt — logic nghiệp vụ ghi nằm ngay trong `PrismaInventoryRepository`, được gọi qua interface `IInventoryRepository`. Bảng trên phản ánh đúng kiến trúc thật của dự án (Application Service của module nguồn → Repository của module nguồn, giữ nguyên transaction của nó → gọi thẳng `InventoryRepository`), không thêm tầng trung gian mới trừ khi SPEC-INV-001 quyết định khác.

## 4. Việc CHƯA làm ở T003.5 — nhắc lại ràng buộc

- Không có dòng code nào trong `backend/src/` bị sửa.
- Không có migration Prisma nào được tạo.
- Không có test nào được viết hay chạy lại cho mục đích T004 (5 module vẫn đang hoạt động đúng như thiết kế hiện tại, chỉ là chưa dùng chung 1 cửa ngõ ghi).
- 7 tài liệu tại `docs/architecture/inventory/` là đầu vào phân tích cho `SPEC-INV-001` — bản thân chúng không phải SPEC, không có hiệu lực "APPROVED FOR DEVELOPMENT".

## 5. Điều kiện để T004 được phép bắt đầu

1. User review 7 tài liệu này (Architecture Review, theo đúng yêu cầu T003.5).
2. User soạn `SPEC-INV-001`, quyết định các **[OPEN QUESTION]** đã nêu rải rác trong 7 tài liệu (tổng hợp lại ở đây để tiện theo dõi):
   - Có tách `InventorySnapshot` khỏi `Inventory` không? (domain-model §4.1)
   - Có xây `InventoryReservation` trong T004 hay hoãn? (domain-model §4.2, concurrency Case 6)
   - Có xây Lot/Serial/Batch không, và có nằm trong T004 không? (domain-model §4.3)
   - Hợp nhất `recordMovement()`/`recordSaleMovement()` thành 1 hàm (Hướng A) hay giữ 2 hàm riêng (Hướng B)? (write-path §4)
   - Nguồn Setting cho negative-stock check: `Setting` cũ hay `OrganizationSettings.allowNegativeInventory` mới? (migration-plan P4)
   - Transfer OUT có nên thêm negative-stock check không (thay đổi hành vi)? (migration-plan §2.3)
   - Stock Count có cần khóa sản phẩm trong lúc đếm (Pessimistic Lock) không? (concurrency Case 5, locking-strategy §5)
3. SPEC-INV-001 được đánh dấu "APPROVED FOR DEVELOPMENT" và bàn giao — chỉ khi đó T004 mới được phép viết code.
