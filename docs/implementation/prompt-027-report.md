# Implementation Report — Prompt 027: Purchase Order Module

**Ngày:** 2026-07-14
**Phạm vi:** Hệ thống nhập hàng — "nghiệp vụ quan trọng nhất của Inventory" theo lời người dùng. Workflow Draft→Approve→Receive, Receive sinh `InventoryMovement` + đồng bộ `Inventory`/Average Cost trong đúng 1 Transaction, không update Inventory trực tiếp.

## 1. Đối chiếu schema hiện có với Prompt 027 (quan trọng nhất của Prompt này)

Foundation đã có sẵn `PurchaseOrder`/`PurchaseItem` từ migration khởi tạo, nhưng lệch với Prompt 027 ở 2 điểm — xử lý theo đúng nguyên tắc đã áp dụng nhất quán từ Category/Warehouse/Supplier: **field/status list của Prompt là nguồn sự thật, schema cũ nhường bước, migrate an toàn dữ liệu**.

1. **`PurchaseOrderStatus`**: Foundation có `DRAFT, ORDERED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED`; Prompt 027 yêu cầu `DRAFT, PENDING, APPROVED, RECEIVED, COMPLETED, CANCELLED`. Đổi enum theo đúng Prompt. Vì Postgres không cho xóa giá trị enum trực tiếp, migration tạo type mới và **remap dữ liệu cũ** (`ORDERED→PENDING`, `PARTIALLY_RECEIVED→RECEIVED`) thay vì DROP/CREATE thẳng — không có bản ghi nào bị kẹt hoặc mất giá trị nếu đã có dữ liệu.
2. **`PurchaseItem` field list của Prompt 027 là "Product, Warehouse, Qty, Price, Discount, Tax, Total"** — "Warehouse" ở cấp **dòng hàng**, khác với schema cũ (warehouse ở cấp `PurchaseOrder`, áp dụng cho cả đơn). Chuyển `warehouseId` xuống `PurchaseItem`: một đơn nhập từ 1 Nhà cung cấp có thể chia hàng về nhiều kho khác nhau trong cùng 1 lần — sát với thực tế ERP hơn, và đúng theo đúng field list được liệt kê. Migration thêm cột nullable, **backfill từ `warehouseId` cũ của `PurchaseOrder` cha**, rồi mới ép NOT NULL — không mất dữ liệu. Thêm `taxAmount` (Decimal, mặc định 0, an toàn cho dữ liệu cũ) để khớp đủ field "Tax" còn thiếu.

## 2. Quyết định thiết kế

1. **Không có endpoint "submit" hay "complete" trong API list** (chỉ `create/approve/receive/cancel/list`), nhưng Status liệt kê đủ 6 giá trị. Xử lý: `create()` → `DRAFT`; `approve()`: `DRAFT → APPROVED` (đúng chữ "Draft → Approve" trong Workflow); `receive()`: `APPROVED → RECEIVED`. **`PENDING` và `COMPLETED` được khai báo trong enum theo đúng Prompt nhưng không có endpoint nào set chúng trong phạm vi Prompt 027** — dự phòng: `PENDING` cho một bước "gửi duyệt" nhiều cấp trong tương lai; `COMPLETED` dự kiến sẽ được set bởi Prompt 029 (Supplier Debt/Payment) khi công nợ đơn nhập đã thanh toán đủ (đơn "hoàn tất" theo nghĩa tài chính, không chỉ nghĩa vật lý). Đây là quyết định tối thiểu-phạm-vi, không tự ý thêm endpoint chưa được yêu cầu.
2. **`receive()` không gọi `IInventoryRepository.recordMovement()`** dù hàm này đã có sẵn từ Prompt 022 — vì `recordMovement()` tự mở `$transaction` riêng, không thể tham gia transaction của `PurchaseOrder.receive()`, vi phạm trực tiếp yêu cầu tường minh "Purchase + Inventory + Movement History phải là một Transaction". Thay vào đó, `PrismaPurchaseOrderRepository.receive()` tự mở 1 `$transaction` bao trọn: đọc lại status (chặn race condition khi 2 request receive cùng lúc), với mỗi `PurchaseItem` ghi 1 `InventoryMovement` (`PURCHASE`) + upsert `Inventory` (tính lại Average Cost qua `applyInventoryDelta` dùng chung) + cập nhật `receivedQuantity`, rồi mới chuyển status đơn. Đây là mẫu đã được xác lập và tái dùng chính xác từ `PrismaTransferRepository.transitionStatus()` (Prompt 023) và `PrismaInventoryAdjustmentRepository.complete()` (Prompt 025) — module Purchase là module thứ 3 áp dụng cùng một khuôn mẫu "atomic transition + movements" mà không trùng lặp logic tính Average Cost.
3. **`approve()`/`cancel()` là cổng chuyển trạng thái thuần túy** (không đụng Inventory) — dùng `updateMany` có điều kiện `status IN (...)` rồi đọc lại, thay vì mở transaction nặng — vì chưa có gì cần rollback ở các bước này (đúng mẫu `transitionSimple` đã có ở InventoryAdjustment).
4. **`cancel()` cho phép từ `[DRAFT, PENDING, APPROVED]`, chặn từ `RECEIVED`/`COMPLETED`** — vì `receive()` là bước DUY NHẤT đụng tồn kho trong module này; một khi đã Receive, huỷ không thể tự động hoàn tác (khác Transfer, nơi Approve đã trừ kho nên Cancel cần hoàn trả) — muốn trả hàng sau khi đã nhận phải qua Purchase Return (Prompt 028), không phải Cancel.
5. **`GET /purchase-orders/:id` được thêm** dù chỉ có `GET /purchase-orders` (danh sách) trong API list gốc — cùng lý do đã áp dụng nhất quán ở Transfer/StockCount/InventoryAdjustment: cần xem chi tiết trước khi Approve/Receive.
6. **`totalAmount` mỗi dòng hàng và cả đơn được tính ở server** (`quantity*unitCost - discount + taxAmount`, tổng đơn = tổng các dòng), không tin số client gửi lên — DTO tạo đơn không có trường `totalAmount` nào ở cả 2 cấp, tránh client giả mạo tổng tiền.
7. **Mã đơn `PNxxxxxx` ("Phiếu Nhập") sinh qua bảng `Sequence`** — tái dùng chính xác cơ chế `SequenceSkuGenerator`/`SequenceTransferCodeGenerator`/... đã có.
8. **Permission mở rộng từ `crud('purchase', 'đơn nhập hàng')` đã có sẵn trong catalog** (Foundation) thành `crud('purchase', 'đơn nhập hàng', ['approve', 'receive', 'cancel'])` — tái dùng nhóm quyền `purchase:*` đã tồn tại thay vì tạo nhóm `purchase_order:*` mới, nhất quán với tên bảng `purchase_orders`/`PurchaseOrder`.
9. **Không dùng `recordMovement()` cũng đồng nghĩa `PurchaseOrder` KHÔNG phụ thuộc `InventoryModule`** — `PurchaseOrderModule` chỉ import `RbacModule`, thao tác trực tiếp trên `tx.inventory`/`tx.inventoryMovement` qua Prisma (đúng mẫu Transfer/Adjustment), giữ dependency graph phẳng.

## 3. Chức năng đã hoàn thành

- **`POST /purchase-orders`**: tạo đơn (status `DRAFT`), nhiều dòng hàng, mỗi dòng có kho nhận riêng, tự tính `totalAmount`.
- **`GET /purchase-orders`** / **`GET /purchase-orders/:id`**: danh sách (lọc `status`/`supplierId`/`branchId`/`search` theo mã, phân trang) và chi tiết kèm `items`.
- **`PATCH .../approve`**: `DRAFT → APPROVED`, cổng phê duyệt thuần túy.
- **`PATCH .../receive`**: `APPROVED → RECEIVED` — sinh `InventoryMovement` (`PURCHASE`) + đồng bộ `Inventory`/Average Cost cho từng dòng hàng, cập nhật `receivedQuantity`, tất cả trong 1 Transaction (rollback toàn bộ nếu bất kỳ bước nào lỗi).
- **`PATCH .../cancel`**: hủy đơn chưa Receive.
- **Audit Log** đầy đủ cho cả 4 hành động ghi (create/approve/receive/cancel).
- **Permission**: `purchase:view`(đã có)/`purchase:create`(đã có)/`purchase:approve`/`purchase:receive`/`purchase:cancel` (mới).

## 4. File đã tạo/sửa

**Tạo mới** — `backend/src/modules/purchase-order/` (đủ 4 lớp + code generator riêng): domain (entity, repository interface với `PurchaseOrderStatusConflictError`, code-generator interface), application (DTO×3 + spec, mapper, service + spec), infrastructure (Prisma repository + spec — trọng tâm `receive()` atomic, `SequencePurchaseOrderCodeGenerator` + spec), presentation (controller + spec), `purchase-order.module.ts`.
**Tạo mới khác**: `backend/test/purchase-order.e2e-spec.ts`, migration `20260714120000_purchase_order_module`.
**Sửa**: `schema.prisma` (đổi `PurchaseOrderStatus`; chuyển `warehouseId` từ `PurchaseOrder` xuống `PurchaseItem`; thêm `PurchaseItem.taxAmount`; back-relation `Warehouse.purchaseItems` thay cho `Warehouse.purchaseOrders`), `app.module.ts` (đăng ký `PurchaseOrderModule`), `error-codes.ts` (+`PURCHASE_ORDER_001..003`), `permission-catalog.ts` (mở rộng `crud('purchase', ...)` thêm `approve/receive/cancel`).
**Sửa (do đổi schema)**: `test/supplier.e2e-spec.ts` — bỏ `warehouseId` khỏi seed `PurchaseOrder` trực tiếp qua Prisma (test "BLOCK-DELETE" của Supplier chỉ cần `PurchaseOrder` tồn tại, không cần `warehouseId` nữa vì đã chuyển xuống `PurchaseItem`).

## 5. Migration

`20260714120000_purchase_order_module`: đổi `PurchaseOrderStatus` (tạo type mới, remap `ORDERED→PENDING`/`PARTIALLY_RECEIVED→RECEIVED`, xóa type cũ, đổi tên type mới); thêm `purchase_items.warehouseId` (nullable → backfill từ `purchase_orders.warehouseId` → NOT NULL → FK + index); xóa `purchase_orders.warehouseId` (FK + cột); thêm `purchase_items.taxAmount` (NOT NULL DEFAULT 0). Toàn bộ viết tay để đảm bảo an toàn dữ liệu, không dùng diff tự sinh của Prisma.

## 6. API

| Method | Path | Permission |
|---|---|---|
| POST | `/api/v1/purchase-orders` | `purchase:create` |
| GET | `/api/v1/purchase-orders` | `purchase:view` |
| GET | `/api/v1/purchase-orders/:id` | `purchase:view` |
| PATCH | `/api/v1/purchase-orders/:id/approve` | `purchase:approve` |
| PATCH | `/api/v1/purchase-orders/:id/receive` | `purchase:receive` |
| PATCH | `/api/v1/purchase-orders/:id/cancel` | `purchase:cancel` |

**DI graph**: `npx tsc --noEmit` xác nhận toàn bộ token `@Inject(PURCHASE_ORDER_REPOSITORY)`/`@Inject(PURCHASE_ORDER_CODE_GENERATOR)` khớp kiểu; `npm run build` (biên dịch qua `nest build`) sạch; toàn bộ constructor injection được xác nhận qua controller/service spec (khởi tạo trực tiếp với mock đúng shape interface). **Không xác nhận được bằng cách bootstrap `AppModule` thật** — thử qua `Test.createTestingModule({imports:[AppModule]}).compile()` nhưng bị treo do các module khác (Redis/Queue) cố kết nối dịch vụ ngoài không có sẵn trong sandbox này; đã dừng và dọn dẹp script thử nghiệm, không đưa vào commit. `PurchaseOrderModule` có cấu trúc provider/token giống hệt `TransferModule`/`InventoryAdjustmentModule`/`SupplierModule` (đã bootstrap thành công ở các Prompt trước với cùng mẫu), nên rủi ro DI-wiring-sai ở runtime là thấp.

## 7. Test

- **Unit**: **632/632 PASS** toàn backend (tăng từ 581 sau Prompt 026). Purchase-order-specific (51 test): `PurchaseOrderService` (create tự tính totalAmount từng dòng+tổng đơn, mặc định discount/taxAmount=0, findOne 404, search, approve/receive/cancel đều +404 +audit +dịch `StatusConflictError`→422), `PrismaPurchaseOrderRepository` (create+P2002→409+P2003→400, findById, search, existsByCode, approve/cancel qua `updateMany`+conflict, **receive** — conflict khi không APPROVED, **ghi đúng Movement PURCHASE + Average Cost đúng công thức bình quân gia quyền** (kiểm chứng số cụ thể: tồn 10@8000 + nhập 100@10000 → avgCost=9818.18), cập nhật `receivedQuantity`, tạo Inventory mới khi kho/sản phẩm chưa có snapshot), controller (permission metadata cho 6 method, ủy quyền), DTO validation (bắt buộc supplierId, items rỗng, thiếu warehouseId, quantity≤0, unitCost âm), code generator.
- **Coverage** (`purchase-order/`, loại trừ `.module.ts`): **97.78% statement, 95.74% function, 98.56% line, 75.21% branch** — vượt xa mốc 90% yêu cầu ở statement/function/line.
- **Integration**: `test/purchase-order.e2e-spec.ts` — luồng đầy đủ create(DRAFT)→approve(APPROVED)→receive(RECEIVED) qua HTTP thật (xác nhận `totalAmount` tính đúng, `receivedQuantity` cập nhật, `Inventory.quantity`/`avgCost` đúng, `GET /inventory/history?movementType=PURCHASE` trả đúng 1 Movement kèm `referenceId` = purchaseOrderId); từ chối receive khi còn DRAFT (422); hủy đơn DRAFT thành công + không cho hủy lại đơn đã CANCELLED (422); **không cho hủy đơn đã RECEIVED** (422); chi tiết theo id + lọc danh sách theo supplierId. **Chưa xác nhận PASS thật** — sandbox không có Docker/PostgreSQL, cùng giới hạn Gate B đã disclose từ Prompt 016.
- Build/Lint/TypeCheck/Prisma validate: tất cả **PASS** trên toàn repo.

## 8. Self-Review

- **Không TODO/FIXME/console.log/`any`** — `grep` xác nhận rỗng trong `src/modules/purchase-order/`.
- **Architecture Review**: Clean Architecture giữ nguyên 4 lớp; domain interface không rò rỉ kiểu Prisma (`Prisma.Decimal` chỉ xuất hiện ở infrastructure). `PurchaseOrderModule` không phụ thuộc `InventoryModule` (thao tác tồn kho trực tiếp qua Prisma trong transaction riêng, đúng mẫu Transfer/Adjustment) — không circular dependency.
- **Security Review**: mọi truy vấn lọc `organizationId`; `totalAmount` tính server-side, không tin client; P2003 (FK không tồn tại — `supplierId`/`branchId`/`warehouseId`/`productId`) dịch sang 400 rõ ràng thay vì lộ lỗi Prisma thô.
- **Performance Review**: `receive()` xử lý tuần tự từng `PurchaseItem` trong 1 transaction — chấp nhận được ở quy mô 1 đơn nhập thực tế (vài đến vài chục dòng hàng); chưa có benchmark khối lượng lớn (không có yêu cầu định lượng nào ở Prompt 027 — mốc "100.000 Purchase phải xử lý <3s" thuộc Prompt 030 — Purchase Report, không phải Prompt này).
- **Concurrency**: `receive()`/`approve()`/`cancel()` đều đọc lại status ngay trong transaction/`updateMany`-có-điều-kiện trước khi ghi, chặn race condition khi 2 request cùng thao tác trên 1 đơn (đã là thực hành tốt kế thừa từ Transfer/Adjustment, dù mốc "Concurrency Requirements" chính thức chỉ bắt buộc từ Prompt 031).

**Definition of Done đạt được** (trừ Integration Test PASS thật — cùng giới hạn Gate B đã biết, đã disclose minh bạch; và DI graph runtime bootstrap — bị chặn bởi Redis/Queue không khả dụng trong sandbox, đã disclose rõ ở mục 6, bù lại bằng typecheck + build + spec-level constructor verification). Sẵn sàng cho Prompt 028 (Purchase Return).
