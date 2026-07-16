# Unit — Dependency Audit (T008 kickoff, trước RFC-0004)

**Yêu cầu:** `ARCHITECT DECISION – CLOSE T007 & START RFC-0004` (Decision U02) — khảo sát hệ thống hiện có, không đề xuất giải pháp, không thiết kế, không viết RFC/SPEC/Migration/API mới (Decision U03).
**Phạm vi (14 điểm, đúng Decision U02):** Schema Review, Dependency Graph, Repository Boundary, Multi Tenant Review, API Review, Permission Review, DTO Review, Optimistic Lock, Archive/Restore, Event Review, Test Review, Technical Debt, Impact Analysis, Open Questions.
**Phương pháp:** đọc trực tiếp code/schema hiện tại — `backend/src/modules/unit/`, `backend/prisma/schema.prisma`, `backend/src/modules/rbac/infrastructure/permission-catalog.ts`, grep toàn `backend/src`, chạy test suite thật.
**Không thay đổi code. Không commit code. Không đề xuất giải pháp/thiết kế — chỉ khảo sát và báo cáo phát hiện.**

---

## 1. Schema Review

**`Unit` model — toàn bộ field** (`schema.prisma:757-778`):

| Field | Kiểu | Ghi chú |
|---|---|---|
| `id` | `String @id @default(uuid()) @db.Uuid` | PK |
| `organizationId` | `String @db.Uuid` | FK → `Organization.id`, `onDelete: Restrict` |
| `code` | `String` | Không có ràng buộc độ dài ở DB |
| `name` | `String` | |
| `symbol` | `String` | |
| `createdBy`/`updatedBy` | `String? @db.Uuid` | Không khai báo quan hệ FK |
| `createdAt`/`updatedAt` | `DateTime` | `@default(now())` / `@updatedAt` |
| `deletedAt` | `DateTime?` | Soft-delete marker |
| `products` | `Product[]` | Back-relation |
| `barcodes` | `Barcode[]` | Back-relation |

Constraint: `@@unique([organizationId, code])`, `@@index([organizationId])`, `@@map("units")`. **Không có `version`, không có `status`** (khác `Tax`/`Warehouse`/`Brand`/`Supplier`/`Customer` — có `status: CommonStatus`).

**Toàn bộ model khác tham chiếu tới `Unit`** — grep không giới hạn token `Unit` trên toàn `schema.prisma`, trả về đúng 3 dòng ngoài khai báo model:

| Model | Field | Bắt buộc? | onDelete |
|---|---|---|---|
| `Organization` | `units Unit[]` (back-relation, không có cột FK) | n/a | n/a |
| `Product` | `unitId String @db.Uuid` | **Bắt buộc** | `Restrict` |
| `Barcode` | `unitId String? @db.Uuid` | Optional | `SetNull` |

**Không có FK nào tới `Unit` từ**: `PurchaseOrder`/`PurchaseOrderItem`, `Inventory`/`InventoryMovement`, `InventoryAdjustment`/`InventoryAdjustmentItem`, `Transfer`/`TransferItem`, `Invoice`/`InvoiceItem`, `StockCount`/`StockCountItem` — các bảng này chỉ có `productId`, thông tin Unit chỉ tiếp cận được gián tiếp qua `Product.unitId`.

## 2. Dependency Graph

Grep `UNIT_REPOSITORY`/`IUnitRepository`/`UnitEntity` toàn `backend/src` ngoài `modules/unit/`: **0 kết quả cả 3 token** — không module nào bên ngoài import DI token, interface, hay entity type.

Grep `unitId` ngoài `modules/unit/`: toàn bộ kết quả (~26 điểm chạm, không tính file test) đều là **field thuần túy**, không có lời gọi Repository nào:

| Module | Cách dùng `unitId` |
|---|---|
| `barcode` | FK thuần trên bảng `Barcode` của chính nó (entity/DTO/mapper/repository) — không đụng bảng `Unit` |
| `product` | FK thuần trên bảng `Product` của chính nó (entity/DTO/mapper/repository), cộng 1 điểm đọc cross-module: `ProductDomainService.hasActiveProductsInUnit(unitId)` (`product-domain.service.ts:36-37`) — đọc bảng `Product` lọc theo `unitId`, KHÔNG đụng bảng/Repository `Unit` |

`ProductDomainService.hasActiveProductsInUnit()` chỉ được gọi từ trong chính `modules/unit/` (`unit.service.ts:126`) — chiều phụ thuộc là Unit → Product (qua `ProductDomainService`), không có chiều ngược lại.

Grep `UnitModule` toàn `backend/src --include="*.module.ts"`: chỉ 2 kết quả, cả 2 đều ở `app.module.ts` (đăng ký gốc, dòng 38 và 71) và chính `unit.module.ts` (khai báo class). **Không module nghiệp vụ nào khác import `UnitModule`.**

## 3. Repository Boundary

`unit.module.ts` (18 dòng):

```
imports: [RbacModule, ProductModule],
controllers: [UnitController],
providers: [UnitService, { provide: UNIT_REPOSITORY, useClass: PrismaUnitRepository }],
exports: [UNIT_REPOSITORY],
```

- **`UnitModule.exports` có `UNIT_REPOSITORY`** (dòng 16) — nhưng consumer bên ngoài: **0** (§2). Cùng trạng thái "export chưa ai dùng" như Brand/Category trước Sprint chuẩn hóa của chúng.
- **Chiều ngược lại**: `UnitModule` import `ProductModule` (dòng 2, 10) để lấy `ProductDomainService` — **không** inject `PRODUCT_REPOSITORY` trực tiếp. Khớp đúng comment trong `product.module.ts:22-25`: *"PRODUCT_REPOSITORY không còn export... cả 5 module phụ thuộc (category/brand/unit/barcode/cart) đã chuyển sang inject ProductDomainService"* (SPEC-PRODUCT-001 §7.2, ADR-0010). `unit.service.ts:34` xác nhận đúng — inject `ProductDomainService`.
- Không có Architecture Test riêng bảo vệ ranh giới `UNIT_REPOSITORY` (không tìm thấy file `*unit-repository-boundary*`).

## 4. Multi Tenant Review

`prisma-unit.repository.ts` — theo từng method:

| Method | Lọc `organizationId`? |
|---|---|
| `create` (21-37) | Ghi `organizationId: input.organizationId` (dòng 25) — do caller truyền vào |
| `findById` (39-47) | **Có** — `where: { id, organizationId, deletedAt: null }` (dòng 44) |
| `update` (49-64) | **Không** — `where: { id }` (dòng 52), không kèm `organizationId` |
| `softDelete` (66-71) | **Không** — `where: { id }` (dòng 68) |
| `search` (73-104) | **Có** — `where.organizationId = params.organizationId` (dòng 75) |
| `existsByCode` (106-120) | **Có** — `where: { organizationId, code, ... }` (dòng 113) |

`update`/`softDelete` không tự lọc `organizationId` ở tầng ghi — an toàn tenant phụ thuộc hoàn toàn vào `UnitService` gọi `findById(id, actor.organizationId)` trước khi ghi (`unit.service.ts:92-96` cho `update`, `119-123` cho `remove`). Xác nhận bằng chính test của Repository: `prisma-unit.repository.spec.ts:123-129` assert `softDelete` gọi Prisma với `where: { id: 'unit-1' }` — không có `organizationId`.

**Đây là pattern hệ thống đã lặp lại ở Product/Category/Brand** (Brand audit §3 đã ghi nhận y hệt: *"chỉ lọc theo id, không kèm organizationId... an toàn tenant phụ thuộc tầng Service"*) — không phải rủi ro riêng của Unit.

Controller: `organizationId` chỉ lấy từ `@CurrentUser() user.organizationId` (JWT), không có DTO nào (`CreateUnitDto`/`UpdateUnitDto`/`UnitQueryDto`) khai báo field `organizationId` — không có vector để client override.

## 5. API Review

`unit.controller.ts` — `@Controller('units')`, guard `JwtAuthGuard`+`PermissionsGuard`:

| Method | Route | Permission | Ghi chú |
|---|---|---|---|
| `POST` | `/units` | `unit:create` | |
| `GET` | `/units` | `unit:view` | search + phân trang |
| `GET` | `/units/:id` | `unit:view` | |
| `PATCH` | `/units/:id` | `unit:update` | Không có Optimistic Lock |
| `DELETE` | `/units/:id` | `unit:delete` | Xóa mềm, `204`, chặn nếu còn Product đang dùng |

**Không có `POST /units/:id/restore`.**

Query params (`UnitQueryDto`): `search`, `page` (default 1), `limit` (default 20, max 100). **Không có `sortBy`/`sortOrder`** — `search()` hard-code `orderBy: { name: 'asc' }` (`prisma-unit.repository.ts:91`), không thể đổi qua API.

## 6. Permission Review

`permission-catalog.ts:63` — `crud('unit', 'đơn vị tính')` (KHÔNG có tham số `extra` thứ 3) — sinh đúng 4 permission: `unit:view`/`create`/`update`/`delete`. **Không có `unit:restore`.**

Đối chiếu: `product`(60)/`category`(61)/`brand`(62)/`warehouse`(65) đều gọi `crud(..., ['restore'])`. `unit`(63) và `barcode`(64) là 2 lời gọi `crud()` DUY NHẤT trong catalog không có `restore` — khớp đúng việc cả 2 module này hiện không có cơ chế Restore nào.

## 7. DTO Review

- `CreateUnitDto`: `code` (`@IsString @Length(1,50)`), `name` (`@IsString @Length(1,255)`), `symbol` (`@IsString @Length(1,20)`) — cả 3 bắt buộc.
- `UpdateUnitDto`: cùng 3 field, tất cả `@IsOptional()` — **khai báo tay lặp lại**, không dùng `PartialType(CreateUnitDto)`.
- `UnitQueryDto`: `search?`, `page?=1`, `limit?=20 (max 100)` — không có field sort.
- `UnitResponseDto`: `id`, `code`, `name`, `symbol`, `createdAt`, `updatedAt` — **không có `deletedAt`, không có `organizationId`, không có `version`**.
- `UnitMapper.toResponseDto()` bỏ qua `organizationId`/`deletedAt` khi map từ Entity.

## 8. Optimistic Lock

**Không có `version` ở bất kỳ tầng nào** — schema (`Unit` model), `UnitEntity`, `UpdateUnitInput` (Repository interface) đều không có field này. `update()` dùng `where: { id }` thuần, không có so sánh compare-and-swap nào.

## 9. Archive / Restore

- **Soft delete**: có — `Unit.deletedAt`, `IUnitRepository.softDelete(id, deletedBy)`, set `deletedAt: new Date()`.
- **Restore**: **không có** — `IUnitRepository` không có method `restore()`, không có route, không có permission (§6).
- **Guard nghiệp vụ khi xóa**: `UnitService.remove()` (118-148) gọi `ProductDomainService.hasActiveProductsInUnit(id)` (125-126), ném `UnprocessableEntityException` (`UNIT_003`) nếu `true`, trước khi `softDelete`.
  - Implementation `hasActiveProductsInUnit()` (`prisma-product.repository.ts:409-415`): `where: { unitId, deletedAt: null }` — **chỉ loại trừ Product đã xóa mềm, KHÔNG lọc theo `Product.status`** (1 Product `INACTIVE` nhưng chưa xóa mềm vẫn chặn xóa Unit, dù tên hàm là "hasActive...") và **không lọc `organizationId`** riêng (dựa vào `unitId` đã được scope qua bước `findById` trước đó ở Service).
- `existsByCode()` (khai báo interface + implement + có test) **không được gọi từ `unit.service.ts`** ở bất kỳ đâu — `create`/`update` chỉ dựa vào bắt lỗi Prisma `P2002` (`translateWriteError()`) để phát hiện trùng `code`. Đây là code không được dùng tới từ góc nhìn Service.

## 10. Event Review

`unit.service.ts` chỉ import `AuditLogService`, không import `DomainEventPublisher` (dùng ở `checkout`/`customer`/`customer-point`, không có `unit`). 3 điểm gọi `auditLogService.log()`: `create`/`update`/`remove` (action `unit.create`/`unit.update`/`unit.delete`). `AuditLogService.log()` là best-effort (try/catch nuốt lỗi, log warning, không throw) — không phải cơ chế publish/subscribe, không có listener nào.

**Không có hook `onUnitCreated`/`onUnitUpdated`/`onUnitDeleted` nào, kể cả dạng no-op** — khác Category/Brand (đã có 4 hook no-op reserve mỗi module).

## 11. Test Review

4 file `*.spec.ts` trong `modules/unit/`: `create-unit.dto.spec.ts` (5 case), `unit.service.spec.ts`, `prisma-unit.repository.spec.ts`, `unit.controller.spec.ts`.

`test/unit.e2e-spec.ts` **đã tồn tại** (223 dòng, 4 `it()` block: create/search/detail, duplicate-code→409, block-delete-khi-đang-dùng→422, update+soft-delete→204 rồi get→404) — cùng giới hạn PENDING-không-Docker như `brand.e2e-spec.ts`/`product.e2e-spec.ts`.

Chạy `npx jest src/modules/unit --coverage` thật:

- **4 test suite / 37 test case, 100% PASS.**
- Coverage theo file (`modules/unit/**`):

| File | % Stmts | % Branch |
|---|---|---|
| `unit.module.ts` | 0 | 100 |
| `unit.service.ts` | 100 | 90 |
| `create-unit.dto.ts` | 100 | 100 |
| `unit-query.dto.ts` | 63.63 | 100 |
| `unit-response.dto.ts` | 100 | 75 |
| `update-unit.dto.ts` | 100 | 100 |
| `unit.mapper.ts` | 100 | 100 |
| `unit.repository.interface.ts` | 100 | 100 |
| `prisma-unit.repository.ts` | 100 | 87.5 |
| `unit.controller.ts` | 100 | 75 |

Thấp nhất: `unit-query.dto.ts` (63.63% stmts, 2 dòng chưa cover — cùng dạng khoảng trống nhỏ đã ghi nhận ở `brand-query.dto.ts` trước T007).

## 12. Technical Debt

1. **Không có cơ chế Restore** — xóa mềm 1 chiều, khớp với §6/§9.
2. **`update()`/`softDelete()` không tự lọc `organizationId` ở `where`** — dựa vào Service pre-check (§4) — pattern hệ thống lặp lại từ Product/Category/Brand, không riêng Unit.
3. **Không có `version`** (Optimistic Lock) — không có bảo vệ compare-and-swap.
4. **`UnitQueryDto` không có `sortBy`/`sortOrder`** — `orderBy` hard-code `{ name: 'asc' }`.
5. **`UpdateUnitDto` khai báo tay lặp lại** thay vì `PartialType(CreateUnitDto)`.
6. **`existsByCode()` là dead code** từ góc nhìn Service — có implement/test nhưng không nơi nào gọi.
7. **`hasActiveProductsInUnit()` không lọc theo `Product.status`** — chỉ loại Product đã xóa mềm, tên hàm "hasActive" nhưng không kiểm tra trạng thái Active thật.
8. **Không có `unit-query.dto.spec.ts`** riêng cho validate query params.
9. **Không có Domain Event hook nào** kể cả no-op — khác Category/Brand.
10. **`docs/architecture/dependency-graph.md:105`** vẫn ghi nội dung lỗi thời về `PRODUCT_REPOSITORY` (đã ghi nhận ở audit Category và Brand trước đó, vẫn chưa cập nhật).
11. **`UnitModule` export `UNIT_REPOSITORY` nhưng 0 consumer** (§3) — cùng trạng thái YAGNI-sạch như Brand/Category trước khi chuẩn hóa.
12. Không tìm thấy `TODO`/`FIXME`/`any` trong toàn bộ `unit` module.

## 13. Impact Analysis

- **Nếu đổi schema `Unit`**: ảnh hưởng trực tiếp **2 model** — `Product` (`unitId` bắt buộc, `Restrict`) và `Barcode` (`unitId` optional, `SetNull`) — phạm vi lớn hơn Brand (chỉ ảnh hưởng `Product`).
- **Không có tác động trực tiếp** tới `PurchaseOrder`/`Inventory`/`InventoryAdjustment`/`Transfer`/`Invoice`/`StockCount`/`Supplier`/POS — các module này không có FK tới `Unit`, chỉ có thể bị ảnh hưởng **gián tiếp** qua `Product.unitId` nếu bản thân Product thay đổi cách xử lý Unit (nằm ngoài phạm vi thay đổi của chính module Unit).
- **Nếu thêm Restore**: cần đồng thời — method Repository (`restore`, `findByIdIncludingDeleted`), method Service, route Controller, permission `unit:restore` — đúng bộ 4 thay đổi đã làm ở Brand (T007)/Category (T006).
- **Nếu thêm `version`**: cần migration thêm cột + đổi chữ ký `update()` — đúng mẫu đã áp dụng 3 lần (Product/Category/Brand).
- **Nếu thêm `sortBy`/`sortOrder`**: chỉ trong phạm vi `unit` module (DTO + Repository `search()`), không ảnh hưởng module khác.
- **Nếu sửa `update()`/`softDelete()` thêm `organizationId` vào `where`**: chỉ trong phạm vi Repository của `unit`, không ảnh hưởng module khác — nhưng đây là pattern lặp lại ở nhiều module, nếu sửa nên cân nhắc phạm vi rộng hơn 1 module.
- **Barcode phụ thuộc Unit optional** (`SetNull`) — xóa cứng 1 Unit (nếu có) sẽ không chặn ở tầng DB cho Barcode, khác Product (`Restrict`, chặn cứng).

## 14. Open Questions (không tự trả lời, để RFC-0004 quyết định)

1. Unit có cần `status`/vòng đời phức tạp (đúng mẫu Product/Category 4 giá trị, hay Brand giữ `CommonStatus` 2 giá trị) hay tiếp tục không có `status` nào (chỉ có `deletedAt`) — vì Unit hiện là Master Data đơn giản nhất (chỉ 3 field nghiệp vụ: `code`/`name`/`symbol`)?
2. Unit có cần Restore đầy đủ (route + permission + guard) đúng chuẩn Category/Brand không, hay đơn giản chỉ cần đảo `deletedAt` không cần guard nghiệp vụ nào?
3. Unit có cần `version` (Optimistic Lock) không — rủi ro race condition trên 1 entity chỉ 3 field đơn giản có đủ cao để cần compare-and-swap như Product/Category/Brand?
4. `UnitQueryDto` có cần bổ sung `sortBy`/`sortOrder` để khớp Query Convention thống nhất đã áp dụng ở Category/Brand không?
5. `hasActiveProductsInUnit()` hiện không lọc theo `Product.status` (chỉ lọc `deletedAt`) — đây là hành vi cố ý (mọi Product chưa xóa đều chặn, bất kể status) hay là điểm cần sửa lại để chỉ chặn khi Product thực sự `ACTIVE`?
6. `existsByCode()` hiện không được gọi — giữ lại dự phòng hay xóa (YAGNI)?
7. Unit có cần Domain Event hook (dù chỉ no-op reserve, đúng mẫu Category/Brand) để nhất quán không?
8. Pattern hệ thống "`update()`/`softDelete()` không lọc `organizationId` ở `where`, dựa vào Service pre-check" đã lặp lại ở Product/Category/Brand/Unit — có cần 1 quyết định áp dụng chung cho toàn dự án (chuẩn hóa lại tất cả) hay giữ nguyên vì Service pre-check đã đủ an toàn?

## 15. Kết luận

Unit là module đơn giản nhất trong 3 module Master Data đã audit (Category/Brand/Unit): chỉ 3 field nghiệp vụ, không `status`, không `version`, không Restore, không Domain Event hook (kể cả no-op) — mức "chưa chuẩn hóa" rõ rệt nhất so với Category (đã qua T006) và Brand (đã qua T007). Repository Boundary sạch (0 consumer ngoài), Multi-tenant đúng chuẩn ở đường đọc, có cùng khoảng hở hệ thống (không lọc `organizationId` ở `where` ghi) đã ghi nhận từ Product/Category/Brand. Không tìm thấy TODO/FIXME/`any`. Điểm khác biệt cấu trúc lớn nhất so với Brand: Unit ảnh hưởng **2 model** khi đổi schema (`Product` + `Barcode`) thay vì 1.

Không có phát hiện nào đủ nghiêm trọng để chặn việc chờ RFC-0004.
