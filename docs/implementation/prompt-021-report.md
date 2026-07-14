# Implementation Report — Prompt 021: Warehouse Module

**Ngày:** 2026-07-14
**Phạm vi:** Warehouse Module — nền tảng quản lý kho cho Inventory/Purchase/POS/Stock Transfer/Stock Count (các Prompt 022-025 sắp tới), theo Clean Architecture, tái dùng nguyên vẹn kiến trúc Foundation.

## 1. Chức năng đã hoàn thành

- **CRUD Warehouse đầy đủ**: `POST/GET/PATCH/DELETE /warehouses`, `GET /warehouses/:id`, `POST /warehouses/:id/restore`.
- **Search/Filter/Pagination/Sorting**: tìm theo `name`/`code` (không phân biệt hoa thường), lọc theo `branchId`/`type`/`status`, phân trang `page`/`limit`, sắp xếp theo `name`/`code`/`createdAt`/`updatedAt` (`sortBy`/`sortOrder`) — đúng 4 yêu cầu "Search, Pagination, Sorting, Filter" của Prompt.
- **Chặn xóa khi còn tồn kho hoặc giao dịch**: `WarehouseService.remove()` gọi `IWarehouseRepository.hasStockOrTransactions()` → 422 `WAREHOUSE_HAS_STOCK_OR_TRANSACTIONS` nếu (a) còn dòng `Inventory` với `quantity`/`reservedQty` khác 0, hoặc (b) còn dòng `InventoryHistory` tham chiếu kho này.
- **Soft Delete + Restore**: giống pattern Category/Product.
- **Permission**: `warehouse:create/view/update/delete/restore` (đã thêm `restore` vào catalog — trước đó catalog chỉ có 4 quyền cơ bản).
- **Audit Log**: create (newValue)/update (oldValue+newValue)/delete (oldValue)/restore (newValue).
- **Swagger**: đầy đủ, tái dùng `ApiWriteErrors()`/`ApiCommonErrors()`.
- **Validation**: `name` 3-255 ký tự (đúng spec); `code` 1-50 bắt buộc; `phone` theo regex VN (`^(0|\+84)\d{9,10}$`); `email` dùng `@IsEmail()`, nullable; `branchId` bắt buộc UUID; `managerId` UUID tùy chọn.
- **Transaction/Rollback khi Manager không tồn tại**: `managerId` là FK thật tới `User` (`onDelete: SetNull`); nếu giá trị không tồn tại, Prisma `create()`/`update()` ném `P2003`, được dịch sang `400 Bad Request` — INSERT/UPDATE là 1 câu lệnh nguyên tử nên tự động rollback toàn bộ, không cần `$transaction()` tường minh (giống cách Product xử lý `categoryId`/`brandId`/`unitId` không hợp lệ ở Prompt 016).

## 2. Quyết định thiết kế

1. **Warehouse model đã tồn tại từ Foundation schema (Prompt 002/003) ở dạng tối giản** (`code`, `name`, `address`, `isDefault`, `status`) — Prompt 021 yêu cầu field list chi tiết hơn (`type`, `phone`, `email`, `managerId`, `description`) và **không có `isDefault`**. Đã bổ sung các field còn thiếu và **xóa `isDefault`** (grep xác nhận không có code nào tham chiếu field này) để khớp đúng field list literal của Prompt — cùng cách xử lý đã áp dụng cho Category ở Prompt 017 khi field list của Prompt khác với schema Foundation ban đầu.
2. **`WarehouseStatus` tái dùng `CommonStatus` (ACTIVE/INACTIVE) có sẵn** thay vì tạo enum riêng — `CommonStatus` đã đúng 2 giá trị Prompt yêu cầu, tạo enum trùng lặp là dư thừa.
3. **Không dùng `class-validator`'s `@IsPhoneNumber()`**: decorator này cần `libphonenumber-js` làm peer dependency; gói này có mặt trong `node_modules` nhưng **không được khai báo tường minh** trong `package.json` (chỉ là dependency bắc cầu của gói khác) — dùng nó sẽ vi phạm "Đóng băng phạm vi" (phụ thuộc ẩn, không được uỷ quyền). Thay vào đó dùng `@Matches()` với regex số điện thoại Việt Nam tự viết — chỉ dùng API đã có sẵn của `class-validator` (gói đã khai báo từ đầu dự án).
4. **`hasStockOrTransactions` triển khai trực tiếp trong `PrismaWarehouseRepository`**, truy vấn thẳng bảng `Inventory`/`InventoryHistory` đã có sẵn trong schema (từ Foundation), **không** tạo dependency sang một "Inventory Module" — vì module đó (Prompt 022) chưa tồn tại. Đây là cách tiếp cận tự chứa (self-contained), giống hệt cách `IProductRepository.hasActiveProductsInCategory/InBrand/InUnit` được triển khai trực tiếp trong Product's repository ở Prompt 016-019 dù Category/Brand/Unit module gọi tới nó.
5. **Lưu ý minh bạch cho Prompt 022 sắp tới**: người dùng đã nêu rõ kiến trúc "Inventory Movement Ledger là nguồn sự thật, Inventory chỉ là snapshot". Khi Prompt 022 triển khai `InventoryMovement` làm ledger chính thức, method `hasStockOrTransactions()` ở Warehouse có thể cần bổ sung kiểm tra thêm bảng `InventoryMovement` (hiện chưa tồn tại) — đây là việc của Prompt 022, không tự ý làm trước trong Prompt 021 theo đúng "Đóng băng phạm vi".
6. **Không dùng `$transaction()` tường minh cho `create`**: một lệnh `prisma.warehouse.create()` đơn lẻ đã nguyên tử ở cấp DB; yêu cầu "Nếu Manager không tồn tại → Rollback" được thỏa mãn tự nhiên bởi ràng buộc FK, không cần bọc thêm transaction thừa.

## 3. File đã tạo/sửa

**Tạo mới** — `backend/src/modules/warehouse/` (đủ 4 lớp): domain (entity, repository interface), application (DTO×4, mapper, service + spec + DTO validation spec), infrastructure (Prisma repository + spec), presentation (controller + spec), `warehouse.module.ts`.
**Tạo mới khác**: `backend/test/warehouse.e2e-spec.ts`, migration `20260714060000_warehouse_module`.
**Sửa**: `schema.prisma` (Warehouse: +`type`/+`phone`/+`email`/+`managerId`/+`description`, -`isDefault`; thêm enum `WarehouseType`; `User` +back-relation `managedWarehouses`), `app.module.ts` (đăng ký `WarehouseModule`), `error-codes.ts` (+`WAREHOUSE_001..004`), `permission-catalog.ts` (`warehouse` group +`restore`).

## 4. Migration

`20260714060000_warehouse_module`: tạo enum `WarehouseType`; `ALTER TABLE "warehouses"` xóa cột `isDefault`, thêm `description`/`email`/`managerId`/`phone`/`type` (mặc định `MAIN`); thêm index + FK `managerId → users.id` (`ON DELETE SET NULL`).

## 5. API

| Method | Path | Permission |
|---|---|---|
| POST | `/api/v1/warehouses` | `warehouse:create` |
| GET | `/api/v1/warehouses` | `warehouse:view` |
| GET | `/api/v1/warehouses/:id` | `warehouse:view` |
| PATCH | `/api/v1/warehouses/:id` | `warehouse:update` |
| DELETE | `/api/v1/warehouses/:id` | `warehouse:delete` |
| POST | `/api/v1/warehouses/:id/restore` | `warehouse:restore` |

Xác nhận qua Swagger generation offline: **32 route tổng** (tăng từ 29 sau Prompt 020), đúng 3 path warehouse-liên-quan. DI graph resolve thành công, không phát hiện circular dependency (`WarehouseModule → RbacModule` một chiều — không cần phụ thuộc `ProductModule` vì check tồn kho/giao dịch dùng thẳng Prisma).

## 6. Test

- **Unit**: **336/336 PASS** toàn backend (tăng từ 282 sau Prompt 020). Warehouse-specific (54 test): service (create+audit log, findOne+404, search+map đầy đủ params kèm default sortBy/sortOrder, update+404+audit log, remove+chặn khi còn tồn kho/giao dịch+404, restore+404+chặn khi chưa xóa+audit log), Prisma repository (create+P2002→409+P2003→400+lỗi không xác định, findById/findByIdIncludingDeleted, update+P2002, softDelete/restore, search+có/không search text, existsByCode+loại trừ excludeId, hasStockOrTransactions×3 kịch bản), controller (permission metadata `it.each` cho 6 method, ủy quyền actor context đúng), DTO validation (hợp lệ tối thiểu/branchId sai UUID/name ngắn/code rỗng/type sai enum/phone đúng-sai định dạng theo bảng dữ liệu/email sai định dạng/đầy đủ field tùy chọn).
- **Coverage module `warehouse/`** (loại trừ `.module.ts`): **92.27% statement, 94.11% function, 95.26% line, 81.03% branch** — vượt mốc 90% ở statement/function/line.
- **Integration**: `test/warehouse.e2e-spec.ts` — tạo/tìm kiếm/chi tiết qua API thật, từ chối trùng `code` (409), từ chối `branchId` không tồn tại (400), chặn xóa khi còn tồn kho thật (tạo trực tiếp dòng `Inventory` qua Prisma rồi gọi DELETE → 422), cập nhật + xóa mềm + khôi phục qua HTTP thật (204 → GET 404 → restore 201 → GET 200 lại). **Chưa xác nhận PASS** — sandbox không có Docker/PostgreSQL, cùng giới hạn môi trường đã disclose từ Prompt 016 (Gate B, `docs/release-gates.md`).
- Build/Lint/TypeCheck/Prisma validate: tất cả **PASS** trên toàn repo.

## 7. Sự cố kỹ thuật trong quá trình thực hiện (minh bạch)

`npx prisma generate` ban đầu thất bại với lỗi `EPERM` (không đổi tên được file `query_engine-windows.dll.node`) do 2 tiến trình `node.exe` mồ côi từ lần chạy `di-check.ts` **cũ** (trước khi tôi thêm `process.exit(0)` ở Prompt 018) vẫn còn sống — `TaskStop` trước đó chỉ dừng được tiến trình wrapper, không dừng tiến trình con thực sự chạy `ts-node`, khiến nó giữ khóa file engine trong suốt phiên làm việc. Đã xác định qua `tasklist`/`wmic` và dừng bằng `taskkill /T /F`, sau đó `prisma generate` chạy thành công. Không liên quan đến logic nghiệp vụ của Warehouse module.

## 8. Self-Review

Không còn TODO/FIXME/console.log/`any` thừa trong `src/modules/warehouse/` (đã `grep` xác nhận rỗng). Clean Architecture giữ nguyên layering; interface dùng `import type` riêng theo yêu cầu `isolatedModules`. Không phát sinh circular dependency. Multi-tenant isolation giữ nguyên (mọi query lọc `organizationId`). Rủi ro cần lưu ý cho các Prompt tiếp theo: `hasStockOrTransactions()` hiện chỉ nhìn vào `Inventory`/`InventoryHistory` — khi Prompt 022 giới thiệu `InventoryMovement` làm ledger chính thức, cần rà lại method này để đảm bảo tính đúng đắn của việc chặn xóa kho.

**Definition of Done đạt được** (trừ Integration Test PASS thật — cùng giới hạn Gate B đã biết, đã disclose minh bạch). Warehouse Module sẵn sàng làm nền tảng cho Prompt 022 (Inventory Foundation).
