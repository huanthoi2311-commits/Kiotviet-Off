# RFC-0003 — Brand Domain (Version 1.0)

**Status:** APPROVED (`ARCHITECT RESOLUTION — RFC-0003 Brand Domain`, Decision RQ1-RQ5). Khóa nội dung — mọi thay đổi sau đây chỉ phản ánh Resolution, không tự diễn giải thêm.
**Tác giả:** Claude Code, theo ủy quyền tường minh 1 lần trong `ARCHITECT DECISION – START RFC-0003` (Decision B01 — "ngoại lệ được Architect phê duyệt cho dự án này... chỉ áp dụng cho RFC-0003, không thay đổi nguyên tắc Specification First cho các RFC khác trong tương lai").
**Nguồn:** `docs/architecture/brand-dependency-audit.md` (Dependency Audit) + `ARCHITECT DECISION – Brand Architecture Guidance` (Decision B02, các quyết định kiến trúc bắt buộc RFC này phải tuân thủ).
**Chỉ đạo cho Claude Code (đúng Decision B03):** RFC này chỉ mô tả Business Rules/Aggregate/API Scope/Permission/Multi-tenant/Archive-Restore/Validation/Acceptance Criteria/Out of Scope — **không viết SPEC, không viết Implementation Plan, không code**. Sau khi hoàn thành, Claude Code tự thực hiện Architecture Review cho chính RFC này (đúng Decision B04), liệt kê xung đột/câu hỏi mở, rồi dừng lại chờ Architect Resolution.

## 1. Mục tiêu

Chuẩn hóa Brand Domain theo đúng chuẩn kiến trúc đã thiết lập ở Product (T005) và Category (T006) — Optimistic Lock, Archive/Restore đầy đủ, Query API thống nhất toàn dự án Master Data — trong khi giữ Brand đơn giản hơn Category (không cấu trúc cây, tiếp tục dùng `CommonStatus` chung thay vì enum riêng), đúng bản chất Brand là Master Data phẳng, không phải Aggregate phức tạp.

## 2. Phạm vi

**Bao gồm:**
- Brand: CRUD hiện có, bổ sung Archive/Restore đầy đủ, Optimistic Lock (`version`), chuẩn hóa Query API.
- Permission mới cho Restore.
- Migration bổ sung field (`version`), tách nhỏ độc lập, có rollback (định hướng cho SPEC/Implementation Plan sau này — RFC không mô tả chi tiết migration).

**Không bao gồm** (xem §10 Out of Scope):
- Tạo `BrandStatus` enum riêng.
- Tạo `BrandDomainService`.
- Triển khai Domain Event thật (chỉ reserve).
- Thay đổi `CommonStatus` (ảnh hưởng `Warehouse`/`Tax`/`Supplier`/`Customer`).
- Thêm cấu trúc phân cấp (cây) cho Brand.
- Thay đổi quan hệ `Product.brandId` (giữ nguyên optional/`SetNull`).

## 3. Business Rules

1. Một Brand thuộc đúng một Organization (`organizationId` bắt buộc, không có Brand toàn cục).
2. Brand **không phân cấp** — không có `parentId`/`children`, khác Category. Đây là khác biệt cấu trúc cố ý (Decision B02 không yêu cầu thêm cấu trúc cây).
3. Một Product có thể có **0 hoặc 1** Brand (`brandId` optional). Xóa/Archive 1 Brand **không** xóa hay ẩn Product liên quan — Product tiếp tục tồn tại, giữ nguyên lịch sử giao dịch (Decision B02: *"Brand = NULL, Product vẫn tồn tại... đây là thiết kế ERP chuẩn"*).
4. **Archive** (xóa mềm, `DELETE /brands/:id`) bị từ chối nếu còn Product đang **active** sử dụng Brand đó (giữ nguyên rule hiện có — `hasActiveProductsInBrand` qua `ProductDomainService`, không đổi).
5. **Restore** (`POST /brands/:id/restore`, MỚI — Decision B02.3): khôi phục Brand đã xóa mềm (`deletedAt = null`).
6. **Optimistic Lock**: Brand là Aggregate Root, có `version` (Decision B02.7). Mọi `UPDATE` (qua `update()`/`softDelete()`/`restore()`) đều tăng `version`, không bao giờ reset — đúng chuẩn đã áp dụng cho `Product`/`Category`.
7. `status` (`CommonStatus`: `ACTIVE`/`INACTIVE`) **giữ nguyên, không đổi kiểu, không thêm giá trị mới** (Decision B02.1) — khác Product/Category (4 giá trị, enum riêng).

## 4. Aggregate

```
Brand (Aggregate Root, version)
```

Không có entity con nào trong Aggregate (khác `Product` — có `ProductPrice`/`ProductImage`/`Barcode`; khác `Category` — có self-reference cây). Quan hệ duy nhất ra bên ngoài Aggregate: `Product.brandId` (FK, optional, `onDelete: SetNull`, **không đổi** — Decision B02.4).

## 5. API Scope

**Không thêm route path mới ngoài `restore`** (đúng nguyên tắc đã áp dụng ở Product/Category — tái sử dụng route hiện có khi có thể):

| Route | Thay đổi so với hiện tại |
|---|---|
| `POST /brands` | Không đổi cấu trúc, có thể nhận `status` (đã có). |
| `GET /brands` | Chuẩn hóa Query params đúng Decision B02.5 — xem §5.1. |
| `GET /brands/:id` | Không đổi. |
| `PATCH /brands/:id` | Thêm `version` bắt buộc (Optimistic Lock — Decision B02.7). |
| `DELETE /brands/:id` | Giữ nguyên hành vi (chặn nếu còn Product active). |
| `POST /brands/:id/restore` | **MỚI** (Decision B02.3). |

### 5.1 Query Parameter (Decision B02.5 — chuẩn Master Data thống nhất)

```
page, limit, search, sortBy, sortOrder, status, isActive
```

**Không có `parentId`** (Brand không phân cấp, khác Category). `search` tìm theo `name`/`code` (đúng mẫu `Product`/`Category`). `sortBy` cần ít nhất `name` (hiện là default cứng duy nhất) — danh sách đầy đủ trường hợp lệ để SPEC quyết định.

**Đã quyết định (Decision RQ1, RQ3):** `isActive` **không phải cột schema mới** — là alias tầng business logic của `status`: `isActive=true` ⇔ `status=ACTIVE`, `isActive=false` ⇔ `status != ACTIVE`. Không tạo cột `isActive` boolean trong Prisma. Đây là khác biệt **cố ý** so với Product/Category (2 khái niệm độc lập) — lý do: tránh dual-source-of-truth và chi phí đồng bộ 2 field không mang lại giá trị nghiệp vụ thật cho Brand (nguyên tắc mới, xem §12 RQ5 — "Business First, Consistency Second"). `status` và `isActive` có thể dùng đồng thời trong cùng 1 query — **không phải Breaking Change** (Decision RQ4), không cần API version mới.

## 6. Permission

Thêm **1 permission mới**: `brand:restore` (đúng mẫu `category:restore`/`product:restore`). Giữ nguyên 4 permission hiện có (`brand:view`/`create`/`update`/`delete`). Không đổi permission catalog nào khác.

## 7. Multi-tenant

Không thay đổi — Brand đã đúng chuẩn (Dependency Audit §3 xác nhận: mọi method đọc lọc `organizationId`, route Controller luôn lấy `organizationId` từ JWT, không nhận từ input).

## 8. Archive / Restore

- **Archive** (`DELETE /brands/:id`): giữ nguyên hành vi hiện có — xóa mềm (`deletedAt`), chặn nếu còn Product active. Vì `CommonStatus` không có giá trị tương đương `ARCHIVED` (khác Category), Archive **không** đổi `status` — chỉ set `deletedAt`.
- **Restore** (`POST /brands/:id/restore`, MỚI):
  - Xóa `deletedAt` (`deletedAt = null`).
  - **Đã quyết định (Decision RQ2):** set `status = INACTIVE` sau khi restore, luôn luôn — không bao giờ trực tiếp `ACTIVE`, đúng nguyên tắc an toàn đã áp dụng ở Category (Decision Q7/A05 gốc từ Product). Người dùng phải chủ động `PATCH status=ACTIVE` sau đó. Lý do (Architect): *"Restore chỉ có nghĩa 'đưa dữ liệu trở lại hệ thống', không đồng nghĩa 'cho phép sử dụng ngay'"*.
  - Không có guard nghiệp vụ nào khác cho Restore (khác Category — không có cấu trúc cây nên không cần kiểm tra chuỗi tổ tiên).

## 9. Validation

- Giữ nguyên validate hiện có: `code` (`@Length(1,50)`), `name` (`@Length(2,255)`), `website` (`@IsUrl`), `status` (`@IsEnum` theo `CommonStatus`).
- Thêm: `version` bắt buộc trên `UpdateBrandDto` (kiểu `number`, `@IsInt`).
- Không có validate quan hệ cha-con (không áp dụng cho Brand).

## 10. Out of Scope (Decision B02, tường minh)

- **`BrandStatus` enum riêng** — không tạo, giữ `CommonStatus` (Decision B02.1). Hệ quả: mọi thay đổi `CommonStatus` trong tương lai ảnh hưởng đồng thời `Warehouse`/`Tax`/`Supplier`/`Customer` — nằm ngoài phạm vi RFC này.
- **`BrandDomainService`** — không tạo trừ khi có nhu cầu thực tế (Decision B02.8, YAGNI — đúng Decision Q5/S07/IP07 đã áp dụng cho Category). Dependency Audit xác nhận 0 module bên ngoài tiêu thụ `BRAND_REPOSITORY`.
- **Domain Event** (`BrandCreated`/`Updated`/`Archived`/`Restored`) — chỉ reserve tên + thời điểm gọi (hook no-op), **không** implement publish thật (Decision B02.9, đúng mẫu Product/Category).
- **Cấu trúc phân cấp (cây)** cho Brand — không có trong phạm vi, không có yêu cầu nào từ Decision B02.
- **Quan hệ `Product.brandId`** — giữ nguyên optional/`SetNull`, không đổi sang required/`Restrict` (Decision B02.4).
- **Chi tiết Migration** (số lượng, thứ tự, SQL cụ thể) — Decision B02.10 chỉ định hướng nguyên tắc ("chia nhỏ, độc lập, có rollback"), chi tiết thuộc phạm vi SPEC/Implementation Plan, không phải RFC.

## 11. Acceptance Criteria (mức RFC — sẽ chi tiết hóa ở SPEC)

| # | Tiêu chí |
|---|---|
| 1 | `POST /brands/:id/restore` hoạt động đúng, có permission `brand:restore` riêng |
| 2 | `PATCH /brands/:id` bắt buộc `version`, sai → 409 |
| 3 | `GET /brands` hỗ trợ đủ `page`/`limit`/`search`/`sortBy`/`sortOrder`/`status`/`isActive` |
| 4 | Không tạo `BrandStatus`/`BrandDomainService` mới ngoài yêu cầu |
| 5 | `Product.brandId` không đổi hành vi (vẫn optional/`SetNull`) |
| 6 | Multi-tenant không có vi phạm mới |
| 7 | Migration độc lập, có rollback, không `DROP` dữ liệu hiện có |
| 8 | Existing Tests (38 test hiện có) không vỡ |
| 9 | Regression Baseline (T005+T006) vẫn PASS (Decision T006-R06) |

## 12. Architecture Review Resolution (`ARCHITECT RESOLUTION — RFC-0003 Brand Domain`)

RFC-0003 đã qua Architecture Review (self-review của Claude Code theo Decision B04 — đối chiếu 12 ADR, `PROJECT_RULES.md`, `AI_WORKFLOW.md`, schema hiện có, module Product, module Category — không phát hiện xung đột) và Architect Resolution, giải quyết toàn bộ câu hỏi mở:

| # | Câu hỏi mở gốc | Quyết định |
|---|---|---|
| RQ1 | `isActive` — cột schema mới hay alias? | **Alias**, không tạo cột mới. `isActive=true/false` ánh xạ `status=ACTIVE`/`status != ACTIVE`. Ngoại lệ cố ý so với Product/Category. |
| RQ2 | Giá trị `status` chính xác sau Restore? | Luôn `INACTIVE`, không bao giờ trực tiếp `ACTIVE`. |
| RQ3 | Query Convention có giữ nguyên 7 param chuẩn? | Giữ nguyên — `isActive` là business filter, không phải yêu cầu schema bắt buộc cho mọi Aggregate. |
| RQ4 | Hỗ trợ đồng thời `status` VÀ `isActive` có phải Breaking Change? | Không — không cần API version mới/endpoint mới. |
| RQ5 | Nguyên tắc Master Data mới | **"Business First, Consistency Second"** — chỉ thêm field/cột khi tạo giá trị nghiệp vụ thật, không thêm chỉ để nhất quán hình thức với module khác. Áp dụng cho mọi Master Data domain kể từ đây (Unit/Attribute/Variant sau này). |

**Kết quả:** RFC-0003 **APPROVED**, không còn câu hỏi mở. SPEC-BRAND-001 được phép bắt đầu (Specification First), Implementation Plan và Code vẫn bị cấm cho tới Architecture Review tiếp theo.
