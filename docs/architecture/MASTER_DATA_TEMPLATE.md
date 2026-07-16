# Master Data — Template Chuẩn

**Mục đích:** Khuôn mẫu kiến trúc chung cho mọi module Master Data (đã áp dụng cho Product/T005, Category/T006, Brand/T007, Unit/T008 — dùng làm điểm khởi đầu cho Barcode/T009, Attribute/T010, Variant/T011). Đây là **template tham khảo**, không thay thế RFC/SPEC — mỗi module vẫn phải qua đúng quy trình `Dependency Audit → RFC → Architecture Review → SPEC → Implementation Plan → Architecture Review → Code → Release`. Template chỉ giúp trả lời nhanh "hình dạng mặc định là gì" để RFC/SPEC không phải mô tả lại từ đầu mỗi lần.

**Không phải mọi module đều dùng đủ toàn bộ template** — vd Brand không phân cấp (không có `parentId`), Unit không có cấu trúc cây. Từng RFC vẫn phải xác nhận module cụ thể có cần từng phần hay không (xem `DEFAULT_DECISIONS.md` cho phần nào được tự áp dụng, phần nào vẫn cần hỏi).

---

## 1. Entity

Field chuẩn mọi Master Data Aggregate Root:

```ts
export interface XxxEntity {
  id: string;
  organizationId: string;
  code: string;              // unique theo (organizationId, code)
  name: string;
  // ...field nghiệp vụ riêng của module...
  status: XxxStatus;         // xem §XxxStatus bên dưới — KHÔNG mặc định copy module khác
  version: number;           // Optimistic Lock — mặc định CÓ (xem DEFAULT_DECISIONS.md)
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
```

**`status` — 3 hình dạng đã dùng, không có hình dạng "mặc định đúng cho mọi module":**
- `CommonStatus` dùng chung (`ACTIVE`/`INACTIVE`, 2 giá trị) — Brand, cũng dùng bởi `Warehouse`/`Tax`/`Supplier`/`Customer`. Archive KHÔNG có giá trị `ARCHIVED` tương ứng — chỉ set `deletedAt`.
- Enum riêng 3 giá trị (`ACTIVE`/`INACTIVE`/`ARCHIVED`, không `DRAFT`) — Unit (`UnitStatus`).
- Enum riêng 4 giá trị (`DRAFT`/`ACTIVE`/`INACTIVE`/`ARCHIVED`) — Product (`ProductStatus`), Category (`CategoryStatus`).

RFC phải chọn tường minh 1 trong 3 (hoặc đề xuất hình dạng khác nếu có lý do), không suy diễn từ module trước.

## 2. Aggregate

```
Xxx (Aggregate Root, version)
├── (entity con, nếu có — vd Product có ProductPrice/ProductImage/Barcode)
└── (không có child — phần lớn Master Data, vd Brand/Unit)
```

Xác nhận rõ trong RFC: Aggregate có phân cấp cây không (chỉ Category hiện có `parentId`), có bao nhiêu model khác tham chiếu qua FK (ảnh hưởng Impact Analysis — Brand: 1 model, Unit: 2 model).

## 3. Migration

- **Mỗi thay đổi schema độc lập → 1 migration độc lập** (không gộp) — nguyên tắc bất biến từ T006 (Decision S04) tới nay.
- Mỗi migration có `migration.sql` + `rollback.sql`, thư mục đặt tên theo timestamp tuần tự.
- Backfill (nếu có) phải đơn giản — 1 câu `UPDATE` dựa trên dữ liệu hiện có (vd `deletedAt IS NOT NULL → status = 'ARCHIVED'`), không backfill phức tạp nhiều bước.
- Không `DROP` dữ liệu hiện có trong migration thêm mới (chỉ `ADD COLUMN`/`CREATE TYPE`).
- Bước Verify bắt buộc cho mỗi migration (đối chiếu số dòng trước/sau, hoặc điều kiện logic sau backfill).

## 4. Repository

```ts
export interface IXxxRepository {
  create(input: CreateXxxInput): Promise<XxxEntity>;
  findById(id: string, organizationId: string): Promise<XxxEntity | null>;
  findByIdIncludingDeleted(id: string, organizationId: string): Promise<XxxEntity | null>;
  update(id: string, organizationId: string, expectedVersion: number, input: UpdateXxxInput): Promise<XxxEntity>;
  softDelete(id: string, organizationId: string, deletedBy: string): Promise<void>;
  restore(id: string, organizationId: string, restoredBy: string): Promise<void>;
  search(params: XxxSearchParams): Promise<XxxSearchResult>;
  existsByCode(organizationId: string, code: string, excludeId?: string): Promise<boolean>;
}
export const XXX_REPOSITORY = Symbol('XXX_REPOSITORY');
```

- `update()`: `updateMany` compare-and-swap qua `where: { id, organizationId, version: expectedVersion }` — không dùng `update()` thuần (Prisma không cho thêm điều kiện ngoài unique field). 0 dòng ảnh hưởng → ném `XxxConcurrencyConflictError`.
- `softDelete()`/`restore()`: `where: { id, organizationId }` (module từ T008 trở đi — xem `DEFAULT_DECISIONS.md` về mốc áp dụng).
- `existsByCode()`: giữ làm Reserved API kể cả khi Service chưa gọi tới (không xóa "dead code" — có thể phục vụ Import/Bulk/Validation sau này, xác nhận qua Decision SU02).

## 5. Domain Service

**Chỉ tạo `XxxDomainService` khi có module khác THẬT SỰ cần đọc** — không tạo "phòng khi cần sau" (YAGNI, ADR-0010). Category/Brand/Unit đều xác nhận qua Dependency Audit: 0 consumer bên ngoài → không tạo.

Khi tạo, đúng mẫu `ProductDomainService`/`BarcodeDomainService`: chỉ pass-through các method module khác thực sự gọi, không thêm `create`/`update`/method ghi nào.

## 6. Application (Service)

```
create() → Repository.create() → AuditLog → onXxxCreated() (no-op) → MapperResponse
findOne() → Repository.findById() → 404 nếu null → MapperResponse
search() → Repository.search(query mapped) → MapperResponse phân trang
update() → Repository.findById() (404 check) → Repository.update(dto.version) → bắt ConcurrencyConflictError→409 → AuditLog → onXxxUpdated() → MapperResponse
remove() → Repository.findById() → Guard nghiệp vụ (vd hasActiveXInY qua DomainService) → Repository.softDelete() → AuditLog → onXxxArchived()
restore() → Repository.findByIdIncludingDeleted() → 404/đã-active-check → Repository.restore() → AuditLog → onXxxRestored() → MapperResponse
```

4 hook Domain Event no-op (`onXxxCreated/Updated/Archived/Restored`) — reserve tên + thời điểm gọi, KHÔNG publish thật (chờ Outbox, ADR-0009/ADR-0011).

## 7. Controller

```
POST   /xxx                 xxx:create
GET    /xxx                 xxx:view   (search + pagination)
GET    /xxx/:id             xxx:view
PATCH  /xxx/:id              xxx:update (bắt buộc version trong body)
DELETE /xxx/:id              xxx:delete (204, chặn nếu còn tham chiếu)
POST   /xxx/:id/restore      xxx:restore (nếu module có Restore)
```

Guard chuẩn: `@UseGuards(JwtAuthGuard, PermissionsGuard)` ở class, `@RequirePermissions('xxx:action')` ở method. `organizationId` LUÔN lấy từ `@CurrentUser()` (JWT), không nhận từ body/param/query.

## 8. DTO

- `CreateXxxDto`: field nghiệp vụ bắt buộc + `status?` (optional, chỉ nhận giá trị non-terminal — không `ARCHIVED`/`DRAFT` tùy hình dạng status).
- `UpdateXxxDto`: field nghiệp vụ optional + `version` (**bắt buộc**, `@IsInt()`) + `status?` (cùng ràng buộc như Create).
- `XxxQueryDto`: `search?`/`status?`/`isActive?`/`page?`/`limit?`/`sortBy?`/`sortOrder?` — đúng 7 tham số Query Convention (xem §10).
- `XxxResponseDto`: field nghiệp vụ + `status` + `version` (KHÔNG có `organizationId`/`deletedAt`).

## 9. Validation

- `status` trên Create/Update: `@IsIn([...non-terminal values])` — loại trừ giá trị "đã lưu trữ" (chỉ đạt được qua `DELETE`, không qua `PATCH`).
- `version` trên Update: `@IsInt()`, không `@IsOptional()`.
- Không validate quan hệ cha-con trừ khi module có cấu trúc cây (hiện chỉ Category).

## 10. Query Convention

```
page, limit, search, sortBy, sortOrder, status, isActive
```

Cố định, không đổi tên (không `pageSize`/`sort`). `isActive` là **filter alias cho `status=ACTIVE`/`status != ACTIVE`, không phải cột schema mới** — trừ khi RFC chứng minh có nhu cầu nghiệp vụ thật cho 1 cờ độc lập (nguyên tắc "Business First, Consistency Second"). Có thể dùng đồng thời `status` + `isActive` (AND logic, không cái nào override cái nào) — không phải Breaking Change.

## 11. Permission

`crud(group, label, extra)` — thêm `'restore'` vào `extra` nếu module có Restore, không thì để `[]`. Không tạo permission code nào ngoài `view`/`create`/`update`/`delete`/`restore`.

## 12. Optimistic Lock

`version: number @default(1)`. `PATCH` bắt buộc gửi đúng version, sai → `409` qua `XxxConcurrencyConflictError` → `ConflictException`. **Không áp dụng cho** `GET`/`LIST`/`RESTORE`/`ARCHIVE` — chỉ `PATCH`.

## 13. Archive (Soft Delete)

`DELETE /xxx/:id` → set `deletedAt` + `status = <giá trị terminal>` NẾU status enum có giá trị đó (Product/Category/Unit: `ARCHIVED`; Brand: không có, chỉ set `deletedAt`). Guard nghiệp vụ: kiểm tra mọi model khác tham chiếu qua FK còn "đang dùng thật" (status active, chưa xóa mềm) — nếu Aggregate ảnh hưởng nhiều model (vd Unit: Product + Barcode), phải kiểm tra ĐỦ tất cả, thiếu 1 cũng không cho Archive ("không để dữ liệu mồ côi").

## 14. Restore

`POST /xxx/:id/restore` → set `deletedAt = null`, `status = INACTIVE` **luôn luôn** (không bao giờ trực tiếp `ACTIVE`) — người dùng phải chủ động `PATCH status=ACTIVE` sau đó. Guard: chỉ cần xác nhận "đã từng xóa mềm chưa" (`XXX_NOT_DELETED` nếu chưa) trừ khi module có cấu trúc cây (Category cần thêm guard chuỗi tổ tiên).

## 15. Swagger

`@ApiTags`/`@ApiBearerAuth`/`@ApiCommonErrors()` ở class. `@ApiOperation`/`@ApiResponse` mỗi route. `@ApiWriteErrors()` cho route ghi (`POST`/`PATCH`/`DELETE`/`restore`). `@ApiProperty` đầy đủ trên DTO, có `example` khi hợp lý.

## 16. Tests

5 lớp theo `TEST_RULES.md`. Nhóm bắt buộc cho Unit Test + API Contract (Decision UP09, đúc kết từ T008): **CRUD, Restore, Optimistic Lock, Pagination, Search, Sort, Permission, Multi Tenant, Repository, Validation, API Contract, Regression**. Coverage module ≥ 90% (áp dụng theo phạm vi module đang triển khai, không phải toàn backend — xác nhận qua Decision R01/T007).

## 17. Release Checklist

```
Build PASS → TypeCheck PASS → Lint PASS → Unit Test PASS → Regression PASS
→ Architecture Test PASS → Coverage ≥ 90% (module) → Repository Boundary
không vi phạm mới → Release Note + CHANGELOG + PROJECT_STATUS cập nhật
→ Technical Complete = YES, Operational Complete = PENDING (nếu còn
Integration/Rollback/Smoke Test chưa chạy do thiếu Docker) → Tag → Push
```
