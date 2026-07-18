# RFC-T012 — Supplier Domain

**Status:** APPROVED WITH DECISIONS (Revised — v2, sau `ARCHITECT RESOLUTION — RFC-T012 SUPPLIER DOMAIN`, Decision SR01-SR14)
**Task:** T012
**Mode:** Short RFC
**Author:** Architect (bản gốc) — **Revision v2 do Claude Code cập nhật theo AUTHORIZATION tường minh của Architect Resolution SR01-SR14** (không phải Claude Code tự soạn RFC mới — chỉ áp dụng đúng các quyết định đã chốt vào bản RFC hiện có, đúng ranh giới RFC-authorship, cùng ngoại lệ đã áp dụng ở RFC-T011).
**Project:** Offline Single-Computer POS System

> Bản v1 (PROPOSED) đã qua Architecture Review (`docs/architecture/T012-architecture-review.md`) → `ARCHITECT RESOLUTION — RFC-T012 SUPPLIER DOMAIN` (Decision SR01-SR14, kết quả **APPROVED WITH DECISIONS**, AUTHORIZATION cập nhật RFC + viết SPEC-T012-SUPPLIER-001). Các mục thay đổi so với v1 được đánh dấu **[SRxx]**. Mục không đổi giữ nguyên nội dung gốc.

---

## 0. Context — **[SR01 xác nhận]**

Supplier là module Master Data chuẩn.

T012 là Brownfield — **xác nhận (Decision SR01): T012 là Evolution, không Rewrite, không phá dữ liệu, không phá API hiện hành nếu không thật sự cần.**

Nếu Supplier module đã tồn tại:

- ưu tiên Evolution
- không Rewrite
- không mất dữ liệu
- không phá API hiện tại

Áp dụng đầy đủ:

- AD05
- MASTER_DATA_TEMPLATE
- MASTER_DECISION
- DEFAULT_DECISIONS

## 1. Purpose

Supplier Domain quản lý thông tin nhà cung cấp phục vụ:

- Purchase
- Purchase Return
- Supplier Debt
- Reporting

Supplier không phải source of truth của công nợ.

## 2. Scope

Bao gồm:

- Supplier Aggregate
- Repository
- Domain Service
- Application Service
- REST API
- DTO
- Permission
- Search
- Pagination
- Archive
- Restore
- Optimistic Lock
- Audit
- Swagger
- Test
- Documentation

## 3. Out of Scope — **[SR04 — REVISED]**

Không thực hiện:

- Supplier Group
- Supplier Portal
- Contract Management
- Purchase Pricing
- Multiple Contacts
- Multiple Addresses
- ~~Import/Export Excel~~ **[SR04] "No new Import/Export functionality"** — Import/Export **đã tồn tại và hoạt động thật** (`POST /suppliers/import`, `GET /suppliers/export`) — không phải "chưa có". T012 **giữ nguyên hoàn toàn**: không sửa, không xóa, không viết lại, không thêm tính năng, không đổi API.
- Supplier Statement
- Supplier Debt Ledger
- Loyalty
- CRM
- Cloud Sync

Debt sẽ thuộc T017.

## 4. Aggregate

Aggregate Root: **Supplier**

Organization scoped.

Không thuộc Branch.

## 5. Main Fields

Tối thiểu: `id`, `organizationId`, `code`, `name`, `phone`, `email`, `address`, `taxCode`, `contactName`, `note`, `paymentTermDays`, `status`, `version`, `createdAt`, `updatedAt`, `archivedAt`, `createdBy`, `updatedBy`.

**[SR09 xác nhận]** Các field bổ sung hiện có (nếu repository đã có): **được giữ**. Không xóa trong T012 nếu đang có consumer. Danh sách trên là minimum fields, không phải danh sách đóng.

**[Ghi chú audit]** `SupplierProduct` (bảng giá/liên kết Supplier-Product, `defaultPrice`/`leadTime`/`priority`) không nằm trong Scope §2 — T012 không đụng tới, giữ nguyên hoàn toàn.

## 6. Supplier Code — **[SR07 — REVISED, bổ sung rõ]**

Giống Customer.

`code`: optional input, mandatory stored value.

Nếu client truyền → validate → unique.
Nếu không truyền → generator.

**[SR07]** Khác Customer — Supplier **chưa có generator nào tồn tại**. T012 sẽ bổ sung mới. Generator phải: organization scoped, atomic, concurrency safe. **Không dùng `count()+1`. Không dùng `MAX(code)`.** Ưu tiên tái sử dụng infrastructure sequence/generator đã có trong dự án (mẫu `Sequence` table — `SequenceCustomerCodeGenerator`/`SequenceSkuGenerator`) nếu phù hợp; nếu chưa có mẫu phù hợp, được phép xây generator riêng cho Supplier.

## 7. Lifecycle

`ACTIVE`, `INACTIVE`, `ARCHIVED`.

Allowed:

```
ACTIVE → INACTIVE
INACTIVE → ACTIVE
ACTIVE → ARCHIVED
INACTIVE → ARCHIVED
ARCHIVED → INACTIVE
```

Restore luôn về `INACTIVE`.

## 8. Business Rules

**BR01 — Organization Scope.**

**BR02 — Unique Code.**

**BR03 — Immutable:** `id`, `organizationId`, `code`, `createdAt`, `createdBy`.

**BR04 — Archived Supplier** không được dùng cho Purchase mới.

**BR05 — Inactive Supplier** không được dùng cho Purchase mới.

**BR06 — Supplier Aggregate** không là source of truth của: `currentDebt`, `payableBalance`, `debtAmount`. **[SR10]** Audit xác nhận Supplier **hiện không có cột nào trong nhóm này** trên schema thật (khác Customer, vốn có sẵn `currentDebt`) — quyết định vẫn giữ nguyên nguyên tắc cho tương lai: nếu phát sinh field dạng này sau này, đánh dấu deprecated, không xóa, T017 xử lý.

**BR07 — Projection:** các field như `totalPurchase`, `totalOrder` (nếu đang tồn tại) được giữ. Không chuyển realtime. **[Ghi chú audit]** Hiện Supplier không có cột nào trong nhóm này — cùng tình huống BR06.

**BR08 — Archive Guard. [SR02/SR03 — REVISED HOÀN TOÀN]**

~~Thiết kế mở. T015 Purchase Foundation và T017 Debt Ledger sẽ tích hợp. Không tạo dependency giả.~~ **Tiền đề này SAI — Architecture Review phát hiện Archive Guard ĐÃ TỒN TẠI VÀ ĐANG HOẠT ĐỘNG ĐÚNG** (`SupplierService.remove()` → `hasPurchaseOrders()` → chặn Archive nếu còn đơn nhập hàng, có test).

**Quyết định (Decision SR02):** GIỮ NGUYÊN. Không xóa, không viết lại, không đổi business rule. BR08 đổi thành: **"Chuẩn hóa Archive Guard hiện có"**, không phải "Thiết kế Archive Guard mới". Guard hiện tại là **source of truth** — đúng nghiệp vụ, có test, không vi phạm kiến trúc (kiểm tra qua quan hệ Prisma nội bộ trong `SupplierRepository`, không phải cross-module call) → tiếp tục sử dụng.

**Decision SR03:** T015 Purchase Foundation **không được viết Archive Guard mới** — chỉ được **mở rộng** guard hiện có nếu phát sinh thêm trạng thái nghiệp vụ mới (vd đơn nhập hàng ở trạng thái khác ngoài "chưa hoàn tất").

**BR09 — Optimistic Lock.** Áp dụng: Update, Activate, Deactivate, Archive, Restore.

**BR10 — Audit Log.** Bắt buộc.

## 9. Domain Service — **[SR05/SR06 xác nhận, không đổi nội dung]**

`SupplierDomainService` — **Public Domain API** (Decision SR06).

Public API tối thiểu:

- `findById()`
- `findActiveById()`
- `findUsableForPurchase()`
- `existsByCode()`
- `assertBelongsToOrganization()`
- `assertNotArchived()`

Repository token không export.

**[SR05]** `SupplierModule` không được export `SUPPLIER_REPOSITORY`/`SUPPLIER_PRODUCT_REPOSITORY` ra ngoài business layer — **phải gỡ khỏi `SupplierModule.exports` trong T012** (Architecture Review xác nhận cả 2 token đang bị export, `supplier-debt` đang inject `SUPPLIER_REPOSITORY` trực tiếp, chỉ dùng đúng 1 method `findById()`).

`supplier-debt` phải chuyển sang dùng `SupplierDomainService`. Không dùng `forwardRef`. Nếu phát sinh dependency, áp dụng Reference Module Pattern (đã dùng ở Barcode T009) — không cần thiết ở đây vì không có circular dependency (hướng phụ thuộc một chiều).

## 10. Repository

Tối thiểu: `create`, `findById`, `findByCode`, `existsByCode`, `updateWithVersion`, `changeStatusWithVersion`, `search`, `count`.

Mọi query phải có `organizationId`.

**[SR08]** `existsByCode()` **đã tồn tại** trong `ISupplierRepository` — không viết lại, chỉ chuẩn hóa signature/contract nếu cần (đối chiếu khi viết SPEC).

## 11. Search

Search: `code`, `name`, `phone`, `email`, `taxCode`, `contactName`.

Filter: `status`.

Default: không trả `ARCHIVED`.

## 12. API

Route: `/suppliers`

```
POST   /suppliers
GET    /suppliers
GET    /suppliers/:id
PATCH  /suppliers/:id
POST   /suppliers/:id/activate
POST   /suppliers/:id/deactivate
DELETE /suppliers/:id
POST   /suppliers/:id/restore
```

`DELETE` = Archive.

**[Ghi chú audit — không đổi]** `POST /suppliers/import` và `GET /suppliers/export` (đã tồn tại, giữ nguyên theo SR04) không nằm trong danh sách route "tối thiểu" ở trên vì không phải route T012 tạo mới — vẫn tiếp tục hoạt động song song.

## 13. Permission — **[SR12 xác nhận, khớp convention hiện có]**

`supplier:create`, `supplier:read`, `supplier:update`, `supplier:activate`, `supplier:deactivate`, `supplier:archive`, `supplier:restore` — **giữ đúng convention dấu hai chấm hiện có của dự án** (không dùng dấu chấm). Tên cụ thể (`read` vs `view`, `archive` vs `delete`) chốt khớp `crud()` helper hiện tại khi viết SPEC — đúng tiền lệ Customer (Decision CR10).

Permission `supplier:import`/`supplier:export` đã tồn tại (SR04) — không đổi.

## 14. Migration — **[SR11 — REVISED, tách theo mục đích]**

Audit schema trước (đã thực hiện — `docs/architecture/T012-architecture-review.md`). Nếu Supplier đã tồn tại: không tạo model mới.

**Migration Strategy (Decision SR11):**

- **Migration A — Generator/Version (nếu cần).** Thêm `version` (Optimistic Lock). Generator mới (SR07) không nhất thiết cần thay đổi schema — xác nhận cụ thể khi viết SPEC.
- **Migration B — Status/field adjustment.** Đổi status model sang enum riêng (nếu cần, đúng mẫu Customer/Barcode), điều chỉnh field nếu SPEC xác định cần.
- **Migration C — Boundary cleanup (chỉ khi thực sự cần).** Không dự kiến cần migration schema cho việc gỡ Repository Boundary (đây là thay đổi code, không phải schema).

Không migration nào phá dữ liệu.

## 15. Test — **[SR13 bổ sung]**

Bắt buộc: CRUD, Archive, Restore, Activate, Deactivate, Optimistic Lock, Duplicate Code, Cross Organization, Search, Repository Boundary, Architecture Test, Regression, Build, Typecheck, Lint.

**Bổ sung theo Decision SR13:**
1. Archive Guard — Supplier có Purchase (đơn nhập hàng chưa hoàn tất) → Archive Fail.
2. Archive Guard — Supplier không có Purchase → Archive Success.
3. Generator concurrency (2 request đồng thời không tạo trùng code).
4. Repository Boundary (xác nhận `supplier-debt` không còn inject `SUPPLIER_REPOSITORY`).
5. Architecture Test.
6. Regression.

## 16. Documentation

Cập nhật: Module docs, Permission catalog, Error catalog, Release note, PROJECT_STATUS, SPRINT_DASHBOARD.

## 17. Implementation Priority — **[SR14 — mới]**

1. Repository Boundary.
2. Generator.
3. Archive Guard Standardization (chuẩn hóa, không viết lại).
4. Documentation.

## 18. Open Questions

Claude Code chỉ được dừng nếu phát hiện:

- Supplier module đã tồn tại và mâu thuẫn RFC.
- Repository Boundary violation.
- Circular dependency.
- Public API breaking.
- Schema conflict.
- Migration risk.
- Supplier debt đang lưu trực tiếp.
- Permission conflict.

Không tự quyết định.

*(Toàn bộ điều kiện trên đã thực sự xảy ra ở Architecture Review — xem `docs/architecture/T012-architecture-review.md` mục A/C — và đã được giải quyết qua Decision SR01-SR14 ở trên. Không còn Open Question nào chưa giải quyết tính tới thời điểm RFC v2 này.)*

## 19. Authorization — **[cập nhật theo `ARCHITECT RESOLUTION — RFC-T012 SUPPLIER DOMAIN`, thay thế Authorization ở bản v1]**

RFC-T012: **APPROVED WITH DECISIONS.**

Claude Code được phép:

1. Cập nhật RFC theo Decision SR01-SR14 (đã thực hiện — chính là bản v2 này).
2. Viết **SPEC-T012-SUPPLIER-001**.

Claude Code không được: sửa source, migration, commit, push, tag.

Sau khi SPEC hoàn thành: dừng và chờ Architecture Review (của SPEC).

---

## Lịch sử quyết định

1. **RFC-T012 v1 (PROPOSED)** — Architect soạn trực tiếp (Short RFC), giao Claude Code làm Architecture Review only.
2. **`ARCHITECTURE REVIEW — RFC-T012 Supplier Domain`** (Claude Code, `docs/architecture/T012-architecture-review.md`) — phát hiện 3 conflict cụ thể (A1 Archive Guard đã tồn tại, A2 Repository Boundary violation, A3 Excel Import/Export đã tồn tại) + 2 ambiguity (C1 `SupplierProduct` phạm vi, C2 naming `paymentTerm`).
3. **`ARCHITECT RESOLUTION — RFC-T012 SUPPLIER DOMAIN`** (Decision SR01-SR14) — kết quả **APPROVED WITH DECISIONS**, AUTHORIZATION tường minh: (a) cập nhật RFC theo SR01-14, (b) viết SPEC-T012-SUPPLIER-001.
4. **RFC-T012 v2 (bản này)** — Claude Code áp dụng SR01-SR14 vào bản v1, giữ nguyên toàn bộ phần không bị Decision nào chạm tới, đánh dấu rõ **[SRxx]** ở từng mục thay đổi, không xóa nội dung gốc (giữ bằng gạch ngang ở §3/§8 BR08 để lưu lịch sử quyết định bị bác bỏ).
