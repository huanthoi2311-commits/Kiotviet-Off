# Implementation Report — Prompt 022: Inventory Foundation

**Ngày:** 2026-07-14
**Phạm vi:** Nền tảng tồn kho — kiến trúc Snapshot + Movement Ledger, module quan trọng nhất của ERP theo đúng mô tả của người dùng. Đây là nền tảng cho Purchase/POS/Stock Transfer/Stock Count/Inventory Adjustment (Prompt 023-025 và các Prompt bán hàng/mua hàng sau này).

## 1. Kiến trúc cốt lõi (theo đúng yêu cầu kiến trúc bổ sung của người dùng)

```
Inventory (snapshot đọc nhanh)
        ↑ cập nhật trong CÙNG transaction
InventoryMovement (ledger bất biến — Source of Truth)
        ↑
Purchase / POS / Transfer / Stock Count / Adjustment (Prompt 023+, chưa xây)
```

- **`InventoryMovement` là nguồn sự thật duy nhất.** Mọi thay đổi tồn kho đi qua **một điểm ghi duy nhất**: `IInventoryRepository.recordMovement()`. Không có đường nào khác (không API, không repository method nào khác) được phép ghi vào `Inventory.quantity`.
- **`recordMovement()` là 1 Prisma `$transaction` nguyên tử**: (1) đọc snapshot `Inventory` hiện tại (hoặc coi như 0 nếu chưa có), (2) tính `beforeQuantity`/`afterQuantity` từ delta do caller truyền vào, (3) tính lại **Average Cost** (chỉ khi nhập kho — `quantity > 0` và có `unitCost`; xuất kho giữ nguyên avgCost làm giá vốn xuất), (4) `upsert` bảng `Inventory`, (5) `create` một dòng `InventoryMovement` bất biến. Nếu bất kỳ bước nào lỗi, toàn bộ rollback — không thể có Movement mà không có Inventory tương ứng, hay ngược lại.
- **`InventoryMovement` không có `updatedAt`/`updatedBy`/`deletedAt`** — đây là **cố ý lệch khỏi quy ước Base Audit Fields** ghi ở đầu `schema.prisma` ("Mọi model kế thừa Base Audit Fields"). Một ledger là bất biến theo định nghĩa: một dòng ghi sai được sửa bằng **một Movement bù trừ mới**, không bao giờ sửa/xóa dòng cũ — đúng theo đúng tinh thần "nguồn sự thật, truy vết đầy đủ, kiểm toán dễ dàng" người dùng đã nêu.

## 2. Chức năng đã hoàn thành

- **`GET /inventory`**: tồn kho hiện tại (snapshot), lọc theo `warehouseId`/`productId`, phân trang.
- **`GET /inventory/history`**: lịch sử Movement, lọc theo `warehouseId`/`productId`/`movementType`/`referenceType`/khoảng thời gian, phân trang, sắp xếp mới nhất trước.
- **`GET /inventory/product/:id`**: tồn kho của 1 sản phẩm tại tất cả các kho trong tổ chức.
- **Không có API ghi** (`POST/PATCH/DELETE`) — đúng yêu cầu "Không cho phép Update Quantity bằng API". Đã viết test xác nhận `POST /inventory` trả `404` (route không tồn tại).
- **`recordMovement()`** là service nội bộ, export qua `INVENTORY_REPOSITORY` để Prompt 023-025 (và Purchase/POS sau này) inject và gọi — chưa có consumer nào ở Prompt này vì các module đó chưa được xây.

## 3. Quyết định thiết kế

1. **Thay thế hoàn toàn `InventoryHistory`/`InventoryHistoryType` (đã có sẵn từ Foundation schema Prompt 002/003) bằng `InventoryMovement`/`InventoryMovementType`/`InventoryReferenceType`.** Đã `grep` xác nhận `InventoryHistory` không được tham chiếu ở bất kỳ đâu trong `src/` (chưa có module nào dùng nó), nên xóa an toàn. Giữ song song 2 bảng cùng mục đích "lịch sử tồn kho" sẽ vi phạm trực tiếp nguyên tắc "một nguồn sự thật" người dùng vừa đặt ra.
2. **`quantity` trên `InventoryMovement` là delta có dấu, do caller quyết định** (dương = nhập, âm = xuất) — `recordMovement()` không tự suy đoán dấu từ `movementType`. Đây là ranh giới trách nhiệm rõ ràng: `InventoryMovement`/`recordMovement()` là hạ tầng (infrastructure), còn "SALE thì luôn trừ, PURCHASE thì luôn cộng" là quyết định nghiệp vụ của từng module gọi nó (Prompt 023 Transfer sẽ gọi 2 lần — một lần âm cho kho nguồn, một lần dương cho kho đích; Prompt 025 Adjustment có thể dương hoặc âm tùy `reason`). Nhúng cứng quy tắc dấu vào tầng nền tảng sẽ khiến các Prompt sau phải "lách" thay vì dùng đúng.
3. **`availableQty` là trường tính toán (`quantity - reservedQty`), không lưu trong DB.** Tránh lưu một giá trị suy ra được từ 2 giá trị khác — nguyên nhân kinh điển gây lệch dữ liệu khi một trong hai giá trị gốc được cập nhật mà quên đồng bộ giá trị dẫn xuất.
4. **Average Cost chỉ tính lại khi nhập kho** (`delta > 0` và có `unitCost`); khi xuất kho, `avgCost` giữ nguyên (dùng làm giá vốn hàng xuất — đúng chuẩn kế toán "Bình quân gia quyền di động"/Moving Average Cost). `lastCost` chỉ cập nhật khi nhập kho, phản ánh đơn giá nhập gần nhất.
5. **Giữ tên cột `avgCost` (không đổi thành `averageCost`)**: cột này đã tồn tại từ schema Foundation; đổi tên sẽ là churn không cần thiết và không nhất quán với các tên viết tắt khác đã có trong schema (`costPrice`, `sku`...). Prompt 022 chỉ thêm cột `lastCost` mới, không đổi tên cột cũ.
6. **`hasStockOrTransactions()` của Warehouse Module (Prompt 021) đã được cập nhật** để trỏ sang `inventoryMovement` thay vì `inventoryHistory` đã xóa — đúng như đã disclose trong report Prompt 021 rằng method này "cần rà lại khi Prompt 022 hoàn tất".
7. **Test ghi dữ liệu (`recordMovement`) qua DI container trong integration test**, không qua HTTP — vì module này không có API ghi. `test/inventory.e2e-spec.ts` lấy `INVENTORY_REPOSITORY` trực tiếp từ `app.get()`, mô phỏng đúng cách các module tương lai (Purchase/POS/Transfer) sẽ gọi.

## 4. File đã tạo/sửa

**Tạo mới** — `backend/src/modules/inventory/` (đủ 4 lớp): domain (entity kép `InventoryEntity`/`InventoryMovementEntity`, repository interface), application (DTO×4, mapper, service + spec + DTO validation spec), infrastructure (Prisma repository + spec — trọng tâm là `recordMovement`), presentation (controller + spec, chỉ 3 route GET), `inventory.module.ts` (export `INVENTORY_REPOSITORY`).
**Tạo mới khác**: `backend/test/inventory.e2e-spec.ts`, migration `20260714070000_inventory_foundation`.
**Sửa**: `schema.prisma` (Inventory +`lastCost`; xóa `InventoryHistory`/`InventoryHistoryType`; thêm `InventoryMovement`/`InventoryMovementType`/`InventoryReferenceType`; đổi back-relation `inventoryHistories`→`inventoryMovements` trên `Organization`/`Warehouse`/`Product`), `app.module.ts` (đăng ký `InventoryModule`), `warehouse/infrastructure/persistence/prisma-warehouse.repository.ts` (+spec: `hasStockOrTransactions` trỏ sang `inventoryMovement`).
**Không sửa**: `error-codes.ts`/`permission-catalog.ts` — module chỉ đọc, không có exception nghiệp vụ nào cần mã lỗi riêng; `inventory:view` đã có sẵn trong catalog từ Prompt 016.

## 5. Migration

`20260714070000_inventory_foundation`: thêm cột `inventories.lastCost` (Decimal, default 0); xóa bảng `inventory_histories` + enum `InventoryHistoryType`; tạo bảng `inventory_movements` + 2 enum mới + 4 index + 3 FK (`organizationId`/`warehouseId`/`productId`, đều `ON DELETE RESTRICT`).

## 6. API

| Method | Path | Permission |
|---|---|---|
| GET | `/api/v1/inventory` | `inventory:view` |
| GET | `/api/v1/inventory/history` | `inventory:view` |
| GET | `/api/v1/inventory/product/:id` | `inventory:view` |

Xác nhận qua Swagger generation offline: **35 route tổng** (tăng từ 32 sau Prompt 021), đúng 3 path inventory. Route `/inventory/history` và `/inventory/product/:id` đăng ký trước path nào có thể xung đột — không có `/inventory/:id` trong module này nên không phát sinh vấn đề thứ tự route. DI graph resolve thành công, không phát hiện circular dependency.

## 7. Test

- **Unit**: **360/360 PASS** toàn backend (tăng từ 336 sau Prompt 021). Inventory-specific (24 test): service (search+map params, getByProduct, getHistory+map khoảng thời gian+không set khi rỗng), Prisma repository (search+availableQty tính đúng, getByProduct, getHistory+lọc thời gian, **recordMovement×4 kịch bản** — khởi tạo Inventory mới khi chưa tồn tại, tính lại Average Cost khi nhập thêm với đơn giá khác `(100×50+50×80)/150=60`, xuất kho giữ nguyên avgCost/lastCost, ghi đúng before/afterQuantity vào Movement), controller (permission metadata, ủy quyền params đúng), DTO validation (`MovementQueryDto` — rỗng hợp lệ/enum sai/date sai/UUID sai/đầy đủ field hợp lệ).
- **Coverage module `inventory/`** (loại trừ `.module.ts`): **91.66% statement, 92.85% function, 93.66% line, 84.21% branch** — vượt mốc 90% ở statement/function/line.
- **Integration**: `test/inventory.e2e-spec.ts` — gọi `recordMovement()` qua DI container (nhập 100 với `unitCost=50000`, sau đó xuất 30), xác nhận qua 3 API GET thật: snapshot đúng (`quantity=70`, `avgCost=50000` không đổi vì xuất không tính lại), lịch sử đúng 2 movement theo thứ tự mới nhất trước với before/afterQuantity chính xác, tồn kho theo sản phẩm across-warehouse, và xác nhận không tồn tại API ghi (`POST /inventory` → 404). **Chưa xác nhận PASS** — sandbox không có Docker/PostgreSQL, cùng giới hạn môi trường đã disclose từ Prompt 016 (Gate B, `docs/release-gates.md`).
- Build/Lint/TypeCheck/Prisma validate: tất cả **PASS** trên toàn repo.

## 8. Self-Review

Không còn TODO/FIXME/console.log/`any` thừa trong `src/modules/inventory/` (đã `grep` xác nhận rỗng). Clean Architecture giữ nguyên layering; interface dùng `import type` riêng theo yêu cầu `isolatedModules`. Không phát sinh circular dependency (`InventoryModule → RbacModule` một chiều). Multi-tenant isolation giữ nguyên (mọi query lọc `organizationId`). Dùng `Prisma.Decimal` (bundled sẵn trong `@prisma/client`, không phải dependency mới) cho mọi phép tính số học tồn kho — tránh lỗi làm tròn của `number` JavaScript khi cộng/trừ/chia giá trị tiền tệ và số lượng.

**Rủi ro/lưu ý cho Prompt 023-025 sắp tới**: `recordMovement()` hiện **không tự chặn tồn kho âm** — quyết định "không âm tồn kho nếu cấu hình không cho phép" được nêu rõ là acceptance criteria của Prompt 025 (Inventory Adjustment), không phải 022, nên cố tình chưa enforce ở tầng nền tảng để tránh làm cứng một rule mà một module tương lai cần cấu hình được (per-organization). `reservedQty` (giữ chỗ) cũng chưa có cơ chế set/clear — sẽ cần khi Prompt liên quan tới đơn hàng chưa thanh toán/giao được xây.

**Definition of Done đạt được** (trừ Integration Test PASS thật — cùng giới hạn Gate B đã biết, đã disclose minh bạch). Nền tảng Inventory sẵn sàng cho Prompt 023 (Stock Transfer Module).
