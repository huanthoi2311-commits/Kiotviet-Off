# RFC-0004 — Unit Domain (Version 1.0)

**Status:** Draft for Architecture Review.
**Tác giả:** Claude Code, theo ủy quyền tường minh trong `ARCHITECTURE REVIEW – Unit Dependency Audit` (Decision U12 — "Claude Code được phép tạo docs/rfc/RFC-0004-unit-domain.md theo đúng template RFC chuẩn của dự án").
**Nguồn:** `docs/architecture/unit-dependency-audit.md` (Dependency Audit, APPROVED) + `ARCHITECTURE REVIEW – Unit Dependency Audit` (Decision U06-U13 — các quyết định đã chốt và các câu hỏi mở RFC này phải trình bày rõ, không tự trả lời).
**Ràng buộc bắt buộc (Decision U10):** *"RFC phải quyết định toàn bộ [status/version/restore/event]. Không suy diễn từ Category. Không copy Product. Không mặc định giống Brand."* RFC này vì vậy **không đề xuất 1 phương án duy nhất** cho các mục còn mở — trình bày các phương án/cân nhắc trung lập, để Architecture Review quyết định. Đây là khác biệt cố ý so với RFC-0003 (Brand), vốn được phép đề xuất trước rồi chờ xác nhận.
**Ràng buộc phạm vi (Decision U13):** RFC này chỉ mô tả Mục tiêu/Phạm vi/Business Rules/Aggregate/Lifecycle/Permission/API Direction/Multi Tenant/Repository Boundary/Optimistic Lock/Archive-Restore/Domain Events/Acceptance Review/Danh sách Architect Decisions cần xác nhận — **không viết SPEC, không viết Implementation Plan, không code**. Sau khi hoàn thành, dừng lại chờ Architecture Review.

## 1. Mục tiêu

Xác định hình dạng kiến trúc của Unit Domain — hiện là module Master Data **kém chuẩn hóa nhất** trong 3 module đã hoàn thành (Product/Category/Brand): không `status`, không `version`, không Restore, không Domain Event hook nào (kể cả no-op). Khác RFC-0003 (Brand — đã có 10 chỉ đạo kiến trúc bắt buộc từ Decision B02 trước khi viết RFC), RFC-0004 **không có tiền đề chỉ đạo nào** — mọi trục thiết kế chính đều là câu hỏi mở thật sự (Decision U10).

**Điểm khác biệt cấu trúc quan trọng nhất (Decision U09):** Unit ảnh hưởng **2 model** khi đổi schema — `Product.unitId` (bắt buộc, `Restrict`) và `Barcode.unitId` (optional, `SetNull`) — so với Brand chỉ ảnh hưởng 1 (`Product.brandId`). Decision U09 xác định Unit là **"High Impact Aggregate"**, không được xử lý theo khuôn mẫu Brand.

## 2. Phạm vi

**Bao gồm** (khảo sát/quyết định, không code):
- Toàn bộ 8 câu hỏi mở từ Dependency Audit (Decision U11, xem §14).
- Cách xử lý 4 mục Technical Debt đã xác nhận ở Decision U07 (không sửa ở Audit, đưa vào RFC để quyết định).

**Không bao gồm** (đã chốt sẵn, không cần RFC quyết định lại):
- Repository Boundary: Decision U08 đã xác nhận ADR-0010 PASS, **không cần `UnitDomainService`** ở thời điểm hiện tại (YAGNI, 0 consumer bên ngoài `UNIT_REPOSITORY`) — RFC chỉ ghi nhận lại, không mở lại câu hỏi này (xem §9).
- Multi-tenant ở đường đọc (`findById`/`search`/`existsByCode`) — Audit xác nhận đã đúng chuẩn, không có vấn đề.

## 3. Business Rules

**Hiện có** (giữ nguyên trừ khi Architecture Review quyết định khác — Audit §9):
1. Một Unit thuộc đúng 1 Organization (`organizationId` bắt buộc).
2. `code` duy nhất trong phạm vi Organization (`@@unique([organizationId, code])`).
3. Xóa mềm (`DELETE /units/:id`) bị chặn nếu còn **Product** chưa xóa mềm đang tham chiếu Unit đó (`hasActiveProductsInUnit`, qua `ProductDomainService`).

**Phát hiện mới khi soạn RFC (không có trong 8 câu hỏi gốc của Audit, cần bổ sung — xem §14 mục 9):** Guard xóa hiện tại **chỉ kiểm tra `Product`, không kiểm tra `Barcode`** — dù `Barcode.unitId` cũng tham chiếu tới Unit (optional, `onDelete: SetNull`). Nếu 1 Unit đang được gán cho Barcode nào đó bị xóa mềm, không có cảnh báo/chặn nào ở tầng Service — hành vi thực tế phụ thuộc hoàn toàn vào việc `Barcode.unitId` chỉ bị ảnh hưởng khi **xóa cứng** (DB-level `SetNull`), còn xóa mềm (`deletedAt`) qua API hiện tại không đụng tới Barcode theo bất kỳ cách nào (không set NULL, không chặn) — Barcode vẫn giữ nguyên `unitId` trỏ tới 1 Unit đã bị đánh dấu xóa mềm. Đây là khoảng trống nghiệp vụ chưa được đặt câu hỏi ở Audit gốc.

## 4. Aggregate

```
Unit (Aggregate Root, flat — không child entity)
```

Không có entity con trong Aggregate (giống Brand). Quan hệ ra ngoài Aggregate: `Product.unitId` (bắt buộc, `Restrict`) và `Barcode.unitId` (optional, `SetNull`) — **2 quan hệ**, không phải 1 như Brand (Decision U09). Cả 2 quan hệ đều là chiều "model khác trỏ vào Unit qua FK", không phải Unit sở hữu Product/Barcode.

## 5. Lifecycle

**Hiện tại**: chỉ 2 trạng thái ngầm định — tồn tại (`deletedAt = null`) hoặc đã xóa mềm (`deletedAt != null`). Không có `status` field nào.

**Các phương án cho Architecture Review cân nhắc (không đề xuất — Decision U10):**
- **Phương án A — Giữ nguyên, không thêm `status`**: Unit tiếp tục chỉ có 2 trạng thái ngầm (tồn tại/đã xóa), không có khái niệm `ACTIVE`/`INACTIVE` tách biệt.
- **Phương án B — Thêm `status: CommonStatus`** (2 giá trị `ACTIVE`/`INACTIVE`, dùng chung enum với `Warehouse`/`Tax`/`Brand`/`Supplier`/`Customer`), đúng mẫu Brand.
- **Phương án C — Thêm `status` enum riêng 4 giá trị** (`DRAFT`/`ACTIVE`/`INACTIVE`/`ARCHIVED`), đúng mẫu Product/Category.

Không có cơ sở từ Audit để nghiêng về phương án nào — Decision U10 cấm suy diễn từ Category/Product/Brand.

## 6. Permission

**Hiện có**: `unit:view`/`create`/`update`/`delete` (4 permission, `crud('unit', 'đơn vị tính')`, không có `extra`). **Không có `unit:restore`** — khớp đúng việc chưa có cơ chế Restore (xem §11).

Nếu Architecture Review quyết định thêm Restore (§11), permission `unit:restore` cần được thêm — cùng cơ chế `crud(..., ['restore'])` đã dùng cho `product`/`category`/`brand`/`warehouse`. Đây là hệ quả kỹ thuật, không phải quyết định độc lập.

## 7. API Direction

**Hiện có** (Audit §5): `POST /units`, `GET /units` (search/page/limit, không sort), `GET /units/:id`, `PATCH /units/:id` (không Optimistic Lock), `DELETE /units/:id`.

**Hướng cần quyết định** (không phải bảng route cố định như RFC-0003 §5 — vì phụ thuộc vào các quyết định ở §5/§10/§11 chưa chốt):
- Nếu thêm `version` (§10): `PATCH /units/:id` sẽ cần `version` bắt buộc, đúng mẫu Product/Category/Brand.
- Nếu thêm Restore (§11): cần route `POST /units/:id/restore` mới.
- `GET /units` — Query Convention thống nhất dự án (`page`/`limit`/`search`/`sortBy`/`sortOrder`/`status`/`isActive`) hiện chỉ có 3/7 tham số (`search`/`page`/`limit`). Việc bổ sung `sortBy`/`sortOrder` là 1 trong 8 câu hỏi mở (§14 mục 5) — không tự thêm.
- `status`/`isActive` filter chỉ có ý nghĩa nếu §5 chọn Phương án B hoặc C (thêm `status`).

## 8. Multi Tenant

Đường đọc (`findById`/`search`/`existsByCode`) đã đúng chuẩn — lọc `organizationId` đầy đủ, Controller chỉ lấy `organizationId` từ JWT (Audit §4). **Không có vấn đề cần quyết định ở mục này.**

Đường ghi (`update`/`softDelete`) không tự lọc `organizationId` ở `where` — dựa vào Service pre-check. Đây là pattern hệ thống lặp lại ở Product/Category/Brand (không riêng Unit) — liệt kê ở §14 mục 8 để Architecture Review quyết định có nên chuẩn hóa lại (phạm vi rộng hơn 1 module) hay giữ nguyên.

## 9. Repository Boundary

**Đã chốt (Decision U08, không mở lại):**
- `UNIT_REPOSITORY` hiện có 0 consumer bên ngoài `unit` module — ADR-0010 đang PASS.
- **Không cần `UnitDomainService`** ở thời điểm hiện tại — tiếp tục YAGNI. Chỉ tạo khi có module thứ 2 thật sự cần đọc Unit.
- `UnitModule` tiếp tục inject `ProductDomainService` (không phải `PRODUCT_REPOSITORY` trực tiếp) để gọi `hasActiveProductsInUnit()` — đúng ADR-0010, không đổi.

## 10. Optimistic Lock

**Hiện tại**: không có `version` ở bất kỳ tầng nào (schema/entity/interface).

**Các phương án cho Architecture Review cân nhắc (không đề xuất):**
- **Phương án A — Không thêm `version`**: Unit chỉ có 3 field nghiệp vụ đơn giản (`code`/`name`/`symbol`), rủi ro race condition giữa 2 request ghi đồng thời có thể được đánh giá là thấp, không cần compare-and-swap.
- **Phương án B — Thêm `version`**, đúng mẫu Product/Category/Brand — nhất quán toàn bộ Master Data đã chuẩn hóa `version` cho mọi Aggregate Root có thể ghi qua `PATCH`.

Không có cơ sở từ Audit để nghiêng về phương án nào (Decision U10).

## 11. Archive / Restore

**Hiện tại**: chỉ có Archive (xóa mềm `deletedAt`), **không có Restore** — không route, không method Repository, không permission.

**Các phương án cho Architecture Review cân nhắc (không đề xuất):**
- **Phương án A — Không thêm Restore**: Unit đã xóa mềm không thể khôi phục qua API (phải can thiệp DB trực tiếp nếu cần).
- **Phương án B — Thêm Restore đầy đủ**, đúng mẫu Category/Brand: route `POST /units/:id/restore`, method Repository (`restore`, `findByIdIncludingDeleted`), permission `unit:restore`. Nếu chọn phương án này, cần quyết định thêm: có cần guard nghiệp vụ nào khi restore không (Category có guard "tổ tiên không đang Archived" vì có cấu trúc cây — Unit không có cấu trúc cây nên guard này không áp dụng được nguyên trạng, có thể không cần guard nào hoặc cần guard khác).

**Guard khi Archive (xóa mềm) — bổ sung phát hiện mới (§3):** guard hiện tại chỉ kiểm tra Product, không kiểm tra Barcode đang dùng Unit. Nếu Architecture Review giữ nguyên hành vi Archive, cần quyết định rõ: có mở rộng guard để chặn cả khi còn Barcode tham chiếu không, hay giữ nguyên (chỉ chặn theo Product) là chủ đích.

## 12. Domain Events

**Hiện tại**: không có hook nào (kể cả no-op) — khác Category/Brand (đã có 4 hook reserve: Created/Updated/Archived/Restored).

**Các phương án cho Architecture Review cân nhắc (không đề xuất):**
- **Phương án A — Không thêm hook**: giữ nguyên, chỉ dựa vào `AuditLogService` (best-effort, không phải domain event).
- **Phương án B — Thêm hook no-op reserve** (`onUnitCreated`/`onUnitUpdated`/`onUnitArchived`/`onUnitRestored` nếu có Restore), đúng mẫu Category/Brand — chỉ định nghĩa tên + thời điểm gọi, không publish thật (đúng ADR-0009/ADR-0011, chưa triển khai Outbox).

## 13. Acceptance Review (mức RFC)

RFC này được coi là hoàn chỉnh khi:

| # | Tiêu chí |
|---|---|
| 1 | Toàn bộ 8 câu hỏi mở từ Audit (Decision U11) được trình bày trong §14, không tự trả lời |
| 2 | 1 câu hỏi mở mới phát sinh khi soạn RFC (guard Archive không kiểm tra Barcode, §3/§11) được trình bày rõ, không tự quyết định |
| 3 | Các mục đã chốt sẵn (Repository Boundary — Decision U08, Blast Radius — Decision U09) được ghi nhận, không mở lại |
| 4 | Không đề xuất 1 phương án duy nhất cho Lifecycle/Optimistic Lock/Archive-Restore/Domain Events — trình bày phương án trung lập (Decision U10) |
| 5 | Không viết SPEC/Implementation Plan/code trong tài liệu này (Decision U13) |

## 14. Danh sách Architect Decisions cần xác nhận

| # | Câu hỏi | Nguồn |
|---|---|---|
| 1 | Unit có cần `status`/vòng đời (§5) — không thêm, `CommonStatus` 2 giá trị (mẫu Brand), hay enum riêng 4 giá trị (mẫu Product/Category)? | Audit Open Question #1 |
| 2 | Unit có cần Restore đầy đủ (§11) — route/permission/guard — hay giữ nguyên chỉ Archire 1 chiều? | Audit Open Question #2 |
| 3 | Unit có cần `version` (Optimistic Lock, §10) không? | Audit Open Question #3 |
| 4 | `UnitQueryDto` có cần bổ sung `sortBy`/`sortOrder` (§7) để khớp Query Convention thống nhất không? | Audit Open Question #4 |
| 5 | `hasActiveProductsInUnit()` hiện không lọc theo `Product.status` (chỉ lọc `deletedAt`) — giữ nguyên (mọi Product chưa xóa đều chặn) hay sửa để chỉ chặn khi Product thực sự `ACTIVE`? | Audit Open Question #5 |
| 6 | `existsByCode()` hiện không được gọi từ Service — giữ lại dự phòng hay xóa (YAGNI)? | Audit Open Question #6 |
| 7 | Unit có cần Domain Event hook (dù chỉ no-op reserve, §12) để nhất quán với Category/Brand không? | Audit Open Question #7 |
| 8 | Pattern "`update()`/`softDelete()` không lọc `organizationId` ở `where`" (§8) — có cần 1 quyết định áp dụng chung toàn dự án (chuẩn hóa lại Product/Category/Brand/Unit cùng lúc) hay giữ nguyên vì Service pre-check đã đủ an toàn? | Audit Open Question #8 |
| 9 | **(Mới, phát sinh khi soạn RFC)** Guard khi Archive (xóa mềm) Unit hiện chỉ kiểm tra Product đang dùng, không kiểm tra Barcode (§3/§11) — có cần mở rộng guard để chặn cả khi còn Barcode tham chiếu, hay giữ nguyên là chủ đích? | RFC-0004 §3, không có trong 8 câu hỏi gốc của Audit |

Không có câu hỏi nào trong danh sách này được RFC tự trả lời — toàn bộ chờ Architecture Review (Decision U13).
