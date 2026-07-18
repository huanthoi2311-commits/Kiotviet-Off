# RFC-T011 — Customer Domain

**Status:** APPROVED WITH DECISIONS (Revised — v2, sau `ARCHITECT RESOLUTION — RFC-T011 CUSTOMER DOMAIN`, Decision CR01-CR13)
**Task:** T011
**Mode:** Short RFC
**Author:** Architect (bản gốc) — **Revision v2 do Claude Code cập nhật theo AUTHORIZATION tường minh của Architect Resolution CR01-CR13** (không phải Claude Code tự soạn RFC mới — chỉ áp dụng đúng các quyết định đã chốt vào bản RFC hiện có, đúng ranh giới RFC-authorship).
**Project Mode:** Offline Single-Computer POS System

> Bản v1 (PROPOSED) đã qua Architecture Review (`docs/architecture/T011-architecture-review.md`) → `ARCHITECT RESOLUTION` lần 1 (AR-T011-01 đến 08, kết quả RFC REVISION REQUIRED) → `ARCHITECT RESOLUTION — RFC-T011 CUSTOMER DOMAIN` lần 2 (Decision CR01-CR13, kết quả **APPROVED WITH DECISIONS**, AUTHORIZATION cập nhật RFC + viết SPEC-T011-CUSTOMER-001). Các mục thay đổi so với v1 được đánh dấu **[CRxx]**. Mục không đổi giữ nguyên nội dung gốc.

---

## 0. Định hướng tổng quát (CR01 — mới)

**T011 là "Evolution of existing Customer Domain", KHÔNG phải "Greenfield Customer Module".**

Customer không phải module mới — đây là module hiện hữu (20 file, có test, 2 module khác đang phụ thuộc thật — `checkout`, `customer-point`) cần được refactor theo kiến trúc mới, không phải thiết kế lại từ đầu.

Mọi quyết định trong RFC này (và SPEC kế tiếp) phải ưu tiên theo đúng thứ tự:

1. Giữ dữ liệu (không mất dữ liệu, không migration phá hủy).
2. Giảm breaking change (giữ backward compatibility API khi có thể).
3. Giảm migration risk (tách nhỏ, mỗi migration một mục đích, có rollback).

## 1. Purpose

Xây dựng Customer Domain làm nguồn dữ liệu chuẩn cho khách hàng, phục vụ các nghiệp vụ:

- Bán hàng.
- Bán chịu.
- Thu công nợ.
- Trả hàng bán.
- Tra cứu lịch sử mua hàng.
- Báo cáo khách hàng.
- Báo cáo công nợ khách hàng.

Customer Domain chỉ quản lý thông tin định danh và trạng thái khách hàng.

Customer Domain không phải nguồn sự thật của công nợ.

## 2. Governing Documents

T011 phải tuân theo:

- MASTER_DATA_TEMPLATE.md
- MASTER_DECISION.md
- DEFAULT_DECISIONS.md
- PROJECT_RULES.md
- ARCHITECTURE_RULES.md
- CODING_RULES.md
- TEST_RULES.md
- REVIEW_RULES.md
- AI_WORKFLOW.md
- Các ADR hiện hành
- Quy tắc Organization Scope hiện hành
- Quy tắc Repository Boundary hiện hành

Khi RFC này xung đột với DEFAULT_DECISIONS, RFC này được ưu tiên cho Customer Domain.

## 3. Scope

T011 bao gồm:

- Customer aggregate.
- Customer repository.
- Customer domain service.
- Customer application service.
- REST API.
- DTO validation.
- Permissions.
- Audit Log.
- Archive.
- Restore.
- Optimistic Lock.
- Search.
- Filtering.
- Pagination.
- Swagger documentation.
- Unit tests.
- Integration tests.
- Architecture tests.
- Migration và rollback nếu schema cần thay đổi.
- Tài liệu module.

## 4. Out of Scope

Không thực hiện trong T011:

- Customer Group.
- Loyalty points.
- Membership tier.
- Promotion.
- Marketing automation.
- Customer segmentation nâng cao.
- CRM pipeline.
- Sales opportunity.
- Customer portal.
- Online registration.
- Cloud synchronization.
- Import Excel.
- Export Excel.
- Customer debt ledger.
- Thu công nợ.
- Customer statement.
- Credit approval workflow.
- Customer-specific price list.
- Multiple shipping addresses.
- Multiple contacts.
- Customer merge.
- Duplicate detection nâng cao.

Các nội dung công nợ sẽ được xử lý tại T017 — Debt Ledger.

## 5. Aggregate

Aggregate Root: **Customer**

Customer phải thuộc chính xác một Organization.

Customer không thuộc riêng một Branch.

Lý do:

- Một khách hàng có thể giao dịch tại nhiều Branch.
- Công nợ khách hàng phải được quản lý ở cấp Organization.
- Branch chỉ được ghi nhận tại từng chứng từ bán hàng hoặc thu nợ.

## 6. Main Fields

Customer tối thiểu gồm: `id`, `organizationId`, `code`, `name`, `phone`, `email`, `address`, `taxCode`, `contactName`, `note`, `creditLimit`, `paymentTermDays`, `status`, `version`, `createdAt`, `updatedAt`, `archivedAt`, `createdBy`, `updatedBy`.

**[CR07] Danh sách trên là "minimum required fields", KHÔNG phải danh sách đóng (exclusive).** Các field hiện có ngoài danh sách này (`customerType`, `gender`, `birthday`, `avatar`, `companyName`, `province`, `district`, `ward`...) **được GIỮ** — không xóa chỉ vì không nằm trong danh sách tối thiểu. Chỉ loại bỏ khi: không còn consumer nào, VÀ có quyết định Architect riêng. SPEC-T011-CUSTOMER-001 phải lập bảng phân loại toàn bộ field hiện tại thành 5 nhóm: CORE / OPTIONAL PROFILE / SYSTEM-MAINTAINED / DEPRECATED / OUT OF SCOPE.

**[CR02/CR03/CR04] Field hệ thống duy trì (system-maintained) — không thuộc phạm vi field "nghiệp vụ" ở trên, xử lý riêng:**

- `currentDebt`, `receivableBalance`, `debtAmount` (nếu tồn tại dưới tên khác trong schema): theo BR06 — **DEPRECATED, KHÔNG xóa trong T011**. Không tiếp tục là dữ liệu nghiệp vụ, không cho Create/Update ghi vào, không bổ sung logic mới sử dụng. Migration dữ liệu thật + xem xét xóa cột thuộc trách nhiệm T017 (Debt Ledger).
- `totalRevenue`, `totalOrder`: **được phép tiếp tục tồn tại** như projection (không phải source of truth). Nếu hiện đang cập nhật qua Domain Event/workflow tập trung — giữ nguyên cơ chế đó, không chuyển sang tính realtime, không xóa trong T011. Đánh giá lại nếu sau này có Reporting Projection riêng.
- `totalPoint`: **giữ nguyên** — đây là projection hợp lệ đồng bộ từ Customer Point Domain Event. T011 không thay đổi cơ chế này. Customer API (Create/Update) không được sửa `totalPoint` trực tiếp — chỉ Customer Point workflow được cập nhật.

### 6.1 id
UUID theo chuẩn hiện tại của dự án.

### 6.2 organizationId
Bắt buộc. Không được nhận trực tiếp từ request body. Lấy từ authenticated context. Không được thay đổi sau khi tạo.

### 6.3 code
Bắt buộc (luôn có giá trị lưu trữ — xem §7 đã sửa theo CR05). Trim khoảng trắng. Chuẩn hóa uppercase. Duy nhất trong Organization. Immutable sau khi tạo.

Unique rule: `(organizationId, code)`

### 6.4 name
Bắt buộc. Trim khoảng trắng. Không được rỗng. Độ dài theo convention hiện có. Không bắt buộc duy nhất.

### 6.5 phone — **[CR06 xác nhận lại, không đổi so với v1]**
Tùy chọn. Trim khoảng trắng. **KHÔNG unique.** Không tự suy đoán hoặc chuẩn hóa mã quốc gia phức tạp trong T011.

Lý do không unique: Gia đình hoặc doanh nghiệp có thể dùng chung số điện thoại. Không được chặn tạo khách hàng chỉ vì trùng số điện thoại.

**Thực thi cụ thể (CR06):** gỡ DB unique constraint hiện có (`@@unique([organizationId, phone])`); gỡ application-level duplicate check (`existsByPhone` không còn dùng để chặn); gỡ error code `CUSTOMER_PHONE_DUPLICATE` khỏi luồng tạo/cập nhật; `GET /customers?search=<phone>` phải trả **danh sách** (nhiều Customer), không giả định tối đa 1 kết quả.

### 6.6 email
Tùy chọn. Lowercase. Validate định dạng nếu có. Không bắt buộc duy nhất.

### 6.7 address
Tùy chọn. Một địa chỉ dạng text trong T011.

### 6.8 taxCode
Tùy chọn. Trim khoảng trắng. Không bắt buộc duy nhất trong T011.

### 6.9 contactName
Tùy chọn. Một người liên hệ chính.

### 6.10 note
Tùy chọn.

### 6.11 creditLimit
Tùy chọn. Decimal. Giá trị >= 0. Không phải số dư công nợ. Chỉ là hạn mức tham chiếu cho nghiệp vụ Sales và Debt sau này. T011 chưa thực thi Credit Limit Guard.

### 6.12 paymentTermDays
Tùy chọn. Integer. Giá trị >= 0. T011 chỉ lưu thông tin. Chưa tự tính hạn thanh toán trong T011.

### 6.13 version
Bắt buộc. Optimistic locking. Khởi tạo theo convention hiện tại của dự án.

## 7. Customer Code — **[CR05 — REVISED]**

~~T011 không tự động sinh mã khách hàng. Client phải cung cấp code khi tạo Customer.~~ **Phương án này bị bác bỏ ở Architect Resolution (Decision CR05).**

**Quyết định mới:** Customer code là **OPTIONAL INPUT, MANDATORY STORED VALUE**.

- Nếu client truyền `code` khi tạo: validate format (trim, uppercase) + kiểm tra unique trong Organization.
- Nếu client không truyền `code`: hệ thống tự sinh (giữ generator hiện có `SequenceCustomerCodeGenerator`, định dạng `CUS000001` — không viết generator mới).
- Code luôn có giá trị lưu trữ (không bao giờ null) — immutable sau khi tạo (không đổi bằng cả 2 đường: client sửa lại, hoặc hệ thống tự sinh lại).

**Điều kiện giữ generator hiện có (phải Audit trước khi quyết định giữ nguyên hay sửa ở SPEC):** organization scope (generator đã đúng phạm vi tổ chức — dùng bảng `Sequence` theo `organizationId`), concurrency safety (upsert atomic, đã đúng), tương tác với Optimistic Lock (generator không liên quan `version`, không xung đột). Nếu đạt yêu cầu ở cả 3 điểm — tiếp tục dùng, không viết generator mới.

Mã đề xuất cho người dùng khi hệ thống tự sinh: `CUS000001`, `CUS000002`... (giữ định dạng hiện có, không đổi sang `KH000001` — đây chỉ là UX convention, không phải business rule bắt buộc).

## 8. Lifecycle

CustomerStatus: `ACTIVE`, `INACTIVE`, `ARCHIVED`.

Allowed transitions:

```
ACTIVE → INACTIVE
INACTIVE → ACTIVE
ACTIVE → ARCHIVED
INACTIVE → ARCHIVED
ARCHIVED → INACTIVE
```

Restore luôn đưa Customer về INACTIVE. Không restore trực tiếp về ACTIVE.

Hard delete không được phép.

## 9. Business Rules

**BR01 — Organization Scope.** Mọi read/write phải giới hạn theo organizationId. Không được truy cập Customer của Organization khác.

**BR02 — Unique Code.** Customer code phải duy nhất trong Organization (áp dụng cho cả code client cung cấp lẫn code hệ thống tự sinh — xem §7 đã sửa theo CR05). Application validation phải sử dụng repository check. Database unique constraint vẫn là tuyến phòng thủ cuối cùng.

**BR03 — Immutable Fields.** Sau khi tạo, không được thay đổi: `id`, `organizationId`, `code`, `createdAt`, `createdBy`.

**BR04 — Archived Customer.** Customer ARCHIVED: không được sử dụng cho giao dịch bán hàng mới; không được cập nhật thông tin thông thường; chỉ được xem chi tiết; chỉ được restore.

**BR05 — Inactive Customer.** Customer INACTIVE: không được chọn cho giao dịch bán hàng mới; vẫn được xem lịch sử; vẫn có thể được thu công nợ trong tương lai; có thể được chuyển lại ACTIVE.

**BR06 — Debt Ownership. [CR02 — bổ sung điều kiện T011 cụ thể]** Customer aggregate không lưu (như dữ liệu nghiệp vụ, writable): `currentDebt`, `receivableBalance`, `totalDebt`, `debtAmount`, `paidDebt`. Nguồn sự thật công nợ thuộc Debt Ledger tại T017. Customer API không được tự tính hoặc cập nhật công nợ trong T011.

**Thực thi T011 (CR02):** cột `currentDebt` hiện có trong schema **không bị xóa** — đánh dấu DEPRECATED, không cho Create/Update Customer ghi vào, không bổ sung logic mới đọc/dùng. T017 (Debt Ledger) chịu trách nhiệm migration dữ liệu thật sang mô hình mới và chỉ xem xét xóa cột sau khi migration đó hoàn tất. T011 tuyệt đối không tạo migration phá dữ liệu cho các cột này.

**BR07 — Archive Guard.** Trong T011, CustomerDomainService phải cung cấp khả năng thực hiện Archive Guard qua các dependency abstraction phù hợp. Customer không được archive nếu: có Sales Invoice ở trạng thái chưa kết thúc; có công nợ khác 0.

Tuy nhiên tại thời điểm T011: Sales Foundation chưa hoàn thành; Debt Ledger chưa hoàn thành. Do đó T011 phải thiết kế Archive Guard theo hướng mở rộng, nhưng không được tạo dependency giả hoặc circular dependency.

Quyết định triển khai T011: Archive được phép khi Customer chưa có module phụ thuộc thực tế. CustomerDomainService phải có API phù hợp để bổ sung guard sau này. T013 và T017 có trách nhiệm tích hợp bổ sung Archive Guard. Không hard-code giả dữ liệu Sales hoặc Debt. Không tạo placeholder repository không có consumer thật.

**BR08 — Historical References.** Archive Customer không được làm mất hoặc thay đổi lịch sử chứng từ. Các hóa đơn sau này phải lưu snapshot thông tin cần thiết.

**BR09 — Optimistic Lock.** Các thao tác sau phải kiểm tra version: Update, Activate, Deactivate, Archive, Restore. Version mismatch phải trả lỗi conflict theo convention hiện hành.

**BR10 — Audit.** Các hành động sau phải có Audit Log: Create, Update, Activate, Deactivate, Archive, Restore. Audit Log không được ghi password, token hoặc dữ liệu nhạy cảm không cần thiết.

**BR11 — System-maintained Projections. [CR03/CR04 — mới]** `totalRevenue`, `totalOrder`, `totalPoint` là projection do hệ thống duy trì, không phải trường nghiệp vụ do Customer CRUD sở hữu. Create/Update Customer DTO không được nhận các field này làm input. Chỉ workflow nguồn (Order/Sales cho `totalRevenue`/`totalOrder`, Customer Point cho `totalPoint`) được phép cập nhật, đúng cơ chế Domain Event đã có (`ADR-0009`).

## 10. Domain Service — **[CR08/CR09 — REVISED, từ khuyến nghị "phải cung cấp" thành yêu cầu bắt buộc cụ thể]**

**Đây là Technical Debt đã xác nhận (Architecture Review §A4):** `checkout.service.ts` và `customer-point.service.ts` hiện đang inject trực tiếp `CUSTOMER_REPOSITORY` — vi phạm Repository Boundary (ADR-0010). T011 **bắt buộc** phải xử lý việc này (không phải tùy chọn "nếu cần").

CustomerDomainService phải cung cấp API tối thiểu cho các module sau: Sales validation, Sales Return validation, Debt validation, Reporting reference, Archive Guard integration.

**API domain tối thiểu (CR09 — bổ sung `findById()`):**

- `findById(organizationId, customerId)`
- `findActiveById(organizationId, customerId)`
- `findUsableForSale(organizationId, customerId)`
- `existsByCode(organizationId, code, excludeId?)`
- `assertBelongsToOrganization(organizationId, customerId)`
- `assertNotArchived(organizationId, customerId)`

Tên method cụ thể có thể điều chỉnh theo convention hiện tại, nhưng trách nhiệm không được thay đổi.

CustomerDomainService là public domain API. Repository token (`CUSTOMER_REPOSITORY`) không được export cho module nghiệp vụ khác — **phải gỡ khỏi `CustomerModule.exports` trong T011**.

`checkout` và `customer-point` phải chuyển từ inject `CUSTOMER_REPOSITORY` sang inject `CustomerDomainService`.

Không dùng `forwardRef()`. Nếu phát sinh circular dependency, áp dụng đúng pattern Reference Module/Persistence Module đã được phê duyệt tại Barcode (T009, Decision RPC01-RPC12) — tên contract cuối cùng (`CustomerDomainService` hay tên khác) chốt ở SPEC.

## 11. Repository

Repository phải hỗ trợ tối thiểu: `create`, `findById`, `findByCode`, `existsByCode`, `updateWithVersion`, `changeStatusWithVersion`, `search`, `count`.

Repository query bắt buộc có organizationId. Không method nào được tìm Customer chỉ bằng id mà thiếu organizationId.

Repository không được export ra ngoài Customer infrastructure boundary, trừ khi có quyết định kiến trúc riêng.

## 12. Search and Filter

Search hỗ trợ các trường: `code`, `name`, `phone`, `email`, `taxCode`, `contactName`.

Filter hỗ trợ: `status`, `createdAt` range nếu convention hiện tại đã hỗ trợ, `includeArchived` theo quyền và convention hiện tại.

Default behavior: không trả Customer ARCHIVED trong danh sách mặc định; default sort `name ASC`, sau đó `createdAt DESC` hoặc theo query convention hiện hành; pagination theo chuẩn chung của dự án.

Search phải scoped theo organizationId. **[CR06]** Search theo `phone` phải trả về danh sách (0, 1, hoặc nhiều Customer) — không giả định tối đa 1 kết quả.

## 13. API

Route chuẩn: `/customers`

API tối thiểu:

```
POST   /customers
GET    /customers
GET    /customers/:id
PATCH  /customers/:id
POST   /customers/:id/activate
POST   /customers/:id/deactivate
DELETE /customers/:id
POST   /customers/:id/restore
```

DELETE mang nghĩa Archive, không hard delete.

Request update/status/archive/restore phải nhận version theo convention hiện hành.

API phải: validate DTO; lấy organizationId từ auth context; áp dụng permission guard; có Swagger; trả error code ổn định; không expose Prisma model trực tiếp.

## 14. Permissions — **[CR10 — REVISED]**

~~Permissions tối thiểu: `customer.create`, `customer.read`, `customer.update`, `customer.activate`, `customer.deactivate`, `customer.archive`, `customer.restore`.~~ **Naming dấu chấm bị bác bỏ ở Architect Resolution (Decision CR10) — giữ đúng convention toàn dự án (dấu hai chấm), không tạo 2 convention song song.**

**Permissions tối thiểu (đã sửa theo convention `crud()` hiện có — `permission-catalog.ts`):**

```
customer:view
customer:create
customer:update
customer:activate
customer:deactivate
customer:archive
customer:restore
```

`customer:view` áp dụng cho: List, Detail, Search (giữ tên `view` hiện có thay vì `read` — đúng convention toàn dự án, xem `crud()` helper dùng cho 15+ module khác).

Không tạo permission công nợ trong T011.

## 15. Error Cases

T011 phải có lỗi rõ ràng cho: Customer not found; Duplicate customer code; Customer archived; Customer inactive khi được yêu cầu dùng cho bán hàng; Version conflict; Invalid lifecycle transition; Cross-organization access; Invalid credit limit; Invalid payment term days.

Error codes phải tuân theo catalog và convention hiện hành. Claude Code không được tự tạo error naming khác hệ thống nếu đã có convention.

**[CR06]** Bỏ error case "Duplicate customer phone" khỏi luồng tạo/cập nhật (không còn unique) — `CUSTOMER_PHONE_DUPLICATE` (error code đã tồn tại) không còn được ném ra ở luồng Create/Update, có thể giữ định nghĩa error code (không xóa khỏi catalog) nhưng ngừng dùng.

## 16. Migration — **[CR11 — REVISED, tách rõ 3 migration]**

Claude Code phải Audit schema hiện tại trước khi tạo migration (đã thực hiện ở Architecture Review, xem `docs/architecture/T011-architecture-review.md`).

Nếu Customer model đã tồn tại: không tạo model trùng; phải thực hiện dependency audit; phải xác định consumer hiện tại; phải lập migration tương thích; không làm mất dữ liệu.

**Migration phải tách theo đúng 3 nhóm (Decision CR11), không gộp:**

- **Migration A — Phone unique removal.** Gỡ `@@unique([organizationId, phone])`. Không migration dữ liệu nguy hiểm — chỉ bỏ constraint.
- **Migration B — Customer code adjustment (nếu cần).** Chỉ thực hiện nếu Audit generator ở §7 phát hiện cần điều chỉnh schema (ví dụ thêm cột hỗ trợ, hoặc không cần gì nếu generator hiện tại đã đạt yêu cầu — xác nhận cụ thể ở SPEC).
- **Migration C — Projection cleanup (chỉ khi thực sự cần).** Không thực hiện trong T011 trừ khi SPEC xác định có nhu cầu cụ thể (ví dụ thêm cột `version`, đổi status model — các thay đổi bổ sung khác ngoài phone/code phải có migration riêng, không gộp vào A hoặc B).

Mỗi migration phải có rollback script riêng. Không gộp cleanup nguy hiểm với schema addition nếu có thể tránh.

Không chạy migration production trong T011 nếu môi trường chưa sẵn sàng.

## 17. Test Requirements

Bắt buộc kiểm thử:

1. Create Customer thành công (có code từ client).
2. Create Customer thành công (không có code — hệ thống tự sinh). **[CR05 — mới]**
3. Duplicate code trong cùng Organization thất bại (áp dụng cả 2 trường hợp code client cung cấp và tự sinh).
4. Cùng code ở Organization khác được phép.
5. Update Customer thành công.
6. Không sửa được code.
7. Activate Customer.
8. Deactivate Customer.
9. Archive từ ACTIVE.
10. Archive từ INACTIVE.
11. Restore về INACTIVE.
12. Archived Customer không update được.
13. Inactive Customer không dùng được cho sale validation.
14. Active Customer dùng được cho sale validation.
15. Version conflict khi update.
16. Version conflict khi archive.
17. Version conflict khi restore.
18. Search theo code.
19. Search theo name.
20. Search theo phone — **trả về danh sách, kể cả khi nhiều Customer trùng phone.** **[CR06 — sửa]**
21. Tạo 2 Customer cùng phone trong cùng Organization — **phải thành công** (không còn bị chặn). **[CR06 — mới]**
22. Search không lộ dữ liệu Organization khác.
23. List mặc định không trả ARCHIVED.
24. Repository boundary test — xác nhận `checkout`/`customer-point` không còn inject `CUSTOMER_REPOSITORY` trực tiếp. **[CR08 — sửa rõ]**
25. Không export repository token (`CustomerModule.exports` không chứa `CUSTOMER_REPOSITORY`).
26. Không dùng forwardRef().
27. Audit Log được tạo cho lifecycle actions.
28. Response DTO tiếp tục trả `totalPoint`/`customerType`/`gender`/`birthday` và các field hiện có khác — không bị xóa khỏi response. **[CR12 — mới]**
29. `currentDebt`/`totalRevenue`/`totalOrder` không nhận input từ Create/Update DTO (bị bỏ qua nếu client gửi lên). **[CR02/CR03/CR11 — mới]**
30. Build PASS.
31. Typecheck PASS.
32. Lint PASS.
33. Full regression PASS.

Không cần load test quy mô lớn.

## 18. Documentation

T011 phải cập nhật tối thiểu: Module documentation; Permission catalog; Error catalog nếu có lỗi mới; API documentation; PROJECT_STATUS.md; SPRINT_DASHBOARD.md; Release notes; Dependency graph nếu có thay đổi kiến trúc.

Không được xóa lịch sử roadmap cũ.

## 19. Backward Compatibility — **[CR12 — mới]**

T011 phải ưu tiên Backward Compatibility hơn "làm sạch" API.

Nếu API hiện tại (`GET/POST/PATCH /customers`) đã trả về các field: `totalPoint`, `customerType`, `gender`, `birthday` (và field khác đang có trong `CustomerResponseDto` hiện tại) — **tiếp tục trả về**, không xóa khỏi response trong T011.

Không xóa response field trong T011 chỉ vì field đó không nằm trong danh sách "minimum required" ở §6 (xem CR07).

## 20. Implementation Priority — **[CR13 — mới]**

Khi vào Implementation Plan (sau SPEC), thứ tự ưu tiên bắt buộc:

1. Repository Boundary (gỡ `CUSTOMER_REPOSITORY` khỏi export, tạo `CustomerDomainService`, chuyển `checkout`/`customer-point` sang dùng domain service).
2. Phone unique removal (Migration A + gỡ application check + error code).
3. Customer code (audit generator, điều chỉnh nếu cần — Migration B nếu có).
4. Projection cleanup (chỉ nếu SPEC xác định cần — Migration C).
5. Documentation.

## 21. Open Questions

Không có Open Question bắt buộc trước Architecture Review.

Claude Code phải Audit repository và chỉ nêu câu hỏi khi phát hiện:

- Customer model đã tồn tại và xung đột với RFC.
- Customer đang được module khác sử dụng.
- Route hoặc permission naming đã tồn tại khác convention.
- Schema hiện tại lưu debt trực tiếp trong Customer.
- Có repository export hoặc circular dependency.
- Có business rule hiện tại mâu thuẫn RFC.
- Migration có nguy cơ mất dữ liệu.
- Có public API hiện tại gây breaking change.

Claude Code không được tự quyết định các xung đột trên.

*(Toàn bộ 8 điều kiện trên đã thực sự xảy ra ở Architecture Review — xem `docs/architecture/T011-architecture-review.md` mục A/C — và đã được giải quyết qua Decision AR-T011-01~08 rồi CR01-CR13 ở trên. Không còn Open Question nào chưa giải quyết tính tới thời điểm RFC v2 này.)*

## 22. Authorization — **[cập nhật theo `ARCHITECT RESOLUTION — RFC-T011 CUSTOMER DOMAIN`, thay thế Authorization ở bản v1]**

RFC-T011: **APPROVED WITH DECISIONS.**

Claude Code được phép:

1. Cập nhật RFC theo Decision CR01-CR13 (đã thực hiện — chính là bản v2 này).
2. Viết **SPEC-T011-CUSTOMER-001**.

Claude Code không được:

- Sửa source code.
- Migration.
- Commit.
- Push.
- Tag.

Sau khi SPEC hoàn thành: dừng và chờ Architecture Review (của SPEC).

---

## Lịch sử quyết định

1. **RFC-T011 v1 (PROPOSED)** — Architect soạn trực tiếp (Short RFC), giao Claude Code làm Architecture Review only.
2. **`ARCHITECTURE REVIEW — RFC-T011 Customer Domain`** (Claude Code, `docs/architecture/T011-architecture-review.md` mục A-E) — phát hiện 5 conflict cụ thể (A1-A5) + 3 ambiguity (C1-C3), xác nhận Customer là domain đang hoạt động thật, không phải scaffold — đúng 7/8 điều kiện dừng RFC §19 (bản v1) đã xảy ra thật.
3. **`ARCHITECT RESOLUTION — RFC-T011 CUSTOMER DOMAIN`** lần 1 (Decision AR-T011-01 đến 08) — kết quả **RFC REVISION REQUIRED**, Implementation authorization NOT GRANTED, yêu cầu Architect tự sửa RFC (giữ ranh giới RFC-authorship).
4. **`ARCHITECT RESOLUTION — RFC-T011 CUSTOMER DOMAIN`** lần 2 (Decision CR01-CR13) — kết quả **APPROVED WITH DECISIONS**, AUTHORIZATION tường minh cho Claude Code: (a) cập nhật RFC theo đúng CR01-13, (b) viết SPEC-T011-CUSTOMER-001. Đây là ngoại lệ tường minh, theo đúng yêu cầu cụ thể của Architect cho riêng bước cập nhật RFC này — không phải Claude Code tự ý soạn nội dung RFC mới.
5. **RFC-T011 v2 (bản này)** — Claude Code áp dụng CR01-CR13 vào bản v1, giữ nguyên toàn bộ phần không bị Decision nào chạm tới, đánh dấu rõ **[CRxx]** ở từng mục thay đổi, không xóa nội dung gốc (giữ bằng gạch ngang ở §7/§14 để lưu lịch sử quyết định bị bác bỏ).
