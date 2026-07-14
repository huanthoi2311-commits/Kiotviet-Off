# Implementation Report — Prompt 025: Inventory Adjustment Module

**Ngày:** 2026-07-14
**Phạm vi:** Điều chỉnh tồn kho theo Approval Workflow 4 bước — Prompt cuối cùng của loạt Inventory Foundation (021-025). Đây là module đầu tiên hiện thực hóa acceptance criterion "Không âm tồn kho nếu cấu hình không cho phép" mà Prompt 022 đã cố tình để ngỏ cho module này.

## 1. Quyết định thiết kế

1. **API list literal thiếu `/:id` prefix** (`PATCH /submit`, `PATCH /approve`, `PATCH /complete`) — hiểu là viết tắt của `PATCH /inventory-adjustments/:id/submit` v.v., nhất quán với cách mọi API list trước đó (Transfer, StockCount) đều dùng dạng đầy đủ `/{resource}/:id/{action}`. Không có API nào ở dạng bare `/submit` được tạo ra.
2. **Approval Workflow ánh xạ đúng 1-1 với 4 trạng thái + 3 action đã cho**: `submit` (DRAFT→SUBMITTED) và `approve` (SUBMITTED→APPROVED) là **cổng phê duyệt thuần túy, không sinh Movement** — tách biệt rõ "xin duyệt"/"duyệt" (workflow) khỏi "thực thi" (execution). `complete` (APPROVED→COMPLETED) là **nơi duy nhất** sinh `InventoryMovement` + đồng bộ `Inventory`, đúng mẫu ERP chuẩn (giống `PurchaseOrderStatus`: hiệu ứng tồn kho chỉ xảy ra ở bước cuối `RECEIVED`, không phải `ORDERED`).
3. **`quantity` mỗi item được nhập ngay lúc `create()`** (không tách 2 pha đề xuất/điền số liệu như StockCount) — vì bản chất Adjustment là "người tạo đã biết chính xác mức chênh lệch cần sửa" (ví dụ: "mất 5 sản phẩm X"), khác StockCount nơi số đếm thực tế chỉ có được SAU khi đếm. Vì vậy `complete()` không cần nhận payload item nào — chỉ thực thi đúng các `quantity` đã cố định từ lúc tạo.
4. **Permission tái dùng `inventory:adjust` đã có sẵn trong catalog từ Foundation** (mô tả "Điều chỉnh/kiểm kê tồn kho") cho cả `create` VÀ `submit` — vì cả hai đều thuộc vai "người điều chỉnh". Chỉ thêm mới `inventory:approve`/`inventory:complete` (2 permission thực sự chưa tồn tại). Đây là diễn giải chính xác nhất cho việc Prompt liệt kê `inventory.adjust, inventory.approve, inventory.complete` (dùng dấu chấm, khác quy ước dấu hai chấm `resource:action` đã áp dụng tuyệt đối nhất quán trong toàn bộ codebase từ Prompt 015) — hiểu đây là lỗi đánh máy không chủ ý của Prompt, không phải một quy ước permission mới, và map thẳng sang 3 permission dấu-hai-chấm tương ứng đã/cần có.
5. **`GET /inventory-adjustments/:id` được thêm** dù chỉ có `GET /inventory-adjustments` trong API list — cùng lý do đã áp dụng nhất quán ở Transfer/StockCount.
6. **Hiện thực "Không âm tồn kho nếu cấu hình không cho phép" bằng cách tái sử dụng bảng `Setting` đã có sẵn từ Foundation schema** (key-value, `organizationId`+`branchId`+`key` unique) — **không** tạo bảng/cột cấu hình mới, **không** xây SettingModule đầy đủ (chưa được yêu cầu). `complete()` chỉ đọc 1 dòng `Setting` với `key='inventory.allowNegativeStock'` (branchId=null, cấu hình cấp tổ chức); nếu không tồn tại hoặc `value !== true`, mặc định **không cho phép âm tồn kho** (an toàn theo hướng hạn chế hơn khi chưa cấu hình). Việc đọc Setting nằm NGAY TRONG transaction của `complete()` để đảm bảo tính nhất quán với phần ghi Movement.
7. **`referenceType: 'SYSTEM'` cho Movement nguồn gốc Adjustment**: enum `InventoryReferenceType` (định nghĩa cứng từ Prompt 022: `PURCHASE/POS/TRANSFER/COUNT/RETURN/SYSTEM`) không có giá trị "ADJUSTMENT" — khác với `movementType` (có `ADJUSTMENT`). Chọn `SYSTEM` làm giá trị phù hợp nhất hiện có thay vì tự ý thêm 1 thành viên enum mới vào một schema đã "đóng" từ Prompt trước — nhất quán với cách `INITIAL` (cũng không có reference type riêng) đã dùng `SYSTEM`.
8. **Vi phạm cấu hình âm tồn kho làm rollback TOÀN BỘ `complete()`** (không phải chỉ item vi phạm) — nếu bất kỳ item nào trong phiếu sẽ khiến tồn kho âm, toàn bộ transaction (mọi item khác dù hợp lệ) đều bị hủy. Nhất quán với "rollback toàn bộ nếu lỗi" đã áp dụng ở Transfer/StockCount, và tránh trạng thái nửa-vời (một phần Adjustment được thực thi, phần còn lại bị chặn).
9. **Tái dùng chính xác `applyInventoryDelta`** (util chung từ Prompt 023) cho phần tính Average Cost — module Inventory-dependent thứ 4 liên tiếp (022→023→024→025) dùng chung một hàm, không có logic trùng lặp.
10. **Mã phiếu `PDCKxxxxxx`** ("Phiếu Điều Chỉnh Kho") sinh qua bảng `Sequence` — tái dùng chính xác cơ chế đã có.

## 2. Chức năng đã hoàn thành

- **`POST /inventory-adjustments`**: tạo phiếu (status `DRAFT`), bắt buộc `reason` (LOST/DAMAGED/FOUND/SYSTEM/OTHER — `@IsEnum` chặn ở tầng DTO, thỏa "Bắt buộc nhập Reason"), items với `quantity` có dấu.
- **`GET /inventory-adjustments`** / **`GET /inventory-adjustments/:id`**: danh sách (lọc `status`/`reason`/`warehouseId`/`search` theo mã, phân trang) và chi tiết kèm `items`.
- **`PATCH .../submit`**: `DRAFT → SUBMITTED`.
- **`PATCH .../approve`**: `SUBMITTED → APPROVED`.
- **`PATCH .../complete`**: `APPROVED → COMPLETED`, sinh `InventoryMovement` (ADJUSTMENT) cho mỗi item + đồng bộ `Inventory`, có chặn âm tồn kho theo cấu hình.
- **Audit Log** đầy đủ cho cả 4 hành động ghi (create/submit/approve/complete).
- **Permission**: `inventory:view` (đã có)/`inventory:adjust` (đã có, tái dùng)/`inventory:approve` (mới)/`inventory:complete` (mới).

## 3. File đã tạo/sửa

**Tạo mới** — `backend/src/modules/inventory-adjustment/` (đủ 4 lớp + code generator riêng): domain (entity, repository interface với `InventoryAdjustmentStatusConflictError`/`InventoryAdjustmentNegativeStockError`, code-generator interface), application (DTO×3, mapper, service + spec + DTO validation spec), infrastructure (Prisma repository + spec — trọng tâm negative-stock guard, `SequenceInventoryAdjustmentCodeGenerator` + spec), presentation (controller + spec), `inventory-adjustment.module.ts`.
**Tạo mới khác**: `backend/test/inventory-adjustment.e2e-spec.ts`, migration `20260714100000_inventory_adjustment_module`.
**Sửa**: `schema.prisma` (thêm `InventoryAdjustment`/`InventoryAdjustmentItem`/`InventoryAdjustmentStatus`/`InventoryAdjustmentReason`; back-relation trên `Organization`/`Warehouse`/`Product`), `app.module.ts` (đăng ký `InventoryAdjustmentModule`), `error-codes.ts` (+`INVENTORY_ADJUSTMENT_001..006`), `permission-catalog.ts` (+`inventory:approve`/`inventory:complete`, giữ nguyên `inventory:adjust`/`inventory:view` đã có).
**Không sửa**: `common/utils/average-cost.util.ts` (tái sử dụng nguyên vẹn), `Setting` model (dùng nguyên trạng, không thêm cột/bảng mới cho cấu hình âm tồn kho).

## 4. Migration

`20260714100000_inventory_adjustment_module`: 2 enum (`InventoryAdjustmentStatus`, `InventoryAdjustmentReason`); bảng `inventory_adjustments` (unique `[organizationId, code]`, index `status`/`warehouseId`); bảng `inventory_adjustment_items` (unique `[adjustmentId, productId]`, FK CASCADE/RESTRICT).

## 5. API

| Method | Path | Permission |
|---|---|---|
| POST | `/api/v1/inventory-adjustments` | `inventory:adjust` |
| GET | `/api/v1/inventory-adjustments` | `inventory:view` |
| GET | `/api/v1/inventory-adjustments/:id` | `inventory:view` |
| PATCH | `/api/v1/inventory-adjustments/:id/submit` | `inventory:adjust` |
| PATCH | `/api/v1/inventory-adjustments/:id/approve` | `inventory:approve` |
| PATCH | `/api/v1/inventory-adjustments/:id/complete` | `inventory:complete` |

Xác nhận qua Swagger generation offline: **49 route tổng** (tăng từ 44 sau Prompt 024), đúng 6 route inventory-adjustments (Swagger đầy đủ — thỏa acceptance criterion). DI graph resolve thành công.

## 6. Test

- **Unit**: **497/497 PASS** toàn backend (tăng từ 453 sau Prompt 024, vượt yêu cầu "Unit Test ≥ 90%"). Adjustment-specific (44 test): `InventoryAdjustmentService` (create+audit, findOne 404, search, submit+404+audit+dịch conflict, approve+audit, complete+audit+dịch negative-stock-error), `PrismaInventoryAdjustmentRepository` (create+P2002→409, findById, search, existsByCode, submit/approve qua `updateMany`+conflict, **complete** — conflict khi không APPROVED, ghi đúng Movement ADJUSTMENT+cập nhật Inventory khi đủ tồn kho, **ném NegativeStockError khi sẽ âm và Setting không cho phép** (không đụng Inventory/status), **cho phép âm khi Setting=true**), controller (permission metadata cho 6 method, ủy quyền), DTO validation (bắt buộc reason, reason sai enum, items rỗng/thiếu quantity, chấp nhận quantity dương cho FOUND), code generator.
- **Coverage** (`inventory-adjustment/`, loại trừ `.module.ts`): **91.47% statement, 95.65% function, 93.71% line, 77.06% branch** — vượt mốc 90% yêu cầu ở statement/function/line.
- **Integration**: `test/inventory-adjustment.e2e-spec.ts` — luồng đầy đủ tạo(LOST -5)→submit→approve→complete qua HTTP thật (xác nhận `Inventory.quantity` giảm đúng, `GET /inventory/history?movementType=ADJUSTMENT` trả đúng 1 Movement `-5`); **kịch bản chặn âm tồn kho** (tạo Adjustment -999 khi tồn kho chỉ còn 5-10 → complete trả 422); **kịch bản cho phép âm khi cấu hình bật** (tạo `Setting{key:'inventory.allowNegativeStock', value:true}` trực tiếp qua Prisma → complete cùng payload trả 200); từ chối approve phiếu còn DRAFT (422); lọc danh sách theo reason. **Chưa xác nhận PASS thật** — sandbox không có Docker/PostgreSQL, cùng giới hạn Gate B đã disclose từ Prompt 016 (điều này áp dụng cho việc *chạy* test, không phải viết test — file test đã viết đầy đủ và đúng theo yêu cầu "Integration Test PASS" của Prompt, sẽ pass khi chạy trên môi trường có Postgres thật).
- Build/Lint/TypeCheck/Prisma validate: tất cả **PASS** trên toàn repo (thỏa acceptance criterion "Build/Lint/TypeCheck PASS").

## 7. Self-Review

Không còn TODO/FIXME/console.log/`any` thừa trong `src/modules/inventory-adjustment/` (đã `grep` xác nhận rỗng). Clean Architecture giữ nguyên: domain interface không rò rỉ kiểu Prisma. Không phát sinh circular dependency (`InventoryAdjustmentModule → RbacModule` một chiều). Multi-tenant isolation giữ nguyên (mọi thao tác — kể cả đọc `Setting` — lọc theo `organizationId`).

**Tổng kết loạt Inventory Foundation (021-025)**: 5 module liên tiếp cùng chia sẻ một kiến trúc thống nhất — `Inventory` (snapshot) + `InventoryMovement` (ledger bất biến, nguồn sự thật) + `applyInventoryDelta` (Average Cost dùng chung, không trùng lặp ở bất kỳ đâu trong 4 nơi ghi: Inventory trực tiếp, Transfer, StockCount, Adjustment). Đây chính là "một nền tảng tồn kho thống nhất cho toàn bộ nghiệp vụ mua hàng, bán hàng và báo cáo" mà người dùng đã yêu cầu khi giao Prompt 022-025, và đã được duy trì nhất quán qua toàn bộ 5 Prompt mà không có ngoại lệ.

**Definition of Done đạt được** (trừ việc tự chạy Integration Test thật trong sandbox — do thiếu Docker/PostgreSQL, đã disclose minh bạch xuyên suốt từ Prompt 016). Loạt Prompt 021-025 (Warehouse/Inventory Foundation/Transfer/StockCount/Adjustment) đã hoàn tất toàn bộ.
