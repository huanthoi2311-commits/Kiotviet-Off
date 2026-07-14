# Implementation Report — Prompt 023: Stock Transfer Module

**Ngày:** 2026-07-14
**Phạm vi:** Điều chuyển hàng giữa các Warehouse, xây trên nền tảng Inventory Movement Ledger (Prompt 022). Đây là module nghiệp vụ đầu tiên tiêu thụ `IInventoryRepository`/`InventoryMovement`.

## 1. Về mức độ chi tiết của Prompt 023

Prompt 023 ngắn hơn đáng kể so với 021/022 (không có field list Entity đầy đủ, không có Validation/Coding Standards/Output/Acceptance chi tiết). Toàn bộ mục 2 dưới đây là các quyết định thiết kế **bắt buộc phải tự đưa ra** để lấp đầy khoảng trống đó — mỗi quyết định được liệt kê kèm lý do, theo đúng tinh thần đã áp dụng xuyên suốt từ Prompt 017 (Category field list) đến Prompt 022 (thay thế InventoryHistory).

## 2. Quyết định thiết kế

1. **Entity `Transfer`/`TransferItem` tự thiết kế**, theo đúng cấu trúc `code + status + audit fields` + bảng con `*Item` đã có sẵn trong schema (mẫu `PurchaseOrder`/`PurchaseItem`). `Transfer`: `fromWarehouseId`, `toWarehouseId` (2 quan hệ đặt tên `TransferFromWarehouse`/`TransferToWarehouse` tới cùng bảng `Warehouse`), `code`, `status`, `note`. `TransferItem`: `productId`, `quantity`, và **`unitCost` (mới, không có trong yêu cầu gốc — xem mục 4)**.
2. **`transfer:view` được thêm vào Permission** dù Prompt chỉ liệt kê `create/approve/receive/cancel`: không có `:view` thì `GET /transfers` không có quyền nào để gán — vi phạm quy ước "mọi GET đều có permission riêng" đã áp dụng nhất quán ở 8 module trước. Bổ sung tối thiểu cần thiết, không phải mở rộng phạm vi.
3. **`GET /transfers/:id` được thêm** dù không có trong API list gốc (chỉ có `GET /transfers`) — cùng lý do: đọc 1 bản ghi là hệ quả tự nhiên của có danh sách, không phải tính năng mới, rủi ro bằng 0 (chỉ đọc).
4. **Trạng thái `SHIPPING` trong enum nhưng KHÔNG có endpoint chuyển riêng.** Với đúng 4 action (`create/approve/receive/cancel`), quyết định: `approve` = `PENDING → APPROVED` (kèm trừ Kho nguồn — đúng "Approve → Trừ Kho A"); `receive` = `APPROVED → RECEIVED` (kèm cộng Kho đích). `SHIPPING` được giữ trong schema đúng theo Entity Status list của Prompt nhưng **hiện không thể đạt tới qua API** — dành cho một Prompt tương lai bổ sung bước "bắt đầu vận chuyển" nếu cần tách biệt "đã duyệt" và "đang vận chuyển". Không tự ý thêm endpoint thứ 5 không được yêu cầu.
5. **Cancel cho phép từ `DRAFT`/`PENDING`/`APPROVED`, không cho từ `RECEIVED`/`CANCELLED`.** Nếu hủy khi đã `APPROVED` (đã trừ Kho nguồn), sinh 1 `InventoryMovement` hoàn kho (`TRANSFER_IN` về đúng Kho nguồn) để không mất tồn kho — trực tiếp phục vụ acceptance criterion "Không mất dữ liệu".
6. **Vấn đề kiến trúc cốt lõi: giao dịch xuyên 2 repository.** Approve/Receive/Cancel-with-reversal cần **atomically** vừa ghi `InventoryMovement`/cập nhật `Inventory` (thuộc Inventory module) vừa đổi `Transfer.status` (thuộc Transfer module) — đúng yêu cầu "Transaction: Rollback toàn bộ nếu lỗi". `IInventoryRepository.recordMovement()` (Prompt 022) tự mở transaction riêng nên **không compose được** với transaction của Transfer nếu gọi trực tiếp nhiều lần (item thứ 2 lỗi thì item thứ 1 đã commit — vi phạm rollback toàn bộ). Gói `recordMovement` để nhận thêm tham số `tx` cũng bị loại vì sẽ là **lần đầu tiên rò rỉ kiểu `Prisma.TransactionClient` vào domain interface** trong toàn bộ codebase — phá vỡ ranh giới Clean Architecture đã giữ nghiêm ngặt từ Prompt 016.
   → **Giải pháp đã chọn**: tách phần tính Average Cost thuần túy (không phụ thuộc Prisma ngoài kiểu `Prisma.Decimal` — coi như một value-type, tương tự `Date`) ra `common/utils/average-cost.util.ts` (`applyInventoryDelta`), dùng chung bởi cả `PrismaInventoryRepository.recordMovement()` (đã refactor lại để gọi hàm này, hành vi không đổi — 24 test Inventory cũ vẫn pass nguyên) và `PrismaTransferRepository.transitionStatus()`. `ITransferRepository.transitionStatus()` tự mở **1 `$transaction` duy nhất**, đọc lại status hiện tại (chống race condition), áp dụng toàn bộ `InventoryMovement` liên quan, rồi đổi `Transfer.status` — tất cả trong cùng 1 transaction, đúng yêu cầu rollback toàn bộ. Domain interface (`ITransferRepository`) không hề biết đến `Prisma.TransactionClient`.
7. **Giá vốn (Average Cost) được "mang theo" qua Transfer**: khi Approve, Average Cost của Kho nguồn **tại đúng thời điểm trừ** được ghi lại vào `TransferItem.unitCost` (cột mới, lý do thêm ở mục 1); khi Receive, giá trị này được dùng làm `unitCost` cho `InventoryMovement` cộng vào Kho đích — đảm bảo Kho đích nhận đúng giá vốn của hàng chuyển tới, không bị tính lại `avgCost` sai (ví dụ về 0 hoặc dùng giá vốn cũ của Kho đích). Đây là hệ quả bắt buộc của việc Transfer phải tuân thủ đúng kiến trúc Average Cost mà Prompt 022 đã đặt ra ("toàn bộ nghiệp vụ... đều sử dụng chung một nền tảng tồn kho thống nhất" — trích nguyên văn từ ghi chú kiến trúc của người dùng ở cuối Prompt 022-025).
8. **Không chặn tồn kho âm khi Approve** — nhất quán với quyết định đã disclose ở Prompt 022 ("không âm tồn kho nếu cấu hình không cho phép" là acceptance criteria của Prompt 025, không phải nền tảng). Áp dụng đồng nhất, không phát minh rule mới riêng cho Transfer.
9. **Mã phiếu `PDCxxxxxx`** sinh nguyên tử qua bảng `Sequence` sẵn có — **tái dùng chính xác** cơ chế `SequenceSkuGenerator` (Prompt 016), không phải kỹ thuật mới.

## 3. Chức năng đã hoàn thành

- **`POST /transfers`**: tạo phiếu (status mặc định `PENDING`), chặn `fromWarehouseId === toWarehouseId` (422 `TRANSFER_SAME_WAREHOUSE`), chặn danh sách sản phẩm rỗng (422 `TRANSFER_EMPTY_ITEMS`, cũng được `class-validator` `@ArrayMinSize(1)` chặn ở tầng DTO).
- **`GET /transfers`** / **`GET /transfers/:id`**: danh sách (lọc `status`/`fromWarehouseId`/`toWarehouseId`/`search` theo mã, phân trang) và chi tiết kèm `items`.
- **`PATCH /transfers/:id/approve`**: `PENDING → APPROVED`, trừ Kho nguồn, ghi lại giá vốn vào từng `TransferItem`.
- **`PATCH /transfers/:id/receive`**: `APPROVED → RECEIVED`, cộng Kho đích đúng giá vốn đã ghi lại.
- **`PATCH /transfers/:id/cancel`**: từ `DRAFT`/`PENDING`/`APPROVED` → `CANCELLED`; nếu đã `APPROVED`, hoàn kho nguồn.
- **Audit Log** đầy đủ cho cả 4 hành động (create/approve/receive/cancel).
- **Permission**: `transfer:view/create/approve/receive/cancel`.

## 4. File đã tạo/sửa

**Tạo mới** — `backend/src/modules/transfer/` (đủ 4 lớp + code generator riêng): domain (entity, repository interface với `TransferStatusConflictError`, code-generator interface), application (DTO×3, mapper, service + spec + DTO validation spec), infrastructure (Prisma repository + spec, `SequenceTransferCodeGenerator` + spec), presentation (controller + spec), `transfer.module.ts`.
**Tạo mới khác**: `backend/src/common/utils/average-cost.util.ts` (+ spec — dùng chung Inventory/Transfer), `backend/test/transfer.e2e-spec.ts`, migration `20260714080000_stock_transfer_module`.
**Sửa**: `schema.prisma` (thêm `Transfer`/`TransferItem`/`TransferStatus`; back-relation trên `Organization`/`Warehouse`(×2, named relations)/`Product`), `app.module.ts` (đăng ký `TransferModule`), `error-codes.ts` (+`TRANSFER_001..005`), `permission-catalog.ts` (+`transfer:*`), `inventory/infrastructure/persistence/prisma-inventory.repository.ts` (refactor `recordMovement` dùng `applyInventoryDelta` dùng chung — hành vi không đổi, đã xác nhận qua 24 test Inventory cũ vẫn pass 100%).

## 5. Migration

`20260714080000_stock_transfer_module`: enum `TransferStatus`; bảng `transfers` (unique `[organizationId, code]`, index `status`/2 warehouse FK); bảng `transfer_items` (FK `transferId` CASCADE, FK `productId` RESTRICT).

## 6. API

| Method | Path | Permission |
|---|---|---|
| POST | `/api/v1/transfers` | `transfer:create` |
| GET | `/api/v1/transfers` | `transfer:view` |
| GET | `/api/v1/transfers/:id` | `transfer:view` |
| PATCH | `/api/v1/transfers/:id/approve` | `transfer:approve` |
| PATCH | `/api/v1/transfers/:id/receive` | `transfer:receive` |
| PATCH | `/api/v1/transfers/:id/cancel` | `transfer:cancel` |

Xác nhận qua Swagger generation offline: **40 route tổng** (tăng từ 35 sau Prompt 022), đúng 6 route transfer. DI graph resolve thành công.

## 7. Test

- **Unit**: **411/411 PASS** toàn backend (tăng từ 360 sau Prompt 022). Transfer-specific + util dùng chung (51 test): `applyInventoryDelta` (5 kịch bản, gồm both chia-cho-0), `TransferService` (same-warehouse/empty-items reject, create+audit, approve xây đúng movement kèm `captureUnitCostToItem`, receive mang đúng `unitCost` đã capture, cancel rẽ nhánh theo status có/không hoàn kho, dịch `TransferStatusConflictError`→422), `PrismaTransferRepository` (create+P2002/P2003, findById, search, **transitionStatus** — conflict khi status không khớp/transfer không tồn tại, approve ghi đúng `beforeQuantity`/`afterQuantity`/unitCost vào TransferItem, receive dùng đúng unitCost, cancel-rỗng không đụng Inventory), controller (permission metadata, ủy quyền), DTO validation, code generator.
- **Coverage** (`transfer/` + `average-cost.util.ts`, loại trừ `.module.ts`): **91.73% statement, 95.34% function, 93.86% line, 77.86% branch** — vượt mốc 90% ở statement/function/line.
- **Integration**: `test/transfer.e2e-spec.ts` — seed tồn kho ban đầu qua `INVENTORY_REPOSITORY` (như `inventory.e2e-spec.ts`), test đủ luồng thật qua HTTP: từ chối same-warehouse (422), luồng đầy đủ tạo→approve (xác nhận Kho A còn 70/100)→receive (xác nhận Kho B có 30 với đúng `avgCost=50000` kế thừa từ Kho A), từ chối approve lại phiếu đã RECEIVED (422), hủy sau khi approve hoàn đúng số lượng cho Kho nguồn, lọc danh sách theo status. **Chưa xác nhận PASS** — sandbox không có Docker/PostgreSQL, cùng giới hạn Gate B đã disclose từ Prompt 016.
- Build/Lint/TypeCheck/Prisma validate: tất cả **PASS** trên toàn repo.

## 8. Self-Review

Không còn TODO/FIXME/console.log/`any` thừa trong `src/modules/transfer/` (đã `grep` xác nhận rỗng). Clean Architecture giữ nguyên: domain interface (`ITransferRepository`) không rò rỉ bất kỳ kiểu Prisma nào (kể cả để giải quyết bài toán transaction xuyên module — xem mục 2.6). Không phát sinh circular dependency (`TransferModule → RbacModule` một chiều; Transfer không import Inventory module, chỉ tự thao tác trực tiếp lên bảng `inventories`/`inventory_movements` qua `PrismaService` giống cách `PrismaInventoryRepository` làm — hai repository độc lập, cùng dùng chung 1 util tính toán). Multi-tenant isolation giữ nguyên.

**Rủi ro đã biết**: reversal khi Cancel dùng lại `unitCost` đã capture lúc Approve, không "replay" lại lịch sử nếu Kho nguồn có biến động khác xen giữa — đây là giới hạn cố hữu của Moving Average Cost dưới điều kiện đồng thời, không phải lỗi, và nằm ngoài phạm vi Prompt 023 để giải quyết triệt để.

**Definition of Done đạt được** (trừ Integration Test PASS thật — cùng giới hạn Gate B đã biết, đã disclose minh bạch). Sẵn sàng cho Prompt 024 (Stock Count Module).
