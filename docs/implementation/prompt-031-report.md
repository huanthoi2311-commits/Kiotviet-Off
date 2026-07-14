# Implementation Report — Prompt 031: Customer Module (CRM Foundation)

**Ngày:** 2026-07-15
**Phạm vi:** Nền tảng CRM — Customer không chỉ lưu tên/SĐT mà đủ khả năng phục vụ POS/Order/Invoice/Loyalty/Voucher/Promotion/Debt/Marketing sau này.

## 0. Bối cảnh: tái cấu trúc lộ trình Prompt

Trước Prompt này, Prompt 036 (Sales Order) được giao nhưng bị đóng băng sau khi rà soát codebase phát hiện Customer/Cart/Discount/Checkout Engine — dù được liệt kê "Đã hoàn thành" — thực ra chưa từng có module nào, chỉ có bảng DB sẵn từ migration khởi tạo. Người dùng quyết định tái cấu trúc toàn bộ lộ trình theo Dependency Graph thay vì đánh số tuyến tính, và giao lại Prompt 031-035 (Customer → Customer Point → Cart → Discount → Checkout) trước khi quay lại Order. Prompt 031 là bước đầu tiên của hướng đi mới này.

## 1. Đối chiếu schema hiện có với Prompt 031

Bảng `customers` đã tồn tại từ migration khởi tạo nhưng **chưa từng được module nào ghi dữ liệu** (xác nhận qua audit trước khi bắt đầu). Field list của Prompt 031 khác đáng kể so với schema cũ:

| Trường cũ | Xử lý |
|---|---|
| `name` | Đổi tên → `fullName` (RENAME COLUMN, giữ nguyên dữ liệu) |
| `debtAmount` | Đổi tên → `currentDebt` (RENAME COLUMN) |
| `pointBalance` | Đổi tên → `totalPoint` (RENAME COLUMN) |
| `groupId`/`group` (→ CustomerGroup) | **Bỏ** — không có trong field list của Prompt 031; CustomerGroup là 1 Prompt riêng trong tương lai (Customer Sprint). `CustomerGroup` model vẫn giữ nguyên, chỉ bỏ quan hệ trỏ tới nó — không mất bảng, dormant chờ Prompt riêng. |

Thêm mới theo đúng field list: `customerType` (enum mới `CustomerType`), `taxCode`, `companyName`, `province`/`district`/`ward` (tách từ `address`, cùng mẫu Supplier), `avatar`, `note`, `creditLimit`, `totalRevenue`, `totalOrder`. Toàn bộ cột mới đều nullable hoặc có `DEFAULT` — an toàn với dữ liệu hiện có (dù bảng đang trống).

**`currentDebt`/`totalRevenue`/`totalOrder`/`totalPoint` là trường do hệ thống duy trì** — không có trong `CreateCustomerDto`/`UpdateCustomerDto`, client không thể sửa trực tiếp. Chúng khởi tạo bằng 0 và sẽ được các module tương lai (Order — Volume 11, Customer Point Ledger — Prompt 032) cập nhật qua Domain Event, không ghi trực tiếp vào bảng `customers` từ module khác (đúng nguyên tắc "mỗi module chỉ chịu trách nhiệm cho dữ liệu của chính nó" mà Prompt 031 nêu).

## 2. Hạ tầng mới: Domain Event Publisher (dùng chung, lần đầu trong dự án)

Prompt 031 là Prompt đầu tiên yêu cầu publish Domain Event thật (`CustomerCreated`, `CustomerUpdated`, `CustomerDeleted`) — trước đây dự án chỉ có Audit Log (ghi vết), chưa có cơ chế "sự kiện" để module khác lắng nghe. Cài `@nestjs/event-emitter@^3.1.0` (tương thích NestJS v11 — bản `^2.1.1` chỉ hỗ trợ tới v10, phải dùng bản mới hơn). `npm audit` xác nhận không phát sinh lỗ hổng mới.

- **`platform/events/domain-event-publisher.service.ts`** — `DomainEventPublisher` (wrap `EventEmitter2`), đăng ký trong `PlatformModule` (đã `@Global()` sẵn) — mọi module tương lai inject trực tiếp, không cần import riêng. `EventEmitterModule.forRoot()` đăng ký 1 lần ở `AppModule`.
- **`customer/domain/events/customer.events.ts`** — tên sự kiện (`customer.created/updated/deleted`) và payload (`{customerId, organizationId, occurredAt}`) thuộc về domain Customer, không phải hạ tầng dùng chung — chỉ cơ chế publish (`DomainEventPublisher`) là platform-level, đúng ranh giới DDD.
- **Chưa có Subscriber nào lắng nghe** (chưa có module nào cần phản ứng với sự kiện Customer ở Prompt này) — đây là hạ tầng nền cho Prompt 032 trở đi, đúng tinh thần "thiết lập trước, dùng sau" mà kiến trúc Event Bus của người dùng yêu cầu.

## 3. Quyết định thiết kế khác

1. **Mã khách hàng tự sinh `CUSxxxxxx`** qua bảng `Sequence` — tái dùng chính xác cơ chế `SequenceSkuGenerator` (Prompt 016). Không có trong `CreateCustomerDto`/`UpdateCustomerDto` — client không được tự đặt hay sửa mã.
2. **Phone unique trong Organization** — enforce ở DB (`@@unique([organizationId, phone])`, đã có sẵn từ schema cũ, giữ nguyên), P2002 dịch sang `CUSTOMER_PHONE_DUPLICATE` (409) riêng biệt với `CUSTOMER_DUPLICATE` (trùng `code` — về lý thuyết gần như không xảy ra vì mã tự sinh, nhưng vẫn giữ làm phòng vệ ở tầng DB).
3. **Không hard-delete, chỉ soft-delete + restore** — đúng `DELETE /customers/:id` (204, xóa mềm) + `POST /customers/:id/restore` (201), cùng mẫu Supplier. Prompt 031 không nêu điều kiện chặn xóa nào (khác Supplier — chặn xóa khi có Purchase Order) nên không thêm guard nào — Order chưa tồn tại nên chưa có gì để kiểm tra.
4. **Search đúng 5 trường Business Rules nêu**: tên (`fullName`), Phone, Email, Company (`companyName`), TaxCode — `OR` trên cả 5 cột, case-insensitive.

## 4. Chức năng đã hoàn thành

- **`POST /customers`**: tạo khách hàng (mã tự sinh), đủ field list Prompt 031.
- **`GET /customers`**: tìm kiếm (5 trường), lọc `customerType`/`status`, phân trang, sắp xếp.
- **`GET /customers/:id`**: chi tiết.
- **`PATCH /customers/:id`**: cập nhật (không cho sửa `code`/`currentDebt`/`totalRevenue`/`totalOrder`/`totalPoint`).
- **`DELETE /customers/:id`**: xóa mềm. **`POST /customers/:id/restore`**: khôi phục.
- **Publish Domain Event**: `CustomerCreated`/`CustomerUpdated`/`CustomerDeleted` sau mỗi hành động ghi tương ứng.
- **Audit Log** đầy đủ cho cả 4 hành động ghi.
- **Permission**: `customer:view/create/update/delete` (đã có sẵn từ Foundation) mở rộng thêm `customer:restore`.

## 5. File đã tạo/sửa

**Tạo mới** — `backend/src/modules/customer/` (đủ 4 lớp + code generator riêng): domain (entity, repository interface, **domain events**, code-generator interface), application (DTO×4 + spec, mapper, service + spec), infrastructure (Prisma repository + spec, `SequenceCustomerCodeGenerator` + spec), presentation (controller + spec), `customer.module.ts`.
**Tạo mới khác**: `backend/src/modules/platform/events/domain-event-publisher.service.ts` (+ spec), `backend/test/customer.e2e-spec.ts`, migration `20260715010000_customer_module`.
**Sửa**: `schema.prisma` (viết lại `Customer`, thêm enum `CustomerType`, bỏ quan hệ `CustomerGroup↔Customer`), `app.module.ts` (đăng ký `EventEmitterModule.forRoot()` + `CustomerModule`), `platform.module.ts` (đăng ký `DomainEventPublisher`), `error-codes.ts` (+`CUSTOMER_001..004`), `permission-catalog.ts` (mở rộng `crud('customer', ...)` thêm `restore`), `package.json`/`package-lock.json` (+`@nestjs/event-emitter`).

## 6. Migration

`20260715010000_customer_module`: đổi tên 3 cột (`name→fullName`, `debtAmount→currentDebt`, `pointBalance→totalPoint` — metadata-only, không mất dữ liệu), bỏ FK+cột `groupId`, đổi index `customers_name_idx→customers_fullName_idx`, thêm enum `CustomerType`, thêm 11 cột mới (đa số nullable/có default) theo đúng field list Prompt 031.

## 7. API

| Method | Path | Permission |
|---|---|---|
| POST | `/api/v1/customers` | `customer:create` |
| GET | `/api/v1/customers` | `customer:view` |
| GET | `/api/v1/customers/:id` | `customer:view` |
| PATCH | `/api/v1/customers/:id` | `customer:update` |
| DELETE | `/api/v1/customers/:id` | `customer:delete` |
| POST | `/api/v1/customers/:id/restore` | `customer:restore` |

## 8. Test

- **Unit**: **790/790 PASS** toàn backend (tăng từ 739 sau Prompt 030). Customer-specific (51 test, gồm cả `DomainEventPublisher`): service (create sinh code+audit+publish CustomerCreated; findOne 404; search map params; update +audit+publish CustomerUpdated+chuyển đổi birthday ISO→Date; remove +audit+publish CustomerDeleted; restore — 404/422-chưa-xóa/thành-công), Prisma repository (create+P2002 phân biệt phone/code, findById/findByIdIncludingDeleted, update+P2002, softDelete/restore, search+OR, existsByPhone+excludeId), code generator, controller (permission metadata 6 route, ủy quyền), DTO validation (bắt buộc fullName/phone, email sai định dạng, customerType sai enum, creditLimit âm, đầy đủ field khách doanh nghiệp), `DomainEventPublisher` (ủy quyền đúng cho `EventEmitter2.emit`).
- **Coverage** (`customer/` + `platform/events/`, loại trừ `.module.ts`): **97.13% statement, 94.87% function, 99.11% line, 86.87% branch** — vượt mốc 90% yêu cầu ở statement/function/line.
- **Integration**: `test/customer.e2e-spec.ts` — luồng đầy đủ qua HTTP thật: tạo (xác nhận mã đúng định dạng `CUS\d{6}`, `customerType` mặc định RETAIL, `currentDebt`/`totalPoint` khởi tạo 0) → search → chi tiết → cập nhật → xóa mềm → 404 → khôi phục → 200; từ chối trùng phone (409); từ chối khôi phục khách hàng chưa xóa (422); lọc theo `customerType`. **Chưa xác nhận PASS thật** — sandbox không có Docker/PostgreSQL, cùng giới hạn Gate B đã disclose từ Prompt 016.
- Build/Lint/TypeCheck/Prisma validate: tất cả **PASS** trên toàn repo.

## 9. Self-Review

- **Không TODO/FIXME/console.log/`any`** — `grep` xác nhận rỗng trong `src/modules/customer/` và `src/modules/platform/events/`.
- **Architecture Review**: `CustomerModule` không phụ thuộc module nào khác ngoài `RbacModule` (Customer là nền tảng, không ai phụ thuộc nó ở Prompt này — đúng vị trí đầu trong Dependency Graph). `DomainEventPublisher` là hạ tầng platform dùng chung — Customer chỉ publish, không tự tạo cơ chế event riêng, thiết lập đúng khuôn mẫu cho mọi module tương lai (Cart/Checkout/Order) tuân theo nguyên tắc "không gọi chéo Service, trao đổi qua Domain Event".
- **Security Review**: mọi truy vấn lọc `organizationId`; `code`/`currentDebt`/`totalRevenue`/`totalOrder`/`totalPoint` không nằm trong DTO ghi — không có đường nào client tự sửa các trường hệ thống duy trì.
- **Concurrency**: uniqueness của `phone` và `code` enforce ở DB (constraint), không phải kiểm tra-rồi-ghi ở tầng ứng dụng — an toàn với "100 User Search đồng thời" (đọc thuần túy) và tránh race condition khi 2 request tạo cùng SĐT.
- **Failure & Recovery**: mọi thao tác ghi là 1 câu lệnh Prisma đơn (không cần transaction đa bước) — lỗi giữa chừng tự động không để lại trạng thái dở dang; P2002 dịch rõ ràng thay vì lộ lỗi DB thô.

**Definition of Done đạt được** (trừ Integration Test PASS thật — cùng giới hạn Gate B đã biết, đã disclose minh bạch). Sẵn sàng cho Prompt 032 (Customer Point — Loyalty Ledger), module đầu tiên sẽ thực sự lắng nghe Domain Event vừa thiết lập.
