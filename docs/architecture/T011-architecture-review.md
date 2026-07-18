# ARCHITECTURE REVIEW — RFC-T011 Customer Domain

Theo `RFC-T011 — Customer Domain` (`docs/rfc/RFC-T011-customer-domain.md`) §20 AUTHORIZATION. Phạm vi đúng như yêu cầu: audit code/schema/test/permission/API/dependency hiện có, đối chiếu với RFC, liệt kê conflict/ambiguity/dependency impact/migration risk. **Không viết SPEC, không Implementation Plan, không sửa source code, không migration, không commit.** Toàn bộ bằng chứng lấy trực tiếp từ code hiện tại (branch `main`, sau tag `v0.6.0-barcode-foundation`), có `file:line`.

**Kết luận ngắn gọn:** Customer **không phải scaffold trống** như Brand/Unit/Barcode lúc bắt đầu RFC — đây là module đã có triển khai khá đầy đủ (20 file, có test) từ Sprint-00, với ít nhất 2 module khác (`checkout`, `customer-point`) đang phụ thuộc thật vào nó. RFC-T011 tự nhận diện đúng khả năng này ở §19 (liệt kê 8 điều kiện cần dừng lại hỏi) — **7 trong 8 điều kiện đó đã xảy ra thật**, không phải giả định. Dưới đây là toàn bộ.

---

## A. CONFLICT — RFC-T011 mâu thuẫn trực tiếp với code/schema hiện tại

### A1. Customer lưu debt trực tiếp trong schema (đúng điều kiện dừng §19 dòng 4)

`backend/prisma/schema.prisma:1736` — `currentDebt Decimal @default(0) @db.Decimal(18, 2)` — comment dòng 1735: *"Do hệ thống duy trì (Customer Debt — Prompt tương lai), không cho client sửa trực tiếp."*

Mâu thuẫn trực tiếp với RFC §9 BR06: *"Customer aggregate không lưu: currentDebt, receivableBalance, totalDebt, debtAmount, paidDebt."*

Cột đã tồn tại, có default `0`, chưa có consumer ghi thật (không tìm thấy `currentDebt` được set ở bất kỳ Service nào ngoài default) — an toàn về mặt dữ liệu nếu bỏ, nhưng **giữ hay xóa cột là quyết định kiến trúc**, không tự quyết.

### A2. `phone` hiện có UNIQUE constraint theo Organization (đúng điều kiện dừng §19 dòng 6)

`backend/prisma/schema.prisma:1757` — `@@unique([organizationId, phone])`. `backend/src/modules/customer/domain/repositories/customer.repository.interface.ts:70-74` — `existsByPhone(organizationId, phone, excludeId?)` — repository method thật, có dùng. `backend/src/common/errors/error-codes.ts:162` — `CUSTOMER_PHONE_DUPLICATE: 'CUSTOMER_003'` — error code riêng cho trường hợp này.

Mâu thuẫn trực tiếp với RFC §6.5: *"phone... Không bắt buộc duy nhất... Không được chặn tạo khách hàng chỉ vì trùng số điện thoại."*

Đây là hành vi nghiệp vụ **đang hoạt động thật** (constraint DB + check tầng Application + error code riêng) — bỏ nó là thay đổi hành vi có chủ đích, cần xác nhận rõ (không phải chỉ xóa 1 dòng migration).

### A3. Code khách hàng hiện được hệ thống tự sinh, không nhận từ client (đúng điều kiện dừng §19 dòng 1)

- `backend/src/modules/customer/infrastructure/generators/sequence-customer-code.generator.ts:1-28` — `SequenceCustomerCodeGenerator`, sinh mã `CUS000001` nguyên tử qua bảng `Sequence` (cùng cơ chế `SequenceSkuGenerator`), có test riêng (`sequence-customer-code.generator.spec.ts`).
- `backend/src/modules/customer/application/customer.service.ts:55` — `const code = await this.codeGenerator.generate(actor.organizationId);` — gọi generator, **bỏ qua hoàn toàn** input từ client.
- `backend/src/modules/customer/application/dto/create-customer.dto.ts` — không có field `code` nào cả — API hiện tại **không có chỗ để client gửi code lên**.
- `backend/src/modules/customer/presentation/customer.controller.ts:51` — Swagger summary: `'Tạo khách hàng (mã tự sinh CUSxxxxxx)'`.

Mâu thuẫn trực tiếp với RFC §7: *"T011 không tự động sinh mã khách hàng. Client phải cung cấp code khi tạo Customer."*

Đây là hạ tầng thật, có test, đang chạy đúng thiết kế ban đầu của nó — chuyển sang mô hình RFC là **đổi hành vi API** (breaking change cho `POST /customers`), không phải thêm field.

### A4. Repository token đang được export và inject trực tiếp bởi 2 module khác (đúng điều kiện dừng §19 dòng 5)

`backend/src/modules/customer/customer.module.ts:26` — `exports: [CUSTOMER_REPOSITORY]`.

2 nơi tiêu thụ trực tiếp (không qua Domain Service — **hiện tại chưa có `CustomerDomainService` nào tồn tại**):

- `backend/src/modules/checkout/application/checkout.service.ts:17-18,77-78,106-114` — inject `CUSTOMER_REPOSITORY`, gọi đúng 1 method `findById(dto.customerId, actor.organizationId)` để xác nhận `customerId` optional trên đơn checkout tồn tại và cùng tổ chức — **read-only, logic đơn giản**.
- `backend/src/modules/customer-point/application/customer-point.service.ts:11-12,44-45,167` — inject `CUSTOMER_REPOSITORY`, cũng chỉ gọi `findById()` — **read-only, logic đơn giản**.

Mâu thuẫn trực tiếp với RFC §10 (*"Repository token không được export cho module nghiệp vụ khác"*), §11 (*"Repository không được export ra ngoài Customer infrastructure boundary"*), và ADR-0010 (Repository Boundary).

**Đánh giá mức độ khó:** thấp — cả 2 consumer chỉ dùng đúng 1 method (`findById`, read-only), không có ghi, không có logic phức tạp đan xen. Đây **không phải circular dependency kiểu Barcode↔Unit** (T009) — chỉ là hướng phụ thuộc một chiều (`checkout`/`customer-point` → `customer`) đang cài sai cách (raw repository thay vì domain service). RFC §10 đã tự đề xuất đúng 2 method thay thế phù hợp (`findActiveById`/`assertBelongsToOrganization`). Rủi ro chính không nằm ở độ phức tạp kỹ thuật, mà ở việc **phải sửa file thuộc 2 module khác chưa qua Audit/RFC chính thức** (`checkout`, `customer-point` — vẫn là "scaffold Sprint-00" theo `SPRINT_DASHBOARD.md`) — đây là Dependency Impact thật, không tự quyết phạm vi sửa module ngoài.

### A5. Permission naming: RFC dùng dấu chấm, toàn dự án dùng dấu hai chấm (đúng điều kiện dừng §19 dòng 3)

`backend/src/modules/rbac/infrastructure/permission-catalog.ts:155` — `...crud('customer', 'khách hàng', ['restore'])` — hàm `crud()` (dùng chung bởi **15+ module khác**: product, category, brand, unit, barcode, warehouse, purchase, supplier, customer, user, role, branch...) sinh ra `customer:view`, `customer:create`, `customer:update`, `customer:delete`, `customer:restore` — **dấu hai chấm**, không có ngoại lệ nào trong toàn bộ catalog dùng dấu chấm.

`backend/src/modules/customer/presentation/customer.controller.ts:50,63,77,88,102,115` — `@RequirePermissions('customer:create')` v.v. — khớp catalog.

RFC §14 đề xuất `customer.create`, `customer.read`, `customer.update`, `customer.activate`, `customer.deactivate`, `customer.archive`, `customer.restore` — **dấu chấm**, và có 2 permission mới hoàn toàn không tồn tại (`activate`, `deactivate` — hiện chỉ có `update` chung, không tách quyền theo hành động lifecycle).

RFC §14 tự cho phép: *"Có thể dùng naming convention hiện tại nếu khác, nhưng phải giữ mức phân quyền tương đương"* — nghĩa là điểm này **RFC đã tự giải quyết trước**, không phải xung đột cần dừng lại — chỉ nêu ở đây để xác nhận rõ: sẽ dùng `customer:activate`/`customer:deactivate`/`customer:archive` (đổi tên từ `delete`) theo đúng convention `crud()` hiện tại, không theo literal RFC.

---

## B. STRUCTURAL GAP — RFC-T011 dự liệu đúng nhưng cần làm rõ quy mô thật

### B1. Không có Optimistic Lock — không có `version` ở bất kỳ đâu

Không tìm thấy `version` trong `schema.prisma` (model `Customer`), `customer.entity.ts`, `customer.repository.interface.ts`, `create-customer.dto.ts`, `update-customer.dto.ts`. Đúng như RFC §16 dự liệu ("Audit schema hiện tại trước khi tạo migration") — cần 1 migration thêm `version INTEGER NOT NULL DEFAULT 1`, đúng mẫu Unit/Brand/Barcode.

### B2. Status model hiện tại KHÔNG phải 3 giá trị, và tách rời khỏi soft-delete

- `backend/prisma/schema.prisma:1742` — `status CommonStatus @default(ACTIVE)` — `CommonStatus` (`schema.prisma:46-49`) chỉ có `ACTIVE`/`INACTIVE`, **dùng chung bởi 5 model khác** (không phải riêng Customer) — không thể sửa trực tiếp `CommonStatus`, cần enum `CustomerStatus` riêng (đúng mẫu Unit/Brand/Barcode).
- `backend/src/modules/customer/infrastructure/persistence/prisma-customer.repository.ts:107-119` — `softDelete()` **chỉ set `deletedAt`**, không đụng `status`; `restore()` **chỉ set `deletedAt: null`**, cũng không đụng `status`. Nghĩa là hiện tại "archived" = `deletedAt != null`, hoàn toàn tách biệt khỏi field `status` (vốn chỉ biểu diễn ACTIVE/INACTIVE nghiệp vụ thông thường).

RFC §8 muốn 1 field `status` duy nhất mang cả 3 trạng thái (kể cả ARCHIVED) — đây là **tái cấu trúc thật sự cách biểu diễn trạng thái**, không chỉ "thêm 1 giá trị enum". Cùng dạng đã làm ở Unit/Brand/Barcode, nhưng cần xác nhận rõ vì Customer đang có nhiều bảng khác giữ FK tới `customers.id` (xem B4) — may mắn là các FK đó chỉ tham chiếu `id`, không phụ thuộc cách biểu diễn status/deletedAt nội bộ, nên rủi ro lan tỏa thấp.

### B3. Ghi (`update`/`softDelete`/`restore`) hiện KHÔNG lọc `organizationId` ở tầng Prisma — đúng lỗ hổng đã tìm thấy ở Brand/Unit/Barcode

`backend/src/modules/customer/infrastructure/persistence/prisma-customer.repository.ts:78-79` (`update`), `:108-109` (`softDelete`), `:115-116` (`restore`) — cả 3 đều `where: { id }`, **không có `organizationId`** trong where clause thật (dù interface `restore(id, restoredBy)`/`softDelete(id, deletedBy)` cũng không nhận `organizationId` làm tham số — lỗ hổng ở cả interface lẫn implementation).

Rủi ro bị giảm nhẹ vì Service luôn gọi `findById(id, organizationId)` trước để xác nhận tồn tại trong đúng tổ chức (`customer.service.ts:127-131,175-179,202-206`) — nhưng đây là pattern "check-rồi-act" ở tầng Application, không phải chặn cứng ở tầng Repository/DB như BR01 yêu cầu ("Mọi read/write phải giới hạn theo organizationId"). Đúng systemic gap đã sửa ở T007/T008/T009 — dự kiến sửa tương tự (thêm `organizationId` vào chữ ký cả 3 method).

### B4. Customer đã có 5 quan hệ FK schema-level, nhưng chỉ 2 có code Service thật đọc tới

`backend/prisma/schema.prisma:1750-1754` — `orders Order[]`, `debts Debt[]`, `pointLedgers CustomerPointLedger[]`, `payments Payment[]`, `invoices Invoice[]`.

- `Order`/`Debt`: có model Prisma, **không có NestJS module tương ứng** (`ls backend/src/modules` không có `order`/`debt`) — thuần schema scaffold Sprint-00, chưa có code nghiệp vụ nào đọc/ghi qua các quan hệ này. Khớp đúng giả định RFC §9 BR07 ("Sales Foundation chưa hoàn thành, Debt Ledger chưa hoàn thành").
- `Payment`/`Invoice`: **có** module NestJS thật (`backend/src/modules/payment/`, `backend/src/modules/invoice/`) nhưng đã xác nhận (grep toàn bộ `CUSTOMER_REPOSITORY|CustomerService|ICustomerRepository`) **không có file nào trong 2 module này** gọi tới Customer Service/Repository — chỉ có quan hệ FK khai báo ở schema, chưa có code nghiệp vụ dùng tới.
- `CustomerPointLedger`: xem mục C1 — đây là quan hệ **đang thật sự hoạt động** hai chiều (khác 4 quan hệ còn lại).

Không phải conflict — chỉ để xác nhận rõ phạm vi ảnh hưởng thật sự nhỏ hơn số lượng quan hệ FK gợi ý (chỉ 1/5 quan hệ có code thật đang chạy).

### B5. Gap thuần bổ sung (không mơ hồ, không cần hỏi)

- Không có `existsByCode()` (chỉ có `existsByPhone()`) — cần thêm.
- Không có method/route/permission Activate/Deactivate riêng — hiện dùng chung `PATCH` + field `status`.
- Không có `CustomerDomainService` — cần tạo mới hoàn toàn (đúng RFC §10).
- Default sort hiện tại `createdAt desc` (`customer.service.ts:248`) — RFC muốn `name ASC` rồi `createdAt DESC` — field thật tên `fullName`, không phải `name` (naming khác do lịch sử, không phải field mới).

---

## C. AMBIGUITY — cần Architect quyết định, Claude Code không tự chọn

### C1. `totalPoint` đang được đồng bộ thật bởi 1 module khác qua Domain Event — RFC không nhắc field này (đúng điều kiện dừng §19 dòng 2)

- `backend/prisma/schema.prisma:1741` — `totalPoint Int @default(0)`.
- `backend/src/modules/customer/application/subscribers/customer-point.subscriber.ts:1-50` — `CustomerPointSubscriber`, lắng nghe `POINT_ADDED_EVENT`/`POINT_USED_EVENT`/`POINT_EXPIRED_EVENT` từ module `customer-point` (`@OnEvent(...)`, dùng `@nestjs/event-emitter`), gọi `customerRepository.syncTotalPoint(customerId, balance)` — cơ chế **"module trao đổi qua Domain Event, không gọi chéo Service"** đã có từ Prompt 031, đúng chuẩn `ADR-0009-domain-events.md` (publish sau khi transaction commit — không phải publish trong transaction).
- Đây là pattern **khác hẳn** no-op event hook (`onXxxCreated() { void x; }`) đã dùng ở Brand/Unit/Barcode — Customer đã có publish/subscribe thật, đang chạy.

RFC §4 liệt kê "Loyalty points" là Out of Scope, nhưng **không nói rõ** nghĩa là: (a) giữ nguyên cơ chế đồng bộ `totalPoint` đang hoạt động, chỉ không xây thêm tính năng loyalty mới; hay (b) bỏ hẳn field/subscriber này khỏi Customer Domain (đẩy việc đọc điểm sang gọi trực tiếp module `customer-point` khi cần). RFC §6 (danh sách field "tối thiểu") cũng không liệt kê `totalPoint`.

**Câu hỏi cần Architect trả lời:** giữ nguyên `totalPoint` + `CustomerPointSubscriber` như hiện tại (không đụng), hay xử lý khác?

### C2. Các field hiện có nhưng không nằm trong danh sách "tối thiểu" của RFC §6

`customerType` (RETAIL/WHOLESALE/VIP/DEALER/COMPANY), `gender`, `birthday`, `companyName`, `province`, `district`, `ward`, `avatar`, `totalRevenue`, `totalOrder` — đều là field thật, có DTO validation, có trong response — nhưng RFC §6 không nhắc tới field nào trong nhóm này.

RFC dùng chữ "tối thiểu" (minimum) cho danh sách field — có thể hiểu là "giữ nguyên field thừa, chỉ đảm bảo đủ nhóm tối thiểu", hoặc "định nghĩa lại Customer chỉ theo đúng danh sách này, field khác cân nhắc bỏ". Ảnh hưởng trực tiếp tới việc DTO/API có breaking change lớn hay nhỏ.

**Câu hỏi cần Architect trả lời:** giữ nguyên toàn bộ field hiện có (RFC chỉ bổ sung field còn thiếu: `contactName`, `paymentTermDays`, `version`), hay cắt bớt theo đúng danh sách RFC §6?

### C3. `currentDebt`/`totalRevenue`/`totalOrder` — giữ cột schema hay xóa hẳn?

Liên quan A1 — RFC BR06 nói rõ Customer **application/domain logic** không được tự tính/cập nhật debt, nhưng không nói rõ có xóa **cột schema** `currentDebt` hay không (cũng chưa nhắc `totalRevenue`/`totalOrder` — 2 cột không liên quan debt nhưng cũng là "hệ thống tự tính" tương tự, thuộc phạm vi Order/Sales chưa xây).

**Câu hỏi cần Architect trả lời:** xóa hẳn 3 cột này trong migration T011 (vì hiện chưa có consumer ghi thật, an toàn dữ liệu), hay giữ lại schema (không dùng ở tầng API) chờ T013/T017 định nghĩa lại?

---

## D. DEPENDENCY IMPACT

| Module bị chạm | Mức độ | Lý do |
|---|---|---|
| `customer` (chính) | Sâu | Toàn bộ entity/repository/service/controller/DTO cần viết lại theo RFC (status model, version, code client-supplied, domain service mới) |
| `checkout` | Nông | 1 dòng — đổi `CUSTOMER_REPOSITORY.findById()` thành gọi `CustomerDomainService` mới (`checkout.service.ts:106`) |
| `customer-point` | Nông | 1 dòng — tương tự (`customer-point.service.ts:167`), cộng: cần xác nhận C1 trước khi biết có đổi gì thêm không |
| `rbac` (permission-catalog.ts) | Nông | Đổi `crud('customer', ..., ['restore'])` thành thêm `activate`/`deactivate`, đổi ý nghĩa `delete` → archive semantics rõ hơn (đã vậy từ trước) |
| `order`/`debt` | Không | Chưa có module NestJS — không có code nào bị chạm |
| `payment`/`invoice` | Không | Có module nhưng chưa có code nào gọi Customer Service/Repository |

Không phát hiện circular dependency (khác tình huống Barcode↔Unit ở T009) — hướng phụ thuộc `checkout`/`customer-point` → `customer` là một chiều, đang cài sai cách (raw repository) chứ không tạo vòng lặp.

## E. MIGRATION RISK

- Thêm `version` (default 1): an toàn, đúng mẫu 3 module trước.
- Đổi status model (`CommonStatus` → `CustomerStatus` riêng, đồng bộ với `deletedAt`): an toàn về dữ liệu (backfill dựa trên `deletedAt` hiện có, đúng mẫu Barcode Migration B), nhưng là thay đổi ý nghĩa cột `status` — cần kiểm tra kỹ không có code nào khác (ngoài `customer` module) đọc trực tiếp cột `status` của bảng `customers` qua Prisma raw hoặc report thô (chưa tìm thấy, nhưng chưa audit riêng phần `purchase-report`/dashboard nếu có).
- Bỏ `@@unique([organizationId, phone])`: an toàn kỹ thuật (loosen constraint không mất dữ liệu), nhưng đổi hành vi nghiệp vụ đã confirm ở A2 — cần AUTHORIZATION rõ ràng trước khi đưa vào migration.
- Xóa cột `currentDebt`/`totalRevenue`/`totalOrder` (nếu được chọn ở C3): an toàn kỹ thuật (chưa có consumer ghi thật ngoài default), nhưng là hành động phá hủy (không rollback được nếu đã có dữ liệu thật nhập tay) — cần xác nhận trước khi thực hiện, không tự quyết.
- Không phát hiện rủi ro mất dữ liệu nào bắt buộc phải xảy ra để hoàn thành RFC — mọi thay đổi đều có thể migration an toàn (additive hoặc loosen-constraint), miễn là các câu hỏi ở mục C được trả lời trước khi viết SPEC.

---

## ARCHITECT RESOLUTION — RFC-T011 Customer Domain

**Review result: RFC REVISION REQUIRED. Implementation authorization: NOT GRANTED.** Source code/schema/migration/commit tiếp tục không được thay đổi. Architecture Review được xác nhận đạt yêu cầu (đúng vì đã phát hiện Customer là domain đang hoạt động thực tế, không phải scaffold thay thế trực tiếp được). RFC-T011 gốc **chưa đủ an toàn** để chuyển sang SPEC — cần chính Architect sửa lại RFC trước (đúng ranh giới RFC-authorship, không phải Claude Code tự viết lại RFC).

| # | Chủ đề | Phân loại | Quyết định |
|---|---|---|---|
| AR-T011-01 | `currentDebt` (A1) | CONFIRMED CONFLICT | Giữ nguyên BR06. Cột **DEPRECATED — RETAIN TEMPORARILY**: không xóa, không migration phá hủy, ngừng coi là writable business field, Create/Update không được ghi vào, phải audit đầy đủ mọi nơi đang đọc/ghi trước khi quyết định migration thật. |
| AR-T011-02 | `totalRevenue`/`totalOrder` (một phần C3) | RFC AMBIGUITY + MIGRATION RISK | Không xóa trong T011. **DEPRECATED — OUT OF T011 DESTRUCTIVE SCOPE**: giữ cột (backward compatibility), không expose trong Create/Update DTO, không thêm logic đồng bộ mới, audit toàn bộ reader/writer hiện tại, giữ read compatibility tạm thời nếu có consumer thật. Thay thế/xóa thuộc 1 task riêng (Reporting Projection/Customer Statistics). |
| AR-T011-03 | Phone uniqueness (A2) | CONFIRMED CONFLICT | RFC sửa theo hướng phone **không unique** trong Organization. Gỡ application-level duplicate-phone rejection + `CUSTOMER_PHONE_DUPLICATE` khỏi contract tạo/cập nhật. DB unique constraint chỉ gỡ bằng migration được duyệt **sau khi SPEC hoàn tất** (không phải ở bước này). Có thể giữ index không-unique để hỗ trợ tìm kiếm. Search theo phone phải trả **danh sách**, không giả định tối đa 1 Customer. Migration đổi hành vi nhưng không mất dữ liệu. |
| AR-T011-04 | Customer code generation (A3) | CONFIRMED CONFLICT | Bác bỏ "client luôn phải cung cấp code". Cơ chế cuối: **code optional input, mandatory persisted value** — client được nhập code; nếu không cung cấp, hệ thống tự sinh; code phải unique trong Organization; normalize trước khi check uniqueness; không đổi code tự động sau khi tạo. Generator hiện tại (`SequenceCustomerCodeGenerator`) có thể giữ nếu đáp ứng organization scope + concurrency safety + format sẽ chốt trong SPEC. |
| AR-T011-05 | Repository Boundary violation (A4) | CONFIRMED PRE-EXISTING ARCHITECTURE VIOLATION | Phải xử lý trong T011 trước khi Customer Domain được duyệt hoàn tất. `checkout.service.ts`/`customer-point.service.ts` không được inject `CUSTOMER_REPOSITORY` trực tiếp — Customer phải cung cấp 1 public application port đọc (tên cụ thể: `CustomerQueryService`/`CustomerReader`/tương đương, **chốt ở SPEC**). Consumer chỉ phụ thuộc port này, không phụ thuộc repository token. Không export `CUSTOMER_REPOSITORY` để hợp thức hóa; không tạo circular dependency; không di chuyển logic checkout/point vào Customer chỉ để né dependency. Kiến trúc bắt buộc: `consumer → Customer application port → Customer repository`. |
| AR-T011-06 | Permission naming (A5) | NO STOP ISSUE | RFC phải sửa theo đúng convention hiện có: dấu hai chấm (`customer:create`, `customer:read`, `customer:update`, `customer:archive`...). Không đưa dấu chấm vào codebase — RFC phải sửa để không tạo 2 convention song song. |
| AR-T011-07 | `totalPoint` (C1) | VALID EXISTING PROJECTION | Giữ `totalPoint`. Đây là projection/cache đọc nhanh, không phải field chỉnh sửa tự do — không nhận từ Create/Update Customer DTO; chỉ loyalty/customer-point workflow được đổi nó, qua đúng event handler/application contract đã có; Customer repository có thể persist projection này nhưng Customer CRUD không sở hữu nghiệp vụ cộng/trừ điểm. Cần xét idempotency/optimistic concurrency cho event update nếu hiện chưa có. RFC phải mô tả rõ đây là system-maintained projection. |
| AR-T011-08 | Field ngoài danh sách tối thiểu (C2) | RFC AMBIGUITY | Danh sách RFC §6 là **minimum required fields**, không phải danh sách đóng. Tạm giữ field hiện hữu có giá trị nghiệp vụ (`customerType`, `gender`, `birthday`, địa chỉ/ghi chú, metadata hợp lệ khác) — điều kiện: phải có consumer/API contract/business use rõ ràng, không vi phạm privacy/organization scope/aggregate boundary; không xóa chỉ vì không nằm trong minimum list; field hoàn toàn không dùng có thể đánh dấu deprecated nhưng xóa vật lý cần dependency audit + migration plan riêng. **SPEC phải lập bảng phân loại toàn bộ field** thành 5 nhóm: CORE / OPTIONAL PROFILE / SYSTEM-MAINTAINED / DEPRECATED / OUT OF SCOPE. |

### Phạm vi RFC-T011 sau chỉnh sửa

RFC-T011 phải được Architect sửa để xác định Customer Domain là **brownfield refactor**, không phải greenfield replacement.

**T011 bao gồm:** chuẩn hóa Customer aggregate + use case hiện có; giữ backward compatibility hợp lý; cho phép phone trùng; giữ cơ chế tự sinh code đồng thời cho phép client cung cấp code; giữ `totalPoint` như system-maintained projection; deprecated `currentDebt`/`totalRevenue`/`totalOrder` nhưng chưa xóa cột; loại bỏ repository injection từ `checkout`/`customer-point`; chuẩn hóa permission dấu hai chấm; xác định archive semantics, optimistic lock, organization scope, audit log, repository boundary.

**T011 không bao gồm:** xây Customer Debt ledger hoàn chỉnh; xây Loyalty/Point domain mới; xóa vật lý cột thống kê/công nợ cũ; refactor toàn bộ reporting; thay đổi dữ liệu lịch sử ngoài migration tối thiểu để bỏ phone unique.

### Điều kiện để chuyển sang SPEC (RFC-T011 chỉ được đánh dấu APPROVED FOR SPEC khi đủ)

1. Field classification table (CORE/OPTIONAL PROFILE/SYSTEM-MAINTAINED/DEPRECATED/OUT OF SCOPE).
2. Quy tắc code generation + code uniqueness.
3. Quy tắc phone non-unique + search cardinality (trả danh sách).
4. Ownership của `totalPoint`.
5. Deprecation plan cho `currentDebt`/`totalRevenue`/`totalOrder`.
6. Public application port thay thế direct repository injection (tên chốt ở SPEC).
7. Dependency direction của `checkout`/`customer-point` (→ port, không → repository).
8. Migration strategy cho phone unique constraint (thực hiện sau SPEC, không phải bây giờ).
9. API backward-compatibility matrix.
10. Permission matrix dùng convention dấu hai chấm.
11. Audit Log events.
12. Optimistic Lock behavior + expected error contract.

**Trạng thái hiện tại:** chờ Architect gửi bản RFC-T011 đã sửa (đúng ranh giới RFC-authorship — Claude Code không tự viết lại RFC). Không có hành động nào khác được thực hiện ở bước này.
