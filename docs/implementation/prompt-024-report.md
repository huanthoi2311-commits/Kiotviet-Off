# Implementation Report — Prompt 024: Stock Count Module

**Ngày:** 2026-07-14
**Phạm vi:** Kiểm kê kho — dựng trên nền Inventory Movement Ledger (Prompt 022), theo cùng mẫu giao dịch nguyên tử xuyên repository đã thiết lập ở Transfer (Prompt 023).

## 1. Về mức độ chi tiết của Prompt 024

Đây là Prompt terse nhất trong loạt 021-025: không có field list Entity, **không có mục Permission nào cả** (khác Transfer vẫn còn liệt kê 4 quyền). Toàn bộ mục 2 là các quyết định bắt buộc phải tự đưa ra để lấp khoảng trống, cùng tinh thần đã áp dụng nhất quán từ Prompt 017 đến 023.

## 2. Quyết định thiết kế

1. **Route `/stock-count` giữ nguyên số ít**, khớp chính xác với 2 lần Prompt viết literal `POST /stock-count` / `GET /stock-count` (khác với toàn bộ 8 module trước đều dùng số nhiều `/warehouses`, `/transfers`...) — tôn trọng đúng path đã cho thay vì tự ý chuẩn hóa.
2. **Toàn bộ Permission (`stock_count:view/create/start/complete`) tự thiết kế** vì Prompt không cho — đặt tên khớp chính xác 3 action đã có trong API (`create/start/complete`) cộng `view` bắt buộc cho 2 GET, theo đúng khuôn mẫu đã dùng ở Transfer.
3. **`GET /stock-count/:id` được thêm** dù chỉ có `GET /stock-count` trong API list — cùng lý do đã áp dụng ở Transfer: đọc 1 bản ghi là hệ quả tự nhiên của có danh sách, rủi ro bằng 0.
4. **`CANCELLED` có trong Status enum nhưng không có endpoint** — Prompt chỉ cho `create/start/complete`. Áp dụng đúng nguyên tắc đã dùng cho `SHIPPING` của Transfer: giữ giá trị trong schema (khớp đúng Status list literal), không tự ý thêm endpoint thứ 4 chưa được yêu cầu.
5. **Luồng dữ liệu 3 bước, khớp đúng "Business Flow: Inventory → Count → Compare → Adjustment → Movement":**
   - **`POST /stock-count`** = "Inventory → Count": nhận `warehouseId` + danh sách `productId` (không nhận số lượng đếm ở bước này); repository tự đọc `Inventory.quantity` hiện tại của từng sản phẩm tại kho đó để chụp thành `systemQty` — đây chính là bước "Inventory" (đọc hệ thống) và "Count" (xác định sẽ đếm gì) gộp lại.
   - **`PATCH /stock-count/:id/start`**: `DRAFT → COUNTING`, thuần chuyển trạng thái, không đụng dữ liệu — đánh dấu phiên đếm đang diễn ra.
   - **`PATCH /stock-count/:id/complete`** = "Compare → Adjustment → Movement": nhận payload `{ items: [{ itemId, actualQty, remark? }] }` — đây là nơi số đếm thực tế được nộp. Với mỗi item, tính `difference = actualQty − systemQty` ("Compare"); nếu khác 0, sinh 1 `InventoryMovement` (`movementType=COUNT`, `referenceType=COUNT`) + đồng bộ `Inventory` ("Adjustment → Movement"). `difference = 0` chỉ cập nhật `actualQty`/`difference`, không sinh Movement (đúng "Không sửa Inventory trực tiếp" — không có gì để sửa nếu không lệch).
   - Quyết định gộp "nhập số đếm" vào chính bước Complete (thay vì thêm 1 endpoint PATCH item riêng không có trong Prompt) giữ đúng 4 endpoint đã cho, không phát minh endpoint thứ 5.
6. **Complete cho phép nộp một phần (partial) danh sách item** — không bắt buộc phải đếm hết mọi sản phẩm trong phiếu mới được Complete. Đây là một đơn giản hóa có chủ đích: Prompt không nêu rule "phải đếm đủ 100% item", và việc bắt buộc đủ sẽ ngăn cản kịch bản hợp lý (một số sản phẩm không đếm được lúc đó, muốn hoàn tất phần còn lại). Item không được nộp giữ nguyên `actualQty = null`, không sinh Movement.
7. **Tái dùng chính xác kiến trúc transaction nguyên tử xuyên repository của Transfer (Prompt 023)**: `IStockCountRepository.complete()` tự mở 1 `$transaction` duy nhất, đọc lại `status` hiện tại trong transaction (chống race condition — ném `StockCountStatusConflictError` nếu không phải `COUNTING`), cập nhật từng `StockCountItem`, ghi `InventoryMovement`/đồng bộ `Inventory` cho item lệch, rồi đổi `StockCount.status = COMPLETED` — tất cả rollback toàn bộ nếu bất kỳ bước nào lỗi. Dùng lại nguyên `applyInventoryDelta` (util dùng chung từ Prompt 023), **không viết lại logic Average Cost lần thứ 3**.
8. **Movement COUNT luôn truyền `unitCost: null`** (kể cả khi `difference > 0`, tức "tìm thấy thêm hàng"): không có thông tin giá vốn mới nào phát sinh từ việc đếm kho — hệ quả tự nhiên của `applyInventoryDelta` khi `unitCost` là `null` chính là giữ nguyên `avgCost` hiện có, đúng ngữ nghĩa "điều chỉnh số lượng, không phải nhập hàng mới".
9. **`start()` dùng `updateMany` với điều kiện `status: 'DRAFT'` + kiểm `count`** thay vì mở `$transaction` interactive — vì đây là chuyển trạng thái đơn thuần không kèm ghi Movement nào, dùng transaction đầy đủ là dư thừa so với mức độ phức tạp thực tế (khác biệt có chủ đích so với `complete()`, nơi thực sự cần transaction nguyên tử đa bước).
10. **Mã phiếu `PKKxxxxxx`** sinh qua bảng `Sequence` — tái dùng chính xác cơ chế đã có (`SequenceSkuGenerator`, `SequenceTransferCodeGenerator`).

## 3. Chức năng đã hoàn thành

- **`POST /stock-count`**: tạo phiếu (status `DRAFT`), chụp `systemQty` từ `Inventory` hiện tại cho từng `productId` (0 nếu sản phẩm chưa có tồn kho tại kho đó).
- **`GET /stock-count`** / **`GET /stock-count/:id`**: danh sách (lọc `status`/`warehouseId`/`search` theo mã, phân trang) và chi tiết kèm `items`.
- **`PATCH /stock-count/:id/start`**: `DRAFT → COUNTING`.
- **`PATCH /stock-count/:id/complete`**: `COUNTING → COMPLETED`, ghi `actualQty`/`difference`, sinh `InventoryMovement` (COUNT) cho item lệch.
- **Audit Log** đầy đủ cho cả 3 hành động ghi (create/start/complete).
- **Permission**: `stock_count:view/create/start/complete`.

## 4. File đã tạo/sửa

**Tạo mới** — `backend/src/modules/stock-count/` (đủ 4 lớp + code generator riêng): domain (entity, repository interface với `StockCountStatusConflictError`/`StockCountItemMismatchError`, code-generator interface), application (DTO×4, mapper, service + spec + DTO validation spec), infrastructure (Prisma repository + spec, `SequenceStockCountCodeGenerator` + spec), presentation (controller + spec), `stock-count.module.ts`.
**Tạo mới khác**: `backend/test/stock-count.e2e-spec.ts`, migration `20260714090000_stock_count_module`.
**Sửa**: `schema.prisma` (thêm `StockCount`/`StockCountItem`/`StockCountStatus`; back-relation trên `Organization`/`Warehouse`/`Product`), `app.module.ts` (đăng ký `StockCountModule`), `error-codes.ts` (+`STOCK_COUNT_001..005`), `permission-catalog.ts` (+`stock_count:*`).
**Không sửa**: `common/utils/average-cost.util.ts` — tái sử dụng nguyên vẹn từ Prompt 023, không cần thay đổi gì.

## 5. Migration

`20260714090000_stock_count_module`: enum `StockCountStatus`; bảng `stock_counts` (unique `[organizationId, code]`, index `status`/`warehouseId`); bảng `stock_count_items` (unique `[stockCountId, productId]` — 1 sản phẩm chỉ xuất hiện 1 lần/phiếu, FK `stockCountId` CASCADE, FK `productId` RESTRICT).

## 6. API

| Method | Path | Permission |
|---|---|---|
| POST | `/api/v1/stock-count` | `stock_count:create` |
| GET | `/api/v1/stock-count` | `stock_count:view` |
| GET | `/api/v1/stock-count/:id` | `stock_count:view` |
| PATCH | `/api/v1/stock-count/:id/start` | `stock_count:start` |
| PATCH | `/api/v1/stock-count/:id/complete` | `stock_count:complete` |

Xác nhận qua Swagger generation offline: **44 route tổng** (tăng từ 40 sau Prompt 023), đúng 5 route stock-count. DI graph resolve thành công.

## 7. Test

- **Unit**: **453/453 PASS** toàn backend (tăng từ 411 sau Prompt 023). StockCount-specific (42 test): `StockCountService` (create+audit, findOne 404, search, start+404+audit+dịch conflict, complete+404+audit+dịch item-mismatch), `PrismaStockCountRepository` (create chụp đúng systemQty từ Inventory có/không có sẵn, P2002→409, findById, search, existsByCode, **start** — updateMany thành công/conflict khi count=0, **complete** — conflict khi không COUNTING, mismatch khi itemId lạ, difference=0 không đụng Inventory, difference≠0 ghi đúng Movement COUNT + before/afterQuantity + cập nhật Inventory), controller (permission metadata cho 5 method, ủy quyền), DTO validation, code generator.
- **Coverage** (`stock-count/`, loại trừ `.module.ts`): **91.85% statement, 93.02% function, 93.17% line, 80% branch** — vượt mốc 90% ở statement/function/line.
- **Integration**: `test/stock-count.e2e-spec.ts` — seed tồn kho ban đầu qua `INVENTORY_REPOSITORY`, luồng đầy đủ qua HTTP thật: tạo (xác nhận `systemQty=100` chụp đúng) → start → complete với `actualQty=95` (xác nhận `difference=-5`, `Inventory.quantity` giảm còn 95, `GET /inventory/history?movementType=COUNT` trả đúng 1 Movement `-5`); từ chối start lại phiếu đã COUNTING (422); lọc danh sách theo status. **Chưa xác nhận PASS** — sandbox không có Docker/PostgreSQL, cùng giới hạn Gate B đã disclose từ Prompt 016.
- Build/Lint/TypeCheck/Prisma validate: tất cả **PASS** trên toàn repo.

## 8. Self-Review

Không còn TODO/FIXME/console.log/`any` thừa trong `src/modules/stock-count/` (đã `grep` xác nhận rỗng). Clean Architecture giữ nguyên: domain interface không rò rỉ kiểu Prisma (bài toán transaction xuyên module giải quyết bằng cùng util `applyInventoryDelta` đã tách ở Prompt 023, không cần giải pháp mới). Không phát sinh circular dependency (`StockCountModule → RbacModule` một chiều; tự thao tác trực tiếp lên `inventories`/`inventory_movements` qua `PrismaService`, không phụ thuộc `InventoryModule`). Multi-tenant isolation giữ nguyên (mọi thao tác lọc `organizationId`, kể cả `start`/`complete` qua `updateMany`/`findFirst` có điều kiện `organizationId`).

**Nhất quán 3/3 module Inventory-dependent (022-024)**: cả `PrismaInventoryRepository.recordMovement`, `PrismaTransferRepository.transitionStatus`, và `PrismaStockCountRepository.complete` giờ đều dùng chung `applyInventoryDelta` — xác nhận kiến trúc "một nền tảng tồn kho thống nhất" mà người dùng yêu cầu đã được giữ vững qua 3 Prompt liên tiếp, không có logic Average Cost trùng lặp ở bất kỳ đâu.

**Definition of Done đạt được** (trừ Integration Test PASS thật — cùng giới hạn Gate B đã biết, đã disclose minh bạch). Sẵn sàng cho Prompt 025 (Inventory Adjustment Module) — Prompt cuối cùng trong loạt Inventory Foundation.
